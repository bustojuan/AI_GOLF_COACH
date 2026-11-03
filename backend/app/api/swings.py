import logging
from pathlib import Path
from threading import Lock
from uuid import UUID, uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, RESULT_DIR, UPLOAD_DIR
from app.schemas.swing import SwingResult
from app.services.errors import ProcessingError
from app.services.video_processing import process_video

router = APIRouter(prefix="/api/swings", tags=["swings"])
processing_lock = Lock()
logger = logging.getLogger(__name__)


@router.post("", response_model=SwingResult, status_code=201)
def create_swing(file: UploadFile = File(...)) -> SwingResult:
    filename = (file.filename or "video").replace("\\", "/").rsplit("/", 1)[-1][:200]
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "Formato no admitido. Selecciona MP4, MOV, WebM o AVI.")
    if file.content_type and not (
        file.content_type.startswith("video/") or file.content_type == "application/octet-stream"
    ):
        raise HTTPException(415, "El archivo debe ser un vídeo.")
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "El vídeo supera los 50 MB.")
    if not processing_lock.acquire(blocking=False):
        raise HTTPException(429, "Hay otro vídeo en proceso. Espera a que termine.")
    swing_id = str(uuid4())
    source = UPLOAD_DIR / (swing_id + extension)
    result_path = RESULT_DIR / (swing_id + ".json")
    partial = result_path.with_suffix(".tmp")
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        RESULT_DIR.mkdir(parents=True, exist_ok=True)
        size = 0
        with source.open("wb") as destination:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "El vídeo supera los 50 MB.")
                destination.write(chunk)
        if not size:
            raise HTTPException(422, "El vídeo está vacío.")
        result = process_video(source, swing_id, filename)
        partial.write_text(result.model_dump_json(), encoding="utf-8")
        partial.replace(result_path)
        return result
    except ProcessingError as error:
        raise HTTPException(error.status_code, str(error)) from error
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Error procesando vídeo %s", swing_id)
        raise HTTPException(500, "No se ha podido procesar el vídeo. Consulta el terminal del backend.") from error
    finally:
        source.unlink(missing_ok=True)
        partial.unlink(missing_ok=True)
        file.file.close()
        processing_lock.release()


@router.get("/{swing_id}", response_model=SwingResult)
def get_swing(swing_id: UUID) -> SwingResult:
    path = RESULT_DIR / f"{swing_id}.json"
    if not path.is_file():
        raise HTTPException(404, "No se ha encontrado ese resultado.")
    return SwingResult.model_validate_json(path.read_text(encoding="utf-8"))