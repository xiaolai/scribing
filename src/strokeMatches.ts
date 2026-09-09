import { average, maxOf } from './utils';
import {
  cosineSimilarity,
  equals,
  frechetDist,
  distance,
  subtract,
  normalizeCurve,
  rotate,
  length,
} from './geometry';
import { Point } from './typings/types';
import UserStroke from './models/UserStroke';
import Stroke from './models/Stroke';
import Character from './models/Character';

const COSINE_SIMILARITY_THRESHOLD = 0; // -1 to 1, smaller = more lenient
const START_AND_END_DIST_THRESHOLD = 250; // bigger = more lenient
const FRECHET_THRESHOLD = 0.4; // bigger = more lenient
const MIN_LEN_THRESHOLD = 0.35; // smaller = more lenient

export interface StrokeMatchResultMeta {
  isStrokeBackwards: boolean;
}

export interface StrokeMatchResult {
  isMatch: boolean;
  meta: StrokeMatchResultMeta;
}

export default function strokeMatches(
  userStroke: UserStroke,
  character: Character,
  strokeNum: number,
  options: {
    leniency?: number;
    isOutlineVisible?: boolean;
    averageDistanceThreshold?: number;
  } = {},
): StrokeMatchResult {
  const strokes = character.strokes;
  const points = stripDuplicates(userStroke.points);

  if (points.length < 2) {
    return { isMatch: false, meta: { isStrokeBackwards: false } };
  }

  const { isMatch, meta, avgDist } = getMatchData(points, strokes[strokeNum], options);

  if (!isMatch) {
    // A backwards match used to return here, skipping disambiguation entirely, so with
    // acceptBackwardsStrokes on, a later stroke drawn backwards was taken as the
    // current one. The reversed gesture gets the same later-stroke check.
    if (
      meta.isStrokeBackwards &&
      drewALaterStrokeBackwards(points, strokes, strokeNum, options)
    ) {
      return { isMatch: false, meta: { isStrokeBackwards: false } };
    }
    return { isMatch, meta };
  }

  // if there is a better match among strokes the user hasn't drawn yet, the user probably drew the wrong stroke
  const closestMatchDist = closestLaterMatch(
    points,
    strokes,
    strokeNum,
    options,
    avgDist,
  );

  // if there's a better match, rather that returning false automatically, try reducing leniency instead
  // if leniency is already really high we can allow some similar strokes to pass
  if (closestMatchDist < avgDist) {
    // adjust leniency between 0.3 and 0.6 depending on how much of a better match the new match is
    const leniencyAdjustment = (0.6 * (closestMatchDist + avgDist)) / (2 * avgDist);
    const stricter = getMatchData(points, strokes[strokeNum], {
      ...options,
      leniency: (options.leniency || 1) * leniencyAdjustment,
    });
    return { isMatch: stricter.isMatch, meta: stricter.meta };
  }

  return { isMatch, meta };
}

type MatchOptions = {
  leniency?: number;
  isOutlineVisible?: boolean;
  averageDistanceThreshold?: number;
};

/** The smallest average distance among later strokes that also match, else `best`. */
const closestLaterMatch = (
  points: Point[],
  strokes: Stroke[],
  strokeNum: number,
  options: MatchOptions,
  best: number,
) => {
  let closest = best;
  for (let i = strokeNum + 1; i < strokes.length; i++) {
    const later = getMatchData(points, strokes[i], { ...options, checkBackwards: false });
    if (later.isMatch && later.avgDist < closest) {
      closest = later.avgDist;
    }
  }
  return closest;
};

/** True when the reversed gesture fits a later stroke better than the current one. */
const drewALaterStrokeBackwards = (
  points: Point[],
  strokes: Stroke[],
  strokeNum: number,
  options: MatchOptions,
) => {
  const reversed = [...points].reverse();
  const own = getMatchData(reversed, strokes[strokeNum], {
    ...options,
    checkBackwards: false,
  });
  return (
    closestLaterMatch(reversed, strokes, strokeNum, options, own.avgDist) < own.avgDist
  );
};

const startAndEndMatches = (points: Point[], closestStroke: Stroke, leniency: number) => {
  const startingDist = distance(closestStroke.getStartingPoint(), points[0]);
  const endingDist = distance(closestStroke.getEndingPoint(), points[points.length - 1]);
  return (
    startingDist <= START_AND_END_DIST_THRESHOLD * leniency &&
    endingDist <= START_AND_END_DIST_THRESHOLD * leniency
  );
};

