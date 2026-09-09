import { Point } from '../typings/types';
import { CompiledMotorStroke, UnitDirection, UnitFeedbackReason } from './types';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pathLength = (points: Point[]) =>
  points.reduce((sum, p, i) => sum + (i ? distance(points[i - 1], p) : 0), 0);
/**
 * Number of arc-length-spaced points every stroke is resampled to before comparison.
 * Both the drawn stroke and the target use it, so forward and reverse comparisons can
 * index each other directly.
 */
const SAMPLE_COUNT = 32;

const sample = (points: Point[], count = SAMPLE_COUNT): Point[] => {
  const total = pathLength(points);
  if (!total) return Array.from({ length: count }, () => points[0]);
  const result = [points[0]];
  let segment = 1;
  let covered = 0;
  for (let i = 1; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (
      segment < points.length - 1 &&
      covered + distance(points[segment - 1], points[segment]) < target
    ) {
      covered += distance(points[segment - 1], points[segment]);
      segment++;
    }
    const a = points[segment - 1];
    const b = points[segment];
    const ratio = Math.min(1, (target - covered) / (distance(a, b) || 1));
    result.push({ x: a.x + ratio * (b.x - a.x), y: a.y + ratio * (b.y - a.y) });
  }
  return result;
};
const features = new WeakMap<CompiledMotorStroke, { points: Point[]; length: number }>();

/** Geometric preview grader; tolerances are fractions of canonical em, never display bounds. */
export function gradeStroke(
  stroke: CompiledMotorStroke,
  input: Point[],
  direction: UnitDirection,
  leniency: number,
): UnitFeedbackReason {
  if (!input.length || input.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    return 'outside-target';
  const tolerance = 70 * leniency;
  if (stroke.kind === 'dot') {
    const radius = (stroke.radius || 0) + 35 * leniency;
    if (input.some((p) => distance(p, stroke.points[0]) > radius))
      return 'outside-target';
    return pathLength(input) <= radius * 4 ? 'correct' : 'wrong-shape';
  }
  let target = features.get(stroke);
  if (!target) {
    target = { points: sample(stroke.points), length: pathLength(stroke.points) };
    features.set(stroke, target);
  }
  const length = pathLength(input);
  if (length < target.length * 0.45 || input.length < 2) return 'too-short';
  if (length > target.length * 2.2) return 'wrong-shape';
  const drawn = sample(input);
  const last = drawn.length - 1;
  const forward = drawn.map((p, i) => distance(p, target!.points[i]));
  const backward = drawn.map((p, i) => distance(p, target!.points[last - i]));
  const meanError = (errors: number[]) =>
    errors.reduce((a, b) => a + b, 0) / errors.length;
  // Endpoints get a tighter budget than the mean, and no single sample may drift
  // more than twice the tolerance, so a stroke cannot pass on average alone.
  const matches = (errors: number[]) =>
    Math.max(errors[0], errors[last]) <= tolerance * 1.5 &&
    meanError(errors) <= tolerance &&
    Math.max(...errors) <= tolerance * 2;
  // A short stroke fits both ways: reversing a straight 100-unit line puts every
  // sample within a 70-unit tolerance, so testing forward first accepted it as
  // 'correct' and 'wrong-direction' was unreachable. Take whichever fits better.
  const forwardFits = matches(forward);
  const backwardFits = matches(backward);
  if (forwardFits && (!backwardFits || meanError(forward) <= meanError(backward))) {
    return 'correct';
  }
  if (backwardFits) return direction === 'either' ? 'correct' : 'wrong-direction';
  const minX = Math.min(...target.points.map((p) => p.x)) - tolerance * 2;
  const maxX = Math.max(...target.points.map((p) => p.x)) + tolerance * 2;
  const minY = Math.min(...target.points.map((p) => p.y)) - tolerance * 2;
  const maxY = Math.max(...target.points.map((p) => p.y)) + tolerance * 2;
  return drawn.some((p) => p.x < minX || p.x > maxX || p.y < minY || p.y > maxY)
    ? 'outside-target'
    : 'wrong-shape';
}
