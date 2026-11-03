"""Alineación y diferencias 2D; el análisis técnico se calcula por separado."""
from bisect import bisect_right

import numpy as np

from app.schemas.comparison import (
    CaptureSetup, ComparisonFrame, ComparisonResult, DifferenceMetric,
    Point2D, Reference, SwingAnchors, NormalizedClub, KeyMomentPair,
)
from app.schemas.swing import PoseFrame, SwingResult
from app.services.errors import ProcessingError
from app.services.previews import frame_preview
from app.services.equipment_detection import body_context

JOINTS = (11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32)
ANGLES = {
    "left_elbow": ("Codo izquierdo", (11, 13, 15)),
    "right_elbow": ("Codo derecho", (12, 14, 16)),
    "left_knee": ("Rodilla izquierda", (23, 25, 27)),
    "right_knee": ("Rodilla derecha", (24, 26, 28)),
}


def validate_anchors(swing: SwingResult, anchors: SwingAnchors) -> None:
    if anchors.end_ms > round(swing.video.duration_seconds * 1000):
        raise ProcessingError("Las marcas deben estar dentro de la duración del vídeo.")
    times = [frame.timestamp_ms for frame in swing.frames]
    if not times or any(a >= b for a, b in zip(times, times[1:])):
        raise ProcessingError("El swing no tiene una secuencia temporal válida.")


def compatible_setup(user: CaptureSetup, reference: CaptureSetup) -> None:
    if user.handedness != reference.handedness or user.view != reference.view:
        raise ProcessingError("Usa la misma lateralidad y perspectiva de cámara en ambos swings.")
    if user.club.strip() and reference.club.strip() and user.club.strip().casefold() != reference.club.strip().casefold():
        raise ProcessingError("Los tipos de palo indicados son distintos. Selecciona una referencia compatible.")


def normalise_frame(frame: PoseFrame, swing: SwingResult) -> list[Point2D | None]:
    if len(frame.landmarks) != 33:
        return []
    points = []
    for point in frame.landmarks:
        valid = (0 <= point.x <= 1 and 0 <= point.y <= 1
                 and min(point.visibility, point.presence) >= swing.visibility_threshold)
        points.append(np.array([point.x * swing.video.width, point.y * swing.video.height]) if valid else None)
    if any(points[index] is None for index in (11, 12, 23, 24)):
        return []
    hips = (points[23] + points[24]) / 2
    shoulders = (points[11] + points[12]) / 2
    scale = float(np.linalg.norm(shoulders - hips))
    if not np.isfinite(scale) or scale < 1e-6:
        return []
    # Se conserva la inclinación: no se rota ni refleja el cuerpo.
    return [None if point is None else Point2D(x=float((point[0] - hips[0]) / scale),
                                             y=float((point[1] - hips[1]) / scale)) for point in points]


def angle(points: list[Point2D | None], indices: tuple[int, int, int]) -> float | None:
    if not points or any(points[index] is None for index in indices):
        return None
    a, b, c = (np.array([points[index].x, points[index].y]) for index in indices)
    left, right = a - b, c - b
    denominator = float(np.linalg.norm(left) * np.linalg.norm(right))
    if denominator < 1e-10:
        return None
    cosine = float(np.clip(np.dot(left, right) / denominator, -1, 1))
    return float(np.degrees(np.arccos(cosine)))


def sample_at(swing: SwingResult, times: list[int], normalised: list, target_ms: float):
    index = bisect_right(times, target_ms + 1e-6) - 1
    max_age = max(150, 1000 / swing.video.processed_fps + 50)
    if index < 0 or target_ms - times[index] > max_age:
        return []
    # No se busca un fotograma válido más lejano si este perdió el cuerpo.
    return normalised[index]


def position_distance(own, other, indices):
    values = [float(np.hypot(own[i].x - other[i].x, own[i].y - other[i].y))
              for i in indices if own and other and own[i] is not None and other[i] is not None]
    return round(float(np.mean(values)), 6) if values else None


def torso_inclination(points):
    if not points or any(points[i] is None for i in (11, 12, 23, 24)):
        return None
    x = (points[11].x + points[12].x - points[23].x - points[24].x) / 2
    y = (points[11].y + points[12].y - points[23].y - points[24].y) / 2
    return float(np.degrees(np.arctan2(x, -y)))


def line_tilt(points, first, second):
    if not points or points[first] is None or points[second] is None:
        return None
    dx, dy = points[second].x - points[first].x, points[second].y - points[first].y
    # Un eje casi de perfil no permite medir su inclinación con estabilidad.
    if np.hypot(dx, dy) < 0.1:
        return None
    return float(np.degrees(np.arctan2(dy, dx)))


def equipment_at(swing, times, target_ms):
    equipment = swing.equipment_frames or swing.frames
    equipment_times = [item.timestamp_ms for item in equipment]
    index = bisect_right(equipment_times, target_ms + 1e-6) - 1
    pose_index = bisect_right(times, target_ms + 1e-6) - 1
    if index < 0 or pose_index < 0:
        return None, None
    item, pose = equipment[index], swing.frames[pose_index]
    if target_ms - item.timestamp_ms > max(100, 1000 / swing.video.processed_fps + 40):
        return None, None
    if target_ms - pose.timestamp_ms > max(150, 1000 / swing.video.processed_fps + 50):
        return None, None
    context = body_context(pose, swing.video.width, swing.video.height)
    if context is None:
        return None, None
    _, _, hips, scale = context

    def convert(point):
        return Point2D(x=(point.x * swing.video.width - hips[0]) / scale,
                       y=(point.y * swing.video.height - hips[1]) / scale)

    ball = convert(item.ball) if item.ball else None
    club = NormalizedClub(start=convert(item.club.start), end=convert(item.club.end)) if item.club else None
    return ball, club


