import { useEffect, useRef } from 'react';
import { scoreLabel } from '../services/analysis';

export default function ScoreOverview({ score }: { score: number | null }) {
  const ring = useRef<SVGCircleElement>(null);
  const length = 2 * Math.PI * 70;
  const target = length * (1 - Math.max(0, Math.min(100, score ?? 0)) / 100);
  useEffect(() => {
    if (!ring.current || score == null || typeof ring.current.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = ring.current.animate([{ strokeDashoffset: String(length) }, { strokeDashoffset: String(target) }],
      { duration: 950, easing: 'cubic-bezier(.22,1,.36,1)' });
    return () => animation.cancel();
  }, [score, target, length]);
  return <div className="similarity-summary score-overview">
    <div className="score-dial"><svg viewBox="0 0 180 180" aria-hidden="true">
      <circle className="score-track" cx="90" cy="90" r="70" />
      <circle ref={ring} className="score-ring" cx="90" cy="90" r="70" strokeDasharray={length} strokeDashoffset={target} transform="rotate(-90 90 90)" />
    </svg><div><span className="score-big">{score == null ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(score)}</span><span>/ 100</span></div></div>
    <div className="score-overview-copy"><span className="lab-eyebrow">TU MOVIMIENTO / TU REFERENCIA</span>
      <h4>Tu swing, en perspectiva.</h4><strong className="similarity-score sr-only">{scoreLabel(score)}</strong>
      <p>Semejanza entre ambos movimientos según las medidas disponibles. Explora cada etapa para entender los detalles.</p>
      <span className="score-caption">Selecciona una fase o un momento para empezar <span aria-hidden="true">↘</span></span>
    </div>
  </div>;
}
