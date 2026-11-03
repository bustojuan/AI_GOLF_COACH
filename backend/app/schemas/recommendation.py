"""Datos mínimos para preparar la IA y contrato de su futura respuesta."""
from typing import Annotated, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from app.schemas.comparison import ComparisonCreate

StageKey = Literal["address", "backswing", "top", "downswing", "impact", "follow_through", "finish"]
STAGE_KEYS = get_args(StageKey)
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)]
PracticeText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]


class CoachModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)


class RecommendationRequest(ComparisonCreate):
    model_config = ConfigDict(extra="forbid")


class ReportMetric(CoachModel):
    evidence_id: str
    key: str
    label: str
    unit: Literal["degrees", "torso_percent"]
    difference: float | None = Field(ge=0)
    samples: int = Field(ge=0)
    total_samples: int = Field(ge=0)


class ReportStage(CoachModel):
    key: str
    label: str
    kind: Literal["phase", "moment"]
    user_start_ms: float
    user_end_ms: float
    reference_start_ms: float
    reference_end_ms: float
    similarity_score: float | None = Field(ge=0, le=100)
    available_score_metrics: int
    total_score_metrics: int
    score_weight_coverage: float = Field(ge=0, le=1)
    quality: Literal["sufficient", "limited", "insufficient"]
    minimum_metric_coverage: float = Field(ge=0, le=1)
    user_observed_frames: int
    reference_observed_frames: int
    warnings: list[str]
    metrics: list[ReportMetric]


class CoachInput(CoachModel):
    schema_version: Literal["coach-input-v1"] = "coach-input-v1"
    language: Literal["es"] = "es"
    analysis_version: str
    handedness: Literal["right", "left"]
    view: Literal["face_on", "down_the_line"]
    similarity_score: float | None = Field(ge=0, le=100)
    scored_phases: int
    total_phases: int
    user_backswing_downswing_ratio: float
    reference_backswing_downswing_ratio: float
    overall_metrics: list[ReportMetric]
    phases: list[ReportStage]
    moments: list[ReportStage]
    warnings: list[str]
    limitations: list[str]


class PreparedRecommendation(CoachModel):
    status: Literal["prepared"] = "prepared"
    generated_by_ai: Literal[False] = False
    local_only: Literal[True] = True
    report_id: str
    prompt_version: str
    local_summary: str
    data: CoachInput


class EvidenceCitation(CoachModel):
    evidence_id: str = Field(min_length=1, max_length=100)
    difference: float = Field(ge=0)


class StageCoaching(CoachModel):
    stage_key: StageKey
    assessment: Literal["evaluated", "partial", "not_evaluable"]
    summary: str = Field(min_length=1, max_length=1200)
    strengths: list[ShortText] = Field(default_factory=list, max_length=2)
    areas_to_review: list[ShortText] = Field(default_factory=list, max_length=2)
    recommended_drill: PracticeText | None = None
    success_check: PracticeText | None = None
    evidence: list[EvidenceCitation] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def coherent_assessment(self):
        if self.assessment == "not_evaluable" and (
            self.strengths or self.areas_to_review or self.recommended_drill is not None
            or self.success_check is not None or self.evidence
        ):
            raise ValueError("Una etapa no evaluable solo puede explicar la ausencia de datos.")
        if (self.recommended_drill is None) != (self.success_check is None):
            raise ValueError("Una práctica debe incluir cómo comprobarla, y viceversa.")
        if self.areas_to_review and self.recommended_drill is None:
            raise ValueError("Un aspecto por mejorar debe incluir un ejercicio y cómo comprobarlo.")
        return self


class StrengthHighlight(CoachModel):
    stage_key: StageKey
    observation: str = Field(min_length=1, max_length=800)
    evidence: list[EvidenceCitation] = Field(min_length=1, max_length=5)


class PriorityImprovement(StrengthHighlight):
    recommendation: str = Field(min_length=1, max_length=800)


class CoachResponseV3(CoachModel):
    strengths: list[StrengthHighlight] = Field(max_length=3)
    stages: list[StageCoaching] = Field(min_length=7, max_length=7)
    priorities: list[PriorityImprovement] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def validate_stages(self):
        if tuple(stage.stage_key for stage in self.stages) != STAGE_KEYS:
            raise ValueError("Deben incluirse las siete etapas en orden y sin duplicarlas.")
        return self


class GeneratedRecommendation(CoachModel):
    status: Literal["generated"] = "generated"
    generated_by_ai: Literal[True] = True
    report_id: str
    response: CoachResponseV3


class CoachStatus(CoachModel):
    enabled: bool
    provider: Literal["disabled", "gemini"]
    message: str
