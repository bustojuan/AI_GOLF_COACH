import { useEffect, useRef, useState } from 'react';
import type { HeroClip } from '../../services/heroTracking';
import { heroPhaseAtTime } from '../../services/heroTracking';
import TrackingOverlay from './TrackingOverlay';

/** Video presentation timestamps are the only clock for pose, phase and trajectory. */
export default function TrackedVideo({ clip, variant = 'demo', autoPlay = false }: {
  clip: HeroClip; variant?: 'demo' | 'hero'; autoPlay?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showTracking, setShowTracking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [ready, setReady] = useState(false);
  const [finished, setFinished] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const phase = heroPhaseAtTime(clip.phases, time);
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    let frame = 0, disposed = false, attempted = false;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function present(_now: number, metadata: VideoFrameCallbackMetadata) {
      if (disposed) return;
      if (!media!.seeking) setTime(metadata.mediaTime);
      frame = media!.requestVideoFrameCallback(present);
    }
    if (typeof media.requestVideoFrameCallback === 'function') frame = media.requestVideoFrameCallback(present);
    function startWhenReady() {
      if (disposed || attempted || !autoPlay || motion.matches || document.hidden
        || media!.readyState < 2 || media!.closest('[inert]')) return;
      attempted = true;
      media!.muted = true;
      void media!.play().catch(error => {
        if (!disposed && error instanceof DOMException && error.name !== 'AbortError') setBlocked(true);
      });
    }
    function hide() { if (document.hidden) media?.pause(); else startWhenReady(); }
    function preferenceChanged() { setReducedMotion(motion.matches); if (motion.matches) media?.pause(); }
    media.addEventListener('canplay', startWhenReady);
    document.addEventListener('visibilitychange', hide);
    motion.addEventListener('change', preferenceChanged);
    // Defer one microtask so StrictMode's initial effect cleanup cannot interrupt autoplay.
    queueMicrotask(startWhenReady);
    return () => {
      disposed = true; media.pause(); if (frame) media.cancelVideoFrameCallback(frame);
      media.removeEventListener('canplay', startWhenReady);
      document.removeEventListener('visibilitychange', hide);
      motion.removeEventListener('change', preferenceChanged);
    };
  }, [clip.src, autoPlay]);
  async function play() {
    if (!video.current) return;
    setBlocked(false);
    try { await video.current.play(); } catch { setPlaying(false); setBlocked(true); }
  }
  function restart() {
    if (!video.current) return;
    video.current.currentTime = 0;
    setFinished(false);
    void play();
  }
  function seek(time: number) {
    if (!video.current) return;
    setSeeking(true);
    setTime(time);
    video.current.currentTime = time;
  }
  async function toggle() {
    if (!video.current) return;
    if (playing) video.current.pause();
    else {
      if (video.current.ended) { restart(); return; }
      await play();
    }
  }
  return <section className={`tracked-video tracked-video-${variant}${ready ? ' is-ready' : ''}${finished ? ' is-finished' : ''}`}
    data-playback={failed ? 'error' : finished ? 'complete' : playing ? 'playing' : ready ? 'paused' : 'loading'} aria-label="Demostración sincronizada">
    <div className="tracked-video-stage" style={{ aspectRatio: `${clip.width} / ${clip.height}` }}>
      <video ref={video} src={clip.src} poster={clip.poster} muted playsInline preload={autoPlay ? 'auto' : 'metadata'} aria-label="Swing real de demostración de Ryan Parkland"
        onLoadedData={() => setReady(true)} onPlay={() => { setPlaying(true); setFinished(false); setBlocked(false); }}
        onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setFinished(true); }} onError={() => setFailed(true)}
        onSeeking={() => setSeeking(true)} onSeeked={() => { setSeeking(false); if (video.current) { setTime(video.current.currentTime); setFinished(video.current.ended); } }}
        onTimeUpdate={() => { if (video.current && typeof video.current.requestVideoFrameCallback !== 'function') setTime(video.current.currentTime); }} />
      {showTracking && ready && !seeking && !failed && <TrackingOverlay clip={clip} time={time}
        reveal={variant === 'hero' ? Math.min(1, time / .4) : 1} />}
      <div className="tracked-phase" aria-live={playing ? 'off' : 'polite'} key={phase?.key}>{phase?.label ?? 'Preparación'}</div>
      {!ready && !failed && <p className="tracked-loading" role="status">Preparando el swing…</p>}
      {finished && variant === 'hero' && <span className="tracked-finish" role="status">Swing completo</span>}
    </div>
    {failed ? <p role="alert">No se ha podido abrir la demostración. La subida de tu vídeo sigue disponible en la portada.</p> : <>
      {blocked && <p className="tracked-play-notice" role="status">Pulsa Reproducir para ver el swing.</p>}
      {reducedMotion && !playing && !finished && variant === 'hero' && <p className="tracked-play-notice">Reproducción manual · Movimiento reducido</p>}
      <div className="tracked-controls"><button type="button" disabled={!ready} onClick={() => void toggle()} aria-label={playing ? 'Pausar demostración' : 'Reproducir demostración'}>
        <svg viewBox="0 0 18 18" width="15" height="15" fill="currentColor" aria-hidden="true">{playing
          ? <path d="M4 3h3v12H4zM11 3h3v12h-3z" /> : <path d="m5 2 11 7-11 7z" />}</svg>
        <span>{playing ? 'Pausar' : 'Reproducir'}</span></button>
        <label className="tracked-position">Posición<input aria-label="Posición de la demostración" type="range" min="0" max={clip.duration} step={1 / clip.fps}
          value={time} onChange={event => seek(Number(event.target.value))} /></label>
        <label className="tracked-toggle"><input type="checkbox" checked={showTracking} onChange={event => setShowTracking(event.target.checked)} />Ver puntos</label>
        {(finished || variant === 'demo') && <button type="button" className="tracked-repeat" disabled={!ready} onClick={restart} aria-label="Repetir demostración">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 7a6 6 0 1 1-1 5M4 3v4h4" /></svg>Repetir</button>}
      </div>
      <nav className="tracked-phases" aria-label="Fases de la demostración">{clip.phases.map(item => <button key={item.key} type="button" title={item.label}
        aria-pressed={phase?.key === item.key} disabled={!ready} onClick={() => { if (video.current) {
          video.current.pause();
          // Land inside the marked frame: rounded timestamps must not seek to the previous frame.
          seek(Math.min(clip.duration, item.start + .001));
        } }}>{item.label}</button>)}</nav>
    </>}
  </section>;
}
