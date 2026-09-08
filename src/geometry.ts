import { Point } from './typings/types';
import { average, arrLast } from './utils';

export const subtract = (p1: Point, p2: Point) => ({ x: p1.x - p2.x, y: p1.y - p2.y });

export const magnitude = (point: Point) =>
  Math.sqrt(Math.pow(point.x, 2) + Math.pow(point.y, 2));

export const distance = (point1: Point, point2: Point) =>
  magnitude(subtract(point1, point2));

export const equals = (point1: Point, point2: Point) =>
  point1.x === point2.x && point1.y === point2.y;

export const round = (point: Point, precision = 1) => {
  const multiplier = precision * 10;
  return {
    x: Math.round(multiplier * point.x) / multiplier,
    y: Math.round(multiplier * point.y) / multiplier,
  };
};

export const length = (points: Point[]) => {
  let lastPoint = points[0];
  const pointsSansFirst = points.slice(1);
  return pointsSansFirst.reduce((acc, point) => {
    const dist = distance(point, lastPoint);
    lastPoint = point;
    return acc + dist;
  }, 0);
};

export const cosineSimilarity = (point1: Point, point2: Point) => {
  const rawDotProduct = point1.x * point2.x + point1.y * point2.y;
  return rawDotProduct / magnitude(point1) / magnitude(point2);
};

/**
 * return a new point, p3, which is on the same line as p1 and p2, but distance away
 * from p2. p1, p2, p3 will always lie on the line in that order
 */
export const _extendPointOnLine = (p1: Point, p2: Point, dist: number) => {
  const vect = subtract(p2, p1);
  const vectMagnitude = magnitude(vect);
  if (vectMagnitude === 0) return { ...p2 };
  const norm = dist / vectMagnitude;
  return { x: p2.x + norm * vect.x, y: p2.y + norm * vect.y };
};

/** based on http://www.kr.tuwien.ac.at/staff/eiter/et-archive/cdtr9464.pdf */
export const frechetDist = (curve1: Point[], curve2: Point[]) => {
  if (!curve1.length || !curve2.length) return Infinity;
  const longCurve = curve1.length >= curve2.length ? curve1 : curve2;
  const shortCurve = curve1.length >= curve2.length ? curve2 : curve1;

  const calcVal = (
    i: number,
    j: number,
    prevResultsCol: number[],
    curResultsCol: number[],
  ): number => {
    if (i === 0 && j === 0) {
      return distance(longCurve[0], shortCurve[0]);
    }

    if (i > 0 && j === 0) {
      return Math.max(prevResultsCol[0], distance(longCurve[i], shortCurve[0]));
    }

    const lastResult = curResultsCol[curResultsCol.length - 1];

    if (i === 0 && j > 0) {
      return Math.max(lastResult, distance(longCurve[0], shortCurve[j]));
    }

    return Math.max(
      Math.min(prevResultsCol[j], prevResultsCol[j - 1], lastResult),
      distance(longCurve[i], shortCurve[j]),
    );
  };

  let prevResultsCol: number[] = [];
  for (let i = 0; i < longCurve.length; i++) {
    const curResultsCol: number[] = [];
    for (let j = 0; j < shortCurve.length; j++) {
      // we only need the results from i - 1 and j - 1 to continue the calculation
      // so we only need to hold onto the last column of calculated results
      // prevResultsCol is results[i-1][:] in the original algorithm
      // curResultsCol is results[i][:j-1] in the original algorithm
      curResultsCol.push(calcVal(i, j, prevResultsCol, curResultsCol));
    }
    prevResultsCol = curResultsCol;
  }

  return prevResultsCol[shortCurve.length - 1];
};

/** break up long segments in the curve into smaller segments of len maxLen or smaller */
export const subdivideCurve = (curve: Point[], maxLen = 0.05) => {
  if (!Number.isFinite(maxLen) || maxLen <= 0) {
    throw new Error('maxLen must be a positive finite number');
  }
  const newCurve = curve.slice(0, 1);

  for (const point of curve.slice(1)) {
    const prevPoint = newCurve[newCurve.length - 1];
    const segLen = distance(point, prevPoint);
    if (!Number.isFinite(segLen)) {
      throw new Error('Curve segment length must be finite');
    }
    if (segLen > maxLen) {
      const numNewPoints = Math.ceil(segLen / maxLen);
      const newSegLen = segLen / numNewPoints;
      for (let i = 0; i < numNewPoints; i++) {
        newCurve.push(_extendPointOnLine(point, prevPoint, -1 * newSegLen * (i + 1)));
      }
    } else {
      newCurve.push(point);
    }
  }

  return newCurve;
};

