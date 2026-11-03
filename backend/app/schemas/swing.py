from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class ImagePoint(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class ClubSegment(BaseModel):
    start: ImagePoint
    end: ImagePoint


class EquipmentFrame(BaseModel):
    timestamp_ms: int = Field(ge=0)
    ball: ImagePoint | None = None
    club: ClubSegment | None = None
    preview_jpeg: str | None = None


class SuggestedAnchors(BaseModel):
    start_ms: int | None = None
    top_ms: int | None = None
    impact_ms: int | None = None
    end_ms: int | None = None
    notes: list[str] = Field(default_factory=list)
    refinement_frames: int = 0
    impact_refined: bool = False


class Landmark(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    x: float
    y: float
    z: float
    visibility: float = Field(ge=0, le=1)
    presence: float = Field(ge=0, le=1)


class PoseFrame(BaseModel):
    timestamp_ms: int = Field(ge=0)
    landmarks: list[Landmark]
    low_visibility: bool
    ball: ImagePoint | None = None
    club: ClubSegment | None = None
    preview_jpeg: str | None = None


class VideoInfo(BaseModel):
    width: int
    height: int
    fps: float
    duration_seconds: float
    processed_fps: float


class SwingResult(BaseModel):
    id: str
    filename: str
    status: Literal["completed"] = "completed"
    video: VideoInfo
    visibility_threshold: float
    detected_frames: int
    frames: list[PoseFrame]
    warnings: list[str]
    analysis_version: int = 1
    suggested_anchors: SuggestedAnchors = Field(default_factory=SuggestedAnchors)
    equipment_frames: list[EquipmentFrame] = Field(default_factory=list)
