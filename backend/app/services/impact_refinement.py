from bisect import bisect_left
import time

import cv2
import numpy as np

from app.config import MAX_INFERENCE_SIDE, MAX_PROCESSED_FPS, PROCESSING_TIMEOUT_SECONDS
from app.schemas.swing import PoseFrame
from app.services.equipment_detection import body_context, detect_equipment, finalise_equipment
from app.services.previews import encode_preview


def refine_impact(capture, frames, equipment, suggestion, fps, width, height, started):
    if suggestion.impact_ms is None:
        return equipment
    low = max(suggestion.top_ms + 1, suggestion.impact_ms - 300)
    high = min(round(frames[-1].timestamp_ms), suggestion.impact_ms + 300)
    detailed = [frame for frame in equipment if low <= frame.timestamp_ms <= high]
    if fps > MAX_PROCESSED_FPS + 0.5 and time.monotonic() - started < PROCESSING_TIMEOUT_SECONDS - 5:
        times = [frame.timestamp_ms for frame in frames]
        capture.set(cv2.CAP_PROP_POS_MSEC, max(0, low - 100))
        observations = []
        previous = -1
        for _ in range(round(fps * 0.85) + 10):
            if time.monotonic() - started > PROCESSING_TIMEOUT_SECONDS:
                suggestion.notes.append("La búsqueda detallada de impacto alcanzó el límite de tiempo.")
                break
            ok, image = capture.read()
            if not ok:
                break
            timestamp = round(capture.get(cv2.CAP_PROP_POS_MSEC))
            if timestamp <= previous:
                timestamp = round((capture.get(cv2.CAP_PROP_POS_FRAMES) - 1) * 1000 / fps)
            previous = timestamp
            if timestamp > high:
                break
            if timestamp < low:
                continue
            i = bisect_left(times, timestamp)
            options = frames[max(0, i - 1):i + 1]
            pose = min(options, key=lambda frame: abs(frame.timestamp_ms - timestamp)) if options else None
            if pose is None or abs(pose.timestamp_ms - timestamp) > 65:
                pose = PoseFrame(timestamp_ms=timestamp, landmarks=[], low_visibility=True)
            h, w = image.shape[:2]
            if max(h, w) > MAX_INFERENCE_SIDE:
                factor = MAX_INFERENCE_SIDE / max(h, w)
                image = cv2.resize(image, (round(w * factor), round(h * factor)))
            observation = detect_equipment(image, pose, timestamp)
            observation.preview_jpeg = encode_preview(image)
            observations.append(observation)
        detailed = finalise_equipment(observations)
        equipment = sorted({frame.timestamp_ms: frame for frame in equipment + detailed}.values(), key=lambda frame: frame.timestamp_ms)
    elif fps > MAX_PROCESSED_FPS + 0.5:
        suggestion.notes.append("No se han leído fotogramas intermedios por el límite de tiempo; se usan las observaciones ya disponibles.")
    suggestion.refinement_frames = len(detailed)
    balls = [frame.ball for frame in equipment if frame.ball and frame.timestamp_ms <= suggestion.impact_ms]
    if not balls:
        suggestion.notes.append("No se pudo afinar el impacto con la bola: conserva una aproximación corporal revisable.")
        return equipment
    ball = np.median([[point.x * width, point.y * height] for point in balls[-12:]], axis=0)
    nearest_pose = min(frames, key=lambda frame: abs(frame.timestamp_ms - suggestion.impact_ms))
    context = body_context(nearest_pose, width, height)
    if context is None:
        return equipment
    torso = context[3]
    candidates = []
    for frame in detailed:
        if frame.club and frame.timestamp_ms > suggestion.top_ms and (suggestion.end_ms is None or frame.timestamp_ms < suggestion.end_ms):
            tip = np.array([frame.club.end.x * width, frame.club.end.y * height])
            candidates.append((float(np.linalg.norm(tip - ball)), frame.timestamp_ms))
    if candidates and min(candidates)[0] < torso * 0.3:
        suggestion.impact_ms = min(candidates)[1]
        suggestion.impact_refined = True
        suggestion.notes.append("Impacto ajustado por proximidad del segmento observado del palo a la posición previa de la bola. Sigue siendo una estimación del contacto.")
    else:
        suggestion.notes.append("No hay evidencia suficiente de palo y bola para precisar el contacto; revisa el impacto propuesto.")
    return equipment
