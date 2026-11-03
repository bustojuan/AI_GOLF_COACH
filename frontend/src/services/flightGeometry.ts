export interface FlightPoint { x: number; y: number }

/** A single quadratic arc, expressed as a cubic so its stroke can settle into an edge. */
export function flightPoint(start: FlightPoint, end: FlightPoint, loft: number, progress: number): FlightPoint {
  const t = Math.max(0, Math.min(1, progress));
  return { x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t - 4 * loft * t * (1 - t) };
}

export function flightPath(start: FlightPoint, end: FlightPoint, loft: number): string {
  const q = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 2 * loft };
  const a = { x: start.x + (q.x - start.x) * 2 / 3, y: start.y + (q.y - start.y) * 2 / 3 };
  const b = { x: end.x + (q.x - end.x) * 2 / 3, y: end.y + (q.y - end.y) * 2 / 3 };
  return `M ${start.x} ${start.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${end.x} ${end.y}`;
}

// A readable launch and gradual slowdown; no front-loaded global Bézier on top of this clock.
export function flightTravel(time: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, time)), 1.55);
}

export function flightReveal(time: number): number {
  const t = Math.max(0, Math.min(1, time));
  return t * t * (3 - 2 * t);
}

/** A trailing reveal front catches the flight, then follows its head until it settles. */
export function flightSweep(head: FlightPoint, width: number, height: number, catchup: number, release: number): FlightPoint[] {
  const follow = Math.max(0, Math.min(1, catchup)), finish = Math.max(0, Math.min(1, release));
  const front = head.x * follow + (width - head.x * follow) * finish;
  const bow = Math.min(52, width * .08) * (1 - finish) * follow;
  return Array.from({ length: 25 }, (_, index) => {
    const y = height * index / 24;
    return { x: Math.max(0, Math.min(width, front - bow * Math.abs(y - head.y) / height)), y };
  });
}

/** The stroke uses distance along the exact same arc as the ball, not its curve parameter. */
export function flightDistance(start: FlightPoint, end: FlightPoint, loft: number) {
  const lengths = [0];
  let previous = start;
  for (let index = 1; index <= 128; index++) {
    const point = flightPoint(start, end, loft, index / 128);
    lengths.push(lengths[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    previous = point;
  }
  return (progress: number) => {
    const cursor = Math.max(0, Math.min(128, progress * 128));
    const index = Math.floor(cursor), fraction = cursor - index;
    return (lengths[index] + ((lengths[index + 1] ?? lengths[index]) - lengths[index]) * fraction) / (lengths[128] || 1);
  };
}