// returns a list of the direction of all segments in the line connecting the points
const getEdgeVectors = (points: Point[]) => {
  const vectors: Point[] = [];
  let lastPoint = points[0];
  points.slice(1).forEach((point) => {
    vectors.push(subtract(point, lastPoint));
    lastPoint = point;
  });
  return vectors;
};

const directionMatches = (points: Point[], stroke: Stroke) => {
  const edgeVectors = getEdgeVectors(points);
  const strokeVectors = stroke.getVectors();
  const similarities = edgeVectors.map((edgeVector) => {
    const strokeSimilarities = strokeVectors.map((strokeVector) =>
      cosineSimilarity(strokeVector, edgeVector),
    );
    return maxOf(strokeSimilarities);
  });
  const avgSimilarity = average(similarities);
  return avgSimilarity > COSINE_SIMILARITY_THRESHOLD;
};

const lengthMatches = (points: Point[], stroke: Stroke, leniency: number) => {
  return (
    (leniency * (length(points) + 25)) / (stroke.getLength() + 25) >= MIN_LEN_THRESHOLD
  );
};

const stripDuplicates = (points: Point[]) => {
  if (points.length < 2) return points;
  const [firstPoint, ...rest] = points;
  const dedupedPoints = [firstPoint];

  for (const point of rest) {
    if (!equals(point, dedupedPoints[dedupedPoints.length - 1])) {
      dedupedPoints.push(point);
    }
  }

  return dedupedPoints;
};

const SHAPE_FIT_ROTATIONS = [
  Math.PI / 16,
  Math.PI / 32,
  0,
  (-1 * Math.PI) / 32,
  (-1 * Math.PI) / 16,
];

/**
 * `normalizeCurve` is pure and is asked for the same curves over and over: the gesture is
 * re-fitted against every later stroke, and each reference stroke's points never change.
 * Keying on the array identity keeps that to one computation per curve, and the entries
 * are released with the arrays.
 */
const normalizedCurves = new WeakMap<Point[], Point[]>();

const normalizeCurveOnce = (curve: Point[]) => {
  const cached = normalizedCurves.get(curve);
  if (cached) return cached;
  const normalized = normalizeCurve(curve);
  normalizedCurves.set(curve, normalized);
  return normalized;
};

const shapeFit = (curve1: Point[], curve2: Point[], leniency: number) => {
  const threshold = FRECHET_THRESHOLD * leniency;
  const normCurve1 = normalizeCurveOnce(curve1);
  const normCurve2 = normalizeCurveOnce(curve2);
  // The result only asks whether some rotation is within the threshold, so there is
  // nothing to learn from the remaining Frechet comparisons once one is.
  for (const theta of SHAPE_FIT_ROTATIONS) {
    if (frechetDist(normCurve1, rotate(normCurve2, theta)) <= threshold) return true;
  }
  return false;
};

const getMatchData = (
  points: Point[],
  stroke: Stroke,
  options: {
    leniency?: number;
    isOutlineVisible?: boolean;
    checkBackwards?: boolean;
    averageDistanceThreshold?: number;
  },
): StrokeMatchResult & { avgDist: number } => {
  const {
    leniency = 1,
    isOutlineVisible = false,
    checkBackwards = true,
    averageDistanceThreshold = 350,
  } = options;
  const avgDist = stroke.getAverageDistance(points);
  const distMod = isOutlineVisible || stroke.strokeNum > 0 ? 0.5 : 1;
  const withinDistThresh = avgDist <= averageDistanceThreshold * distMod * leniency;
  // short circuit for faster matching
  if (!withinDistThresh) {
    return { isMatch: false, avgDist, meta: { isStrokeBackwards: false } };
  }
  const startAndEndMatch = startAndEndMatches(points, stroke, leniency);
  const directionMatch = directionMatches(points, stroke);
  const shapeMatch = shapeFit(points, stroke.points, leniency);
  const lengthMatch = lengthMatches(points, stroke, leniency);

  // withinDistThresh is not retested: its false branch returned above.
  const isMatch = startAndEndMatch && directionMatch && shapeMatch && lengthMatch;

  if (checkBackwards && !isMatch) {
    const backwardsMatchData = getMatchData([...points].reverse(), stroke, {
      ...options,
      checkBackwards: false,
    });

    if (backwardsMatchData.isMatch) {
      return {
        isMatch,
        avgDist,
        meta: { isStrokeBackwards: true },
      };
    }
  }

  return { isMatch, avgDist, meta: { isStrokeBackwards: false } };
};
