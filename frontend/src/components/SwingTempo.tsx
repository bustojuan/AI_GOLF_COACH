import { useId } from 'react';
import { secondsLabel } from '../services/analysis';

interface TempoStage { key: string; user_start_ms: number; user_end_ms: number; reference_start_ms: number; reference_end_ms: number }

export default function SwingTempo({ userRatio, referenceRatio, phases }: {
  userRatio: number; referenceRatio: number; phases: TempoStage[];
}) {
  const titleId = useId();
  const number = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const valid = (ratio: number) => Number.isFinite(ratio) && ratio > 0;
  const backswing = phases.find(stage => stage.key === 'backswing');
  const downswing = phases.find(stage => stage.key === 'downswing');

  return <section className="swing-tempo" aria-labelledby={titleId}>
    <div className="tempo-heading"><span className="report-eyebrow">EL PULSO DE TU SWING</span>
      <h5 id={titleId}>Subida y bajada. Tu ritmo.</h5>
      <p>Duración del backswing en relación con la bajada.</p>
    </div>
    <div className="tempo-comparison">{[
      { key: 'user', label: 'Tu swing', ratio: userRatio },
      { key: 'reference', label: 'Referencia', ratio: referenceRatio },
    ].map(item => {
      const available = valid(item.ratio);
      const share = available ? 100 * item.ratio / (1 + item.ratio) : 0;
      const duration = (stage: TempoStage | undefined) => {
        if (!stage) return null;
        const value = item.key === 'user' ? stage.user_end_ms - stage.user_start_ms : stage.reference_end_ms - stage.reference_start_ms;
        return Number.isFinite(value) && value > 0 ? secondsLabel(value) : null;
      };
      return <div className={`tempo-kpi tempo-${item.key}`} key={item.key}>
        <div className="tempo-value"><span>{item.label}</span><strong>{available ? number.format(item.ratio) : '—'}<small>{available ? ' : 1' : ''}</small></strong></div>
        <div className="tempo-track" aria-hidden="true">
          {available && <><span className="tempo-backswing" style={{ width: `${share}%` }} /><span className="tempo-downswing" style={{ width: `${100 - share}%` }} /></>}
        </div>
        <div className="tempo-legend"><span>Backswing {duration(backswing)}</span><span>Bajada {duration(downswing)}</span></div>
        <p>{available ? `Tu backswing dura ${number.format(item.ratio)} veces la bajada.`.replace(/^Tu /, item.key === 'user' ? 'Tu ' : 'El ') : 'No hay tiempos suficientes.'}</p>
      </div>;
    })}</div>
    <p className="tempo-note">Es una relación de tiempos, no la velocidad del palo. No hay un ritmo ideal fijado.</p>
  </section>;
}
