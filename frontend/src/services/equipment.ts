import type { EquipmentFrame, SuggestedAnchors, SwingResult } from '../types/swing';
import type { AnchorDraft, ComparisonFrame, Point2D } from '../types/comparison';

export function proposedAnchors(suggestion?: SuggestedAnchors): AnchorDraft {
  const result: AnchorDraft = {};
  for (const key of ['start_ms', 'top_ms', 'impact_ms', 'end_ms'] as const) {
    const value = suggestion?.[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) result[key] = value;
  }
  return result;
}

export function equipmentAtTime(frames: EquipmentFrame[], seconds: number, maxAgeMs = 120): EquipmentFrame | null {
  const target = seconds * 1000;
  let low = 0;
  let high = frames.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].timestamp_ms <= target) { found = middle; low = middle + 1; }
    else high = middle - 1;
  }
  return found >= 0 && target - frames[found].timestamp_ms <= maxAgeMs ? frames[found] : null;
}

export function previewAtTime(result: SwingResult, targetMs: number): EquipmentFrame | null {
  const frames = result.equipment_frames?.length ? result.equipment_frames : result.frames;
  let closest: EquipmentFrame | null = null;
  let gap = Infinity;
  for (const frame of frames) {
    const distance = Math.abs(frame.timestamp_ms - targetMs);
    if (distance < gap) { closest = frame; gap = distance; }
  }
  return gap <= Math.max(150, 1000 / result.video.processed_fps + 50) ? closest : null;
}

// Una trayectoria se corta al perder cualquiera de los puntos necesarios.
export function trajectorySegments(frames: ComparisonFrame[], side: 'user' | 'reference', index: number, elapsed: number): Point2D[][] {
  const segments: Point2D[][] = [];
  let current: Point2D[] = [];
  for (const frame of frames) {
    if (frame.elapsed_ms > elapsed) break;
    const point = frame[side][index];
    if (point) current.push(point);
    else if (current.length) { segments.push(current); current = []; }
  }
  if (current.length) segments.push(current);
  return segments.filter(segment => segment.length > 1);
}
