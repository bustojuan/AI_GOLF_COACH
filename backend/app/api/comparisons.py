from fastapi import APIRouter

from app.schemas.comparison import ComparisonCreate, ComparisonResult
from app.services import storage
from app.services.swing_comparison import compare_swings

router = APIRouter(prefix="/api/comparisons", tags=["comparisons"])


@router.post("", response_model=ComparisonResult)
def create_comparison(request: ComparisonCreate):
    return compare_swings(
        storage.load_swing(request.swing_id), storage.load_reference(request.reference_id),
        request.setup, request.anchors,
    )