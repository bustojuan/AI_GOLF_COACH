"""Proveedor aislado. Preparar un informe no importa LangChain ni abre conexiones."""
import os
from typing import Protocol

from app.schemas.recommendation import CoachResponseV3, CoachStatus
from app.services.errors import ProcessingError


class CoachProvider(Protocol):
    def generate(self, messages: list[tuple[str, str]]) -> object: ...


class LangChainGeminiProvider:
    def generate(self, messages: list[tuple[str, str]]) -> object:
        # Importación diferida: la vista previa funciona sin esta dependencia.
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except ImportError as error:
            raise ProcessingError("La conexión de IA requiere instalar backend/requirements-ai.txt.", 503) from error
        model = ChatGoogleGenerativeAI(
            model=os.environ["GOLF_COACH_AI_MODEL"],
            api_key=os.environ["GOLF_COACH_AI_API_KEY"],
            vertexai=False, timeout=60, max_retries=0, max_tokens=8192,
        )
        return model.with_structured_output(CoachResponseV3, method="json_schema").invoke(messages)


def coach_status() -> CoachStatus:
    # Una clave existente en el equipo nunca activa la IA por sí sola.
    enabled = (os.getenv("GOLF_COACH_AI_ENABLED", "false").casefold() == "true"
               and os.getenv("GOLF_COACH_AI_PROVIDER", "disabled") == "gemini")
    configured = bool(os.getenv("GOLF_COACH_AI_MODEL", "").strip() and os.getenv("GOLF_COACH_AI_API_KEY", "").strip())
    if not enabled:
        return CoachStatus(enabled=False, provider="disabled", message="IA todavía sin activar. Preparar el informe es local.")
    if not configured:
        return CoachStatus(enabled=False, provider="disabled", message="Faltan el modelo o la clave del backend. La vista previa sigue disponible.")
    return CoachStatus(enabled=True, provider="gemini", message="Proveedor configurado. Solo se consultará mediante una petición explícita de generación.")


def require_enabled_provider() -> CoachProvider:
    status = coach_status()
    if not status.enabled:
        raise ProcessingError(status.message, 503)
    return LangChainGeminiProvider()
