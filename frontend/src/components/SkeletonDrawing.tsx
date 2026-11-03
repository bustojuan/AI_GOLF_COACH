import type { Point2D } from '../types/comparison';

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

export default function SkeletonDrawing({ points, color, radius, strokeWidth = 3 }: {
  points: (Point2D | null)[]; color: string; radius: number; strokeWidth?: number;
}) {
  return (
    <g>
      {CONNECTIONS.map(([a, b]) => points[a] && points[b] && (
        <line key={`${a}-${b}`} x1={points[a]!.x} y1={points[a]!.y} x2={points[b]!.x} y2={points[b]!.y}
          stroke={color} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      ))}
      {points.map((point, index) => point && <circle key={index} cx={point.x} cy={point.y} r={radius} fill={color} />)}
    </g>
  );
}
