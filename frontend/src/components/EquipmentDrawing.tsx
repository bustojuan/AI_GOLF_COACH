import type { Point2D, NormalizedClub } from '../types/comparison';

export default function EquipmentDrawing({ ball, club, width = 1, height = 1, radius = 0.045 }: {
  ball?: Point2D | null; club?: NormalizedClub | null;
  width?: number; height?: number; radius?: number;
}) {
  return <g className="equipment-drawing">
    {club && <line className="club-marker" aria-label="Segmento detectado del palo" x1={club.start.x * width} y1={club.start.y * height}
      x2={club.end.x * width} y2={club.end.y * height} stroke="#ef4444" strokeWidth="4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    {ball && <circle className="ball-marker" aria-label="Bola detectada" cx={ball.x * width} cy={ball.y * height}
      r={radius} fill="#ffdf00" stroke="#372e00" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
  </g>;
}
