"""Preparación local y validación de una futura interpretación de las métricas."""
import hashlib
import math

from pydantic import ValidationError

from app.schemas.comparison import CaptureSetup, ComparisonResult
from app.schemas.recommendation import (
    CoachInput, CoachResponseV3, GeneratedRecommendation, PreparedRecommendation,
    ReportMetric, ReportStage,
)
from app.services.coach_prompt import PROMPT_VERSION, build_coach_messages
from app.services.coach_provider import CoachProvider
from app.services.errors import ProcessingError


def report_metrics(metrics, total_samples: int, scope: str) -> list[ReportMetric]:
    return [ReportMetric(
        evidence_id=f"{scope}.{metric.key}", key=metric.key, label=metric.label,
        unit="degrees" if metric.unit == "degrees" else "torso_percent",
        difference=(None if metric.mean_difference is None else
                    round(metric.mean_difference * (1 if metric.unit == "degrees" else 100), 4)),
        samples=metric.samples, total_samples=total_samples,
    ) for metric in metrics]


def prepare_report(result: ComparisonResult, setup: CaptureSetup) -> PreparedRecommendation:
    analysis = result.analysis
    if analysis is None:
        raise ProcessingError("Vuelve a comparar los swings para preparar el análisis técnico.")

    def stage_report(stage):
        available = sum(metric.key in analysis.policy.weights and metric.mean_difference is not None for metric in stage.metrics)
        return ReportStage(
            key=stage.key, label=stage.label, kind=stage.kind,
            user_start_ms=stage.user_start_ms, user_end_ms=stage.user_end_ms,
            reference_start_ms=stage.reference_start_ms, reference_end_ms=stage.reference_end_ms,
            similarity_score=stage.similarity_score, available_score_metrics=available,
            total_score_metrics=len(analysis.policy.weights), score_weight_coverage=stage.score_weight_coverage,
            quality=stage.quality.status, minimum_metric_coverage=stage.quality.minimum_metric_coverage,
            user_observed_frames=stage.quality.user_observed_frames,
            reference_observed_frames=stage.quality.reference_observed_frames,
            warnings=stage.quality.reasons, metrics=report_metrics(stage.metrics, stage.samples, stage.key),
        )

    count = sum(stage.similarity_score is not None for stage in analysis.phases)
    data = CoachInput(
        analysis_version=analysis.version, handedness=setup.handedness, view=setup.view,
        similarity_score=analysis.similarity_score, scored_phases=count, total_phases=len(analysis.phases),
        user_backswing_downswing_ratio=analysis.user_backswing_downswing_ratio,
        reference_backswing_downswing_ratio=analysis.reference_backswing_downswing_ratio,
        overall_metrics=report_metrics(result.metrics, len(result.frames), "overall"),
        phases=[stage_report(stage) for stage in analysis.phases],
        moments=[stage_report(stage) for stage in analysis.moments],
        warnings=list(dict.fromkeys([*result.warnings, *analysis.score_reasons])),
        limitations=[*analysis.limitations,
                      "Las diferencias son absolutas: no indican quién flexiona más ni la dirección del desplazamiento.",
                      "El modelo solo recibirá métricas; no podrá evaluar detalles visuales no medidos."],
    )
    # El sobre local vincula el informe a esta comparación. Sus IDs no entran
    # en los mensajes del modelo; tampoco nombres de archivo o de referencia.
    identity = f"{result.swing_id}:{result.reference_id}:{PROMPT_VERSION}:{data.model_dump_json()}"
    report_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    return PreparedRecommendation(
        report_id=report_id, prompt_version=PROMPT_VERSION, data=data,
        local_summary=(f"Se han preparado {len(data.overall_metrics)} medidas generales, {len(data.phases)} fases y "
                       f"{len(data.moments)} momentos clave. Hay puntuación de semejanza en {count} de {len(data.phases)} fases. "
                       "Este resumen lo construye la aplicación a partir de las mediciones; no lo ha escrito una IA."),
    )


def validate_coach_response(data: CoachInput, raw: object) -> CoachResponseV3:
    response = CoachResponseV3.model_validate(raw)
    sources = {stage.key: stage for stage in [*data.phases, *data.moments]}

    def valid_metrics(key):
        source = sources.get(key)
        return {metric.evidence_id: metric for metric in source.metrics
                if metric.difference is not None and metric.samples > 0} if source else {}

    def citations(key, evidence):
        allowed = valid_metrics(key)
        if len({citation.evidence_id for citation in evidence}) != len(evidence):
            raise ValueError("No se puede repetir la misma evidencia dentro de una cita.")
        for citation in evidence:
            metric = allowed.get(citation.evidence_id)
            if metric is None or not math.isclose(citation.difference, metric.difference, abs_tol=0.0001, rel_tol=0):
                raise ValueError("La respuesta cita una medida ausente, de otra etapa o con un valor distinto.")

    for stage in response.stages:
        source = sources.get(stage.stage_key)
        available = valid_metrics(stage.stage_key)
        expected = "not_evaluable" if not available else "evaluated" if source.quality == "sufficient" else "partial"
        if stage.assessment != expected:
            raise ValueError("La evaluación de la etapa no coincide con la disponibilidad de sus mediciones.")
        if available and not stage.evidence:
            raise ValueError("Una etapa con mediciones debe indicar su evidencia.")
        citations(stage.stage_key, stage.evidence)
    for highlight in [*response.strengths, *response.priorities]:
        citations(highlight.stage_key, highlight.evidence)
    return response


def generate_report(prepared: PreparedRecommendation, provider: CoachProvider) -> GeneratedRecommendation:
    try:
        raw = provider.generate(build_coach_messages(prepared.data))
        response = validate_coach_response(prepared.data, raw)
    except ProcessingError:
        raise
    except TimeoutError as error:
        raise ProcessingError("El proveedor de IA no respondió a tiempo. El informe local sigue disponible.", 504) from error
    except (ValidationError, ValueError, TypeError) as error:
        raise ProcessingError("La respuesta de IA no cumple el contrato o cita mediciones incorrectas. No se mostrará.", 502) from error
    except Exception as error:
        # Los mensajes del SDK pueden contener datos de la petición o credenciales.
        raise ProcessingError("No se pudo obtener una respuesta del proveedor de IA. El informe local sigue disponible.", 502) from error
    return GeneratedRecommendation(report_id=prepared.report_id, response=response)
