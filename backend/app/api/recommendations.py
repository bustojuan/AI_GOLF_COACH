from fastapi import APIRouter

from app.schemas.recommendation import CoachStatus, GeneratedRecommendation, PreparedRecommendation, RecommendationRequest
from app.services import storage
from app.services.ai_coach import generate_report, prepare_report
from app.services.coach_provider import coach_status, require_enabled_provider
from app.services.swing_comparison import compare_swings

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


def prepare_from_saved_data(request: RecommendationRequest) -> PreparedRecommendation:
    result = compare_swings(storage.load_swing(request.swing_id), storage.load_reference(request.reference_id),
                            request.setup, request.anchors)
    return prepare_report(result, request.setup)


@router.get("/status", response_model=CoachStatus)
def get_status():
    return coach_status()


@router.post("/preview", response_model=PreparedRecommendation)
def preview(request: RecommendationRequest):
    # No se reciben métricas del navegador ni se ejecuta el proveedor.
    return prepare_from_saved_data(request)


@router.post("", response_model=GeneratedRecommendation)
def generate(request: RecommendationRequest):
    # Guardar una clave o preparar un informe no activa la generación.
    provider = require_enabled_provider()
    return generate_report(prepare_from_saved_data(request), provider)
