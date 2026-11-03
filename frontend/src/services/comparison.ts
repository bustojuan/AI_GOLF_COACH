import type { AnchorDraft, ComparisonFrame, SetupDraft, CaptureSetup, SwingAnchors } from '../types/comparison';

export const ANCHOR_LABELS: [keyof SwingAnchors, string][] = [
  ['start_ms', 'Inicio'], ['top_ms', 'Cima del backswing'], ['impact_ms', 'Impacto'], ['end_ms', 'Final'],
];

export function anchorsReady(draft: AnchorDraft, durationSeconds: number): draft is SwingAnchors {
  const values = ANCHOR_LABELS.map(([key]) => draft[key]);
  return values.every((value): value is number => value !== undefined && Number.isInteger(value) && value >= 0)
    && values.every((value, index) => index === 0 || value! > values[index - 1]!)
    && values[3]! <= Math.round(durationSeconds * 1000);
}

export function setupReady(draft: SetupDraft): draft is CaptureSetup {
  return ['right', 'left'].includes(draft.handedness) && ['face_on', 'down_the_line'].includes(draft.view);
}

export function comparisonFrameAtTime(frames: ComparisonFrame[], elapsedMs: number): ComparisonFrame | null {
  if (!frames.length) return null;
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (frames[middle].elapsed_ms <= elapsedMs) low = middle;
    else high = middle - 1;
  }
  return frames[low];
}