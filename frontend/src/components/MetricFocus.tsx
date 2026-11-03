import type { Point2D } from '../types/comparison';

const JOINTS: Record<string, number[]> = {
  position: [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
  left_elbow: [11, 13, 15], right_elbow: [12, 14, 16], left_knee: [23, 25, 27], right_knee: [24, 26, 28],
  torso_inclination: [11, 12, 23, 24], shoulder_tilt: [11, 12], hip_tilt: [23, 24], head_position: [0], hands_position: [15, 16],
};

export default function MetricFocus({ points, metric, color }: { points: (Point2D | null)[]; metric: string | null; color: string }) {
  if (!metric || !JOINTS[metric]) return null;
  const selected = JOINTS[metric].flatMap(index => points[index] ? [{ ...points[index]!, index }] : []);
  if (!selected.length) return null;
  return <g className="metric-highlight" data-metric={metric} aria-hidden="true">
    {selected.map(point => <circle key={point.index} cx={point.x} cy={point.y} r=".095" fill="none"
      stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
  </g>;
}
