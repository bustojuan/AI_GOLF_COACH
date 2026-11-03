import type { FlightScene } from './flight3DScene';
import { flightReveal, flightSweep } from '../../services/flightGeometry';

type Animator = (element: HTMLElement | SVGElement, frames: Keyframe[], options: KeyframeAnimationOptions) => Animation;

/** The camera projection drives the HTML reveal: there is no separate overlay clock. */
export function animateBallFlight3D({ scene, layer, incoming, outgoing, anchor, trace, animate }: {
  scene: FlightScene; layer: HTMLElement; incoming: HTMLElement; outgoing: HTMLElement;
  anchor: HTMLElement; trace: SVGPathElement; animate: Animator;
}) {
  const duration = 1880, width = layer.clientWidth, height = layer.clientHeight;
  const bounds = layer.getBoundingClientRect();
  const content = incoming.querySelector<HTMLElement>('.journey-content')!;
  const cb = content.getBoundingClientRect();
  const candidates = [...incoming.querySelectorAll('.players .skeleton, .players .video-stage')];
  const target = candidates.find(element => { const r = element.getBoundingClientRect(); return r.width > 30 && r.top > bounds.top && r.top < bounds.top + height * .7; })
    ?? incoming.querySelector('.card') ?? content;
  const rect = target.getBoundingClientRect();
  const left = Math.max(16, rect.left - bounds.left + 10), right = Math.min(width - 16, rect.right - bounds.left - 10);
  const y = Math.max(16, Math.min(height * .68, rect.top - bounds.top + 1));
  anchor.style.left = `${left - cb.left + bounds.left}px`; anchor.style.top = `${y - cb.top + bounds.top - 1}px`;
  anchor.style.width = `${right - left}px`; anchor.style.right = 'auto'; anchor.dataset.targetEdge = 'media-panel';
  scene.configure(width, height, { x: right, y }); scene.show(); scene.render(0);
  const atmosphere = document.createElement('div'); atmosphere.className = 'golf-flight-atmosphere'; layer.prepend(atmosphere);
  animate(atmosphere, [{ opacity: 0 }, { opacity: .94, offset: .17 }, { opacity: .88, offset: .5 }, { opacity: 0, offset: .85 }, { opacity: 0 }], { duration });
  const masks: Keyframe[] = [];
  for (let i = 0; i <= 96; i++) {
    const ms = duration * i / 96, point = scene.sample(ms);
    const front = flightSweep(point, width, height, flightReveal((ms - 620) / 470), flightReveal((ms - 1360) / 300));
    masks.push({ offset: i / 96, clipPath: `polygon(0px 0px,${front.map(p => `${p.x}px ${p.y}px`).join(',')},0px ${height}px)`, transform: 'none', opacity: 1 });
  }
  animate(incoming, masks, { duration, easing: 'linear' });
  animate(outgoing, [{ opacity: 1, transform: 'none' }, { opacity: .55, transform: 'translateX(-8px) scale(.99)', offset: .45 },
    { opacity: 0, transform: 'translateX(-16px) scale(.985)' }], { duration });
  // The 3D trail hands off at the same projected endpoint to the panel's actual rim.
  const path = scene.projectedTrail().map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const edgePath = Array.from({ length: 49 }, (_, i) => `${i ? 'L' : 'M'} ${left + (right - left) * i / 48} ${y}`).join(' ');
  trace.setAttribute('d', path); trace.style.strokeDashoffset = '0';
  animate(trace, [{ opacity: 0 }, { opacity: 0, offset: 1330 / duration }, { opacity: .58, offset: 1500 / duration }, { opacity: .55 }], { duration });
  if (CSS.supports('d', `path("${path}")`)) animate(trace, [{ d: `path("${path}")` }, { d: `path("${edgePath}")` }], { delay: 1500, duration: 380, easing: 'cubic-bezier(.22,.68,.2,1)' });
  [...incoming.querySelectorAll<HTMLElement>('.players > div, .playback-controls, .anchor-editor')].slice(0, 6).forEach((block, i) => {
    animate(block, [{ opacity: .5, transform: block.contains(target) ? 'none' : 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { delay: 850 + i * 70, duration: 400, easing: 'cubic-bezier(.22,.68,.2,1)' });
  });
  return { render: (ms: number) => scene.render(ms), stop() { scene.hide(); atmosphere.remove(); } };
}
