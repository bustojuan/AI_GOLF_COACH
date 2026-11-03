"""Parámetros iniciales, configurables en código y pendientes de calibración real.

Las escalas indican qué diferencia agota cada componente de semejanza. Los
mínimos son referencias para avisos de calidad: no bloquean la puntuación.
No son rangos biomecánicos ideales ni límites de calidad técnica.
"""
from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True)
class ScoreRule:
    key: str
    weight: float
    zero_at: float


@dataclass(frozen=True)
class AnalysisConfig:
    rules: tuple[ScoreRule, ...] = (
        ScoreRule("position", 0.5, 0.5),
        ScoreRule("left_elbow", 0.1, 45),
        ScoreRule("right_elbow", 0.1, 45),
        ScoreRule("left_knee", 0.1, 45),
        ScoreRule("right_knee", 0.1, 45),
        ScoreRule("torso_inclination", 0.1, 45),
    )
    minimum_metric_coverage: float = 0.8
    minimum_processed_fps: float = 15
    minimum_observed_frames: int = 3
    minimum_motion_range: float = 0.25
    minimum_torso_pixels: float = 40
    minimum_position_joints: int = 12

    def __post_init__(self):
        supported = {"position", "left_elbow", "right_elbow", "left_knee", "right_knee", "torso_inclination"}
        if (not self.rules or len({rule.key for rule in self.rules}) != len(self.rules)
                or any(rule.key not in supported or not isfinite(rule.weight) or not isfinite(rule.zero_at)
                       or rule.weight <= 0 or rule.zero_at <= 0 for rule in self.rules)
                or not all(isfinite(value) for value in (self.minimum_processed_fps, self.minimum_motion_range, self.minimum_torso_pixels))
                or not 0 < self.minimum_metric_coverage <= 1
                or self.minimum_processed_fps <= 0 or self.minimum_observed_frames < 3
                or self.minimum_motion_range <= 0 or self.minimum_torso_pixels <= 0
                or not 1 <= self.minimum_position_joints <= 16):
            raise ValueError("Configuración de análisis experimental inválida.")


DEFAULT_ANALYSIS_CONFIG = AnalysisConfig()
