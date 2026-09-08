import { Point } from '../typings/types';

/** Maximum perpendicular error in canonical em=1024 coordinates. */
export const COMPILED_POINT_TOLERANCE = 2;
export const MAX_COMPILED_POINTS = 512;

const segmentDistanceSquared = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const squaredLength = dx * dx + dy * dy;
  const t = squaredLength
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / squaredLength))
    : 0;
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
};

/** Iterative RDP preserves endpoints and corners exceeding the explicit error bound.
 * Reject overly complex geometry rather than silently raising the tolerance.
 */
export default function simplifyPoints(input: Point[], path: string): Point[] {
  if (input.length <= MAX_COMPILED_POINTS) return input;
  const points = input.filter(
    (p, i) => !i || p.x !== input[i - 1].x || p.y !== input[i - 1].y,
  );
  const anchors = [0];
  // A reversal is motor information even when every point lies on one line.
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    if ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0) anchors.push(i);
  }
  anchors.push(points.length - 1);
  const kept = new Set(anchors);
  const checkLimit = () => {
    if (kept.size > MAX_COMPILED_POINTS)
      throw new Error(
        `Invalid writing unit: ${path} exceeds 512 compiled points at tolerance ${COMPILED_POINT_TOLERANCE}`,
      );
  };
  checkLimit();
  const stack = anchors.slice(1).map((end, i) => [anchors[i], end]);
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let largest = COMPILED_POINT_TOLERANCE ** 2;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const error = segmentDistanceSquared(points[i], points[start], points[end]);
      if (error > largest) {
        largest = error;
        index = i;
      }
    }
    if (index >= 0) {
      kept.add(index);
      checkLimit();
      stack.push([start, index], [index, end]);
    }
  }
  return Array.from(kept)
    .sort((a, b) => a - b)
    .map((i) => points[i]);
}
