import type { FlightScene } from './flight3DScene';

// One renderer per mounted journey; loaded while choosing a reference, never on landing.
const scenes = new WeakMap<HTMLElement, FlightScene>();
const pending = new WeakMap<HTMLElement, Promise<void>>();

export function prepareFlight3D(layer: HTMLElement) {
  if (pending.has(layer) || scenes.has(layer)) return pending.get(layer);
  layer.dataset.flight3d = 'loading';
  const task = import('./flight3DScene').then(({ createFlightScene }) => {
    if (pending.get(layer) !== task || !layer.isConnected) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pending.delete(layer); layer.dataset.flight3d = 'reduced'; return;
    }
    const scene = createFlightScene(layer);
    if (scene) scenes.set(layer, scene);
    layer.dataset.flight3d = scene ? 'ready' : 'unavailable';
  }).catch(() => { layer.dataset.flight3d = 'unavailable'; });
  pending.set(layer, task);
  return task;
}

export function getFlight3D(layer: HTMLElement) { return scenes.get(layer); }
export function disposeFlight3D(layer: HTMLElement) {
  scenes.get(layer)?.dispose(); scenes.delete(layer); pending.delete(layer);
}
