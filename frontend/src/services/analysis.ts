import type { ComparisonFrame, StageAnalysis, TechnicalAnalysis } from '../types/comparison';

/** Solo presentación: las medidas, filtros y puntuaciones se calculan en Python. */
export function chronologicalStages(analysis: TechnicalAnalysis): StageAnalysis[] {
  const stages = [...analysis.phases, ...analysis.moments];
  return ['address', 'backswing', 'top', 'downswing', 'impact', 'follow_through', 'finish']
    .flatMap(key => stages.filter(stage => stage.key === key));
}

export function framesForStage(frames: ComparisonFrame[], stage: Pick<StageAnalysis, 'kind' | 'user_start_ms' | 'user_end_ms'>): ComparisonFrame[] {
  if (!frames.length) return [];
  if (stage.kind === 'moment') {
    return [frames.reduce((nearest, frame) => Math.abs(frame.user_time_ms - stage.user_start_ms)
      < Math.abs(nearest.user_time_ms - stage.user_start_ms) ? frame : nearest)];
  }
  // La vista incluye ambos extremos para ver la transición completa.
  return frames.filter(frame => frame.user_time_ms >= stage.user_start_ms - 1e-6
    && frame.user_time_ms <= stage.user_end_ms + 1e-6);
}

export function differenceLabel(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value)) return 'Sin datos';
  const number = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return unit === 'degrees' ? `${number.format(value)}°` : `${number.format(value * 100)} % del torso`;
}

export function scoreLabel(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return 'Sin puntuación';
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(score)} / 100`;
}

export function secondsLabel(milliseconds: number): string {
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(milliseconds / 1000)} s`;
}
