import yieldWork from './yield-work.mjs';
/** Points indexed between yields, so the gap does not depend on how long a trail is. */
const INDEX_YIELD_POINTS = 16384;

/**
 * Terminal geometry thresholds, all in raster cells.
 *
 * Cells, not em units, because these probe the rasterized mask rather than the outline,
 * and preparation fixes the raster at a configurable pixels-per-em. They are deliberately
 * absolute: a half-cell probe step resolves nothing a whole cell does not, and a shaft
 * wider than MAX_SHAFT_RADIUS is a body rather than a terminal whatever the em.
 */
const PROBE_STEP = 0.25,
  MAX_SHAFT_RADIUS = 32,
  TERMINAL_LOOKAHEAD = 16;

const stop = (signal) => {
  if (signal?.aborted)
    throw new DOMException('Animation preparation canceled', 'AbortError');
};
// A bounded internal turn cap removes a constant-time vertex wedge. Public guides
// stay unchanged; the cap is used only to parameterize ink within the same owner.
//
// `contains` answers for one owner rather than for the glyph. Testing the glyph-wide ink
// mask let a neighbouring stroke's ink widen this stroke's radius, which validated a
// corner shortcut that does not lie inside it and distorted the progress it produced.
function turnField(points, contains, width) {
  if (!contains || points.length < 3) return points;
  const simple = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = simple.at(-1),
      b = points[i],
      c = points[i + 1],
      ux = b[0] - a[0],
      uy = b[1] - a[1],
      vx = c[0] - b[0],
      vy = c[1] - b[1];
    if (Math.abs(ux * vy - uy * vx) > 1e-7 || ux * vx + uy * vy <= 0) simple.push(b);
  }
  simple.push(points.at(-1));
  const inside = (p) => cellInside(contains, width, p[0], p[1]);
  const out = [simple[0]];
  for (let i = 1; i < simple.length - 1; i++) {
    const a = simple[i - 1],
      b = simple[i],
      c = simple[i + 1],
      la = Math.hypot(b[0] - a[0], b[1] - a[1]),
      lb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (!la || !lb) {
      out.push(b);
      continue;
    }
    const u = [(b[0] - a[0]) / la, (b[1] - a[1]) / la],
      v = [(c[0] - b[0]) / lb, (c[1] - b[1]) / lb],
      dot = u[0] * v[0] + u[1] * v[1];
    if (dot > 0.95 || dot < -0.95) {
      out.push(b);
      continue;
    }
    let radius = Math.min(la / 4, lb / 4, 32);
    for (const tangent of [u, v])
      for (const sign of [-1, 1]) {
        let r = 0.25;
        while (
          r <= radius &&
          inside([b[0] - tangent[1] * r * sign, b[1] + tangent[0] * r * sign])
        )
          r += 0.25;
        radius = Math.min(radius, Math.max(0, r - 0.25));
      }
    if (radius < 0.25) {
      out.push(b);
      continue;
    }
    const from = [b[0] - u[0] * radius, b[1] - u[1] * radius],
      to = [b[0] + v[0] * radius, b[1] + v[1] * radius],
      samples = [];
    let valid = true;
    for (let k = 0, n = Math.max(2, Math.ceil(radius * 8)); k <= n; k++) {
      const t = k / n,
        s = 1 - t,
        p = [
          s * s * from[0] + 2 * s * t * b[0] + t * t * to[0],
          s * s * from[1] + 2 * s * t * b[1] + t * t * to[1],
        ];
      if (!inside(p)) {
        valid = false;
        break;
      }
      samples.push(p);
    }
    out.push(...(valid ? samples : [b]));
  }
  out.push(simple.at(-1));
  return out;
}
/**
 * Whether a raster cell at these coordinates is owned.
 *
 * Both callers rounded the coordinates and bounded them the same way, and the two
 * copies had already drifted apart in how they took their arguments. The convention is
 * the load-bearing part: rounding, not flooring, and no upper bound on y because
 * `contains` is indexed by cell and a row past the end simply has none.
 */
const cellInside = (contains, width, rawX, rawY) => {
  const x = Math.round(rawX),
    y = Math.round(rawY);
  return x >= 0 && x < width && y >= 0 && contains(y * width + x);
};

/** Read a trail from either end without copying it. */
const fromEnd = (points, atEnd, i) => points[atEnd ? points.length - 1 - i : i];

