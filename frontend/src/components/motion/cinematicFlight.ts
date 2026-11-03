import { flightDistance, flightPath, flightPoint, flightReveal, flightSweep, flightTravel } from '../../services/flightGeometry';
import type { FlightPoint } from '../../services/flightGeometry';

type Family = 'swing-impact' | 'ball-flight';
type Animator = (element: HTMLElement | SVGElement, frames: Keyframe[], options: KeyframeAnimationOptions) => Animation;
const settle = 'cubic-bezier(.22,.68,.2,1)';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function refinedFlightDuration(family: Family, forward: boolean) {
  return forward ? family === 'swing-impact' ? 960 : 1880 : family === 'swing-impact' ? 680 : 920;
}

/** Only the first two scenes: ball, stroke and reveal share one sampled flight clock. */
export function animateCinematicFlight({ family, forward, journey, layer, outgoing, incoming, anchor, trace, ball, wave, animate }: {
  family: Family; forward: boolean; journey: HTMLElement; layer: HTMLElement;
  outgoing: HTMLElement; incoming: HTMLElement; anchor: HTMLElement;
  trace: SVGPathElement; ball: SVGCircleElement; wave: SVGCircleElement; animate: Animator;
}) {
  const duration = refinedFlightDuration(family, forward);
  const swing = family === 'swing-impact';
  const width = layer.clientWidth, height = layer.clientHeight, diagonal = Math.hypot(width, height);
  const stage = layer.getBoundingClientRect();
  const content = incoming.querySelector<HTMLElement>('.journey-content')!;
  const contentBounds = content.getBoundingClientRect();
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 30 && rect.top >= stage.top + 6 && rect.top < stage.top + height * .7;
  };
  // Land in a real panel rim. On a narrow screen prefer the visible video, not an offscreen skeleton.
  const candidates = swing || !forward ? [...incoming.querySelectorAll('.card')]
    : [...incoming.querySelectorAll('.players .skeleton'), ...incoming.querySelectorAll('.players .video-stage')];
  const target = candidates
    .find(visible) ?? incoming.querySelector('.card') ?? content;
  const targetBounds = target.getBoundingClientRect();
  const left = clamp(targetBounds.left - stage.left + 10, 16, width - 40);
  const right = clamp(targetBounds.right - stage.left - 10, left + 24, width - 16);
  const edgeY = clamp(targetBounds.top - stage.top + 1, 16, height * .68);
  anchor.style.left = `${left - (contentBounds.left - stage.left)}px`;
  anchor.style.top = `${edgeY - (contentBounds.top - stage.top) - 1}px`;
  anchor.style.width = `${right - left}px`; anchor.style.right = 'auto';
  anchor.dataset.targetEdge = target.matches('.skeleton, .video-stage') ? 'media-panel' : 'card';
  const end = { x: right, y: edgeY };
  let start: FlightPoint = { x: width * (forward ? .12 : .88), y: height * .58 };
  if (swing && forward) {
    const frame = outgoing.querySelector('.studio-motion video')?.getBoundingClientRect();
    if (frame) start = { x: clamp(frame.left - stage.left + frame.width * .71, 20, width - 20),
      y: clamp(frame.top - stage.top + frame.height * .79, 20, height - 32) };
  } else {
    const source = outgoing.querySelector(forward ? '.reference-info, .reference-choice h2' : '.card');
    const rect = source?.getBoundingClientRect();
    if (rect && rect.top > stage.top && rect.top < stage.bottom - 40) start = {
      x: clamp(rect.left - stage.left + 22, 20, width - 20),
      y: clamp(rect.top - stage.top + rect.height + 16, height * .3, height * .72),
    };
  }
  let loft = swing ? Math.min(28, height * .035) : height * .22;
  while (loft > 1 && Array.from({ length: 33 }, (_, i) => flightPoint(start, end, loft, i / 32)).some(point => point.y < 20)) loft *= .75;
  const curve = flightPath(start, end, loft);
  const straight = `M ${left} ${edgeY} C ${left + (right - left) / 3} ${edgeY}, ${left + (right - left) * 2 / 3} ${edgeY}, ${right} ${edgeY}`;
  const distance = flightDistance(start, end, loft);
  const launchAt = forward ? swing ? 30 : 140 : 40;
  const flyFor = forward ? swing ? 520 : 1040 : duration * .55;
  const contact = launchAt + flyFor;
  const mergeAt = forward ? swing ? 620 : 1320 : contact + 50;
  const morphAt = forward ? swing ? 620 : 1280 : duration * .65;
  const revealAt = forward ? swing ? 180 : 600 : 100;
  const revealEnd = forward ? swing ? 800 : 1560 : duration - 90;
  const progressAt = (time: number) => flightTravel((time - launchAt) / flyFor);
  const pointAt = (time: number) => flightPoint(start, end, loft, progressAt(time));
  trace.setAttribute('d', curve);
  trace.style.strokeDasharray = '1'; trace.style.strokeDashoffset = '1';
  const stroke: Keyframe[] = Array.from({ length: 65 }, (_, index) => {
    const time = duration * index / 64;
    return { offset: index / 64, strokeDashoffset: 1 - distance(progressAt(time)),
      opacity: time < launchAt ? 0 : time < contact ? .78 : .55 };
  });
  animate(trace, stroke, { duration, easing: 'linear' });
  if (CSS.supports('d', `path("${curve}")`)) animate(trace, [{ d: `path("${curve}")` }, { d: `path("${straight}")` }],
    { delay: morphAt, duration: duration - morphAt, easing: settle });

  if (forward) {
    const pose = (point: FlightPoint, scale: number) => `translate(${point.x}px, ${point.y}px) scale(${scale})`;
    const frames: Keyframe[] = [{ offset: 0, transform: pose(start, .75), opacity: 0 },
      { offset: launchAt / 2 / duration, transform: pose(start, 1.3), opacity: 1 }];
    for (let index = 0; index <= 48; index++) {
      const fraction = index / 48, progress = flightTravel(fraction);
      frames.push({ offset: (launchAt + flyFor * fraction) / duration,
        transform: pose(flightPoint(start, end, loft, progress), 1.3 - progress * .35), opacity: 1 });
    }
    // Stay at the endpoint, then merge into its edge; never vanish halfway through the arc.
    frames.push({ offset: (contact + 35) / duration, transform: pose(end, .95), opacity: 1 },
      { offset: mergeAt / duration, transform: pose(end, .15), opacity: 0 },
      { offset: 1, transform: pose(end, .15), opacity: 0 });
    animate(ball, frames, { duration, easing: 'linear' });
    wave.setAttribute('cx', String(swing ? start.x : end.x));
    wave.setAttribute('cy', String(swing ? start.y : end.y)); wave.setAttribute('fill', 'none');
    animate(wave, [{ r: '4px', opacity: 0 }, { r: '6px', opacity: .45, offset: .1 }, { r: swing ? '21px' : '15px', opacity: 0 }],
      { delay: swing ? 0 : contact, duration: swing ? 190 : 230, easing: settle });
  }

  // No extra pane transform: the ball and the reveal occupy exactly the same coordinate space.
  const masks: Keyframe[] = Array.from({ length: 65 }, (_, index) => {
    const time = duration * index / 64, point = pointAt(time);
    const radius = diagonal * flightReveal((time - revealAt) / (revealEnd - revealAt));
    let clipPath = `circle(${radius}px at ${point.x}px ${point.y}px)`;
    if (!swing && forward) {
      const boundary = flightSweep(point, width, height, flightReveal((time - 500) / 400), flightReveal((time - 1320) / 240));
      clipPath = `polygon(0px 0px,${boundary.map(p => `${p.x}px ${p.y}px`).join(',')},0px ${height}px)`;
    }
    return { offset: index / 64, clipPath, transform: 'none', opacity: 1 };
  });
  animate(incoming, masks, { duration, easing: 'linear' });
  const hold = forward ? swing ? .62 : .32 : .15;
  animate(outgoing, [{ offset: 0, transform: 'none', opacity: 1 },
    { offset: hold, transform: 'none', opacity: 1 },
    { offset: 1, transform: swing ? 'none' : `translateX(${forward ? -14 : 14}px) scale(.992)`, opacity: 0 }],
    { duration, easing: 'linear' });
  const blocks = incoming.querySelectorAll<HTMLElement>(swing || !forward ? '.journey-content > .card' : '.results > h2, .players > div, .playback-controls, .anchor-editor');
  const enterAt = forward ? swing ? 360 : 830 : duration * .3;
  [...blocks].slice(0, 6).forEach((block, index) => {
    const delay = enterAt + index * (swing ? 65 : 80);
    animate(block, [{ transform: block.contains(target) ? 'none' : 'translateY(8px)', opacity: !swing && forward ? .65 : .2 }, { transform: 'translateY(0)', opacity: 1 }],
      { delay, duration: Math.min(forward ? 450 : 300, duration - delay - 30), easing: settle });
  });
  const label = journey.querySelector<HTMLElement>('.journey-title h1');
  if (label) animate(label, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { delay: revealAt, duration: Math.min(360, duration - revealAt), easing: settle });
  journey.dataset.golfBallContactMs = String(contact);
  journey.dataset.golfBallMergeMs = String(mergeAt);
}
