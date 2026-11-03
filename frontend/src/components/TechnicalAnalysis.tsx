import { useState } from 'react';
import type { TechnicalAnalysis as Analysis, StageAnalysis, ComparisonFrame } from '../types/comparison';
import { chronologicalStages, differenceLabel, scoreLabel } from '../services/analysis';
import StagePreview from './StagePreview';
import ScoreOverview from './ScoreOverview';

export default function TechnicalAnalysis({ analysis, frames, active, selectedKey, onSelectKey, seek, viewSelection }: {
  analysis: Analysis; frames: ComparisonFrame[]; active: boolean;
  selectedKey: string; onSelectKey: (key: string) => void;
  seek: (time: number) => void; viewSelection: () => void;
}) {
  const stages = chronologicalStages(analysis);
  const [visibleSwings, setVisibleSwings] = useState({ user: true, reference: true });
  const [focusMetric, setFocusMetric] = useState<string | null>(null);
  const selected = stages.find(stage => stage.key === selectedKey) ?? stages[0];
  function choose(stage: StageAnalysis) { onSelectKey(stage.key); seek(stage.user_start_ms); setFocusMetric(null); }

  return <section className="technical-analysis" aria-labelledby="analysis-title">
    <h3 id="analysis-title">Puntuación general</h3>
    <ScoreOverview score={analysis.similarity_score} />
    {analysis.similarity_score == null && <p className="analysis-notice" role="status">No hay ninguna medida comparable para calcular la puntuación. Puedes revisar las marcas y detecciones de ambos vídeos.</p>}
    <div className="stage-cards" role="group" aria-label="Puntuaciones en orden del swing">{stages.map(stage => <button
      type="button" className={`stage-card ${selected.key === stage.key ? 'selected' : ''}`}
      aria-pressed={selected.key === stage.key} aria-controls="selected-stage" key={stage.key} onClick={() => choose(stage)}>
      <span className="stage-kind">{stage.kind === 'moment' ? 'Momento' : 'Fase'}</span>
      <span className="stage-name">{stage.label}</span><strong>{scoreLabel(stage.similarity_score)}</strong>
    </button>)}</div>
    <div id="selected-stage" className="stage-detail">
      <div className="stage-overview">
        <div>
          <span className="stage-kind">{selected.kind === 'moment' ? 'Momento' : 'Fase'} seleccionado</span>
          <h4 aria-live="polite">{selected.label}</h4>
          <p>{selected.kind === 'phase' ? 'Observa el movimiento completo de esta fase en tu monigote.' : 'Observa tu postura en el instante marcado.'}</p>
          <button type="button" className="secondary" onClick={() => { seek(selected.user_start_ms); viewSelection(); }}>Ver en comparación</button>
        </div>
        <StagePreview key={selected.key} frames={frames} stage={selected} active={active}
          visibleSwings={visibleSwings} onVisibilityChange={setVisibleSwings} focusMetric={focusMetric} />
      </div>
      <div className="stage-data">
        <div className="metric-table-wrap"><table className="metric-table stage-metrics">
          <caption>{selected.kind === 'phase' ? 'Media por fase' : 'Medida del momento'} respecto a la referencia</caption>
          <thead><tr><th>Qué comparamos</th><th>Diferencia</th></tr></thead>
          <tbody>{selected.metrics.map(metric => <tr key={metric.key} className={focusMetric === metric.key ? 'metric-focused' : ''}><th scope="row">
            <button type="button" className="metric-focus-button" disabled={metric.mean_difference == null} aria-pressed={focusMetric === metric.key} aria-label={`Resaltar ${metric.label}`}
              onClick={() => setFocusMetric(current => current === metric.key ? null : metric.key)}>{metric.label}<span aria-hidden="true">↗</span></button></th>
            <td>{differenceLabel(metric.mean_difference, metric.unit)}</td></tr>)}</tbody>
        </table></div>
        <aside className="stage-explanation">
          <h5>Cómo leer {selected.kind === 'phase' ? 'esta fase' : 'este momento'}</h5>
          <p>{selected.kind === 'phase' ? 'La tabla resume las diferencias medias durante esta fase, con ambos movimientos sincronizados.'
            : 'La tabla compara las posturas de ambos vídeos en este momento, usando el fotograma procesado más cercano de la comparación.'}</p>
          <p>Una diferencia menor indica mayor semejanza con la referencia. Los valores son diferencias absolutas: no indican quién flexiona más ni hacia dónde se mueve.</p>
          <p>Los ángulos se expresan en grados. Las posiciones, en <strong>porcentaje de la longitud del torso</strong>: 10 % equivale a una décima de la distancia entre hombros y cadera, no a centímetros.</p>
          <p>«Sin datos» significa que faltan las articulaciones necesarias para esa medida. La puntuación utiliza las medidas disponibles.</p>
          {selected.quality.status !== 'sufficient' && <p className="note">Hay datos limitados en esta comparación. Revisa la postura del monigote y las marcas; la puntuación puede representar solo parte del cuerpo.</p>}
          <p className="note">Es una semejanza con esta referencia, no una nota de calidad técnica.</p>
        </aside>
      </div>
      <p className="metric-focus-help">Pulsa una medida para localizar esa zona en el monigote. La tabla conserva los datos de la etapa.</p>
    </div>
    <details className="score-method insight-card"><summary><span className="insight-number">MÉTODO</span><span className="insight-summary-title">Cómo calculamos la puntuación con los datos disponibles</span><span className="insight-summary-help">Consulta los pesos, las escalas y las medidas que intervienen.</span></summary>
          <p>En cada fase usamos la diferencia media de cada medida. En cada momento usamos la diferencia de su postura.
            Convertimos esas diferencias en semejanza: 100 × máximo(0, 1 − diferencia / escala).
            Después calculamos la media ponderada usando solo las medidas disponibles y redistribuyendo sus pesos.
            La puntuación general da el mismo peso a las tres fases que tienen alguna puntuación; las fases sin medidas comparables se omiten.
            Las notas de los momentos se muestran aparte y no se suman a la general, para no contar dos veces las posturas que ya pertenecen a una fase.</p>
          <div className="metric-table-wrap"><table className="metric-table"><caption>Pesos y escalas experimentales</caption>
            <thead><tr><th>Medida</th><th>Peso</th><th>Diferencia que agota su componente</th></tr></thead>
            <tbody>{Object.entries(analysis.policy.weights).map(([key, weight]) => {
              const metric = selected.metrics.find(metric => metric.key === key)!;
              const total = Object.values(analysis.policy.weights).reduce((sum, item) => sum + item, 0);
              return <tr key={key}><th scope="row">{metric.label}</th><td>{Math.round(weight / total * 100)} %</td>
                <td>{differenceLabel(analysis.policy.zero_score_differences[key], metric.unit)}</td></tr>;
            })}</tbody>
          </table></div>
          <p>Las referencias de calidad ({Math.round(analysis.policy.minimum_metric_coverage * 100)} % de cobertura por medida,
            {analysis.policy.minimum_observed_frames} fotogramas distintos, {analysis.policy.minimum_processed_fps} FPS,
            torso de {analysis.policy.minimum_torso_pixels} píxeles y {analysis.policy.minimum_position_joints} articulaciones para la distancia corporal) solo generan avisos.</p>
          <p>La puntuación se calcula aunque estas referencias no se alcancen. Solo queda sin puntuación una fase o momento que no tiene ninguna medida comparable.
            No se inventan articulaciones ni se consideran perfectas las medidas ausentes. Las puntuaciones basadas en conjuntos distintos de medidas pueden no ser comparables entre sí.</p>
          <ul>{analysis.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul>
          <p className="note">Versión del método: {analysis.version}. Cambiar pesos o escalas cambia las puntuaciones.</p>
    </details>
  </section>;
}
