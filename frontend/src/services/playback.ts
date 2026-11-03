import type { Landmark, PoseFrame } from '../types/swing';

// No se interpola a través de pérdidas de detección ni se prolongan poses antiguas.
export function frameAtTime(frames: PoseFrame[], seconds: number, maxAgeMs = 150): PoseFrame | null {
  const target = seconds * 1000;
  let low = 0;
  let high = frames.length - 1;
  let index = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].timestamp_ms <= target) {
      index = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return index >= 0 && target - frames[index].timestamp_ms <= maxAgeMs ? frames[index] : null;
}

export function isVisible(point: Landmark | undefined, threshold: number): point is Landmark {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && point.visibility >= threshold && point.presence >= threshold;
}