"""Persistencia local de referencias; no depende de la detección corporal."""
from pathlib import Path
from uuid import UUID, uuid4

from pydantic import ValidationError

from app.config import DATA_DIR, RESULT_DIR
from app.schemas.comparison import Reference, ReferenceSummary
from app.schemas.swing import SwingResult
from app.services.errors import ProcessingError

REFERENCE_DIR = DATA_DIR / "reference_swings"


def load_swing(swing_id: UUID) -> SwingResult:
    return _read(RESULT_DIR / f"{swing_id}.json", SwingResult, "No se ha encontrado el swing procesado.")


def load_reference(reference_id: UUID) -> Reference:
    return _read(REFERENCE_DIR / f"{reference_id}.json", Reference, "No se ha encontrado la referencia.")


def _read(path: Path, model, missing_message: str):
    if not path.is_file():
        raise ProcessingError(missing_message, 404)
    try:
        return model.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValidationError) as error:
        raise ProcessingError("No se pueden leer los datos locales. Vuelve a procesar el archivo.", 500) from error


def save_reference(reference: Reference) -> None:
    REFERENCE_DIR.mkdir(parents=True, exist_ok=True)
    destination = REFERENCE_DIR / f"{UUID(reference.id)}.json"
    partial = REFERENCE_DIR / f"{uuid4()}.tmp"
    try:
        partial.write_text(reference.model_dump_json(), encoding="utf-8")
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)


def list_references() -> list[ReferenceSummary]:
    if not REFERENCE_DIR.exists():
        return []
    summaries = []
    for path in sorted(REFERENCE_DIR.glob("*.json")):
        # Una referencia dañada no bloquea la biblioteca; su GET individual sí da error.
        try:
            reference = Reference.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValidationError):
            continue
        summaries.append(ReferenceSummary(**reference.model_dump(exclude={"swing"})))
    return sorted(summaries, key=lambda item: (item.name.casefold(), item.id))