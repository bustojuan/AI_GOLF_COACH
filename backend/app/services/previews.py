import base64
from bisect import bisect_left

import cv2

from app.schemas.swing import EquipmentFrame, SwingResult


def encode_preview(image) -> str:
    height, width = image.shape[:2]
    scale = min(1, 224 / max(width, height))
    small = cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))))
    ok, encoded = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 65])
    if not ok:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(encoded).decode("ascii")


def frame_preview(swing: SwingResult, target_ms: float) -> EquipmentFrame | None:
    # Todos los previews corresponden a fotogramas observados, nunca generados.
    by_time = {frame.timestamp_ms: EquipmentFrame(timestamp_ms=frame.timestamp_ms, ball=frame.ball,
                                                club=frame.club, preview_jpeg=frame.preview_jpeg)
               for frame in swing.frames}
    by_time.update({frame.timestamp_ms: frame for frame in swing.equipment_frames})
    times = sorted(by_time)
    index = bisect_left(times, target_ms)
    neighbors = times[max(0, index - 1):index + 1]
    if not neighbors:
        return None
    closest = min(neighbors, key=lambda timestamp: abs(timestamp - target_ms))
    if abs(closest - target_ms) > max(150, 1000 / swing.video.processed_fps + 50):
        return None
    return by_time[closest]
