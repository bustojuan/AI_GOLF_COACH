import type { CinemaFamily, FrameCapture, ScreenTarget } from './types';

const decoded = new WeakMap<HTMLElement, Map<string, HTMLImageElement>>();
export function warmSceneMedia(journey: HTMLElement) {
  let cache = decoded.get(journey);
  if (!cache) { cache = new Map(); decoded.set(journey, cache); }
  for (const element of journey.querySelectorAll<HTMLImageElement>('.moment-media img, .video-stage img')) {
    const source = element.currentSrc || element.src;
    if (!source || cache.has(source)) continue;
    const image = new Image(); image.src = source; cache.set(source, image);
    void image.decode().catch(() => {});
  }
  // References may be replaced; keep only media still belonging to the mounted analysis.
  const sources = new Set([...journey.querySelectorAll<HTMLImageElement>('img')].map(image => image.currentSrc || image.src));
  for (const source of cache.keys()) if (!sources.has(source)) cache.delete(source);
}

export function relativeTarget(element: Element, layer: HTMLElement): ScreenTarget {
  const box = element.getBoundingClientRect(), stage = layer.getBoundingClientRect();
  return { x: box.left - stage.left, y: box.top - stage.top, width: box.width, height: box.height };
}

/** Draw only actual loaded media. A tainted/unavailable image is omitted, never substituted. */
function capture(element: HTMLImageElement | HTMLVideoElement, layer: HTMLElement, label: string): FrameCapture | null {
  const video = element instanceof HTMLVideoElement;
  const journey = layer.closest<HTMLElement>('.journey');
  const source = element.currentSrc || element.src;
  const cached = !video && journey ? decoded.get(journey)?.get(source) : undefined;
  const image = cached?.complete && cached.naturalWidth ? cached : element;
  const width = video ? element.videoWidth : (image as HTMLImageElement).naturalWidth;
  const height = video ? element.videoHeight : (image as HTMLImageElement).naturalHeight;
  if (!width || !height || (video ? element.readyState < 2 : !(image as HTMLImageElement).complete)) return null;
  const canvas = document.createElement('canvas');
  const factor = Math.min(1, 640 / Math.max(width, height));
  canvas.width = Math.round(width * factor); canvas.height = Math.round(height * factor);
  try {
    const context = canvas.getContext('2d'); if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.getImageData(0, 0, 1, 1); // Fail before a cross-origin texture reaches WebGL.
    return { canvas, aspect: width / height, label, source,
      target: relativeTarget(element, layer) };
  } catch { return null; }
}

export function captureSceneMedia(family: CinemaFamily, incoming: HTMLElement, outgoing: HTMLElement, layer: HTMLElement) {
  const frames: FrameCapture[] = [];
  if (family === 'swing-replay') {
    // DOM order is address, top, impact, finish; only the user's first image in each pair.
    for (const section of incoming.querySelectorAll('.paired-moments > section')) {
      const image = section.querySelector<HTMLImageElement>('.moment-media img');
      const result = image && capture(image, layer, section.querySelector('h4')?.textContent ?? 'Momento');
      if (result && !frames.some(frame => frame.source === result.source)) frames.push(result);
    }
  } else if (family === 'radar-scan') {
    const journey = layer.closest<HTMLElement>('.journey');
    const momentImages = journey?.querySelectorAll<HTMLImageElement>('.paired-moments > section .moment-media img');
    const videoFrames = [...incoming.querySelectorAll<HTMLElement>('.swing-video-frame')];
    for (const [index, videoFrame] of videoFrames.entries()) {
      const stage = videoFrame.querySelector<HTMLElement>('.video-stage');
      const element = stage?.querySelector<HTMLVideoElement | HTMLImageElement>('video, img');
      const label = videoFrame.querySelector('h3')?.textContent ?? 'Swing';
      let result = element ? capture(element, layer, label) : null;
      // The original video may still be seeking; its already processed real moment
      // is available on the next mounted screen and provides a truthful fallback.
      if (!result && stage && momentImages?.[index]) {
        result = capture(momentImages[index], layer, label);
        if (result) result.target = relativeTarget(stage, layer);
      }
      if (result) frames.push(result);
    }
    // On 03 -> 04 the comparison is first mounted in the same React commit as
    // navigation. Its videos can still be seeking at capture time. The outgoing
    // marks screen already contains the user's loaded original and the saved
    // reference preview, so bridge those genuine images into the new pair.
    const outgoingUser = outgoing.querySelector<HTMLVideoElement>('.results .video-stage video');
    const outgoingReference = outgoing.querySelector<HTMLImageElement>('.saved-marks .video-stage img');
    for (const [index, element, label] of [
      [0, outgoingUser, 'Tu swing'], [1, outgoingReference, 'Referencia'],
    ] as const) {
      if (!element || frames.some(frame => frame.label === label)) continue;
      const result = capture(element, layer, label);
      if (!result) continue;
      const stage = videoFrames[index]?.querySelector<HTMLElement>('.video-stage');
      if (stage) result.target = relativeTarget(stage, layer);
      frames.push(result);
    }
    frames.sort((a, b) => a.label === 'Tu swing' ? -1 : b.label === 'Tu swing' ? 1 : 0);
  }
  if (!frames.length && (family === 'swing-replay' || family === 'radar-scan')) {
    const element = outgoing.querySelector<HTMLVideoElement | HTMLImageElement>('.video-stage video, .video-stage img');
    const result = element && capture(element, layer, 'Fotograma disponible');
    if (result) { delete result.target; frames.push(result); }
  }
  return frames.slice(0, 4);
}

export function sceneTarget(incoming: HTMLElement, layer: HTMLElement): ScreenTarget {
  const stage = layer.getBoundingClientRect();
  const targets = [...incoming.querySelectorAll('.video-stage, .moment-media, .score-dial, .coach-report, .card')];
  const visible = targets.find(element => { const r = element.getBoundingClientRect(); return r.width > 30 && r.top >= stage.top && r.top < stage.top + stage.height * .65; });
  return visible ? relativeTarget(visible, layer) : { x: layer.clientWidth * .2, y: layer.clientHeight * .22, width: layer.clientWidth * .6, height: layer.clientHeight * .4 };
}