export function fitTerminalShaft(points, atEnd, radius) {
  // Indexed by direction rather than reversed into a new array. Only a neighbourhood of
  // the terminal is ever read, and copying the whole trail to reach it allocated a
  // second copy of every point in a fifty-thousand-point stroke.
  const endpoint = fromEnd(points, atEnd, 0),
    samples = [];
  let arc = 0;
  for (let i = 1; i < points.length; i++) {
    const previous = fromEnd(points, atEnd, i - 1),
      current = fromEnd(points, atEnd, i);
    arc += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    if (arc >= radius && arc <= radius * 3) samples.push(current);
    if (arc > radius * 3) break;
  }
  if (samples.length < 3) return null;
  const center = [
    samples.reduce((s, p) => s + p[0], 0) / samples.length,
    samples.reduce((s, p) => s + p[1], 0) / samples.length,
  ];
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const p of samples) {
    const x = p[0] - center[0],
      y = p[1] - center[1];
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  // A scatter with no spread has no principal axis to find. atan2(0, 0) is 0 in
  // JavaScript rather than an error, so this handed back a horizontal tangent with no
  // geometric basis, and the residual test below could not reject it because every
  // residual is zero too.
  if (xx + yy <= 1e-12) return null;
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
    t = [Math.cos(angle), Math.sin(angle)];
  if ((endpoint[0] - center[0]) * t[0] + (endpoint[1] - center[1]) * t[1] < 0) {
    t[0] *= -1;
    t[1] *= -1;
  }
  if (
    samples.some(
      (p) =>
        Math.abs((p[0] - center[0]) * -t[1] + (p[1] - center[1]) * t[0]) >
        Math.max(1, radius * 0.1),
    )
  )
    return null;
  const along = (endpoint[0] - center[0]) * t[0] + (endpoint[1] - center[1]) * t[1];
  return {
    point: [center[0] + along * t[0], center[1] + along * t[1]],
    tangent: t,
    samples,
  };
}
// `contains` is the same single-owner test turnField takes, for the same reason: a
// neighbour's ink inflated the terminal radius measured here.
function terminalFits(points, contains, width) {
  if (!contains || points.length < 4) return [];
  const inside = (rawX, rawY) => cellInside(contains, width, rawX, rawY);
  return [false, true].map((end) => {
    const p = (i) => fromEnd(points, end, i);
    let n = 1,
      arc = 0;
    while (n < points.length - 1 && arc < TERMINAL_LOOKAHEAD) {
      arc += Math.hypot(p(n)[0] - p(n - 1)[0], p(n)[1] - p(n - 1)[1]);
      n++;
    }
    const c = p(Math.max(1, n - 1)),
      dx = c[0] - p(0)[0],
      dy = c[1] - p(0)[1],
      length = Math.hypot(dx, dy);
    if (!length) return null;
    let radius = MAX_SHAFT_RADIUS;
    for (const sign of [-1, 1]) {
      let r = PROBE_STEP;
      while (
        r < MAX_SHAFT_RADIUS &&
        inside(c[0] - (dy / length) * r * sign, c[1] + (dx / length) * r * sign)
      )
        r += PROBE_STEP;
      radius = Math.min(radius, r - PROBE_STEP);
    }
    return radius >= 1 ? { ...fitTerminalShaft(points, end, radius), radius } : null;
  });
}
// Arc-ordered BVH: linear construction, exact nearest-segment queries, stable arc ties.
function indexTrail(points) {
  const segments = [];
  let arc = 0;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i - 1],
      dx = points[i][0] - x,
      dy = points[i][1] - y,
      length = Math.hypot(dx, dy);
    if (length)
      segments.push({
        x,
        y,
        dx,
        dy,
        length,
        arc,
        minX: Math.min(x, x + dx),
        maxX: Math.max(x, x + dx),
        minY: Math.min(y, y + dy),
        maxY: Math.max(y, y + dy),
      });
    arc += length;
  }
  const build = (lo, hi) => {
    if (hi - lo <= 8) {
      const leaf = {
        lo,
        hi,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
      for (let i = lo; i < hi; i++) {
        const s = segments[i];
        leaf.minX = Math.min(leaf.minX, s.minX);
        leaf.minY = Math.min(leaf.minY, s.minY);
        leaf.maxX = Math.max(leaf.maxX, s.maxX);
        leaf.maxY = Math.max(leaf.maxY, s.maxY);
      }
      return leaf;
    }
    const mid = (lo + hi) >> 1,
      a = build(lo, mid),
      b = build(mid, hi);
    return {
      a,
      b,
      minX: Math.min(a.minX, b.minX),
      minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX),
      maxY: Math.max(a.maxY, b.maxY),
    };
  };
  return {
    segments,
    root: build(0, segments.length),
    total: arc,
    closed:
      points.length > 2 &&
      Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) <
        0.001,
  };
}
export async function projectCurveProgress(
  assignment,
  trails,
  kinds,
  startIndex,
  width,
  signal,
  ink,
) {
  // Check before the first trail, not after it. The checkpoint only fired on multiples
  // of 32, so an already-aborted request still paid for a full turn-field index and a
  // terminal fit on trail zero, which for a large trail is the expensive part.
  stop(signal);
  const indexes = [];
  let indexed = 0;
  // One containment test per trail, answering only for that trail's own cells.
  const containsFor = (i) => {
    if (!ink) return null;
    const owner = startIndex + i + 1;
    return (cell) =>
      cell >= 0 && cell < ink.length && !!ink[cell] && assignment.owners[cell] === owner;
  };
  for (let i = 0; i < trails.length; i++) {
    const contains = containsFor(i);
    const tree =
      kinds[i] === 'curve' ? indexTrail(turnField(trails[i], contains, width)) : null;
    if (tree && !tree.closed) tree.terminals = terminalFits(trails[i], contains, width);
    indexes.push(tree);
    // Read the signal every trail, and yield on points rather than on trails. An abort
    // check is a field read, while a yield allocates a promise and burns a macrotask,
    // so only the cheap one belongs per item. Counting trails made the gap between
    // yields depend on how long they are: thirty-two of thirty thousand points apiece
    // held the loop for about 180 ms, which a same-tick abort had to wait out, while
    // thirty-two short ones were not worth a yield at all.
    stop(signal);
    indexed += trails[i].length;
    if (indexed >= INDEX_YIELD_POINTS) {
      indexed = 0;
      await yieldWork();
      stop(signal);
    }
  }
  const values = new Float64Array(assignment.owners.length),
    mins = new Float64Array(trails.length),
    maxes = new Float64Array(trails.length);
  mins.fill(Infinity);
  maxes.fill(-Infinity);
  let work = 0;
  for (let cell = 0; cell < assignment.owners.length; cell++) {
    if (cell % 32768 === 0) {
      stop(signal);
      await yieldWork();
      stop(signal);
    }
    const owner = assignment.owners[cell] - startIndex - 1,
      tree = indexes[owner];
    if (!tree?.segments.length) continue;
    const x = cell % width,
      y = Math.floor(cell / width),
      distance = (n) =>
        Math.max(0, n.minX - x, x - n.maxX) ** 2 +
        Math.max(0, n.minY - y, y - n.maxY) ** 2;
    let best = Infinity,
      at = 0,
      chosen = -1,
      param = 0;
    const stack = [tree.root];
    while (stack.length) {
      if (++work % 32768 === 0) {
        stop(signal);
        await yieldWork();
        stop(signal);
      }
      const n = stack.pop();
      if (distance(n) > best) continue;
      if (n.a) {
        const da = distance(n.a),
          db = distance(n.b);
        stack.push(da < db ? n.b : n.a, da < db ? n.a : n.b);
      } else
        for (let i = n.lo; i < n.hi; i++) {
          const s = tree.segments[i],
            raw = ((x - s.x) * s.dx + (y - s.y) * s.dy) / (s.length * s.length),
            t = Math.max(0, Math.min(1, raw)),
            d = (x - s.x - t * s.dx) ** 2 + (y - s.y - t * s.dy) ** 2,
            a = s.arc + t * s.length;
          if (d < best || (d === best && a < at)) {
            best = d;
            at = a;
            chosen = i;
            param = raw;
          }
        }
    }
    // Continue longitudinal time through terminal ink beyond an authored endpoint.
    if (!tree.closed && chosen === 0 && param < 0) at = param * tree.segments[0].length;
    else if (!tree.closed && chosen === tree.segments.length - 1 && param > 1) {
      const s = tree.segments[chosen];
      at = s.arc + param * s.length;
    }
    if (!tree.closed)
      for (let end = 0; end < 2; end++) {
        const fit = tree.terminals?.[end];
        if (!fit?.point) continue;
        const along =
          (x - fit.point[0]) * fit.tangent[0] + (y - fit.point[1]) * fit.tangent[1];
        if (along > 0 && Math.abs(at - (end ? tree.total : 0)) < fit.radius * 2)
          at = end ? tree.total + along : -along;
      }
    values[cell] = at;
    mins[owner] = Math.min(mins[owner], at);
    maxes[owner] = Math.max(maxes[owner], at);
  }
  for (let cell = 0; cell < assignment.owners.length; cell++) {
    if (cell % 65536 === 0) {
      stop(signal);
      await yieldWork();
      stop(signal);
    }
    const owner = assignment.owners[cell] - startIndex - 1;
    // The same guard the projection pass uses. Testing only that the tree exists let a
    // curve with no segments, such as one whose points all coincide, reach this line
    // having projected nothing, and overwrite existing progress with the midpoint.
    if (!indexes[owner]?.segments.length) continue;
    assignment.progress[cell] =
      maxes[owner] > mins[owner]
        ? Math.round(
            ((values[cell] - mins[owner]) / (maxes[owner] - mins[owner])) * 65535,
          )
        : 32767;
  }
}
