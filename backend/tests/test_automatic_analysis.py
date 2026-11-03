import tempfile
import time
import unittest
from pathlib import Path

import cv2
import numpy as np

from app.schemas.swing import ClubSegment, EquipmentFrame, ImagePoint, Landmark, PoseFrame, SuggestedAnchors
from app.services.equipment_detection import EquipmentObservation, detect_equipment, finalise_equipment
from app.services.impact_refinement import refine_impact
from app.services.swing_events import suggest_anchors
from app.services.previews import encode_preview
from test_comparisons import make_swing, marks, reference, setup
from app.services.swing_comparison import compare_swings


def pose(timestamp=0, hand_y=0.52):
    points = [Landmark(x=0.45, y=0.2, z=0, visibility=1, presence=1) for _ in range(33)]
    for index, (x, y) in {
        11: (0.35, 0.25), 12: (0.5, 0.25), 13: (0.5, 0.4), 14: (0.53, 0.4),
        15: (0.58, hand_y), 16: (0.60, hand_y), 23: (0.38, 0.5), 24: (0.5, 0.5),
        27: (0.4, 0.88), 28: (0.49, 0.88), 31: (0.39, 0.9), 32: (0.5, 0.9),
    }.items():
        points[index].x, points[index].y = x, y
    return PoseFrame(timestamp_ms=timestamp, landmarks=points, low_visibility=False)


def equipment_image(ball=True, club=True):
    image = np.full((480, 640, 3), (40, 130, 40), dtype=np.uint8)
    if club:
        cv2.line(image, (380, 253), (514, 418), (0, 0, 0), 3)
    if ball:
        cv2.circle(image, (522, 426), 5, (250, 250, 250), -1)
    return image


