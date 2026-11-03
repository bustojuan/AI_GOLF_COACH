import { useEffect, useState } from 'react';
import type { HeroClip } from '../../services/heroTracking';
import TrackedVideo from './TrackedVideo';

export default function TrackingDemo() {
  const [clip, setClip] = useState<HeroClip | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/studio-dark/parkland-tracking.json', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error('La demostración todavía no está disponible.');
      setClip(await response.json());
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se ha podido abrir la demostración.'); });
    return () => controller.abort();
  }, []);
  return <main className="studio-demo">
    <a className="studio-demo-back" href="/">← Volver al estudio</a>
    <p className="studio-eyebrow">MOVIMIENTO REAL / DEMOSTRACIÓN</p>
    <h1>Un swing.<br /><em>Una misma línea de tiempo.</em></h1>
    <p>El vídeo, los puntos detectados y las fases comparten el tiempo del fotograma. Esta prueba está separada del retrato de estudio.</p>
    {clip ? <TrackedVideo clip={clip} /> : <p role={error ? 'alert' : 'status'}>{error || 'Preparando la demostración…'}</p>}
    <div className="studio-demo-notes"><p>Puntos corporales detectados con MediaPipe. Se omiten detecciones de baja confianza. Las fases son marcas visuales orientativas; el instante de impacto es aproximado.</p>
      <p>La trayectoria del palo queda preparada, pero no se dibuja hasta contar con posiciones de su cabeza validadas.</p>
      <p>Vídeo de <a href="https://www.pexels.com/video/golfer-teeing-off-at-scenic-golf-course-38025632/" target="_blank" rel="noreferrer">Ryan Parkland / Pexels</a>, recortado y reducido para esta demostración. <a href="https://www.pexels.com/license/" target="_blank" rel="noreferrer">Licencia Pexels</a>. Su aparición no implica respaldo de AI Golf Coach.</p></div>
  </main>;
}
