import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import cv2
import numpy as np
from fastapi.testclient import TestClient

from app.config import MODEL_PATH, PROCESSING_TIMEOUT_SECONDS
from app.main import app
from app.schemas.swing import PoseFrame, SwingResult, VideoInfo
from app.services.errors import ProcessingError
from app.services.video_processing import process_video


class SwingApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.uploads = self.root / "uploads"
        self.results = self.root / "results"
        self.patches = [
            patch("app.api.swings.UPLOAD_DIR", self.uploads),
            patch("app.api.swings.RESULT_DIR", self.results),
        ]
        for item in self.patches:
            item.start()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        for item in self.patches:
            item.stop()
        self.temporary.cleanup()

    def upload(self, content=b"not a video", name="swing.mp4", mime="video/mp4"):
        return self.client.post("/api/swings", files={"file": (name, content, mime)})

    def test_health_and_missing_results(self):
        self.assertEqual(self.client.get("/api/health").json()["status"], "ok")
        self.assertEqual(self.client.get("/api/swings/00000000-0000-0000-0000-000000000000").status_code, 404)
        self.assertEqual(self.client.get("/api/swings/not-a-uuid").status_code, 422)

    def test_rejects_non_video_empty_and_corrupt_files(self):
        self.assertEqual(self.upload(name="text.txt", mime="text/plain").status_code, 415)
        self.assertEqual(self.upload(mime="text/plain").status_code, 415)
        self.assertEqual(self.upload(b"").status_code, 422)
        self.assertEqual(self.upload().status_code, 422)
        self.assertEqual(list(self.uploads.iterdir()), [])

    def test_size_limit_and_request_limit(self):
        with patch("app.api.swings.MAX_UPLOAD_BYTES", 4):
            self.assertEqual(self.upload(b"12345").status_code, 413)
        with patch("app.main.MAX_UPLOAD_BYTES", 4):
            response = self.client.post("/api/swings", content=b"x" * (1024 * 1024 + 5))
            self.assertEqual(response.status_code, 413)

    def test_streaming_limit_without_content_length(self):
        with patch("app.main.MAX_UPLOAD_BYTES", 4):
            header = b'--test\r\nContent-Disposition: form-data; name="file"; filename="test.mp4"\r\nContent-Type: video/mp4\r\n\r\n'
            response = self.client.post(
                "/api/swings", content=iter([header, b"x" * (1024 * 1024), b"\r\n--test--\r\n"]),
                headers={"Content-Type": "multipart/form-data; boundary=test"},
            )
            self.assertEqual(response.status_code, 413)

    def test_processing_failure_cleans_up_and_unlocks(self):
        with patch("app.api.swings.process_video", side_effect=ProcessingError("Sin modelo", 503)):
            self.assertEqual(self.upload().status_code, 503)
            self.assertEqual(self.upload().status_code, 503)  # El bloqueo se libera.
        self.assertEqual(list(self.uploads.iterdir()), [])
        self.assertEqual(list(self.results.iterdir()), [])

    def test_one_processing_request_at_a_time(self):
        from app.api.swings import processing_lock
        processing_lock.acquire()
        try:
            self.assertEqual(self.upload().status_code, 429)
        finally:
            processing_lock.release()

    def test_result_roundtrip_and_safe_filename(self):
        def fake_process(path, swing_id, filename):
            self.assertTrue(path.is_file())
            self.assertEqual(path.parent, self.uploads)
            return SwingResult(
                id=swing_id, filename=filename,
                video=VideoInfo(width=320, height=240, fps=30, duration_seconds=1, processed_fps=30),
                visibility_threshold=0.5, detected_frames=0,
                frames=[PoseFrame(timestamp_ms=0, landmarks=[], low_visibility=True)], warnings=["Sin cuerpo"],
            )
        with patch("app.api.swings.process_video", side_effect=fake_process):
            response = self.upload(name="../../private.mp4")
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        self.assertEqual(data["filename"], "private.mp4")
        self.assertEqual(self.client.get(f"/api/swings/{data['id']}").json(), data)
        self.assertEqual(list(self.uploads.iterdir()), [])
        self.assertEqual(len(list(self.results.glob("*.json"))), 1)

    def make_clip(self, name, fps, count):
        path = self.root / name
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (320, 240))
        self.assertTrue(writer.isOpened())
        for _ in range(count):
            writer.write(np.zeros((240, 320, 3), dtype=np.uint8))
        writer.release()
        return path

    def test_rejects_long_clip_before_inference(self):
        path = self.make_clip("long.mp4", 10, 151)
        with self.assertRaisesRegex(ProcessingError, "15 segundos"):
            process_video(path, "test", "long.mp4")

    def test_analysis_can_finish_after_old_two_minute_limit(self):
        path = self.make_clip("slow.mp4", 2, 2)
        # Avanza el reloj sin esperar ni depender de la velocidad del equipo.
        clock = Mock()
        clock.monotonic.side_effect = [0, 121, 122, 123, 124]
        with patch("app.services.video_processing.time", clock), \
             patch("app.services.video_processing.PoseDetector") as detector:
            detector.return_value.__enter__.return_value.detect.side_effect = lambda image, timestamp: PoseFrame(
                timestamp_ms=timestamp, landmarks=[], low_visibility=True
            )
            response = self.upload(path.read_bytes())
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(response.json()["frames"]), 2)
        self.assertEqual(list(self.uploads.iterdir()), [])

    def test_processing_deadline_returns_408_cleans_up_and_allows_retry(self):
        path = self.make_clip("timeout.mp4", 2, 2)
        for _ in range(2):
            clock = Mock()
            clock.monotonic.side_effect = [0, PROCESSING_TIMEOUT_SECONDS + 1, PROCESSING_TIMEOUT_SECONDS + 1]
            with patch("app.services.video_processing.time", clock), \
                 patch("app.services.video_processing.PoseDetector") as detector:
                response = self.upload(path.read_bytes())
            self.assertEqual(response.status_code, 408, response.text)
            self.assertIn(str(PROCESSING_TIMEOUT_SECONDS), response.json()["detail"])
            detector.return_value.__exit__.assert_called_once()
            self.assertEqual(list(self.uploads.iterdir()), [])
            self.assertEqual(list(self.results.iterdir()), [])

    @unittest.skipUnless(MODEL_PATH.is_file(), "Descarga el modelo para la prueba de inferencia real")
    def test_real_blank_video_returns_missing_detection_and_timestamps(self):
        path = self.make_clip("blank.mp4", 60, 30)
        response = self.upload(path.read_bytes())
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        self.assertEqual(data["detected_frames"], 0)
        self.assertTrue(data["warnings"])
        self.assertTrue(all(not frame["landmarks"] for frame in data["frames"]))
        times = [frame["timestamp_ms"] for frame in data["frames"]]
        self.assertTrue(all(a < b for a, b in zip(times, times[1:])))
        self.assertLessEqual(len(times), 16)
        self.assertEqual(list(self.uploads.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