class AutomaticAnalysisTests(unittest.TestCase):
    def test_circle_and_segment_are_detected_with_body_and_temporal_support(self):
        observations = [detect_equipment(equipment_image(), pose(i * 33), i * 33) for i in range(6)]
        result = finalise_equipment(observations)
        self.assertTrue(any(item.club for item in result))
        self.assertTrue(any(item.ball for item in result))
        ball = next(item.ball for item in result if item.ball)
        self.assertAlmostEqual(ball.x, 522 / 640, delta=0.02)
        self.assertAlmostEqual(ball.y, 426 / 480, delta=0.02)

    def test_distractor_circle_without_club_is_not_accepted_as_ball(self):
        observations = [detect_equipment(equipment_image(club=False), pose(i * 33), i * 33) for i in range(5)]
        self.assertFalse(any(item.ball or item.club for item in finalise_equipment(observations)))

    def test_no_body_and_blank_frames_do_not_invent_equipment(self):
        empty = PoseFrame(timestamp_ms=0, landmarks=[], low_visibility=True)
        result = finalise_equipment([detect_equipment(equipment_image(), empty, i * 33) for i in range(5)])
        self.assertTrue(all(item.ball is None and item.club is None for item in result))

    def test_tracking_requires_a_current_observation(self):
        observations = [detect_equipment(equipment_image(), pose(i * 33), i * 33) for i in range(5)]
        observations += [detect_equipment(equipment_image(club=False), pose(i * 33), i * 33) for i in range(5, 12)]
        observations += [detect_equipment(equipment_image(ball=False, club=False), pose(i * 33), i * 33) for i in range(12, 16)]
        result = finalise_equipment(observations)
        self.assertIsNotNone(result[10].ball)
        self.assertTrue(all(item.ball is None for item in result[12:]))

    def test_static_posture_has_no_automatic_swing_marks(self):
        result = suggest_anchors([pose(i * 33) for i in range(120)], 640, 480)
        self.assertTrue(all(getattr(result, key) is None for key in ('start_ms', 'top_ms', 'impact_ms', 'end_ms')))

    def test_events_follow_observed_motion_and_can_finish_before_clip_end(self):
        frames = []
        for timestamp in range(0, 5000, 33):
            hand_y = float(np.interp(timestamp, [0, 1000, 2000, 2500, 3300, 5000], [.65, .65, .15, .65, .2, .2]))
            frames.append(pose(timestamp, hand_y))
        result = suggest_anchors(frames, 640, 480)
        self.assertIsNotNone(result.end_ms, result)
        self.assertTrue(result.start_ms < result.top_ms < result.impact_ms < result.end_ms)
        self.assertAlmostEqual(result.top_ms, 2000, delta=150)
        self.assertAlmostEqual(result.impact_ms, 2500, delta=150)
        self.assertLess(result.end_ms, frames[-1].timestamp_ms - 500)
        for frame in frames:
            if 1600 < frame.timestamp_ms < 2900:
                frame.landmarks = []
        lost = suggest_anchors(frames, 640, 480)
        self.assertIsNone(lost.impact_ms)

    def test_high_fps_refinement_reads_original_frames_and_keeps_missing_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'highfps.mp4'
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'mp4v'), 120, (320, 240))
            self.assertTrue(writer.isOpened())
            for _ in range(120):
                writer.write(np.zeros((240, 320, 3), dtype=np.uint8))
            writer.release()
            frames = [PoseFrame(timestamp_ms=i * 33, landmarks=[], low_visibility=True) for i in range(30)]
            suggestion = SuggestedAnchors(start_ms=0, top_ms=100, impact_ms=450, end_ms=900)
            capture = cv2.VideoCapture(str(path))
            try:
                result = refine_impact(capture, frames, [], suggestion, 120, 320, 240, time.monotonic())
            finally:
                capture.release()
            self.assertGreater(suggestion.refinement_frames, 30)
            self.assertEqual(suggestion.impact_ms, 450)
            self.assertFalse(suggestion.impact_refined)
            self.assertTrue(all(item.ball is None and item.club is None for item in result))
            self.assertTrue(all(a.timestamp_ms < b.timestamp_ms for a, b in zip(result, result[1:])))
            self.assertTrue(all(item.preview_jpeg.startswith('data:image/jpeg;base64,') for item in result))

    def test_impact_adjustment_uses_an_observed_club_near_the_observed_ball(self):
        ball = ImagePoint(x=0.8156, y=0.8875)
        grip = ImagePoint(x=0.6, y=0.52)
        equipment = [EquipmentFrame(timestamp_ms=300, ball=ball)]
        for timestamp, tip in ((400, ImagePoint(x=0.82, y=0.9)), (433, ball), (467, ImagePoint(x=0.9, y=0.9))):
            equipment.append(EquipmentFrame(timestamp_ms=timestamp, club=ClubSegment(start=grip, end=tip)))
        suggestion = SuggestedAnchors(start_ms=0, top_ms=100, impact_ms=450, end_ms=900)
        frames = [pose(timestamp) for timestamp in range(0, 1000, 33)]
        refine_impact(None, frames, equipment, suggestion, 30, 640, 480, time.monotonic())
        self.assertTrue(suggestion.impact_refined)
        self.assertEqual(suggestion.impact_ms, 433)
        self.assertIn(433, [item.timestamp_ms for item in equipment])

    def test_feet_and_extra_measures_are_used_and_key_images_match_corrected_marks(self):
        swing = make_swing()
        other = make_swing()
        for frame in swing.frames:
            frame.landmarks = [point.model_copy() for point in frame.landmarks]
            frame.landmarks[31].x += 0.1
            frame.preview_jpeg = encode_preview(np.zeros((240, 320, 3), dtype=np.uint8))
        result = compare_swings(swing, reference(other), setup(), marks())
        self.assertGreater(result.metrics[0].mean_difference, 0)
        keys = {metric.key for metric in result.metrics}
        self.assertTrue({'head_position', 'hands_position', 'torso_inclination'} <= keys)
        self.assertEqual(len(result.key_moments), 4)
        self.assertEqual(result.key_moments[2].user.timestamp_ms, 2000)
        self.assertIsNotNone(result.key_moments[2].user.preview_jpeg)


if __name__ == '__main__':
    unittest.main()
