import logging
import math
import time
from pathlib import Path

import cv2

from app.config import (
    MAX_DURATION_SECONDS, MAX_FRAME_PIXELS, MAX_INFERENCE_SIDE,
    MAX_PROCESSED_FPS, MAX_SOURCE_FPS, PROCESSING_TIMEOUT_SECONDS, VISIBILITY_THRESHOLD,
)
from app.schemas.swing import SwingResult, VideoInfo
from app.services.errors import ProcessingError
from app.services.pose_detection import PoseDetector
from app.services.equipment_detection import detect_equipment, finalise_equipment
from app.services.impact_refinement import refine_impact
from app.services.previews import encode_preview
from app.services.swing_events import suggest_anchors

logger = logging.getLogger("uvicorn.error")


def process_video(path: Path, swing_id: str, filename: str) -> SwingResult:
    # FFmpeg aplica los metadatos de rotación en MP4/MOV como el navegador.
    capture = cv2.VideoCapture(str(path), cv2.CAP_FFMPEG)
    started = time.monotonic()
    decoded = 0
    frames = []
    completed = False
    try:
        if not capture.isOpened():
            raise ProcessingError("No se puede leer el vídeo. Prueba un MP4 con códec H.264.")
        capture.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
        fps = capture.get(cv2.CAP_PROP_FPS)
        count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        if not math.isfinite(fps) or fps <= 0 or fps > MAX_SOURCE_FPS:
            raise ProcessingError("El vídeo debe tener una frecuencia válida de hasta 240 FPS.")
        if not math.isfinite(count) or count < 1:
            raise ProcessingError("No se puede determinar la duración de este vídeo.")
        duration = count / fps
        logger.info("Vídeo: %.2f s, %.2f FPS, %.0f fotogramas de origen; límite de análisis %d s.",
                    duration, fps, count, PROCESSING_TIMEOUT_SECONDS)
        if duration > MAX_DURATION_SECONDS + 0.05:
            raise ProcessingError("El vídeo supera los 15 segundos. Recorta un solo swing.")

        observations = []
        previous_time = -1.0
        next_sample = 0.0
        used_fallback = False
        width = height = 0
        last_timestamp = -1
        last_frame_time = 0.0
        with PoseDetector() as detector:
            while True:
                if time.monotonic() - started > PROCESSING_TIMEOUT_SECONDS:
                    raise ProcessingError(
                        f"El análisis ha superado el límite de {PROCESSING_TIMEOUT_SECONDS} segundos. "
                        "Prueba a exportar el vídeo a MP4 H.264 a 1080p o recorta un solo swing.", 408
                    )
                ok, frame = capture.read()
                if not ok:
                    break
                height, width = frame.shape[:2]
                if width * height > MAX_FRAME_PIXELS:
                    raise ProcessingError("La resolución supera 4K. Exporta el vídeo a 1080p.")
                if decoded >= math.ceil(MAX_DURATION_SECONDS * MAX_SOURCE_FPS) + 1:
                    raise ProcessingError("El vídeo supera el límite de fotogramas.")
                current_time = capture.get(cv2.CAP_PROP_POS_MSEC)
                if not math.isfinite(current_time) or current_time <= previous_time:
                    current_time = decoded * 1000 / fps
                    used_fallback = True
                if current_time <= previous_time:
                    raise ProcessingError("No se pueden ordenar los tiempos de este vídeo. Expórtalo con FPS constantes.")
                previous_time = current_time
                last_frame_time = current_time
                decoded += 1
                if current_time / 1000 > MAX_DURATION_SECONDS:
                    raise ProcessingError("El vídeo supera los 15 segundos.")
                if current_time + 0.01 < next_sample:
                    continue
                next_sample = current_time + 1000 / MAX_PROCESSED_FPS - 0.5
                # Tiempos enteros estrictamente crecientes para MediaPipe VIDEO.
                timestamp = max(last_timestamp + 1, round(current_time))
                last_timestamp = timestamp
                if max(width, height) > MAX_INFERENCE_SIDE:
                    scale = MAX_INFERENCE_SIDE / max(width, height)
                    frame = cv2.resize(frame, (round(width * scale), round(height * scale)))
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pose = detector.detect(rgb_frame, timestamp)
                pose.preview_jpeg = encode_preview(frame)
                observation = detect_equipment(frame, pose, timestamp)
                observation.preview_jpeg = pose.preview_jpeg
                observations.append(observation)
                frames.append(pose)

        if not frames:
            raise ProcessingError("El archivo no contiene fotogramas de vídeo legibles.")
        # No se presenta como completo un archivo truncado o con fallo de decodificación.
        if decoded < count - max(2, fps * 0.1):
            raise ProcessingError("El vídeo parece incompleto o dañado. Expórtalo de nuevo a MP4 H.264.")
        duration = max(duration, (last_frame_time + 1000 / fps) / 1000)
        detected = sum(bool(frame.landmarks) for frame in frames)
        warnings = []
        if detected == 0:
            warnings.append("No se ha detectado ningún cuerpo. Graba a una sola persona de cuerpo entero y con buena luz.")
        elif detected < len(frames):
            warnings.append("Hay tramos sin detección corporal. El esqueleto se oculta en esos momentos.")
        if any(frame.landmarks and frame.low_visibility for frame in frames):
            warnings.append("Algunas articulaciones tienen poca visibilidad y se ocultan para evitar trazos poco fiables.")
        if used_fallback:
            warnings.append("Algunos tiempos se estimaron a partir de los FPS; la sincronización puede ser aproximada.")
        equipment = finalise_equipment(observations)
        for pose, item in zip(frames, equipment):
            pose.ball, pose.club = item.ball, item.club
        suggestion = suggest_anchors(frames, width, height)
        # Con tiempos reconstruidos no se mezcla otra base temporal de decodificación.
        if not used_fallback:
            equipment = refine_impact(capture, frames, equipment, suggestion, fps, width, height, started)
        else:
            suggestion.notes.append("No se afina el impacto porque los tiempos del vídeo no son fiables.")
        if not any(item.ball for item in equipment):
            warnings.append("Bola no detectada automáticamente con evidencia suficiente. No se dibuja una posición supuesta.")
        if not any(item.club for item in equipment):
            warnings.append("Palo no detectado con evidencia suficiente. No se dibuja un segmento supuesto.")
        warnings.append("La detección geométrica de bola y palo es experimental: revisa las superposiciones, especialmente con desenfoque o fondos complejos.")
        actual_processed_fps = ((len(frames) - 1) * 1000 / (frames[-1].timestamp_ms - frames[0].timestamp_ms)
                                if len(frames) > 1 else min(fps, MAX_PROCESSED_FPS))
        result = SwingResult(
            id=swing_id, filename=filename,
            video=VideoInfo(width=width, height=height, fps=round(fps, 3),
                            duration_seconds=round(duration, 3), processed_fps=round(actual_processed_fps, 3)),
            visibility_threshold=VISIBILITY_THRESHOLD, detected_frames=detected,
            frames=frames, warnings=warnings,
            analysis_version=2, suggested_anchors=suggestion, equipment_frames=equipment,
        )
        completed = True
        return result
    finally:
        capture.release()
        logger.log(logging.INFO if completed else logging.WARNING,
                   "Análisis %s en %.1f s: %d fotogramas leídos, %d muestras procesadas.",
                   "completado" if completed else "interrumpido", time.monotonic() - started,
                   decoded, len(frames))
