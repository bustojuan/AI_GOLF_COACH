export type HeroJoint = 'left_shoulder' | 'right_shoulder' | 'left_wrist' | 'right_wrist' | 'left_hip' | 'right_hip';
export interface HeroPoint { x: number; y: number }
export interface HeroTrackingFrame {
  time: number;
  joints: Partial<Record<HeroJoint, HeroPoint | null>>;
  club?: { head: HeroPoint; grip: HeroPoint } | null;
}
export interface HeroPhase { key: string; label: string; start: number }
export interface HeroClip {
  version: 1;
  src: string;
  poster: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  phases: HeroPhase[];
  frames: HeroTrackingFrame[];
}

export function validHeroPoint(point: HeroPoint | null | undefined): point is HeroPoint {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

/** Only observed samples, never interpolate across missing frames or extrapolate old poses. */
export function heroFrameAtTime(clip: Pick<HeroClip, 'fps' | 'frames'>, time: number): HeroTrackingFrame | null {
  if (!Number.isFinite(time) || time < 0 || !(clip.fps > 0)) return null;
  let left = 0, right = clip.frames.length - 1, index = -1;
  while (left <= right) {
    const middle = (left + right) >>> 1;
    if (clip.frames[middle].time <= time + 0.0001) { index = middle; left = middle + 1; }
    else right = middle - 1;
  }
  return index >= 0 && time - clip.frames[index].time <= 1.5 / clip.fps ? clip.frames[index] : null;
}

export function heroPhaseAtTime(phases: HeroPhase[], time: number): HeroPhase | null {
  if (!Number.isFinite(time)) return null;
  for (let index = phases.length - 1; index >= 0; index--) if (phases[index].start <= time + .0001) return phases[index];
  return null;
}

/** Club trails require explicit observations; wrists alone never fabricate a clubhead. */
export function heroClubTrail(clip: Pick<HeroClip, 'fps' | 'frames'>, time: number, window = .22): HeroPoint[] {
  const current = heroFrameAtTime(clip, time);
  if (!current?.club || !validHeroPoint(current.club.head)) return [];
  const points: HeroPoint[] = [];
  let previousTime = current.time;
  for (let index = clip.frames.indexOf(current); index >= 0; index--) {
    const frame = clip.frames[index];
    if (time - frame.time > window || previousTime - frame.time > 1.5 / clip.fps || !frame.club || !validHeroPoint(frame.club.head)) break;
    points.unshift(frame.club.head); previousTime = frame.time;
  }
  return points;
}
