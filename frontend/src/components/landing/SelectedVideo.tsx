import { useState } from 'react';

export default function SelectedVideo({ src }: { src: string }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div className={`studio-preview${ready ? ' is-ready' : ''}`}>
    <video className="studio-selected-video" src={src} controls={ready} muted playsInline preload="auto"
      aria-label="Vista previa de tu vídeo" onLoadedData={() => setReady(true)} onError={() => setFailed(true)} />
    {!ready && <div className="studio-preview-message" role="status"><svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" aria-hidden="true"><rect x="4" y="7" width="24" height="18" rx="3" /><path d="m13 12 8 4-8 4z" /></svg>
      <p>{failed ? 'El navegador no puede reproducir este formato.' : 'Preparando la vista previa…'}</p>
      {failed && <span>Puedes continuar con la detección del movimiento.</span>}
    </div>}
  </div>;
}
