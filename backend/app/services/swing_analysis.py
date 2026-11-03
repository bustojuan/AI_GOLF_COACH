"""Análisis determinista de las fases marcadas; sin inferencias de calidad técnica.

Los intervalos son [inicio, cima), [cima, impacto), [impacto, final].
Cada muestra pertenece a una sola fase; los cuatro momentos se consultan aparte.
"""
import numpy as np

from app.schemas.comparison import (
    AnalysisQuality, DifferenceMetric, MeasuredDifference, ScorePolicy,
    StageAnalysis, TechnicalAnalysis,
)
from app.services.analysis_config import AnalysisConfig, DEFAULT_ANALYSIS_CONFIG

BODY_JOINTS = (11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32)
PHASES = (("backswing", "Backswing"), ("downswing", "Bajada"),
          ("follow_through", "Finalización"))
MOMENTS = (("address", "Inicio"), ("top", "Cima"),
           ("impact", "Impacto"), ("finish", "Postura final"))


def metric_value(frame, key, config):
    if key == "position":
        return frame.position_difference
    return frame.position_details.get(key) if key in ("head_position", "hands_position") else frame.angle_differences.get(key)


def mean_metrics(frames, definitions, config):
    metrics = []
    for definition in definitions:
        valid = [value for frame in frames if (value := metric_value(frame, definition.key, config)) is not None]
        metrics.append(DifferenceMetric(
            key=definition.key, label=definition.label, unit=definition.unit,
            mean_difference=round(float(np.mean(valid)), 6) if valid else None, samples=len(valid),
        ))
    return metrics


def source_count(swing, points, start, end, include_end, config):
    # Cuenta fotogramas observados, no las muestras repetidas de la alineación.
    return sum(bool(pose)
               for frame, pose in zip(swing.frames, points)
               if start <= frame.timestamp_ms and (frame.timestamp_ms <= end if include_end else frame.timestamp_ms < end))


def capture_reasons(swing, points, start, end, label, config):
    reasons = []
    observed_times = [frame.timestamp_ms for frame in swing.frames if start <= frame.timestamp_ms <= end]
    observed_fps = 1000 / float(np.median(np.diff(observed_times))) if len(observed_times) > 1 else 0
    if min(swing.video.processed_fps, observed_fps) < config.minimum_processed_fps - 0.1:
        reasons.append(f"{label}: menos de {config.minimum_processed_fps:g} fotogramas corporales por segundo.")
    selected = [(frame, pose) for frame, pose in zip(swing.frames, points)
                if start <= frame.timestamp_ms <= end and pose]
    sizes = []
    for frame, _ in selected:
        shoulders = np.mean([[frame.landmarks[j].x * swing.video.width,
                              frame.landmarks[j].y * swing.video.height] for j in (11, 12)], axis=0)
        hips = np.mean([[frame.landmarks[j].x * swing.video.width,
                        frame.landmarks[j].y * swing.video.height] for j in (23, 24)], axis=0)
        sizes.append(float(np.linalg.norm(shoulders - hips)))
    if not sizes or np.mean(np.array(sizes) >= config.minimum_torso_pixels) < config.minimum_metric_coverage:
        reasons.append(f"{label}: torso pequeño o detección parcial; las medidas pueden ser inestables.")
    movement = []
    for joint in (15, 16):
        path = np.array([[pose[joint].x, pose[joint].y] for _, pose in selected if pose[joint] is not None])
        if len(path) >= 5:
            # Percentiles evitan que un único salto de seguimiento simule un swing.
            movement.append(float(np.linalg.norm(np.percentile(path, 95, axis=0) - np.percentile(path, 5, axis=0))))
    if not movement or max(movement) < config.minimum_motion_range:
        reasons.append(f"{label}: poco recorrido observable de muñecas; la semejanza puede corresponder a posturas casi estáticas.")
    if any("tiempos se estimaron" in warning for warning in swing.warnings):
        reasons.append(f"{label}: tiempos estimados por FPS; revisa o exporta el vídeo con tiempos constantes.")
    return reasons


