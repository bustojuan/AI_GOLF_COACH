import { golfTransition } from '../../../services/golfMotion';
import { getCinema } from './loader';
import { captureSceneMedia, relativeTarget, sceneTarget } from './capture';
import { CINEMA_DURATION, CINEMA_RETURN } from './timing';
import { clamp, range, smooth } from './types';

/** One clock owns 3D, the outgoing page and the arrival. Only the final UI is interactive. */
export function playCinematicTransition(journey: HTMLElement, layer: HTMLElement, from: number, to: number) {
  const outgoing = journey.querySelector<HTMLElement>(`[data-screen="${from}"]`)!;
  const incoming = journey.querySelector<HTMLElement>(`[data-screen="${to}"]`)!;
  const family = golfTransition(from, to), forward = to > from;
  journey.dataset.golfTransition = family; journey.dataset.golfEdition = 'cinematic-3d';
  journey.dataset.golfDirection = forward ? 'forward' : 'backward';
  const engine = getCinema(layer);
  const skip = journey.dataset.golfSkipNext === 'true'; delete journey.dataset.golfSkipNext;
  const missingSwing = from === 0 && forward && (!outgoing.querySelector('.studio-motion video')
    || ['blocked', 'unavailable', 'stalled'].includes(journey.dataset.golfImpactSource ?? ''));
  if (skip || missingSwing || matchMedia('(prefers-reduced-motion: reduce)').matches || !layer.clientWidth || !layer.clientHeight) {
    journey.dataset.golfState = 'idle'; engine?.hide(); return { cancel() {} };
  }
  let use3D = forward && !!engine?.usable;
  let duration = forward ? use3D ? CINEMA_DURATION[family] : 320 : CINEMA_RETURN[family];
  journey.style.setProperty('--golf-duration', `${duration}ms`);
  journey.dataset.golfRenderer = use3D ? 'webgl' : 'dom';
  const snapshots = new Map<HTMLElement, Map<string, string>>();
  function style(element: HTMLElement, property: string, value: string) {
    let properties = snapshots.get(element);
    if (!properties) { properties = new Map(); snapshots.set(element, properties); }
    if (!properties.has(property)) properties.set(property, element.style.getPropertyValue(property));
    element.style.setProperty(property, value);
  }
  let live = true, request = 0, lastTime = -1;
  outgoing.dataset.golfExit = ''; incoming.dataset.golfEnter = '';
  style(outgoing, 'will-change', 'transform, opacity, filter');
  style(incoming, 'will-change', 'transform, opacity');
  style(incoming, 'opacity', '0'); incoming.inert = true;
  const blocks = [...incoming.querySelectorAll<HTMLElement>('.journey-content > .card, .players > div, .score-overview, .coach-report > section')].slice(0, 7);
  if (use3D && engine) {
    try {
      const studioVideo = family === 'swing-impact' ? outgoing.querySelector<HTMLVideoElement>('.studio-motion video') : null;
      engine.configure({ family, width: layer.clientWidth, height: layer.clientHeight, mobile: layer.clientWidth < 700,
        frames: captureSceneMedia(family, incoming, outgoing, layer), target: sceneTarget(incoming, layer),
        studioVideo: studioVideo ? { element: studioVideo, bounds: relativeTarget(studioVideo, layer) } : undefined });
      engine.show();
    } catch { use3D = false; engine.hide(); duration = 320; journey.style.setProperty('--golf-duration', '320ms'); journey.dataset.golfRenderer = 'dom'; }
  }
  journey.dataset.golfState = 'running';
  const clock = layer.animate([{ opacity: 1 }, { opacity: 1 }], { duration, fill: 'both' });
  clock.id = 'golf-cinema-clock';

  function reset() {
    cancelAnimationFrame(request); engine?.hide(); clock.cancel();
    outgoing.removeAttribute('data-golf-exit'); incoming.removeAttribute('data-golf-enter');
    for (const [element, properties] of snapshots) for (const [property, value] of properties) {
      if (value) element.style.setProperty(property, value); else element.style.removeProperty(property);
    }
    incoming.inert = incoming.dataset.screen !== journey.dataset.step;
    outgoing.querySelectorAll('video').forEach(video => video.pause());
    journey.dataset.golfState = 'idle';
  }
  function cancel() { if (!live) return; live = false; reset(); }
  function render() {
    if (!live) return;
    const ms = Number(clock.currentTime ?? 0), t = clamp(ms / duration);
    // Scrub mode holds the same frame without doing unnecessary GPU work.
    if (ms !== lastTime) {
      lastTime = ms;
      if (use3D && engine) {
        const signal = engine.render(t);
        if (!signal) { cancel(); return; }
        const enter = smooth(range(t, 0, family === 'swing-impact' ? .13 : .2));
        const reveal = clamp(signal.reveal);
        // By the establishing shot, the page has completely left the scene.
        style(outgoing, 'opacity', String(1 - enter));
        style(outgoing, 'transform', family === 'swing-impact' ? 'none' : `translateY(${-18 * enter}px) scale(${1 - .045 * enter})`);
        style(outgoing, 'filter', family === 'swing-impact' ? 'none' : `blur(${enter * 1.4}px)`);
        style(incoming, 'opacity', String(reveal));
        style(incoming, 'transform', signal.mediaBridge ? 'none' : `translateY(${(1 - reveal) * 14}px) scale(${1.012 - reveal * .012})`);
        engine.canvas.style.opacity = String(enter * (1 - reveal));
        if (family === 'final-putt' && signal.aperture && reveal > 0) {
          const { x, y, rx, ry } = signal.aperture;
          if ([x, y, rx, ry].every(Number.isFinite) && rx > 1 && ry > 1) {
            // The mask follows the projected real cup only after the physical drop.
            engine.canvas.style.maskImage = `radial-gradient(ellipse ${rx}px ${ry}px at ${x}px ${y}px, transparent 96%, #000 100%)`;
            engine.canvas.style.opacity = String(enter * (1 - smooth(range(t, .94, 1))));
            style(incoming, 'opacity', '1'); style(incoming, 'transform', 'none');
          }
        }
        blocks.forEach((block, i) => {
          if (signal.mediaBridge) return;
          const phase = smooth(clamp(reveal * 1.4 - i * .055));
          style(block, 'opacity', String(.45 + .55 * phase));
        });
        incoming.inert = reveal < .65;
      } else {
        // Return: editorial pullback and settling, never reversed golf physics.
        const out = smooth(range(t, 0, .6)), arrive = smooth(range(t, .2, 1));
        style(outgoing, 'opacity', String(1 - out));
        style(outgoing, 'transform', `translateX(${(forward ? -1 : 1) * 16 * out}px) scale(${1 - .018 * out})`);
        style(incoming, 'opacity', String(arrive));
        style(incoming, 'transform', `translateX(${(forward ? 1 : -1) * 18 * (1 - arrive)}px) scale(${1.015 - .015 * arrive})`);
        incoming.inert = arrive < .6;
      }
    }
    request = requestAnimationFrame(render);
  }
  render();
  void clock.finished.then(cancel).catch(() => {});
  return { cancel };
}
