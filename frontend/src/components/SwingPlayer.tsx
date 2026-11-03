import { useEffect, useRef, useState } from 'react';
import type { SwingResult } from '../types/swing';
import { frameAtTime, isVisible } from '../services/playback';
import type { AnchorDraft } from '../types/comparison';
import AnchorEditor from './AnchorEditor';
import SkeletonDrawing from './SkeletonDrawing';
import EquipmentDrawing from './EquipmentDrawing';
import { SwingKeyMoments } from './KeyMoments';
import { equipmentAtTime } from '../services/equipment';

export default function SwingPlayer({ src, result, id = 'user', title = 'Tu swing, punto a punto.', anchors, onAnchorsChange, active = true, showMoments = true }: {
  src: string; result: SwingResult; id?: string; title?: string; active?: boolean; showMoments?: boolean;
  anchors?: AnchorDraft; onAnchorsChange?: (value: AnchorDraft) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const duration = result.video.duration_seconds;
  const frame = frameAtTime(result.frames, time, Math.max(150, 1000 / result.video.processed_fps + 50));
  const points = frame?.landmarks ?? [];
  const equipment = equipmentAtTime(result.equipment_frames?.length ? result.equipment_frames : result.frames,
    time, Math.max(120, 1000 / result.video.processed_fps + 40));
  const visible = (index: number) => isVisible(points[index], result.visibility_threshold);

  useEffect(() => {
    if (!active) { video.current?.pause(); setPlaying(false); }
  }, [active]);

  useEffect(() => {
    if (!playing) return;
    let request = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (videoError) {
        const delta = (now - previous) / 1000;
        setTime(current => Math.min(duration, current + delta));
      } else if (video.current) setTime(video.current.currentTime);
      previous = now;
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, videoError, duration]);

  useEffect(() => {
    if (videoError && time >= duration) setPlaying(false);
  }, [videoError, time, duration]);

  function seek(value: number) {
    setTime(value);
    if (video.current && !videoError) video.current.currentTime = value;
  }

  async function togglePlayback() {
    if (playing) {
      video.current?.pause();
      setPlaying(false);
    } else {
      if (time >= duration - 0.02) seek(0);
      if (!videoError && video.current) {
        try { await video.current.play(); }
        catch { setVideoError(true); setPlaying(true); }
      } else setPlaying(true);
    }
  }

  return (
    <section className="card results" aria-labelledby={`${id}-result-title`}>
      <span className="step">{id === 'user' ? 'TU VÍDEO / MARCAS' : 'REFERENCIA / MARCAS'}</span>
      <h2 id={`${id}-result-title`}>{title}</h2>
      <div className="swing-workstation"><div className="swing-observation">
      <div className="players">
        <div>
          <h3>Vídeo original</h3>
          <div className="video-stage" style={{ aspectRatio: `${result.video.width} / ${result.video.height}` }}>
          <video ref={video} src={src} controls playsInline preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => { setPlaying(false); if (video.current) setTime(video.current.currentTime); }}
            onTimeUpdate={() => { if (video.current && !videoError) setTime(video.current.currentTime); }}
            onSeeked={() => { if (video.current) setTime(video.current.currentTime); }}
            onEnded={() => setPlaying(false)}
            onError={() => { setVideoError(true); setPlaying(false); }} />
          <svg className="equipment-overlay" viewBox={`0 0 ${result.video.width} ${result.video.height}`}
            aria-label="Detecciones de bola y palo sobre el vídeo">
            <EquipmentDrawing ball={equipment?.ball} club={equipment?.club} width={result.video.width} height={result.video.height}
              radius={Math.max(result.video.width, result.video.height) / 100} />
          </svg>
          </div>
        </div>
        <div>
          <h3>Esqueleto corporal</h3>
          <svg viewBox={`0 0 ${result.video.width} ${result.video.height}`}
            className="skeleton" style={{ aspectRatio: `${result.video.width} / ${result.video.height}` }}
            role="img" aria-label="Esqueleto corporal sincronizado con el vídeo">
            <SkeletonDrawing points={points.map((point, index) => visible(index)
              ? { x: point.x * result.video.width, y: point.y * result.video.height } : null)}
              color="#a5cf72" radius={Math.max(result.video.width, result.video.height) / 150} />
            <EquipmentDrawing ball={equipment?.ball} club={equipment?.club} width={result.video.width} height={result.video.height}
              radius={Math.max(result.video.width, result.video.height) / 100} />
            {!points.some((_, index) => visible(index)) && (
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="#d8e6d2"
                fontSize={Math.min(result.video.width, result.video.height) / 22}>Sin detección fiable</text>
            )}
          </svg>
        </div>
      </div>
      <div className="equipment-legend"><span>🔴 Línea roja: segmento observado del palo</span><span>🟡 Punto amarillo: bola detectada</span></div>
      <p className="note equipment-status">En este instante: palo {equipment?.club ? 'detectado' : 'no detectado'} · bola {equipment?.ball ? 'detectada' : 'no detectada'}.
        {(result.analysis_version ?? 1) < 2 && ' Vuelve a procesar este vídeo para obtener las detecciones y propuestas nuevas.'}</p>
      {videoError && <p className="error" role="alert">Tu navegador no puede reproducir este vídeo. Puedes reproducir el esqueleto o exportar el original a MP4 H.264.</p>}
      </div><div className="swing-control-rail">
      <div className="playback-controls">
        <button type="button" onClick={() => void togglePlayback()}>{playing ? 'Pausar' : 'Reproducir'}</button>
        <label htmlFor={id === 'user' ? 'timeline' : `${id}-timeline`}>Posición del vídeo
          <input id={id === 'user' ? 'timeline' : `${id}-timeline`} type="range" min="0" max={duration} step="0.01" value={Math.min(time, duration)}
            onChange={event => seek(Number(event.target.value))} />
        </label>
        <output>{time.toFixed(1)} / {duration.toFixed(1)} s</output>
      </div>
      {anchors && onAnchorsChange && <AnchorEditor id={id} anchors={anchors} duration={duration} time={time}
        suggestion={result.suggested_anchors} onChange={onAnchorsChange}
        onSelect={seconds => { video.current?.pause(); setPlaying(false); seek(seconds); }}
        onCapture={() => { video.current?.pause(); setPlaying(false); }} />}
      </div></div>
      {showMoments && anchors && <SwingKeyMoments result={result} anchors={anchors} onSeek={seconds => { video.current?.pause(); setPlaying(false); seek(seconds); }} />}
    </section>
  );
}
