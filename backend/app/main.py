from fastapi import FastAPI
from starlette.requests import ClientDisconnect
from starlette.responses import JSONResponse

from app.api.swings import router
from app.api.references import router as reference_router
from app.api.comparisons import router as comparison_router
from app.api.recommendations import router as recommendation_router
from app.services.errors import ProcessingError
from app.config import MAX_UPLOAD_BYTES


class UploadLimitMiddleware:
    """Limita el cuerpo antes del parser multipart, incluso sin Content-Length."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        limit = MAX_UPLOAD_BYTES + 1024 * 1024  # Cabeceras y envoltorio multipart.
        headers = dict(scope.get("headers", []))
        try:
            too_large = int(headers.get(b"content-length", b"0")) > limit
        except ValueError:
            too_large = False
        if too_large:
            return await JSONResponse({"detail": "La petición supera el límite de 50 MB de vídeo."}, 413)(scope, receive, send)
        total = 0
        exceeded = False

        async def limited_receive():
            nonlocal total, exceeded
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body", b""))
                if total > limit:
                    exceeded = True
                    # El parser cierra los temporales al recibir ClientDisconnect.
                    raise ClientDisconnect()
            return message

        async def limited_send(message):
            if not exceeded:
                await send(message)

        try:
            await self.app(scope, limited_receive, limited_send)
        except ClientDisconnect:
            if not exceeded:
                raise
        if exceeded:
            await JSONResponse({"detail": "La petición supera el límite de 50 MB de vídeo."}, 413)(scope, receive, send)


app = FastAPI(title="AI Golf Coach", version="0.5.0")
app.add_middleware(UploadLimitMiddleware)
app.include_router(router)
app.include_router(reference_router)
app.include_router(comparison_router)
app.include_router(recommendation_router)


@app.exception_handler(ProcessingError)
async def processing_error_handler(request, error: ProcessingError):
    return JSONResponse({"detail": str(error)}, status_code=error.status_code)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "message": "AI Golf Coach backend disponible"}
