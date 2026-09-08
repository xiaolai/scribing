import { Point } from '../typings/types';
import { CompiledMotorStroke } from '../units/types';

/** Arc-length reveal shared by SVG and Canvas; never connects distinct motor pieces. */
export const revealPoints = (points: Point[], portion: number): Point[] => {
  if (portion <= 0 || points.length < 2) return [];
  if (portion >= 1) return points;
  const lengths = points
    .slice(1)
    .map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
  let remaining = lengths.reduce((sum, value) => sum + value, 0) * portion;
  const result = [points[0]];
  for (let i = 0; i < lengths.length; i++) {
    const distance = lengths[i];
    if (!distance) continue;
    if (remaining >= distance) {
      result.push(points[i + 1]);
      remaining -= distance;
    } else {
      const fraction = remaining / distance;
      result.push({
        x: points[i].x + (points[i + 1].x - points[i].x) * fraction,
        y: points[i].y + (points[i + 1].y - points[i].y) * fraction,
      });
      break;
    }
  }
  return result;
};

export const unitPieces = (unit: CompiledMotorStroke) =>
  unit.segments.length
    ? unit.segments
    : [{ points: unit.points, width: unit.width, start: 0, end: 1 }];

export const segmentPortion = (portion: number, start: number, end: number) =>
  Math.max(0, Math.min(1, (portion - start) / (end - start)));
