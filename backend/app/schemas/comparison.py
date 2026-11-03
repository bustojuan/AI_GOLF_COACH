from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.swing import SwingResult, EquipmentFrame


class CaptureSetup(BaseModel):
    handedness: Literal["right", "left"]
    view: Literal["face_on", "down_the_line"]
    club: str = Field(default="", max_length=60)


class SwingAnchors(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_ms: int = Field(ge=0)
    top_ms: int = Field(ge=0)
    impact_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)

    @model_validator(mode="after")
    def ordered(self):
        if not self.start_ms < self.top_ms < self.impact_ms < self.end_ms:
            raise ValueError("Las marcas deben seguir el orden inicio < cima < impacto < final.")
        return self

    def times(self) -> list[int]:
        return [self.start_ms, self.top_ms, self.impact_ms, self.end_ms]


class ReferenceCreate(BaseModel):
    swing_id: UUID
    name: str = Field(min_length=1, max_length=100)
    setup: CaptureSetup
    anchors: SwingAnchors

    @model_validator(mode="after")
    def nonempty_name(self):
        self.name = self.name.strip()
        if not self.name:
            raise ValueError("La referencia necesita un nombre.")
        return self


class ReferenceSummary(BaseModel):
    id: str
    name: str
    setup: CaptureSetup
    anchors: SwingAnchors
    filename: str


class Reference(ReferenceSummary):
    swing: SwingResult


class ComparisonCreate(BaseModel):
    swing_id: UUID
    reference_id: UUID
    setup: CaptureSetup
    anchors: SwingAnchors


class Point2D(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    x: float
    y: float


class NormalizedClub(BaseModel):
    start: Point2D
    end: Point2D


class ComparisonFrame(BaseModel):
    elapsed_ms: float
    user_time_ms: float
    reference_time_ms: float
    user: list[Point2D | None]
    reference: list[Point2D | None]
    position_difference: float | None
    angle_differences: dict[str, float | None]
    position_joint_count: int = 0
    position_details: dict[str, float | None] = Field(default_factory=dict)
    user_ball: Point2D | None = None
    reference_ball: Point2D | None = None
    user_club: NormalizedClub | None = None
    reference_club: NormalizedClub | None = None


class KeyMomentPair(BaseModel):
    key: str
    label: str
    user_requested_ms: int
    reference_requested_ms: int
    user: EquipmentFrame | None = None
    reference: EquipmentFrame | None = None


class DifferenceMetric(BaseModel):
    key: str
    label: str
    unit: Literal["degrees", "torso_lengths"]
    mean_difference: float | None
    samples: int


class AnalysisQuality(BaseModel):
    status: Literal["sufficient", "limited", "insufficient"]
    minimum_metric_coverage: float = Field(ge=0, le=1)
    user_observed_frames: int
    reference_observed_frames: int
    reasons: list[str]


class StageAnalysis(BaseModel):
    key: str
    label: str
    kind: Literal["phase", "moment"]
    user_start_ms: float
    user_end_ms: float
    reference_start_ms: float
    reference_end_ms: float
    samples: int
    metrics: list[DifferenceMetric]
    quality: AnalysisQuality
    similarity_score: float | None = Field(default=None, ge=0, le=100)
    score_weight_coverage: float = Field(default=0, ge=0, le=1)


class ScorePolicy(BaseModel):
    version: str
    weights: dict[str, float]
    zero_score_differences: dict[str, float]
    minimum_metric_coverage: float
    minimum_processed_fps: float
    minimum_observed_frames: int
    minimum_motion_range: float
    minimum_torso_pixels: float
    minimum_position_joints: int
    quality_checks_block_score: bool = False


class MeasuredDifference(BaseModel):
    phase_key: str
    phase_label: str
    metric_key: str
    metric_label: str
    difference: float
    unit: Literal["degrees", "torso_lengths"]


class TechnicalAnalysis(BaseModel):
    version: str = "experimental-2d-v3-moments"
    similarity_score: float | None = Field(default=None, ge=0, le=100)
    score_reasons: list[str]
    phases: list[StageAnalysis]
    moments: list[StageAnalysis]
    user_backswing_downswing_ratio: float
    reference_backswing_downswing_ratio: float
    largest_differences: list[MeasuredDifference]
    policy: ScorePolicy
    limitations: list[str]


class ComparisonResult(BaseModel):
    swing_id: str
    reference_id: str
    reference_name: str
    method: Literal["manual_anchors_linear_2d"] = "manual_anchors_linear_2d"
    duration_ms: int
    user_anchors: SwingAnchors
    reference_anchors: SwingAnchors
    frames: list[ComparisonFrame]
    metrics: list[DifferenceMetric]
    comparable_frames: int
    warnings: list[str]
    key_moments: list[KeyMomentPair] = Field(default_factory=list)
    compared_joint_count: int = 16
    analysis: TechnicalAnalysis | None = None