/** redraw the curve using numPoints equally spaced out along the length of the curve */
export const outlineCurve = (curve: Point[], numPoints = 30) => {
  if (!Number.isInteger(numPoints) || numPoints < 2) {
    throw new Error('numPoints must be an integer of at least two');
  }
  if (!curve.length) return [];
  const curveLen = length(curve);
  if (!Number.isFinite(curveLen)) return [];
  if (curveLen === 0) return Array.from({ length: numPoints }, () => ({ ...curve[0] }));
  const segmentLen = curveLen / (numPoints - 1);
  const outlinePoints = [curve[0]];
  const endPoint = arrLast(curve);
  const remainingCurvePoints = curve.slice(1);

  for (let i = 0; i < numPoints - 2; i++) {
    let lastPoint: Point = arrLast(outlinePoints);
    let remainingDist = segmentLen;
    let outlinePointFound = false;
    while (!outlinePointFound) {
      // Floating-point rounding may exhaust the segments just before the endpoint.
      if (!remainingCurvePoints.length) {
        outlinePoints.push(endPoint);
        break;
      }
      const nextPointDist = distance(lastPoint, remainingCurvePoints[0]);
      if (nextPointDist < remainingDist) {
        remainingDist -= nextPointDist;
        lastPoint = remainingCurvePoints.shift()!;
      } else {
        const nextPoint = _extendPointOnLine(
          lastPoint,
          remainingCurvePoints[0],
          remainingDist - nextPointDist,
        );
        outlinePoints.push(nextPoint);
        outlinePointFound = true;
      }
    }
  }

  outlinePoints.push(endPoint);

  return outlinePoints;
};

/** translate and scale from https://en.wikipedia.org/wiki/Procrustes_analysis */
export const normalizeCurve = (curve: Point[]) => {
  if (
    !curve.length ||
    !curve.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  )
    return [];
  const outlinedCurve = outlineCurve(curve);
  if (!outlinedCurve.length) return [];
  const meanX = average(outlinedCurve.map((point) => point.x));
  const meanY = average(outlinedCurve.map((point) => point.y));
  const mean = { x: meanX, y: meanY };
  const translatedCurve = outlinedCurve.map((point) => subtract(point, mean));
  let scale = Math.sqrt(
    average([
      Math.pow(translatedCurve[0].x, 2) + Math.pow(translatedCurve[0].y, 2),
      Math.pow(arrLast(translatedCurve).x, 2) + Math.pow(arrLast(translatedCurve).y, 2),
    ]),
  );
  // Endpoints within 10% of the RMS radius are a poor measure of curve size:
  // tiny endpoint changes can otherwise produce enormous normalized coordinates.
  const spread = Math.sqrt(
    average(translatedCurve.map((point) => point.x ** 2 + point.y ** 2)),
  );
  if (scale < 0.1 * spread) scale = spread;
  if (!Number.isFinite(scale) || scale === 0) return [];
  const scaledCurve = translatedCurve.map((point) => ({
    x: point.x / scale,
    y: point.y / scale,
  }));
  // Keep the original 0.05 spacing for ordinary strokes. Reserve one point per
  // outlined vertex so ceil() rounding cannot take the result over 512 points.
  // This also bounds the quadratic cost of subsequent Frechet comparisons.
  const maxPoints = 512;
  const maxLen = Math.max(0.05, length(scaledCurve) / (maxPoints - scaledCurve.length));
  return subdivideCurve(scaledCurve, maxLen);
};

// rotate around the origin
export const rotate = (curve: Point[], theta: number) => {
  return curve.map((point) => ({
    x: Math.cos(theta) * point.x - Math.sin(theta) * point.y,
    y: Math.sin(theta) * point.x + Math.cos(theta) * point.y,
  }));
};

// remove intermediate points that are on the same line as the points to either side
export const _filterParallelPoints = (points: Point[]) => {
  const filteredPoints: Point[] = [];
  for (const point of points) {
    if (filteredPoints.length && equals(point, arrLast(filteredPoints))) continue;
    if (filteredPoints.length >= 2) {
      const curVect = subtract(point, arrLast(filteredPoints));
      const prevVect = subtract(
        arrLast(filteredPoints),
        filteredPoints[filteredPoints.length - 2],
      );
      const isParallel = curVect.y * prevVect.x - curVect.x * prevVect.y === 0;
      const isSameDirection = curVect.x * prevVect.x + curVect.y * prevVect.y > 0;
      if (isParallel && isSameDirection) filteredPoints.pop();
    }
    filteredPoints.push(point);
  }
  return filteredPoints;
};

export function getPathString(points: Point[], close = false) {
  const start = round(points[0]);
  const remainingPoints = points.slice(1);
  let pathString = `M ${start.x} ${start.y}`;
  remainingPoints.forEach((point) => {
    const roundedPoint = round(point);
    pathString += ` L ${roundedPoint.x} ${roundedPoint.y}`;
  });
  if (close) {
    pathString += 'Z';
  }
  return pathString;
}

/** take points on a path and move their start point backwards by distance */
export const extendStart = (points: Point[], dist: number) => {
  const filteredPoints = _filterParallelPoints(points);
  if (filteredPoints.length < 2) return filteredPoints;
  const p1 = filteredPoints[1];
  const p2 = filteredPoints[0];
  const newStart = _extendPointOnLine(p1, p2, dist);
  const extendedPoints = filteredPoints.slice(1);
  extendedPoints.unshift(newStart);
  return extendedPoints;
};
