import type { CaptureSetup, Point2D } from '../types/comparison';
import type { CoachStageKey } from '../types/recommendation';
import { createRearIllustration } from './reportIllustrationBack.ts';

export interface IllustrationPose {
  points: (Point2D | null)[];
  club: { start: Point2D; end: Point2D };
  ball: Point2D;
}

export const ILLUSTRATION_FRAME_COUNT = 72;

/** Guías dibujadas según la perspectiva; independientes de posturas y marcas del vídeo. */
export function createStageIllustration(key: CoachStageKey, view: CaptureSetup['view'] = 'face_on'): IllustrationPose[] {
  const rear = view === 'down_the_line' ? createRearIllustration() : null;
  const pose = (elbows: number[][], wrists: number[][], head: number[], shift = 0): (Point2D | null)[] => {
    const points: (Point2D | null)[] = Array(33).fill(null);
    const entries: Record<number, number[]> = { 0: head, 11: [-.48 + shift, -1], 12: [.48 + shift, -1],
      13: elbows[0], 14: elbows[1], 15: wrists[0], 16: wrists[1],
      23: [-.3, 0], 24: [.3, 0], 25: [-.38, .62], 26: [.38, .62],
      27: [-.53, 1.3], 28: [.53, 1.3], 31: [-.72, 1.35], 32: [.72, 1.35] };
    for (const [index, [x, y]] of Object.entries(entries)) points[Number(index)] = { x, y };
    return points;
  };
  // Se conservan las cuatro posturas fijas del diseño aprobado.
  const moments = rear?.moments ?? [
    pose([[-.38, -.4], [.31, -.38]], [[0, .1], [.09, .14]], [0, -1.47]),
    pose([[-.15, -1.45], [.7, -1.31]], [[.87, -1.94], [.94, -1.91]], [.06, -1.48], .1),
    pose([[-.43, -.4], [.26, -.38]], [[-.1, .1], [-.04, .1]], [-.07, -1.47], -.06),
    pose([[-.6, -1.05], [-.95, -1.4]], [[-.88, -1.9], [-.81, -1.86]], [-.2, -1.58], -.15),
  ];
  const clubEnds = rear?.clubEnds ?? [{ x: .41, y: 1.25 }, { x: -.38, y: -2.03 }, { x: .41, y: 1.25 }, { x: -.5, y: -.8 }];
  const ball = rear?.ball ?? { x: .41, y: 1.35 };
  const momentIndex = ['address', 'top', 'impact', 'finish'].indexOf(key);
  if (momentIndex >= 0) return [{ points: moments[momentIndex],
    club: { start: moments[momentIndex][15]!, end: clubEnds[momentIndex] }, ball }];

  const phaseIndex = ['backswing', 'downswing', 'follow_through'].indexOf(key);
  const controls = (rear?.controls ?? [
    [moments[0],
      pose([[-.05, -.57], [.62, -.63]], [[.62, -.35], [.69, -.31]], [.02, -1.47], .04),
      pose([[.23, -1.22], [.82, -.96]], [[1.03, -1.05], [1.1, -1.02]], [.05, -1.48], .08), moments[1]],
    [moments[1],
      pose([[.12, -1.19], [.77, -.92]], [[.96, -1.17], [1.03, -1.14]], [.02, -1.48], .05),
      pose([[-.07, -.69], [.49, -.6]], [[.59, -.42], [.66, -.39]], [-.03, -1.48], -.02), moments[2]],
    [moments[2],
      pose([[-.67, -.62], [-.12, -.5]], [[-.79, -.35], [-.72, -.32]], [-.1, -1.49], -.08),
      pose([[-.88, -.99], [-.59, -1.2]], [[-1.12, -1.2], [-1.05, -1.17]], [-.16, -1.54], -.12), moments[3]],
  ])[phaseIndex];
  const start = moments[phaseIndex][15]!;
  const end = moments[phaseIndex + 1][15]!;
  const startAngle = Math.atan2(clubEnds[phaseIndex].y - start.y, clubEnds[phaseIndex].x - start.x);
  const endAngle = Math.atan2(clubEnds[phaseIndex + 1].y - end.y, clubEnds[phaseIndex + 1].x - end.x);
  // Ángulos continuos: el palo recorre su arco, sin atravesar el torso ni encogerse.
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const phaseAngles = (rear?.phaseAngles ?? [[15, -72], [-100, -15], [145, 250]])[phaseIndex];
  const angles = [startAngle, ...phaseAngles.map(radians), endAngle + (phaseIndex === 2 ? 2 * Math.PI : 0)];
  const startLength = Math.hypot(clubEnds[phaseIndex].x - start.x, clubEnds[phaseIndex].y - start.y);
  const endLength = Math.hypot(clubEnds[phaseIndex + 1].x - end.x, clubEnds[phaseIndex + 1].y - end.y);
  const curve = (a: number, b: number, c: number, d: number, t: number) =>
    .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);

  return Array.from({ length: ILLUSTRATION_FRAME_COUNT }, (_, index) => {
    // Una breve pausa en los extremos ayuda a leer dónde empieza y acaba la fase.
    const progress = Math.max(0, Math.min(1, (index / (ILLUSTRATION_FRAME_COUNT - 1) - .1) / .8));
    const position = progress * 3;
    const segment = Math.min(2, Math.floor(position));
    const t = position - segment;
    const indices = [Math.max(0, segment - 1), segment, segment + 1, Math.min(3, segment + 2)];
    const points = controls[0].map((point, joint) => point && ({
      x: curve(...indices.map(i => controls[i][joint]!.x) as [number, number, number, number], t),
      y: curve(...indices.map(i => controls[i][joint]!.y) as [number, number, number, number], t),
    }));
    const grip = points[15]!;
    const angle = curve(...indices.map(i => angles[i]) as [number, number, number, number], t);
    const length = startLength + (endLength - startLength) * progress;
    return { points, club: { start: grip, end: { x: grip.x + Math.cos(angle) * length, y: grip.y + Math.sin(angle) * length } }, ball };
  });
}
