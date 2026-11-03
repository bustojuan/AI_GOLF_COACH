import { useEffect, useMemo, useState } from 'react';
import type { ComparisonResult, Point2D } from '../types/comparison';
import { ANCHOR_LABELS, comparisonFrameAtTime } from '../services/comparison';
import SkeletonDrawing from './SkeletonDrawing';
import EquipmentDrawing from './EquipmentDrawing';
import { trajectorySegments } from '../services/equipment';
import type { SwingResult } from '../types/swing';
import SwingVideoFrame from './SwingVideoFrame';
import SwingStageTimeline from './SwingStageTimeline';
import { chronologicalStages } from '../services/analysis';

const USER_COLOR = '#a5cf72';
const REFERENCE_COLOR = '#72bce3';

export default function ComparisonPlayer({ result, swing, reference, src, referenceSrc, active = true, seekRequest = null }: {
  result: ComparisonResult; swing: SwingResult; reference: SwingResult; src: string; referenceSrc?: string;
  active?: boolean; seekRequest?: { timeMs: number } | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState('videos');
  const [rate, setRate] = useState(1);
  const [showTrajectories, setShowTrajectories] = useState(false);
  const [pickedStage, setPickedStage] = useState<string | null>('address');
  const frame = comparisonFrameAtTime(result.frames, elapsed);
  const stages = result.analysis ? chronologicalStages(result.analysis) : [];
  const userTime = result.user_anchors.start_ms + elapsed;
  const currentStage = stages.find(stage => stage.key === pickedStage)
    ?? stages.find(stage => stage.kind === 'moment' && Math.abs(stage.user_start_ms - userTime) < 1)
    ?? stages.find(stage => stage.kind === 'phase' && userTime >= stage.user_start_ms && userTime < stage.user_end_ms);
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  useEffect(() => {
    if (seekRequest) {
      setPlaying(false);
      setPickedStage(null);
      setElapsed(Math.max(0, Math.min(result.duration_ms, seekRequest.timeMs - result.user_anchors.start_ms)));
    }
  }, [seekRequest, result]);
  const bounds = useMemo(() => {
    const points = result.frames.flatMap(frame => [...frame.user, ...frame.reference,
      frame.user_ball, frame.reference_ball, frame.user_club?.start, frame.user_club?.end,
      frame.reference_club?.start, frame.reference_club?.end]).filter((point): point is Point2D => point != null);
    const left = Math.min(-2, ...points.map(point => point.x)) - 0.25;
    const top = Math.min(-2, ...points.map(point => point.y)) - 0.25;
    const right = Math.max(2, ...points.map(point => point.x)) + 0.25;
    const bottom = Math.max(2, ...points.map(point => point.y)) + 0.25;
    return `${left} ${top} ${right - left} ${bottom - top}`;
  }, [result]);

  useEffect(() => {
    if (!playing || !active) return;
    let request = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = (now - previous) * rate;
      setElapsed(current => Math.min(result.duration_ms, current + delta));
      previous = now;
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, active, rate, result.duration_ms]);
  useEffect(() => { if (elapsed >= result.duration_ms) setPlaying(false); }, [elapsed, result.duration_ms]);

  function seek(value: number) { setPlaying(false); setElapsed(value); setPickedStage(null); }
  function trajectories(side: 'user' | 'reference', color: string) {
    return showTrajectories && [0, 15, 16].flatMap(index => trajectorySegments(result.frames, side, index, elapsed).map((segment, part) => (
      <polyline key={`${side}-${index}-${part}`} points={segment.map(point => `${point.x},${point.y}`).join(' ')}
        fill="none" stroke={color} strokeOpacity="0.5" strokeDasharray={index === 0 ? '2 4' : undefined}
        strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    )));
  }
  function drawing(points: (Point2D | null)[], label: string, color: string, side: 'user' | 'reference') {
    return <div><h3>{label}</h3><svg className="comparison-skeleton" viewBox={bounds} role="img" aria-label={label}>
      {trajectories(side, color)}
      <SkeletonDrawing points={points} color={color} radius={0.035} />
      <EquipmentDrawing ball={side === 'user' ? frame?.user_ball : frame?.reference_ball}
        club={side === 'user' ? frame?.user_club : frame?.reference_club} />
      {!points.length && <text x="0" y="0" textAnchor="middle" fill="#d8e6d2" fontSize="0.18">Sin detección fiable</text>}
    </svg></div>;
  }

  if (!frame) return null;
  return (
    <section className="comparison-result" aria-labelledby="comparison-result-title">
      <div className="comparison-heading"><div><span className="lab-eyebrow">EL SWING, BAJO OTRA LUZ</span>
        <h3 id="comparison-result-title">Comparación con {result.reference_name}</h3></div>
        {currentStage && <span className="current-stage-pill"><i />{currentStage.label}</span>}
      </div>
      <div className="comparison-station"><div className="comparison-observation">
      {mode === 'videos' ? <div className="players comparison-pair">
        <SwingVideoFrame swing={swing} src={src} timeMs={frame.user_time_ms} color={USER_COLOR} label="Tu swing" />
        <SwingVideoFrame swing={reference} src={referenceSrc} timeMs={frame.reference_time_ms} color={REFERENCE_COLOR} label="Referencia" />
      </div> : mode === 'side_by_side' ? <div className="players comparison-pair">
        {drawing(frame.user, 'Tu swing sincronizado', USER_COLOR, 'user')}
        {drawing(frame.reference, 'Referencia sincronizada', REFERENCE_COLOR, 'reference')}
      </div> : <svg className="comparison-skeleton comparison-overlay" viewBox={bounds} role="img" aria-label="Superposición de ambos swings">
        {frame.user.map((point, index) => point && frame.reference[index] && (
          <line key={index} x1={point.x} y1={point.y} x2={frame.reference[index]!.x} y2={frame.reference[index]!.y}
            stroke="#b7c4bc" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
        {trajectories('user', USER_COLOR)}{trajectories('reference', REFERENCE_COLOR)}
        <SkeletonDrawing points={frame.reference} color={REFERENCE_COLOR} radius={0.06} strokeWidth={6} />
        <SkeletonDrawing points={frame.user} color={USER_COLOR} radius={0.035} />
        <EquipmentDrawing ball={frame.reference_ball} club={frame.reference_club} />
        <EquipmentDrawing ball={frame.user_ball} club={frame.user_club} />
        {(!frame.user.length || !frame.reference.length) && <text x="0" y="2" textAnchor="middle" fill="#d8e6d2" fontSize="0.15">Faltan datos de uno o ambos swings</text>}
      </svg>}
      {!!stages.length && <SwingStageTimeline stages={stages} selected={currentStage?.key} onSelect={stage => {
        seek(Math.max(0, Math.min(result.duration_ms, stage.user_start_ms - result.user_anchors.start_ms)));
        setPickedStage(stage.key);
      }} />}
      </div><div className="comparison-control-rail">
      <div className="playback-controls">
        <button type="button" onClick={() => {
          setPickedStage(null);
          if (!playing && elapsed >= result.duration_ms) setElapsed(0);
          setPlaying(!playing);
        }}>{playing ? 'Pausar comparación' : 'Reproducir comparación'}</button>
        <label htmlFor="comparison-timeline">Posición sincronizada
          <input id="comparison-timeline" type="range" min="0" max={result.duration_ms} step="1" value={elapsed}
            onChange={event => seek(Number(event.target.value))} />
        </label>
      </div>
      <p className="comparison-times">Tu vídeo: {(frame.user_time_ms / 1000).toFixed(2)} s · Referencia: {(frame.reference_time_ms / 1000).toFixed(2)} s</p>
      <div className="comparison-toolbar">
        <label htmlFor="comparison-mode">Visualización
          <select id="comparison-mode" value={mode} onChange={event => setMode(event.target.value)}>
            <option value="videos">Vídeos con monigotes</option><option value="side_by_side">Monigotes lado a lado</option><option value="overlay">Superposición</option>
          </select>
        </label>
        <label htmlFor="comparison-rate">Velocidad
          <select id="comparison-rate" value={rate} onChange={event => setRate(Number(event.target.value))}>
            <option value="1">Normal</option><option value="0.5">0,5×</option><option value="0.25">0,25×</option>
          </select>
        </label>
        <div className="comparison-legend"><span className="own-color">● Tu swing</span><span className="reference-color">● Referencia</span></div>
      </div>
      <label className="trajectory-option"><input type="checkbox" checked={showTrajectories}
        onChange={event => setShowTrajectories(event.target.checked)} /> Mostrar trayectorias de muñecas y posición aproximada de la cabeza</label>
      <p className="note">Palo en rojo y bola en amarillo cuando se han observado. En superposición se dibujan los de ambos vídeos.
        Las trayectorias son relativas a la cadera; se interrumpen cuando faltan detecciones.</p>
      <div className="anchor-jumps">{ANCHOR_LABELS.map(([key, label]) => (
        <button className="secondary" type="button" key={key} onClick={() => seek(result.user_anchors[key] - result.user_anchors.start_ms)}>{label}</button>
      ))}</div>
      <details className="comparison-context"><summary>Datos y avisos de esta comparación</summary>
      <p>{result.comparable_frames} de {result.frames.length} muestras con posiciones comparables.</p>
      <p>Todos los valores son diferencias entre <strong>tu swing</strong> y <strong>{result.reference_name}</strong>,
        alineados entre Inicio y Final. Se comparan hasta {result.compared_joint_count ?? 16} articulaciones corporales, incluidos talones y puntas de los pies.</p>
      {!!result.warnings.length && <details><summary>Avisos de esta comparación</summary><ul className="warnings">{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
      </details>
      </div></div>
    </section>
  );
}
