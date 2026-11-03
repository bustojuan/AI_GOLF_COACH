import { useEffect, useRef, useState } from 'react';

const clip = {
  src: '/studio-dark/studio-swing-short.mp4', poster: '/studio-dark/studio-swing-poster.jpg',
  width: 624, height: 832,
};

/** The approved image-to-video take, shown clean throughout upload and processing. */
export default function StudioSwing() {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const media = video.current;
    if (!media) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false, attempted = false, entranceReady = false;
    const timer = window.setTimeout(() => { entranceReady = true; start(); }, 900);
    function start() {
      if (disposed || attempted || !entranceReady || preference.matches || document.hidden || media!.closest('[inert]') || media!.readyState < 2) return;
      attempted = true;
      media!.muted = true;
      void media!.play().catch(() => { if (!disposed) setNotice('Pulsa reproducir para ver el swing.'); });
    }
    function visibility() { if (document.hidden) media!.pause(); }
    function motion() { if (preference.matches) media!.pause(); }
    media.addEventListener('canplay', start);
    document.addEventListener('visibilitychange', visibility);
    preference.addEventListener('change', motion);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      media.pause();
      media.removeEventListener('canplay', start);
      document.removeEventListener('visibilitychange', visibility);
      preference.removeEventListener('change', motion);
    };
  }, []);

  async function toggle() {
    const media = video.current;
    if (!media) return;
    if (!media.paused) { media.pause(); return; }
    if (media.ended) media.currentTime = 0;
    setNotice('');
    try { await media.play(); } catch { setNotice('No se ha podido reproducir. Puedes seguir subiendo tu vídeo.'); }
  }

  return <figure className={`studio-portrait studio-motion${ready ? ' is-ready' : ''}`}
    data-playback={failed ? 'error' : finished ? 'complete' : playing ? 'playing' : ready ? 'paused' : 'loading'}>
    <div className="studio-portrait-image">
      {failed ? <img src="/studio-dark/golfer.webp" width="1122" height="1402" alt="Golfista original de Studio Dark en la cima del backswing" />
        : <div className="studio-motion-frame">
          <video ref={video} src={clip.src} poster={clip.poster} width={clip.width} height={clip.height}
            muted playsInline preload="auto" aria-label="Golfista de Studio Dark realizando un swing, generado desde la imagen original"
            onLoadedData={() => setReady(true)} onError={() => { setFailed(true); setPlaying(false); }}
            onPlay={() => { setPlaying(true); setFinished(false); setNotice(''); }} onPause={() => setPlaying(false)}
            onEnded={() => { setFinished(true); setPlaying(false); }} />
        </div>}
    </div>
    <figcaption className="studio-motion-caption">
      <span>Swing de estudio · Generado con IA</span>
      <div className="studio-motion-controls">
        {!failed && <button type="button" className="studio-replay" disabled={!ready} onClick={() => void toggle()}
          aria-label={finished ? 'Repetir swing de estudio' : playing ? 'Pausar swing de estudio' : 'Reproducir swing de estudio'}>
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" fill={finished ? 'none' : 'currentColor'} stroke={finished ? 'currentColor' : 'none'} strokeWidth="1.3">
            {finished ? <path d="M4 7a6 6 0 1 1-1 5M4 3v4h4" /> : playing ? <path d="M5 4h3v12H5zM12 4h3v12h-3z" /> : <path d="m6 3 10 7-10 7z" />}
          </svg>
        </button>}
      </div>
    </figcaption>
    {(notice || failed) && <p className="studio-motion-notice" role="status">{failed ? 'El swing no está disponible. Puedes subir tu vídeo.' : notice}</p>}
  </figure>;
}
