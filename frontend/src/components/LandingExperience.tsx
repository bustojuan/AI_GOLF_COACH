import { useState } from 'react';
import type { ReactNode } from 'react';
import type { SwingResult } from '../types/swing';
import type { CoachStageKey } from '../types/recommendation';
import CoachStageFigure from './CoachStageFigure';
import SwingVideoFrame from './SwingVideoFrame';
import { isVisible } from '../services/playback';

export default function LandingExperience({ children, preview, result, busy }: {
  children: ReactNode; preview: string; result: SwingResult | null; busy: boolean;
}) {
  const [phase, setPhase] = useState<CoachStageKey>('backswing');
  const observed = result?.frames.find(frame => frame.landmarks.some(point => isVisible(point, result.visibility_threshold)));
  return <section className={`landing-experience${preview ? ' has-video' : ''}`}>
    <div className="landing-copy"><p className="lab-eyebrow"><span /> GOLF. DATOS. PROGRESO.</p>
      <h2 className="landing-title">Tu swing.<br /><em>Otra perspectiva.</em></h2>
      <p className="landing-description">Descubre tu movimiento, compáralo y encuentra tu próximo paso en el campo.</p>
      <div className="landing-upload">{children}</div>
      <div className="landing-principles"><span>Vídeo real</span><i /><span>Análisis local</span><i /><span>Tu siguiente paso</span></div>
    </div>
    <div className={`landing-scene${busy ? ' is-processing' : ''}`}>
      <div className="scene-heading"><span className="lab-eyebrow">{result ? 'TU MOVIMIENTO / DETECTADO' : preview ? 'TU VÍDEO / ORIGINAL' : 'EL MOVIMIENTO, HECHO VISIBLE'}</span><span className="scene-cross" aria-hidden="true">＋</span></div>
      {result ? <SwingVideoFrame swing={result} src={preview} timeMs={observed?.timestamp_ms ?? result.frames[0]?.timestamp_ms ?? 0} color="#c5ec83" label="Vista de tu análisis" />
        : preview ? <video className="landing-video" src={preview} controls muted playsInline preload="metadata" aria-label="Vista previa de tu vídeo" />
        : <div className="landing-illustration"><CoachStageFigure key={phase} stageKey={phase} view="face_on" autoPlay />
          <div className="scene-phase-picker" role="group" aria-label="Explorar la ilustración del swing">{([
            ['backswing', 'Subida'], ['downswing', 'Bajada'], ['follow_through', 'Final'],
          ] as const).map(([key, label], index) => <button key={key} type="button" aria-pressed={phase === key} onClick={() => setPhase(key)}>
            <span>0{index + 1}</span>{label}</button>)}</div>
          <p className="scene-caption">Guía ilustrada del swing · No es un análisis de tu vídeo</p>
        </div>}
      <div className="scene-footer"><span>{result ? `${result.video.width} × ${result.video.height} / ${result.video.duration_seconds.toFixed(1)} s` : preview ? 'Seleccionado en tu equipo' : 'Visualiza. Compara. Entrena.'}</span><span aria-hidden="true">↗</span></div>
    </div>
  </section>;
}
