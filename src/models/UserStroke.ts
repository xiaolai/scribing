import { Point } from '../typings/types';

/**
 * Character-space distance below which a sample carries no information.
 *
 * Pointer hardware reports up to a few hundred moves per second, so a slow gesture used
 * to accumulate thousands of points a fraction of a pixel apart. Every one of them was
 * copied into the render state on arrival, which made a stroke cost quadratic in its
 * duration rather than proportional to its length.
 *
 * The character box is 1024 units across, so one unit is at most about one CSS pixel
 * for any writer that fits on a screen, and far less than one on a small one. That
 * bounds a gesture by the length of the path it draws instead of by how long the user
 * took to draw it. `strokeMatches` already discards exact duplicates; this discards the
 * ones that are exact for every purpose but `===`.
 */
const MIN_POINT_DISTANCE = 1;

export default class UserStroke {
  id: number;
  points: Point[];
  externalPoints: Point[];

  constructor(id: number, startingPoint: Point, startingExternalPoint: Point) {
    this.id = id;
    this.points = [startingPoint];
    this.externalPoints = [startingExternalPoint];
  }

  /** Returns false when the point was too close to the last one to be worth recording. */
  appendPoint(point: Point, externalPoint: Point) {
    const last = this.points[this.points.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) {
      return false;
    }
    this.points.push(point);
    this.externalPoints.push(externalPoint);
    return true;
  }
}
