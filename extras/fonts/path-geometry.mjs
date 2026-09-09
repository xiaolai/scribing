const arity = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  Z: 0
};
const fail = () => {
  throw new Error('Invalid FontShape outline geometry');
};

/** Largest coordinate magnitude a real font outline can carry. */
const COORD_LIMIT = 1e7;
/** Polyline samples emitted per curve segment when building a contour. */
const CURVE_SAMPLES = 16;
/**
 * Split a path into command groups, rejecting anything outside the supported subset.
 *
 * The scan is deliberately strict: every byte between two tokens must be whitespace or
 * a comma, so a stray character cannot be silently skipped and change the geometry.
 */
function tokenize(path) {
  if (!/^\s*[Mm]/.test(path) || /,\s*,|[MmLlHhVvCcSsQqTtZz]\s*,|,\s*[MmLlHhVvCcSsQqTtZz]|,\s*$/.test(path)) {
    fail();
  }
  const token = /[MmLlHhVvCcSsQqTtZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
  const groups = [];
  let match;
  let end = 0;
  while (match = token.exec(path)) {
    if (!/^[\s,]*$/.test(path.slice(end, match.index))) fail();
    if (/^[A-Za-z]$/.test(match[0])) {
      groups.push({
        command: match[0],
        values: []
      });
    } else {
      const n = Number(match[0]);
      if (!groups.length || !Number.isFinite(n) || Math.abs(n) > COORD_LIMIT) fail();
      groups[groups.length - 1].values.push(n);
    }
    end = token.lastIndex;
  }
  if (!/^\s*$/.test(path.slice(end))) fail();
  return groups;
}

/** De Casteljau evaluation of a Bezier of any degree at parameter `t`. */
function evaluateBezier(points, t) {
  let current = points.map(v => v.slice());
  while (current.length > 1) {
    current = current.slice(0, -1).map((v, i) => [v[0] * (1 - t) + current[i + 1][0] * t, v[1] * (1 - t) + current[i + 1][1] * t]);
  }
  return current[0];
}

/**
 * Parameters where one axis of a Bezier reaches an extremum, i.e. the roots of its
 * derivative. Endpoints are handled by the caller; only interior roots matter here.
 *
 * A cubic whose leading coefficient vanishes has a linear derivative, so that case is
 * solved directly rather than through the quadratic formula, which would divide by zero.
 */
function extremumParameters(axisValues) {
  if (axisValues.length === 3) {
    const [v0, v1, v2] = axisValues;
    const denominator = v0 - 2 * v1 + v2;
    return denominator ? [(v0 - v1) / denominator] : [];
  }
  if (axisValues.length === 4) {
    const [v0, v1, v2, v3] = axisValues;
    const a = -v0 + 3 * v1 - 3 * v2 + v3;
    const b = 2 * (v0 - 2 * v1 + v2);
    const c = v1 - v0;
    if (Math.abs(a) < 1e-12) return b ? [-c / b] : [];
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return [];
    const root = Math.sqrt(discriminant);
    return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
  }
  return [];
}

/**
 * Running bounds, signed area and contour list for one outline.
 *
 * Kept separate from the command walk so that the walk holds only pen state, and so
 * that the geometry accumulation can be reasoned about on its own.
 */
function createBoundsAccumulator() {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    area = 0,
    contour = [];
  const contours = [];
  let contourX = Infinity,
    contourY = Infinity,
    contourR = -Infinity,
    contourT = -Infinity;
  const include = v => {
    contourX = Math.min(contourX, v[0]);
    contourY = Math.min(contourY, v[1]);
    contourR = Math.max(contourR, v[0]);
    contourT = Math.max(contourT, v[1]);
    minX = Math.min(minX, v[0]);
    minY = Math.min(minY, v[1]);
    maxX = Math.max(maxX, v[0]);
    maxY = Math.max(maxY, v[1]);
  };
  return {
    startContourAt(point) {
      contour.push(point);
    },
    /** Widen the bounds over a segment and append its polyline samples. */
    traceSegment(points) {
      include(points[0]);
      include(points[points.length - 1]);
      // Endpoints alone understate a curve: sample its true extrema as well.
      for (let axis = 0; axis < 2; axis += 1) {
        extremumParameters(points.map(q => q[axis])).filter(t => t > 0 && t < 1).forEach(t => include(evaluateBezier(points, t)));
      }
      if (!contour.length) contour.push(points[0]);
      const samples = points.length === 2 ? 1 : CURVE_SAMPLES;
      for (let i = 1; i <= samples; i += 1) {
        contour.push(evaluateBezier(points, i / samples));
      }
    },
    closeContour() {
      let sum = 0;
      for (let i = 0; i < contour.length; i += 1) {
        const a = contour[i],
          b = contour[(i + 1) % contour.length];
        sum += a[0] * b[1] - b[0] * a[1];
      }
      area += Math.abs(sum) / 2;
      // Degenerate rings have no interior and would only add noise to probe selection.
      if (Number.isFinite(contourX) && contourR > contourX && contourT > contourY) {
        contours.push({
          minX: contourX,
          minY: contourY,
          maxX: contourR,
          maxY: contourT,
          area: Math.abs(sum) / 2,
          points: contour.slice()
        });
      }
      contourX = Infinity;
      contourY = Infinity;
      contourR = -Infinity;
      contourT = -Infinity;
      contour = [];
    },
    finish() {
      if (![minX, minY, maxX, maxY, area].every(Number.isFinite)) fail();
      return {
        minX,
        minY,
        maxX,
        maxY,
        area,
        contours
      };
    }
  };
}

/** Font-outline SVG subset (lines and quadratic/cubic curves), with true curve extrema. */
export default function pathGeometry(path) {
  if (!path) return undefined;
  const groups = tokenize(path);
  const bounds = createBoundsAccumulator();
  let cursor = [0, 0],
    subpathStart = [0, 0],
    lastControl = [0, 0],
    previous = '';

  /** Extend the bounds and the current contour along one segment. */
  const curve = points => {
    bounds.traceSegment(points);
    cursor = points[points.length - 1];
  };
  const close = () => bounds.closeContour();

  /** Reflection of the previous control point, for the smooth S and T commands. */
  const reflected = kinds => kinds.indexOf(previous) >= 0 ? [2 * cursor[0] - lastControl[0], 2 * cursor[1] - lastControl[1]] : cursor;
  const step = (type, values, i, relative) => {
    const point = offset => [values[i + offset] + (relative ? cursor[0] : 0), values[i + offset + 1] + (relative ? cursor[1] : 0)];
    // H moves along x, V along y; a relative value offsets from that same axis.
    const axisOrigin = type === 'H' ? cursor[0] : cursor[1];
    const scalar = values[i] + (relative ? axisOrigin : 0);
    switch (type) {
      case 'M':
        close();
        cursor = point(0);
        subpathStart = cursor;
        bounds.startContourAt(cursor);
        break;
      case 'L':
        curve([cursor, point(0)]);
        break;
      case 'H':
        curve([cursor, [scalar, cursor[1]]]);
        break;
      case 'V':
        curve([cursor, [cursor[0], scalar]]);
        break;
      case 'Q':
        {
          const control = point(0);
          curve([cursor, control, point(2)]);
          lastControl = control;
          break;
        }
      case 'T':
        {
          const control = reflected(['Q', 'T']);
          curve([cursor, control, point(0)]);
          lastControl = control;
          break;
        }
      case 'C':
        {
          const control = point(2);
          curve([cursor, point(0), control, point(4)]);
          lastControl = control;
          break;
        }
      case 'S':
        {
          const second = point(0);
          curve([cursor, reflected(['C', 'S']), second, point(2)]);
          lastControl = second;
          break;
        }
      default:
        fail();
    }
  };
  for (const {
    command,
    values
  } of groups) {
    const upper = command.toUpperCase(),
      relative = command !== upper,
      count = arity[upper];
    if (count === undefined || (count === 0 ? values.length !== 0 : !values.length || values.length % count !== 0)) {
      fail();
    }
    if (upper === 'Z') {
      curve([cursor, subpathStart]);
      close();
      cursor = subpathStart;
      previous = 'Z';
      continue;
    }
    for (let i = 0; i < values.length; i += count) {
      // Repeated coordinate pairs after a moveto are implicit linetos, per SVG.
      const type = upper === 'M' && i > 0 ? 'L' : upper;
      step(type, values, i, relative);
      previous = type;
    }
  }
  close();
  return bounds.finish();
}

/** Interior candidates for sparse/thin contours, checked against the exact nonzero path by callers. */
export function contourProbes(box, step, accept) {
  const w = box.maxX - box.minX,
    h = box.maxY - box.minY;
  if (w >= step * 2 && h >= step * 2 && box.area >= w * h * 0.12) return [];
  const out = [];
  const rows = Math.min(16384, Math.max(1, Math.ceil(h / step)));
  for (let row = 0; row < rows; row++) {
    const y = box.minY + h * (row + 0.5) / rows,
      xs = [];
    for (let i = 0; i < box.points.length; i++) {
      const a = box.points[i],
        b = box.points[(i + 1) % box.points.length];
      if (a[1] <= y && b[1] > y || b[1] <= y && a[1] > y) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      const x = (xs[i - 1] + xs[i]) / 2;
      if (accept(x, y)) out.push([x, y]);
    }
  }
  if (!out.length) for (const fy of [0.5, 0.25, 0.75, 0.1, 0.9]) for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
    const x = box.minX + w * fx,
      y = box.minY + h * fy;
    if (accept(x, y)) {
      out.push([x, y]);
      return out;
    }
  }
  return out;
}
