/** Move an actual displayed frame between player and moment thumbnail; omit it when unavailable. */
export function sharedReplayFrame(outgoing: HTMLElement, incoming: HTMLElement, layer: HTMLElement, duration: number) {
  const source = outgoing.querySelector<HTMLVideoElement | HTMLImageElement>('.video-stage video, .video-stage img, .moment-media img');
  const target = incoming.querySelector<HTMLElement>('.moment-media, .video-stage');
  if (!source || !target || (source instanceof HTMLVideoElement ? source.readyState < 2 : !source.complete || !source.naturalWidth)) return null;
  const a = source.getBoundingClientRect(), b = target.getBoundingClientRect(), stage = layer.getBoundingClientRect();
  if (a.width < 20 || a.height < 20 || b.width < 20 || b.height < 20 || b.bottom < stage.top || b.top > stage.bottom) return null;
  const canvas = document.createElement('canvas');
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  canvas.width = Math.min(960, width); canvas.height = Math.round(height * canvas.width / width);
  const context = canvas.getContext('2d');
  if (!context) return null;
  try { context.drawImage(source, 0, 0, canvas.width, canvas.height); } catch { return null; }
  canvas.className = 'golf-shared-frame';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.width = `${a.width}px`; canvas.style.height = `${a.height}px`;
  layer.prepend(canvas);
  const scale = Math.min(b.width / a.width, b.height / a.height);
  const start = `translate(${a.left - stage.left}px, ${a.top - stage.top}px) scale(1)`;
  const end = `translate(${b.left - stage.left + (b.width - a.width * scale) / 2}px, ${b.top - stage.top + (b.height - a.height * scale) / 2}px) scale(${scale})`;
  const animation = canvas.animate([{ transform: start, opacity: .95 }, { transform: end, opacity: .85, offset: .8 },
    { transform: end, opacity: 0 }], { duration: duration * .85, easing: 'cubic-bezier(.35,0,.15,1)', fill: 'both' });
  const arrival = target.animate([{ opacity: 0 }, { opacity: 0, offset: .72 }, { opacity: 1 }],
    { duration: duration * .85, fill: 'both' });
  return { animation, remove: () => { animation.cancel(); arrival.cancel(); canvas.remove(); } };
}
