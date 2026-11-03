import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { CaptureSetup, Point2D } from '../types/comparison';
import type { CoachStageKey } from '../types/recommendation';
import { createStageIllustration, ILLUSTRATION_FRAME_COUNT } from '../services/reportIllustration';
import { COACH_STAGE_LABELS } from '../services/recommendations';
import SkeletonDrawing from './SkeletonDrawing';

export default function CoachStageFigure({ stageKey, view, autoPlay = false }: { stageKey: CoachStageKey; view: CaptureSetup['view']; autoPlay?: boolean }) {
  const toggleId = useId();
  const snapshots = createStageIllustration(stageKey, view);
  const viewLabel = view === 'down_the_line' ? 'Desde atrás' : 'Frontal';
  const label = COACH_STAGE_LABELS[stageKey];
  const animated = snapshots.length > 1;
  const points = snapshots.flatMap(frame => frame.points).filter((point): point is Point2D => point != null);
  const equipment = snapshots.flatMap(frame => [frame.club.start, frame.club.end]);
  const bounds = [...points, ...equipment];
  const left = Math.min(-1.25, ...bounds.map(point => point.x)) - .3;
  const top = Math.min(-1.65, ...bounds.map(point => point.y)) - .35;
  const right = Math.max(1.25, ...bounds.map(point => point.x)) + .3;
  const bottom = Math.max(1.5, ...bounds.map(point => point.y)) + .2;
  const cycle = stageKey === 'downswing' ? 2800 : 3600;
  const route = { backswing: 'Inicio → Cima', downswing: 'Cima → Impacto', follow_through: 'Impacto → Postura final' };

  return <figure className="coach-stage-figure" data-view={view} aria-label={`Guía visual de ${label}, ${viewLabel.toLowerCase()}`}>
    <figcaption><span className="pose-live-dot" aria-hidden="true" /><span>Guía visual</span><span className="pose-view-label">{viewLabel}</span></figcaption>
    {animated && <>
      <input className="pose-toggle sr-only" type="checkbox" id={toggleId} defaultChecked={autoPlay} aria-label={`Animar ${label}`} />
      <label className="pose-play" htmlFor={toggleId} title={`Animar o pausar ${label}`}>
        <svg className="pose-play-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 4v16l13-8Z" /></svg>
        <svg className="pose-pause-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
        <span className="pose-play-text">Ver movimiento</span><span className="pose-pause-text">Pausar</span>
      </label>
    </>}
    <svg className="coach-stage-svg" viewBox={`${left} ${top} ${right - left} ${bottom - top}`} role="img" aria-label={`${label}: ilustración del swing, ${viewLabel.toLowerCase()}`}>
      <ellipse cx="0" cy={bottom - .15} rx="1.1" ry=".09" fill="#001f18" opacity=".45" />
      <path d={`M${left} ${bottom - .1}H${right}`} stroke="#b5d08e" strokeWidth="1" opacity=".2" vectorEffect="non-scaling-stroke" />
      {snapshots.map((frame, index) => <g key={index} data-frame-index={index} className={animated ? 'report-pose-frame' : 'report-pose-still'}
        style={animated ? { animationDuration: `${cycle}ms`, animationDelay: `${-(ILLUSTRATION_FRAME_COUNT - index) * cycle / ILLUSTRATION_FRAME_COUNT}ms` } as CSSProperties : undefined}>
        {frame.points[0] && <circle cx={frame.points[0].x} cy={frame.points[0].y} r=".16" fill="#e8f5d7" />}
        <SkeletonDrawing points={frame.points} color="#d6f0af" radius={.035} />
        <line x1={frame.club.start.x} y1={frame.club.start.y} x2={frame.club.end.x} y2={frame.club.end.y}
          stroke="#f97667" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={frame.ball.x} cy={frame.ball.y} r=".055" fill="#f4d75f" />
      </g>)}
    </svg>
    <span className="pose-caption">{animated ? route[stageKey as keyof typeof route] : 'Momento · postura fija'}</span>
  </figure>;
}