def compare_swings(user: SwingResult, reference: Reference, setup: CaptureSetup,
                   anchors: SwingAnchors) -> ComparisonResult:
    compatible_setup(setup, reference.setup)
    validate_anchors(user, anchors)
    validate_anchors(reference.swing, reference.anchors)
    user_times = [frame.timestamp_ms for frame in user.frames]
    reference_times = [frame.timestamp_ms for frame in reference.swing.frames]
    user_points = [normalise_frame(frame, user) for frame in user.frames]
    reference_points = [normalise_frame(frame, reference.swing) for frame in reference.swing.frames]
    user_marks, reference_marks = anchors.times(), reference.anchors.times()
    # 30 intervalos por tramo; incluye exactamente cima, impacto y extremos una sola vez.
    targets = np.concatenate([np.linspace(user_marks[i], user_marks[i + 1], 31)[:-1]
                              for i in range(3)] + [np.array([user_marks[-1]])])
    frames = []
    for target in targets:
        reference_time = float(np.interp(target, user_marks, reference_marks))
        own = sample_at(user, user_times, user_points, float(target))
        other = sample_at(reference.swing, reference_times, reference_points, reference_time)
        distances = []
        if own and other:
            for index in JOINTS:
                if own[index] is not None and other[index] is not None:
                    distances.append(float(np.hypot(own[index].x - other[index].x, own[index].y - other[index].y)))
        differences = {}
        for key, (_, indices) in ANGLES.items():
            first, second = angle(own, indices), angle(other, indices)
            differences[key] = None if first is None or second is None else round(abs(first - second), 4)
        first_torso, second_torso = torso_inclination(own), torso_inclination(other)
        differences["torso_inclination"] = (None if first_torso is None or second_torso is None
                                            else round(abs((first_torso - second_torso + 180) % 360 - 180), 4))
        for key, indices in (("shoulder_tilt", (11, 12)), ("hip_tilt", (23, 24))):
            first, second = line_tilt(own, *indices), line_tilt(other, *indices)
            differences[key] = (None if first is None or second is None else
                                round(abs((first - second + 90) % 180 - 90), 4))
        user_ball, user_club = equipment_at(user, user_times, float(target))
        reference_ball, reference_club = equipment_at(reference.swing, reference_times, reference_time)
        frames.append(ComparisonFrame(
            elapsed_ms=round(float(target - user_marks[0]), 4),
            user_time_ms=round(float(target), 4), reference_time_ms=round(reference_time, 4),
            user=own, reference=other,
            position_difference=round(float(np.mean(distances)), 6) if distances else None,
            position_joint_count=len(distances),
            angle_differences=differences,
            position_details={"head_position": position_distance(own, other, (0,)),
                              "hands_position": position_distance(own, other, (15, 16))},
            user_ball=user_ball, user_club=user_club, reference_ball=reference_ball, reference_club=reference_club,
        ))
    metrics = []
    definitions = [("position", "Distancia de articulaciones", "torso_lengths")]
    definitions += [(key, label, "degrees") for key, (label, _) in ANGLES.items()]
    definitions += [("torso_inclination", "Inclinación del torso (2D)", "degrees"),
                    ("shoulder_tilt", "Inclinación de la línea de hombros (2D)", "degrees"),
                    ("hip_tilt", "Inclinación de la línea de caderas (2D)", "degrees"),
                    ("head_position", "Posición aproximada de la cabeza", "torso_lengths"),
                    ("hands_position", "Posición de las muñecas", "torso_lengths")]
    for key, label, unit in definitions:
        values = [frame.position_difference if key == "position" else
                  frame.position_details.get(key) if key in ("head_position", "hands_position") else
                  frame.angle_differences.get(key) for frame in frames]
        valid = [value for value in values if value is not None]
        metrics.append(DifferenceMetric(key=key, label=label, unit=unit,
                                        mean_difference=round(float(np.mean(valid)), 6) if valid else None,
                                        samples=len(valid)))
    comparable = sum(frame.position_difference is not None for frame in frames)
    if comparable == 0:
        raise ProcessingError("No hay posturas comparables. Comprueba el encuadre, las detecciones y las marcas de ambos vídeos.")
    warnings = ["Diferencias de proyecciones 2D: dependen de la cámara y de las marcas revisadas; no califican la técnica del jugador."]
    if comparable < len(frames):
        warnings.append("Hay muestras sin torso o articulaciones visibles; se omiten de las diferencias, sin inventar posiciones.")
    if any(metric.samples < len(frames) for metric in metrics):
        warnings.append("Cada medida usa solo las muestras con sus articulaciones visibles en ambos swings.")
    result = ComparisonResult(
        swing_id=user.id, reference_id=reference.id, reference_name=reference.name,
        duration_ms=anchors.end_ms - anchors.start_ms, user_anchors=anchors,
        reference_anchors=reference.anchors, frames=frames, metrics=metrics,
        comparable_frames=comparable, warnings=warnings,
        key_moments=[KeyMomentPair(key=key, label=label,
                                   user_requested_ms=getattr(anchors, key), reference_requested_ms=getattr(reference.anchors, key),
                                   user=frame_preview(user, getattr(anchors, key)),
                                   reference=frame_preview(reference.swing, getattr(reference.anchors, key)))
                     for key, label in (("start_ms", "Inicio"), ("top_ms", "Cima del backswing"),
                                        ("impact_ms", "Impacto"), ("end_ms", "Final"))],
    )
    # Importación local para mantener este módulo utilizable por separado.
    from app.services.swing_analysis import analyse_comparison
    result.analysis = analyse_comparison(result, user, reference.swing, user_points, reference_points)
    return result
