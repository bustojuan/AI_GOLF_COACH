from uuid import UUID, uuid4

from fastapi import APIRouter

from app.schemas.comparison import Reference, ReferenceCreate, ReferenceSummary
from app.services import storage
from app.services.errors import ProcessingError
from app.services.swing_comparison import normalise_frame, validate_anchors

router = APIRouter(prefix="/api/references", tags=["references"])


@router.get("", response_model=list[ReferenceSummary])
def list_references():
    return storage.list_references()


@router.get("/{reference_id}", response_model=Reference)
def get_reference(reference_id: UUID):
    return storage.load_reference(reference_id)


@router.post("", response_model=Reference, status_code=201)
def create_reference(request: ReferenceCreate):
    swing = storage.load_swing(request.swing_id)
    validate_anchors(swing, request.anchors)
    if not any(normalise_frame(frame, swing) for frame in swing.frames
               if request.anchors.start_ms <= frame.timestamp_ms <= request.anchors.end_ms):
        raise ProcessingError("La referencia necesita detecciones visibles de hombros y caderas en el tramo marcado.")
    reference = Reference(
        id=str(uuid4()), name=request.name, setup=request.setup, anchors=request.anchors,
        filename=swing.filename, swing=swing,
    )
    storage.save_reference(reference)
    return reference