import { useState } from 'react';

/** A still concept image. These annotations identify visible regions, not measured biomechanics. */
export default function StudioPortrait() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [annotations, setAnnotations] = useState(true);

  return <figure className={`studio-portrait${ready ? ' is-ready' : ''}${annotations ? ' has-annotations' : ''}`}>
    {!failed ? <div className="studio-portrait-image">
      <img src="/studio-dark/golfer.webp" width="1122" height="1402" alt="Golfista de cuerpo entero en la cima de la subida, en una imagen conceptual de estudio"
        fetchPriority="high" decoding="async" onLoad={() => setReady(true)} onError={() => setFailed(true)} />
      {ready && <svg className="studio-static-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        <g className="studio-region studio-region-shoulders"><line x1="642" y1="322" x2="447" y2="499" />
          <circle cx="642" cy="322" r="4" /></g>
        <g className="studio-region studio-region-hands"><circle cx="350" cy="146" r="4" /><circle className="studio-joint-ring" cx="350" cy="146" r="10" /></g>
        <g className="studio-region studio-region-hips"><circle cx="447" cy="499" r="4" /></g>
      </svg>}
    </div> : <figcaption className="studio-portrait-fallback">La imagen de estudio no está disponible. Puedes subir tu vídeo.</figcaption>}
    <div className="studio-portrait-label"><span aria-hidden="true" /><span>CIMA</span></div>
    <button type="button" className="studio-annotation-toggle" aria-pressed={annotations} onClick={() => setAnnotations(value => !value)}
      aria-label={annotations ? 'Ocultar puntos ilustrativos' : 'Mostrar puntos ilustrativos'}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="10" cy="10" r="2" /></svg>
      <span>{annotations ? 'Vista limpia' : 'Ver puntos'}</span></button>
  </figure>;
}
