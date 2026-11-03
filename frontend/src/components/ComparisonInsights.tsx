import type { TechnicalAnalysis } from '../types/comparison';
import { differenceLabel, scoreLabel } from '../services/analysis';
import SwingTempo from './SwingTempo';

export default function ComparisonInsights({ analysis, onSelectPhase, showTempo = true }: {
  analysis: TechnicalAnalysis; onSelectPhase: (key: string) => void; showTempo?: boolean;
}) {
  return <section className="comparison-insights" aria-labelledby="insights-title">
    <h4 id="insights-title">Entiende tu comparación</h4>
    <p className="report-label">Datos de la aplicación · No generado por IA</p>
    <p className="report-comparison-summary">{analysis.similarity_score == null
      ? 'No hay ninguna medida comparable para calcular una puntuación general de semejanza.'
      : <>La semejanza general con esta referencia es <strong>{scoreLabel(analysis.similarity_score)}</strong>, calculada con las fases disponibles.</>}
      {' '}El ritmo y las diferencias destacadas te ayudan a interpretar la comparación.</p>
    {showTempo && <SwingTempo userRatio={analysis.user_backswing_downswing_ratio}
      referenceRatio={analysis.reference_backswing_downswing_ratio} phases={analysis.phases} />}
    <div className="analysis-insights report-differences">
      <section className="insight-card measured-differences" aria-labelledby="differences-title">
        <span className="insight-number">02 / DIFERENCIAS</span>
        <h5 id="differences-title">Diferencias que más pesan en esta comparación</h5>
        <p>Son diferencias medidas respecto a esta referencia; por sí solas no identifican errores técnicos.</p>
        {analysis.largest_differences.length ? <ul>{analysis.largest_differences.map(item => <li key={item.phase_key + '-' + item.metric_key}>
          <button type="button" className="secondary" onClick={() => onSelectPhase(item.phase_key)}
            aria-label={`Ver ${item.phase_label} en Puntuación final`}>{item.phase_label}</button>
          <span>{item.metric_label}: <strong>{differenceLabel(item.difference, item.unit)}</strong></span>
        </li>)}</ul> : <p className="note">No hay diferencias destacadas con las medidas disponibles.</p>}
      </section>
    </div>
  </section>;
}
