import type { CoachStageKey, GeneratedRecommendation, PreparedRecommendation, ReportMetric } from '../types/recommendation';
import { differenceLabel } from './analysis.ts';

/** El contrato de IA usa porcentajes explícitos; el formateador usa longitudes. */
export function reportMetricLabel(metric: Pick<ReportMetric, 'difference' | 'unit'>): string {
  const value = metric.difference;
  return metric.unit === 'degrees' ? differenceLabel(value, 'degrees')
    : differenceLabel(value == null ? null : value / 100, 'torso_lengths');
}

export const COACH_STAGE_LABELS: Record<CoachStageKey, string> = {
  address: 'Inicio', backswing: 'Backswing', top: 'Cima', downswing: 'Bajada',
  impact: 'Impacto', follow_through: 'Finalización', finish: 'Postura final',
};
export const ASSESSMENT_LABELS = {
  evaluated: 'Datos disponibles', partial: 'Datos parciales', not_evaluable: 'Sin datos evaluables',
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function fields(value: Record<string, unknown>, names: string[]): boolean {
  return Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}
function texts(value: unknown, maximum: number, length: number): value is string[] {
  return Array.isArray(value) && value.length <= length && value.every(item => text(item, maximum));
}

/** Verifica contrato, disponibilidad y evidencias de fases y momentos antes de mostrarlos. */
export function readGeneratedReport(raw: unknown, prepared: PreparedRecommendation): GeneratedRecommendation {
  const invalid = () => new Error('La explicación recibida no es válida o cita mediciones incorrectas. No se mostrará.');
  if (!record(raw) || !fields(raw, ['status', 'generated_by_ai', 'report_id', 'response'])
    || raw.status !== 'generated' || raw.generated_by_ai !== true) throw invalid();
  if (raw.report_id !== prepared.report_id) {
    throw new Error('La comparación ha cambiado. Vuelve a preparar el informe antes de generar una explicación.');
  }
  const response = raw.response;
  if (!record(response) || !fields(response, ['strengths', 'stages', 'priorities'])
    || !Array.isArray(response.strengths) || response.strengths.length > 3
    || !Array.isArray(response.stages) || response.stages.length !== 7
    || !Array.isArray(response.priorities) || response.priorities.length > 3
    || !Array.isArray(prepared.data.phases) || !Array.isArray(prepared.data.moments)) throw invalid();
  const sources = [...prepared.data.phases, ...prepared.data.moments];

  function evidence(value: unknown, stageKey: string, minimum: number, maximum: number): boolean {
    if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return false;
    const source = sources.find(stage => stage.key === stageKey);
    const ids = new Set<string>();
    return value.every(citation => {
      if (!record(citation) || !fields(citation, ['evidence_id', 'difference']) || !text(citation.evidence_id, 100)
        || typeof citation.difference !== 'number' || !Number.isFinite(citation.difference) || citation.difference < 0
        || ids.has(citation.evidence_id)) return false;
      ids.add(citation.evidence_id);
      const metric = source?.metrics.find(metric => metric.evidence_id === citation.evidence_id);
      return metric != null && metric.difference != null && metric.samples > 0
        && Math.abs(metric.difference - citation.difference) <= 0.0001;
    });
  }

  const keys = Object.keys(COACH_STAGE_LABELS);
  if (!response.stages.every((stage, index) => {
    if (!record(stage) || !fields(stage, ['stage_key', 'assessment', 'summary', 'strengths', 'areas_to_review',
      'recommended_drill', 'success_check', 'evidence'])
      || stage.stage_key !== keys[index] || !text(stage.summary, 1200)
      || !texts(stage.strengths, 400, 2) || !texts(stage.areas_to_review, 400, 2)
      || (stage.recommended_drill !== null && !text(stage.recommended_drill, 600))
      || (stage.success_check !== null && !text(stage.success_check, 600))
      || (stage.recommended_drill === null) !== (stage.success_check === null)
      || (stage.areas_to_review.length > 0 && stage.recommended_drill === null)) return false;
    const source = sources.find(item => item.key === stage.stage_key);
    const measured = source?.metrics.some(metric => metric.difference != null && metric.samples > 0);
    const expected = !measured ? 'not_evaluable' : source?.quality === 'sufficient' ? 'evaluated' : 'partial';
    if (stage.assessment !== expected) return false;
    if (!measured && (stage.strengths.length || stage.areas_to_review.length
      || stage.recommended_drill !== null || stage.success_check !== null)) return false;
    return evidence(stage.evidence, keys[index], measured ? 1 : 0, measured ? 10 : 0);
  })) throw invalid();
  if (!response.strengths.every(strength => record(strength)
    && fields(strength, ['stage_key', 'observation', 'evidence'])
    && typeof strength.stage_key === 'string' && keys.includes(strength.stage_key)
    && text(strength.observation, 800)
    && evidence(strength.evidence, strength.stage_key, 1, 5))) throw invalid();
  if (!response.priorities.every(priority => record(priority)
    && fields(priority, ['stage_key', 'observation', 'recommendation', 'evidence'])
    && typeof priority.stage_key === 'string' && keys.includes(priority.stage_key)
    && text(priority.observation, 800) && text(priority.recommendation, 800)
    && evidence(priority.evidence, priority.stage_key, 1, 5))) throw invalid();
  return raw as unknown as GeneratedRecommendation;
}
