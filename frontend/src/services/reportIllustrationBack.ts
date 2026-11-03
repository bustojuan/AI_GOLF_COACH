import type { Point2D } from '../types/comparison';

/** Dibujo desde la línea de tiro: torso inclinado, manos por delante y pies en profundidad. */
export function createRearIllustration() {
  const pose = (elbows: number[][], wrists: number[][], head: number[], turn = 0, finish = false): (Point2D | null)[] => {
    const points: (Point2D | null)[] = Array(33).fill(null);
    const entries: Record<number, number[]> = {
      0: head,
      11: [.12 - turn * .32, -.97 - turn * .08], 12: [.53 - turn * .2, -.95 - turn * .12],
      13: elbows[0], 14: elbows[1], 15: wrists[0], 16: wrists[1],
      23: [-.24 - turn * .03, 0], 24: [.15 - turn * .02, -.03],
      25: [-.16 - turn * .05, .65], 26: [.24 - turn * .04, .66],
      27: [-.28, 1.3], 28: [finish ? .15 : .2, finish ? 1.12 : 1.31],
      31: [-.06, 1.36], 32: [.45, 1.36],
    };
    for (const [index, [x, y]] of Object.entries(entries)) points[Number(index)] = { x, y };
    return points;
  };
  const moments = [
    pose([[.38, -.45], [.69, -.45]], [[.82, .06], [.9, .08]], [.48, -1.35]),
    pose([[.3, -1.5], [.72, -1.38]], [[.7, -2], [.77, -1.97]], [.38, -1.39], .65),
    pose([[.36, -.49], [.7, -.45]], [[.8, .04], [.87, .07]], [.45, -1.38], .2),
    pose([[-.35, -1.2], [.15, -1.45]], [[-.32, -1.9], [-.25, -1.88]], [.05, -1.58], 1, true),
  ];
  return {
    moments,
    clubEnds: [{ x: 1.28, y: 1.23 }, { x: -.56, y: -2.1 }, { x: 1.28, y: 1.23 }, { x: .44, y: -1 }],
    ball: { x: 1.3, y: 1.35 },
    controls: [
      [moments[0],
        pose([[.3, -.64], [.65, -.72]], [[.67, -.46], [.74, -.43]], [.45, -1.36], .15),
        pose([[.2, -1.14], [.65, -1.07]], [[.78, -1.11], [.85, -1.08]], [.41, -1.38], .4), moments[1]],
      [moments[1],
        pose([[.17, -1.19], [.6, -1.02]], [[.56, -1.36], [.63, -1.33]], [.39, -1.39], .5),
        pose([[.3, -.75], [.68, -.68]], [[.68, -.53], [.75, -.5]], [.43, -1.38], .3), moments[2]],
      [moments[2],
        pose([[-.06, -.67], [.46, -.68]], [[.2, -.4], [.27, -.37]], [.32, -1.43], .45),
        pose([[-.37, -1.1], [.2, -1.2]], [[-.35, -1.2], [-.28, -1.17]], [.16, -1.51], .75), moments[3]],
    ],
    phaseAngles: [[15, -72], [-100, -15], [130, 245]],
  };
}
