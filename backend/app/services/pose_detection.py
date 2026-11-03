import math
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from app.config import MODEL_PATH, VISIBILITY_THRESHOLD
from app.schemas.swing import Landmark, PoseFrame
from app.services.errors import ProcessingError

# Articulaciones principales; manos y cara pueden estar ocluidas en un swing.
CORE_JOINTS = (11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28)


class PoseDetector:
    def __enter__(self):
        if not MODEL_PATH.is_file():
            raise ProcessingError(
                "Falta el modelo corporal. Ejecuta python scripts/download_model.py desde backend.", 503
            )
        options = vision.PoseLandmarkerOptions(
            base_options=python.BaseOptions(
                model_asset_path=str(MODEL_PATH), delegate=python.BaseOptions.Delegate.CPU
            ),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.landmarker = vision.PoseLandmarker.create_from_options(options)
        return self

    def detect(self, rgb_frame, timestamp_ms: int) -> PoseFrame:
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        result = self.landmarker.detect_for_video(image, timestamp_ms)
        points = []
        if result.pose_landmarks:
            for point in result.pose_landmarks[0]:
                values = (point.x, point.y, point.z, point.visibility, point.presence)
                if any(value is None or not math.isfinite(value) for value in values):
                    points = []
                    break
                points.append(Landmark(
                    x=point.x, y=point.y, z=point.z,
                    visibility=point.visibility, presence=point.presence,
                ))
        if len(points) != 33:
            points = []
        low_visibility = not points or any(
            min(points[index].visibility, points[index].presence) < VISIBILITY_THRESHOLD
            for index in CORE_JOINTS
        )
        return PoseFrame(timestamp_ms=timestamp_ms, landmarks=points, low_visibility=low_visibility)

    def __exit__(self, *_):
        self.landmarker.close()