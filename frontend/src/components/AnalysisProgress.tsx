import { useEffect, useState } from 'react';
import type { UploadProgress } from '../services/upload';

export default function AnalysisProgress({ progress, busy, completed }: { progress: UploadProgress | null; busy: boolean; completed: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const started = performance.now();
    setElapsed(0);
    const interval = window.setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 500);
    return () => clearInterval(interval);
  }, [busy]);
  if (!busy && !completed) return null;
  const phase = completed ? 2 : progress?.phase === 'processing' ? 1 : 0;
  const percent = progress?.phase === 'uploading' && progress.total != null ? Math.min(100, Math.round(100 * progress.loaded / progress.total)) : null;
  return <div className={`analysis-progress${completed ? ' is-complete' : ''}`} aria-busy={busy}>
    <div className="analysis-progress-heading"><span className="processing-orbit" aria-hidden="true">{completed ? '✓' : <span />}</span>
      <div><strong>{completed ? 'Tu movimiento está listo' : phase === 0 ? 'Enviando tu vídeo' : 'Analizando el movimiento'}</strong>
        <p role="status">{completed ? 'Continúa para elegir tu referencia.' : phase === 0 ? percent == null ? 'Preparando la transferencia…' : `${percent} % del archivo enviado` : 'Detección local en curso. Puede tardar hasta cuatro minutos.'}</p></div>
      {busy && <span className="analysis-elapsed" aria-label="Tiempo transcurrido">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>}
    </div>
    <ol className="processing-stages">{['Enviar vídeo', 'Analizar movimiento', 'Listo para comparar'].map((label, index) => <li key={label}
      className={index < phase || completed ? 'done' : index === phase ? 'current' : ''} aria-current={index === phase && !completed ? 'step' : undefined}>
      <span>{index < phase || completed ? '✓' : String(index + 1).padStart(2, '0')}</span>{label}</li>)}</ol>
    {busy && phase === 0 && percent != null && <progress max={100} value={percent} aria-label="Transferencia del archivo" />}
  </div>;
}
