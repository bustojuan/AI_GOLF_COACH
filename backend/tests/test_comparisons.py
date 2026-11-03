import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.comparison import CaptureSetup, Reference, SwingAnchors
from app.schemas.swing import Landmark, PoseFrame, SwingResult, VideoInfo
from app.services.errors import ProcessingError
from app.services.swing_comparison import angle, compare_swings, normalise_frame


def make_swing(duration_ms=3000, transform=None, hidden=(), bent=False):
    positions = [(0.5, 0.2)] * 33
    for index, xy in {
        11: (0.4, 0.3), 12: (0.6, 0.3), 13: (0.3, 0.4), 14: (0.7, 0.4),
        15: ((0.4, 0.5) if bent else (0.2, 0.5)), 16: (0.8, 0.5),
        23: (0.43, 0.6), 24: (0.57, 0.6), 25: (0.43, 0.75), 26: (0.57, 0.75),
        27: (0.43, 0.9), 28: (0.57, 0.9),
    }.items():
        positions[index] = xy
    width, height = (800, 600) if transform else (400, 400)
    landmarks = []
    for index, (x, y) in enumerate(positions):
        if transform:
            x, y = (x * 400 * 1.1 + 50) / width, (y * 400 * 1.1 + 40) / height
        landmarks.append(Landmark(x=x, y=y, z=0, visibility=0.1 if index in hidden else 1, presence=1))
    return SwingResult(
        id=str(uuid4()), filename="test.mp4", detected_frames=91, visibility_threshold=0.5,
        video=VideoInfo(width=width, height=height, fps=30, duration_seconds=duration_ms / 1000, processed_fps=30),
        frames=[PoseFrame(timestamp_ms=round(i * duration_ms / 90), landmarks=landmarks, low_visibility=bool(hidden))
                for i in range(91)], warnings=[],
    )


