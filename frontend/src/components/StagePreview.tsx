import { useEffect, useMemo, useState } from 'react';
import type { ComparisonFrame, Point2D, StageAnalysis } from '../types/comparison';
import { framesForStage } from '../services/analysis';
import { comparisonFrameAtTime } from '../services/comparison';
import SkeletonDrawing from './SkeletonDrawing';
import MetricFocus from './MetricFocus';

type VisibleSwings = { user: boolean; reference: boolean };

export default function StagePreview({ frames, stage, active, visibleSwings, onVisibilityChange, focusMetric = null }: {
  frames: ComparisonFrame[]; stage: StageAnalysis; active: boolean;
  visibleSwings: VisibleSwings; onVisibilityChange: (value: VisibleSwings) => void;
  focusMetric?: string | null;
}) {
  const selectedFrames = useMemo(() => framesForStage(frames, stage), [frames, stage]);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const start = selectedFrames[0]?.elapsed_ms ?? 0;
  const duration = (selectedFrames.at(-1)?.elapsed_ms ?? start) - start;
  const frame = comparisonFrameAtTime(selectedFrames, start + elapsed);
  const bounds = useMemo(() => {
    const points = selectedFrames.flatMap(frame => [...frame.user, ...frame.reference]).filter((point): point is Point2D => point != null);
    const left = Math.min(-1, ...points.map(point => point.x)) - 0.3;
    const top = Math.min(-1, ...points.map(point => point.y)) - 0.3;
    const right = Math.max(1, ...points.map(point => point.x)) + 0.3;
    const bottom = Math.max(1, ...points.map(point => point.y)) + 0.3;
    return `${left} ${top} ${right - left} ${bottom - top}`;
  }, [selectedFrames]);

  useEffect(() => { if (!active || elapsed >= duration) setPlaying(false); }, [active, elapsed, duration]);
  useEffect(() => {
    if (!playing || !active) return;
    let request = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = now - previous;
      previous = now;
      setElapsed(value => Math.min(duration, value + delta));
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, active, duration]);

  const ownPose = visibleSwings.user && frame?.user.some(point => point != null);
  const referencePose = visibleSwings.reference && frame?.reference.some(point => point != null);
  const label = visibleSwings.user && visibleSwings.reference ? 'Tu swing y swing referencia'
    : visibleSwings.user ? 'Tu swing' : 'Swing referencia';
  return <figure className="stage-preview" aria-label={`Monigotes: ${stage.label}`}>
    <div className="preview-controls">
      {stage.kind === 'phase' && <button type="button" className="stage-play" disabled={duration <= 0}
        aria-label={playing ? 'Pausar fase' : 'Reproducir fase'} title={playing ? 'Pausar fase' : 'Reproducir fase'} onClick={() => {
        if (!playing && elapsed >= duration) setElapsed(0);
        setPlaying(value => !value);
      }}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor">
        {playing ? <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>
          : <path d="M6 4v16l13-8Z" />}
      </svg></button>}
      <fieldset className="preview-visibility">
        <legend className="sr-only">Monigotes visibles</legend>
        <label className="preview-user"><input type="checkbox" checked={visibleSwings.user}
          disabled={visibleSwings.user && !visibleSwings.reference}
          onChange={event => onVisibilityChange({ ...visibleSwings, user: event.target.checked })} />Tu swing</label>
        <label className="preview-reference"><input type="checkbox" checked={visibleSwings.reference}
          disabled={visibleSwings.reference && !visibleSwings.user}
          onChange={event => onVisibilityChange({ ...visibleSwings, reference: event.target.checked })} />Swing referencia</label>
      </fieldset>
    </div>
    <svg className="stage-pose" viewBox={bounds} role="img" aria-label={`${label}: ${stage.label}`}>
      {referencePose && <g className="stage-preview-reference"><SkeletonDrawing points={frame!.reference} color="#8bafd4" radius={0.06} />
        <MetricFocus points={frame!.reference} metric={focusMetric} color="#8bafd4" /></g>}
      {ownPose && <g className="stage-preview-user"><SkeletonDrawing points={frame!.user} color="#c5ec83" radius={0.045} />
        <MetricFocus points={frame!.user} metric={focusMetric} color="#edffcf" /></g>}
      {!ownPose && !referencePose && <text x="0" y="0" textAnchor="middle" fill="#a4bc95" fontSize="0.2">Sin postura disponible</text>}
    </svg>
    {visibleSwings.user && !ownPose && <p className="preview-missing">Tu swing: sin postura disponible.</p>}
    {visibleSwings.reference && !referencePose && <p className="preview-missing">Swing referencia: sin postura disponible.</p>}
  </figure>;
}