def available_rules(metrics, config):
    by_key = {metric.key: metric for metric in metrics}
    return [rule for rule in config.rules if rule.key in by_key
            and by_key[rule.key].mean_difference is not None and by_key[rule.key].samples > 0]


def phase_score(metrics, config):
    by_key = {metric.key: metric for metric in metrics}
    rules = available_rules(metrics, config)
    if not rules:
        return None
    # Se redistribuye el peso solo entre medidas observadas; ninguna ausencia
    # se convierte en diferencia cero ni en un componente perfecto.
    total_weight = sum(rule.weight for rule in rules)
    return round(100 * sum(rule.weight * max(0, 1 - by_key[rule.key].mean_difference / rule.zero_at)
                           for rule in rules) / total_weight, 1)


def analyse_comparison(result, user, reference, user_points, reference_points,
                       config: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG):
    user_marks, ref_marks = result.user_anchors.times(), result.reference_anchors.times()
    capture_issues = (capture_reasons(user, user_points, user_marks[0], user_marks[-1], "Tu vídeo", config)
                      + capture_reasons(reference, reference_points, ref_marks[0], ref_marks[-1], "Referencia", config))

    def stage(key, label, kind, frames, start, end, ref_start, ref_end, include_end):
        metrics = mean_metrics(frames, result.metrics, config)
        required = [metric for metric in metrics if metric.key in {rule.key for rule in config.rules}]
        coverage = min((metric.samples / len(frames) for metric in required), default=0) if frames else 0
        own_count = source_count(user, user_points, start, end, include_end, config)
        ref_count = source_count(reference, reference_points, ref_start, ref_end, include_end, config)
        reasons = list(capture_issues)
        if coverage < config.minimum_metric_coverage:
            reasons.append(f"La cobertura mínima entre medidas es {coverage:.0%}; la referencia de calidad es {config.minimum_metric_coverage:.0%}. Este aviso no bloquea la puntuación.")
        if any(frame.position_difference is not None and frame.position_joint_count < config.minimum_position_joints for frame in frames):
            reasons.append(f"Algunas distancias usan menos de {config.minimum_position_joints} articulaciones; pueden representar solo parte del cuerpo.")
        needed = config.minimum_observed_frames if kind == "phase" else 1
        # En los momentos se consulta el fotograma anterior, como hace la comparación.
        if kind == "moment":
            own_count = observed_at(user, user_points, start, config)
            ref_count = observed_at(reference, reference_points, ref_start, config)
        if min(own_count, ref_count) < needed:
            reasons.append(f"Hay pocos fotogramas corporales distintos ({own_count} en tu vídeo y {ref_count} en la referencia); la referencia de calidad es {needed} por vídeo.")
        rules = available_rules(metrics, config)
        if not rules:
            reasons.append("No hay ninguna medida comparable para calcular una puntuación en este intervalo.")
        quality = AnalysisQuality(
            status="sufficient" if not reasons else "insufficient" if not rules else "limited",
            minimum_metric_coverage=round(coverage, 4), user_observed_frames=own_count,
            reference_observed_frames=ref_count, reasons=reasons,
        )
        return StageAnalysis(
            key=key, label=label, kind=kind, user_start_ms=start, user_end_ms=end,
            reference_start_ms=ref_start, reference_end_ms=ref_end, samples=len(frames), metrics=metrics,
            quality=quality, similarity_score=phase_score(metrics, config),
            score_weight_coverage=round(sum(rule.weight for rule in rules) / sum(rule.weight for rule in config.rules), 4),
        )

    phases = []
    for index, (key, label) in enumerate(PHASES):
        start, end = user_marks[index:index + 2]
        frames = [frame for frame in result.frames if start <= frame.user_time_ms
                  and (frame.user_time_ms <= end if index == 2 else frame.user_time_ms < end)]
        phases.append(stage(key, label, "phase", frames, start, end, ref_marks[index], ref_marks[index + 1], index == 2))
    moments = []
    for index, (key, label) in enumerate(MOMENTS):
        frame = min(result.frames, key=lambda frame: abs(frame.user_time_ms - user_marks[index]))
        moments.append(stage(key, label, "moment", [frame], user_marks[index], user_marks[index],
                             ref_marks[index], ref_marks[index], True))
    reasons = list(capture_issues)
    reasons += [f"{phase.label}: {reason}" for phase in phases for reason in phase.quality.reasons if reason not in capture_issues]
    scores = [phase.similarity_score for phase in phases if phase.similarity_score is not None]
    score = round(float(np.mean(scores)), 1) if scores else None
    candidates = []
    for phase in phases:
        if phase.similarity_score is None:
            continue
        by_key = {metric.key: metric for metric in phase.metrics}
        rules = available_rules(phase.metrics, config)
        total_weight = sum(rule.weight for rule in rules)
        for rule in rules:
            metric = by_key[rule.key]
            if metric.mean_difference > 1e-5:
                candidates.append((rule.weight / total_weight * min(1, metric.mean_difference / rule.zero_at), MeasuredDifference(
                    phase_key=phase.key, phase_label=phase.label, metric_key=metric.key,
                    metric_label=metric.label, difference=metric.mean_difference, unit=metric.unit,
                )))
    candidates.sort(key=lambda item: item[0], reverse=True)
    return TechnicalAnalysis(
        similarity_score=score, score_reasons=reasons, phases=phases, moments=moments,
        user_backswing_downswing_ratio=round((user_marks[1] - user_marks[0]) / (user_marks[2] - user_marks[1]), 3),
        reference_backswing_downswing_ratio=round((ref_marks[1] - ref_marks[0]) / (ref_marks[2] - ref_marks[1]), 3),
        largest_differences=[item[1] for item in candidates[:3]],
        policy=ScorePolicy(
            version="experimental-2d-v3-moments", weights={rule.key: rule.weight for rule in config.rules},
            zero_score_differences={rule.key: rule.zero_at for rule in config.rules},
            minimum_metric_coverage=config.minimum_metric_coverage,
            minimum_processed_fps=config.minimum_processed_fps, minimum_observed_frames=config.minimum_observed_frames,
            minimum_motion_range=config.minimum_motion_range, minimum_torso_pixels=config.minimum_torso_pixels,
            minimum_position_joints=config.minimum_position_joints,
        ),
        limitations=[
            "Puntuación experimental de semejanza 2D con esta referencia; no es una nota de técnica ni un porcentaje de precisión.",
            "Pesos y escalas iniciales sin calibración con un conjunto anotado ni validación por un entrenador.",
            "La puntuación usa las medidas y fases disponibles, aunque haya poca información; los avisos de calidad no la bloquean.",
            "Al faltar medidas se redistribuyen sus pesos entre las observadas. Una puntuación alta con datos parciales no demuestra semejanza del cuerpo completo.",
            "Las fases dependen de las cuatro marcas: revisa Inicio, Cima, Impacto y Final en ambos vídeos.",
            "Los controles comprueban disponibilidad de datos, tamaño y muestreo; no certifican la exactitud de MediaPipe ni del ángulo de cámara indicado.",
            "La inclinación de hombros y caderas es una proyección 2D; no mide su rotación tridimensional.",
            "Bola y palo son ayudas visuales experimentales y no intervienen en la puntuación. El impacto marcado no certifica el contacto.",
            "Los tiempos se muestran aparte: la alineación iguala las fases, por lo que la puntuación no mide el ritmo original.",
            "Se comparan fotogramas observados, sin interpolar posturas: diferencias de muestreo pueden producir pequeñas diferencias incluso entre movimientos equivalentes.",
        ],
    )


def observed_at(swing, points, timestamp, config):
    from bisect import bisect_right
    index = bisect_right([frame.timestamp_ms for frame in swing.frames], timestamp + 1e-6) - 1
    if index < 0 or timestamp - swing.frames[index].timestamp_ms > max(150, 1000 / swing.video.processed_fps + 50):
        return 0
    pose = points[index]
    return int(bool(pose))
