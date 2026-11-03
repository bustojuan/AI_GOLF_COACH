import type { CinemaEngine } from './engine';
const instances = new WeakMap<HTMLElement, CinemaEngine>();
const pending = new WeakMap<HTMLElement, Promise<void>>();

export function prepareCinema(layer: HTMLElement) {
  if (pending.has(layer) || instances.has(layer)) return pending.get(layer);
  layer.dataset.cinemaReady = 'loading';
  const task = import('./engine').then(({ createCinemaEngine }) => {
    if (pending.get(layer) !== task || !layer.isConnected) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { pending.delete(layer); layer.dataset.cinemaReady = 'reduced'; return; }
    const engine = createCinemaEngine(layer);
    if (engine) instances.set(layer, engine);
    layer.dataset.cinemaReady = engine ? 'ready' : 'unavailable';
    if (engine) {
      const video = layer.closest('.journey')?.querySelector<HTMLVideoElement>('.studio-motion video');
      if (video) {
        const warm = () => {
          if (!layer.isConnected) return;
          const run = () => { if (layer.isConnected) void engine.primeSwing(video); };
          // Start after the first paint instead of waiting for an idle slot: a quick
          // first click should not push shader compilation into the transition.
          requestAnimationFrame(() => setTimeout(run, 0));
        };
        if (video.readyState >= 2) warm();
        else video.addEventListener('loadeddata', warm, { once: true });
      }
    }
  }).catch(() => { layer.dataset.cinemaReady = 'unavailable'; });
  pending.set(layer, task); return task;
}
export function getCinema(layer: HTMLElement) { return instances.get(layer); }
export async function prepareSwingCinema(layer: HTMLElement, video: HTMLVideoElement) {
  await prepareCinema(layer);
  await instances.get(layer)?.primeSwing(video);
}
export function disposeCinema(layer: HTMLElement) {
  instances.get(layer)?.dispose(); instances.delete(layer); pending.delete(layer);
}
