import { useEffect, useRef, useState } from 'react';
import type { SwingResult } from '../types/swing';
import { frameAtTime, isVisible } from '../services/playback';
import { equipmentAtTime, previewAtTime } from '../services/equipment';
import SkeletonDrawing from './SkeletonDrawing';
import EquipmentDrawing from './EquipmentDrawing';

/** El reloj de comparación proporciona el tiempo original de cada vídeo. */
export default function SwingVideoFrame({ swing, src, timeMs, color, label }: {
  swing: SwingResult; src?: string; timeMs: number; color: string; label: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const currentTime = useRef(timeMs);
  currentTime.current = timeMs;
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => {
    if (video.current?.readyState && !failed) video.current.currentTime = timeMs / 1000;
  }, [timeMs, failed, src]);
  const seconds = timeMs / 1000;
  const frame = frameAtTime(swing.frames, seconds, Math.max(150, 1000 / swing.video.processed_fps + 50));
  const preview = previewAtTime(swing, timeMs);
  const equipment = equipmentAtTime(swing.equipment_frames?.length ? swing.equipment_frames : swing.frames,
    seconds, Math.max(120, 1000 / swing.video.processed_fps + 40));
  const { width, height } = swing.video;
  const points = frame?.landmarks.map(point => isVisible(point, swing.visibility_threshold)
    ? { x: point.x * width, y: point.y * height } : null) ?? [];

  return <div className="swing-video-frame"><h3>{label}</h3>
    <div className="video-stage" style={{ aspectRatio: `${width} / ${height}` }}>
      {src && !failed ? <video ref={video} src={src} muted playsInline preload="auto" aria-label={`Vídeo de ${label}`}
        onLoadedMetadata={() => { if (video.current) video.current.currentTime = currentTime.current / 1000; }}
        onError={() => setFailed(true)} />
        : preview?.preview_jpeg ? <img src={preview.preview_jpeg} alt={`Fotograma guardado de ${label}`} />
          : <p className="snapshot-missing">No hay imagen disponible para este instante.</p>}
      <svg className="equipment-overlay body-overlay" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Monigote sobre ${label}`}>
        <SkeletonDrawing points={points} color={color} radius={Math.max(width, height) / 150} />
        <EquipmentDrawing ball={equipment?.ball} club={equipment?.club} width={width} height={height} radius={Math.max(width, height) / 100} />
        {!points.some(Boolean) && <text x="50%" y="50%" textAnchor="middle" fill="white" fontSize={width / 25}>Sin detección fiable</text>}
      </svg>
    </div>
    <p className="note">{seconds.toFixed(2)} s · {src && !failed ? 'Vídeo original con monigote' : 'Fotogramas guardados con monigote'}</p>
  </div>;
}