def marks(duration_ms=3000):
    return SwingAnchors(start_ms=0, top_ms=duration_ms // 3, impact_ms=duration_ms * 2 // 3, end_ms=duration_ms)


def setup():
    return CaptureSetup(handedness="right", view="face_on", club="hierro 7")


def reference(swing):
    return Reference(id=str(uuid4()), name="Referencia de prueba", setup=setup(), anchors=marks(round(swing.video.duration_seconds * 1000)),
                     filename=swing.filename, swing=swing)


class ComparisonMathTests(unittest.TestCase):
    def test_translation_scale_and_aspect_ratio_do_not_change_differences(self):
        result = compare_swings(make_swing(), reference(make_swing(transform=True)), setup(), marks())
        self.assertEqual(result.comparable_frames, 91)
        for metric in result.metrics:
            self.assertAlmostEqual(metric.mean_difference, 0, places=4)

    def test_manual_marks_align_different_durations_exactly(self):
        result = compare_swings(make_swing(), reference(make_swing(duration_ms=6000)), setup(), marks())
        for index, user_time, reference_time in ((0, 0, 0), (30, 1000, 2000), (60, 2000, 4000), (90, 3000, 6000)):
            self.assertEqual(result.frames[index].user_time_ms, user_time)
            self.assertEqual(result.frames[index].reference_time_ms, reference_time)
        self.assertTrue(all(a.elapsed_ms < b.elapsed_ms for a, b in zip(result.frames, result.frames[1:])))

    def test_joint_angle_difference_is_in_degrees(self):
        result = compare_swings(make_swing(bent=True), reference(make_swing()), setup(), marks())
        values = {metric.key: metric.mean_difference for metric in result.metrics}
        self.assertAlmostEqual(values["left_elbow"], 90, places=3)
        self.assertAlmostEqual(values["right_elbow"], 0, places=3)

    def test_occluded_joint_is_not_treated_as_zero_difference(self):
        result = compare_swings(make_swing(hidden=(15,)), reference(make_swing()), setup(), marks())
        metric = next(item for item in result.metrics if item.key == "left_elbow")
        self.assertIsNone(metric.mean_difference)
        self.assertEqual(metric.samples, 0)
        self.assertIsNone(result.frames[0].user[15])
        self.assertTrue(result.warnings)

    def test_lost_pose_is_not_bridged_with_an_earlier_valid_pose(self):
        swing = make_swing()
        swing.frames[30].landmarks = []
        result = compare_swings(swing, reference(make_swing()), setup(), marks())
        self.assertEqual(result.frames[30].user, [])
        self.assertIsNone(result.frames[30].position_difference)
        self.assertLess(result.comparable_frames, len(result.frames))

    def test_no_torso_or_degenerate_angle_produces_no_measurement(self):
        swing = make_swing(hidden=(11,))
        self.assertEqual(normalise_frame(swing.frames[0], swing), [])
        with self.assertRaises(ProcessingError):
            compare_swings(swing, reference(make_swing()), setup(), marks())
        points = normalise_frame(make_swing().frames[0], make_swing())
        points[13] = points[11]
        self.assertIsNone(angle(points, (11, 13, 15)))


class ComparisonApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.references = self.root / "references"
        self.patches = [patch("app.services.storage.RESULT_DIR", self.root),
                        patch("app.services.storage.REFERENCE_DIR", self.references)]
        for item in self.patches:
            item.start()
        self.client = TestClient(app)
        self.swing = make_swing()
        (self.root / f"{self.swing.id}.json").write_text(self.swing.model_dump_json(), encoding="utf-8")

    def tearDown(self):
        self.client.close()
        for item in self.patches:
            item.stop()
        self.temporary.cleanup()

    def create_reference(self, **changes):
        body = {"swing_id": self.swing.id, "name": "Mi referencia", "setup": setup().model_dump(), "anchors": marks().model_dump()}
        body.update(changes)
        return self.client.post("/api/references", json=body)

    def test_reference_persists_snapshot_and_lists_without_coordinates(self):
        response = self.create_reference()
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        (self.root / f"{self.swing.id}.json").unlink()
        restored = self.client.get(f"/api/references/{data['id']}")
        self.assertEqual(restored.json(), data)
        summaries = self.client.get("/api/references").json()
        self.assertEqual(len(summaries), 1)
        self.assertNotIn("swing", summaries[0])
        self.assertEqual(list(self.references.glob("*.tmp")), [])

    def test_compare_route_uses_cached_reference_without_inference(self):
        ref = self.create_reference().json()
        response = self.client.post("/api/comparisons", json={
            "swing_id": self.swing.id, "reference_id": ref["id"],
            "setup": setup().model_dump(), "anchors": marks().model_dump(),
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["comparable_frames"], 91)
        self.assertEqual(response.json()["reference_name"], "Mi referencia")
        self.assertEqual(response.json()["analysis"]["version"], "experimental-2d-v3-moments")
        self.assertEqual(len(response.json()["analysis"]["phases"]), 3)
        self.assertEqual(len(response.json()["analysis"]["moments"]), 4)
        self.assertEqual(response.json()["analysis"]["similarity_score"], 100)  # Posturas idénticas, con aviso de poco movimiento.
        self.assertFalse(response.json()["analysis"]["policy"]["quality_checks_block_score"])

    def test_invalid_marks_missing_files_and_empty_reference_are_rejected(self):
        invalid = marks().model_dump()
        invalid["impact_ms"] = invalid["top_ms"]
        self.assertEqual(self.create_reference(anchors=invalid).status_code, 422)
        self.assertEqual(self.create_reference(anchors=marks(6000).model_dump()).status_code, 422)
        self.assertEqual(self.create_reference(name="   ").status_code, 422)
        self.assertEqual(self.create_reference(swing_id=str(uuid4())).status_code, 404)
        self.assertEqual(self.client.get(f"/api/references/{uuid4()}").status_code, 404)
        self.swing.frames = []
        (self.root / f"{self.swing.id}.json").write_text(self.swing.model_dump_json(), encoding="utf-8")
        self.assertEqual(self.create_reference().status_code, 422)

    def test_incompatible_handedness_view_and_club_are_rejected(self):
        ref = self.create_reference().json()
        for field, value in (("handedness", "left"), ("view", "down_the_line"), ("club", "driver")):
            metadata = setup().model_dump()
            metadata[field] = value
            response = self.client.post("/api/comparisons", json={
                "swing_id": self.swing.id, "reference_id": ref["id"], "setup": metadata,
                "anchors": marks().model_dump(),
            })
            self.assertEqual(response.status_code, 422, response.text)


if __name__ == "__main__":
    unittest.main()
