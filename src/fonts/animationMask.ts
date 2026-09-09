import yieldWork from './yieldWork';
import { FontAnimation } from './types';
type FontAnimationTile = FontAnimation['tiles'][number];
export type MaskField = {
  corners: Float32Array;
  first: number;
  last: number;
  full: string;
  completed: string;
  stroke: number;
  key: string;
  path: string;
};
// Recover a local affine scalar field using only cells owned by the same path.
// Sharing corner estimates removes seams between neighboring cell polygons.
/**
 * Least-squares gradient of the progress field at every owned cell, using only
 * neighbours belonging to the same stroke. Sharing these estimates is what removes
 * seams between neighbouring cell polygons.
 */
async function progressGradients(tile: FontAnimationTile, checkpoint: () => void) {
  const { width, height, owners, progress } = tile;
  const gx = new Float32Array(owners.length),
    gy = new Float32Array(owners.length);

  for (let i = 0; i < owners.length; i++) {
    if (i % 32768 === 0) {
      checkpoint();
      await yieldWork();
    }
    if (!owners[i]) continue;
    const x = i % width,
      y = Math.floor(i / width);
    let xx = 0,
      xy = 0,
      yy = 0,
      xp = 0,
      yp = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dy) ||
          x + dx < 0 ||
          x + dx >= width ||
          y + dy < 0 ||
          y + dy >= height
        )
          continue;
        const j = i + dy * width + dx;
        if (owners[j] !== owners[i] || Math.abs(progress[j] - progress[i]) > 16384)
          continue;
        const p = progress[j] - progress[i];
        xx += dx * dx;
        xy += dx * dy;
        yy += dy * dy;
        xp += dx * p;
        yp += dy * p;
      }
    }
    const det = xx * yy - xy * xy;
    if (det) {
      gx[i] = (xp * yy - yp * xy) / det;
      gy[i] = (yp * xx - xp * xy) / det;
    } else {
      gx[i] = xx ? xp / xx : 0;
      gy[i] = yy ? yp / yy : 0;
    }
  }
  return { gx, gy };
}

/** Corner offsets of a cell, in the order the marching-squares code expects. */
const CORNER_OFFSETS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

/** Reconstruct a progress value at each cell corner from the gradient field. */
async function cornerProgress(
  tile: FontAnimationTile,
  gradients: { gx: Float32Array; gy: Float32Array },
  checkpoint: () => void,
) {
  const { width, height, owners, progress } = tile;
  const { gx, gy } = gradients;
  const corners = new Float32Array(owners.length * 4);

  for (let i = 0; i < owners.length; i++) {
    if (i % 32768 === 0) {
      checkpoint();
      await yieldWork();
    }
    if (!owners[i]) continue;
    const x = i % width,
      y = Math.floor(i / width);
    CORNER_OFFSETS.forEach(([cx, cy], corner) => {
      const vx = x + cx,
        vy = y + cy;
      let total = 0,
        count = 0;
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -1; dx <= 0; dx++) {
          const px = vx + dx,
            py = vy + dy;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          const j = py * width + px;
          if (owners[j] !== owners[i] || Math.abs(progress[j] - progress[i]) > 16384)
            continue;
          total += progress[j] + gx[j] * (vx - px - 0.5) + gy[j] * (vy - py - 0.5);
          count++;
        }
      }
      corners[i * 4 + corner] = count ? total / count : progress[i];
    });
  }
  return corners;
}

/**
 * Rescale each stroke's corner values to the full 0..65535 range.
 *
 * Including the reconstructed boundary in the clock range is what stops a cap appearing
 * only because playback switched to the fully completed state.
 */
async function normalizeCorners(
  tile: FontAnimationTile,
  corners: Float32Array,
  checkpoint: () => void,
) {
  const { owners } = tile;
  // Size the scratch to the owners actually present. `owners` is a Uint16Array, but
  // validateAnimation caps strokes at 8,192 and rejects any larger owner, so a fixed
  // 65,536-entry pair allocated 1 MB per tile to address at most 8,193 slots.
  let maxOwner = 0;
  for (let i = 0; i < owners.length; i++) if (owners[i] > maxOwner) maxOwner = owners[i];
  const minima = new Float64Array(maxOwner + 1),
    maxima = new Float64Array(maxOwner + 1);
  minima.fill(Infinity);
  maxima.fill(-Infinity);

  for (let i = 0; i < owners.length; i++) {
    if (!owners[i]) continue;
    for (let c = 0; c < 4; c++) {
      minima[owners[i]] = Math.min(minima[owners[i]], corners[i * 4 + c]);
      maxima[owners[i]] = Math.max(maxima[owners[i]], corners[i * 4 + c]);
    }
  }
  for (let i = 0; i < owners.length; i++) {
    if (i % 65536 === 0) {
      checkpoint();
      await yieldWork();
    }
    if (!owners[i]) continue;
    const min = minima[owners[i]],
      max = maxima[owners[i]];
    for (let c = 0; c < 4; c++) {
      corners[i * 4 + c] =
        max > min ? ((corners[i * 4 + c] - min) / (max - min)) * 65535 : 32767;
    }
  }
}

/** Row-run outline of every owned cell, plus the stroke range the tile covers. */
function completedOutline(tile: FontAnimationTile) {
  const { width, height, owners } = tile;
  let first = Infinity,
    last = -1;
  const runs: string[] = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const owner = x < width ? owners[y * width + x] : 0;
      if (owner) {
        first = Math.min(first, owner - 1);
        last = Math.max(last, owner - 1);
        if (start < 0) start = x;
      } else if (start >= 0) {
        runs.push(rect(start, y, x - start));
        start = -1;
      }
    }
  }
  return { first, last, full: outline(runs) };
}

/**
 * Precompute the per-tile scalar field playback interpolates through.
 *
 * `checkpoint` throws if the request has been superseded, and the work yields between
 * stages so a large guide cannot block input.
 */
export async function prepareMaskField(
  tile: FontAnimationTile,
  checkpoint: () => void,
): Promise<MaskField> {
  const gradients = await progressGradients(tile, checkpoint);
  const corners = await cornerProgress(tile, gradients, checkpoint);
  await normalizeCorners(tile, corners, checkpoint);
  const { first, last, full } = completedOutline(tile);
  checkpoint();

  return {
    corners,
    first,
    last,
    full,
    completed: '',
    stroke: -1,
    key: '',
    path: '',
  };
}

const rect = (x: number, y: number, w: number) => `M${x} ${y}h${w}v1h-${w}Z`;
const number = (n: number) => String(Math.round(n * 100000) / 100000);
type Vertex = [number, number, number];
function clippedTriangle(vertices: Vertex[], threshold: number): string {
  const out: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length],
      inside = a[2] <= threshold;
    if (inside) out.push(a);
    if (inside !== b[2] <= threshold) {
      const t = (threshold - a[2]) / (b[2] - a[2]);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), threshold]);
    }
  }
  return out.length < 3
    ? ''
    : `M${out.map((p) => `${number(p[0])} ${number(p[1])}`).join('L')}Z`;
}
// Cancel shared primitive edges before native filling. A single compound fill
// can still show SVG rasterizer seams at collinear T-junctions; its outer boundary cannot.
type XY = [number, number];
type Edge = { a: XY; b: XY; used?: boolean };

const edgeKey = (p: XY) => `${p[0]},${p[1]}`;

/** Coordinates are scaled to integers so shared edges compare exactly. */
const EDGE_SCALE = 100000;

/**
 * Accumulate the directed edges of a set of primitives, cancelling shared ones.
 *
 * Axis-aligned edges are tallied per line as winding events, so any number of abutting
 * runs collapse to the outer span. Diagonal edges cancel against their exact reverse.
 */
function collectEdges(parts: string[]) {
  const axis = new Map<string, Map<number, number>>(),
    diagonals = new Map<string, Edge>();

  const add = (a: XY, b: XY) => {
    if (a[0] === b[0] && a[1] === b[1]) return;
    if (a[0] === b[0] || a[1] === b[1]) {
      const vertical = a[0] === b[0],
        name = `${vertical ? 'v' : 'h'}:${vertical ? a[0] : a[1]}`;
      let events = axis.get(name);
      if (!events) {
        events = new Map();
        axis.set(name, events);
      }
      const startAt = vertical ? a[1] : a[0],
        endAt = vertical ? b[1] : b[0],
        sign = startAt < endAt ? 1 : -1,
        lo = Math.min(startAt, endAt),
        hi = Math.max(startAt, endAt);
      events.set(lo, (events.get(lo) || 0) + sign);
      events.set(hi, (events.get(hi) || 0) - sign);
    } else {
      const forward = `${edgeKey(a)}:${edgeKey(b)}`,
        reverse = `${edgeKey(b)}:${edgeKey(a)}`;
      if (diagonals.has(reverse)) diagonals.delete(reverse);
      else diagonals.set(forward, { a, b });
    }
  };

  for (const part of parts) {
    for (const path of part.split('M')) {
      if (!path) continue;
      const values = (path.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      let points: XY[];
      if (path.includes('h')) {
        const [x, y, w] = values;
        points = [
          [x, y],
          [x + w, y],
          [x + w, y + 1],
          [x, y + 1],
        ];
      } else {
        points = [];
        for (let i = 0; i < values.length; i += 2)
          points.push([values[i], values[i + 1]]);
      }
      points = points.map(([x, y]) => [
        Math.round(x * EDGE_SCALE),
        Math.round(y * EDGE_SCALE),
      ]);
      for (let i = 0; i < points.length; i++)
        add(points[i], points[(i + 1) % points.length]);
    }
  }

  const edges = Array.from(diagonals.values());
  for (const [name, events] of Array.from(axis)) {
    const vertical = name[0] === 'v',
      fixed = Number(name.slice(2)),
      positions = Array.from(events.keys()).sort((lhs, rhs) => lhs - rhs);
    let winding = 0;
    for (let i = 0; i < positions.length - 1; i++) {
      winding += events.get(positions[i])!;
      if (!winding) continue;
      const lo = positions[i],
        hi = positions[i + 1],
        a: XY = vertical ? [fixed, lo] : [lo, fixed],
        b: XY = vertical ? [fixed, hi] : [hi, fixed];
      edges.push(winding > 0 ? { a, b } : { a: b, b: a });
    }
  }
  return edges;
}

/**
 * Walk the edge set into closed rings, always taking the sharpest left turn so that
 * nested rings come out with opposite winding and fill as holes.
 */
function traceRings(edges: Edge[]): XY[][] {
  const from = new Map<string, Edge[]>();
  for (const edge of edges) {
    const k = edgeKey(edge.a);
    if (!from.has(k)) from.set(k, []);
    from.get(k)!.push(edge);
  }

  const rings: XY[][] = [];
  for (const first of edges) {
    if (first.used) continue;
    const points = [first.a];
    let edge = first;
    // Bounded by the edge count: a ring cannot revisit an edge, and `used` enforces it.
    for (let guard = 0; guard <= edges.length; guard++) {
      edge.used = true;
      points.push(edge.b);
      if (edgeKey(edge.b) === edgeKey(first.a)) break;
      const next = (from.get(edgeKey(edge.b)) || []).filter((e) => !e.used);
      if (!next.length) break;
      const dx = edge.b[0] - edge.a[0],
        dy = edge.b[1] - edge.a[1];
      const turn = (e: Edge) =>
        Math.atan2(
          dx * (e.b[1] - e.a[1]) - dy * (e.b[0] - e.a[0]),
          dx * (e.b[0] - e.a[0]) + dy * (e.b[1] - e.a[1]),
        );
      next.sort((lhs, rhs) => turn(rhs) - turn(lhs));
      edge = next[0];
    }
    if (points.length > 3) rings.push(points);
  }
  return rings;
}

/** Drop interior points that lie on the straight line between their neighbours. */
function compactRing(points: XY[]): XY[] {
  const compact: XY[] = [];
  for (const p of points) {
    while (compact.length > 1) {
      const a = compact[compact.length - 2],
        b = compact[compact.length - 1];
      if ((b[0] - a[0]) * (p[1] - b[1]) !== (b[1] - a[1]) * (p[0] - b[0])) break;
      compact.pop();
    }
    compact.push(p);
  }
  return compact;
}

/**
 * Cancel shared primitive edges before native filling.
 *
 * A single compound fill can still show SVG rasterizer seams at collinear T-junctions;
 * its outer boundary cannot, which is why the shared edges are removed rather than
 * relying on the fill rule.
 */
function outline(parts: string[]): string {
  return traceRings(collectEdges(parts))
    .map(
      (points) =>
        `M${compactRing(points)
          .map(([x, y]) => `${number(x / EDGE_SCALE)} ${number(y / EDGE_SCALE)}`)
          .join('L')}Z`,
    )
    .join('');
}

/** Row-run primitives covering every stroke that finished before `stroke`. */
function completedBefore(tile: FontAnimationTile, stroke: number): string[] {
  const { owners, width, height } = tile;
  const runs: string[] = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const owner = x < width ? owners[y * width + x] : 0,
        fill = owner && owner - 1 < stroke;
      if (fill && start < 0) start = x;
      if (!fill && start >= 0) {
        runs.push(rect(start, y, x - start));
        start = -1;
      }
    }
  }
  return runs;
}

/**
 * Primitives for the stroke currently being drawn, at a given threshold.
 *
 * Fully-reached cells become row runs; cells the front is crossing are clipped into
 * two triangles, which is what gives the reveal a straight analytic edge rather than a
 * staircase along cell boundaries.
 */
function activeStrokeAt(
  tile: FontAnimationTile,
  field: MaskField,
  stroke: number,
  progress: number,
  threshold: number,
): string[] {
  const { owners, width, height } = tile;
  const runs: string[] = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const i = y * width + x,
        owned = x < width && owners[i] === stroke + 1,
        at = i * 4;
      const values = owned
        ? [
            field.corners[at],
            field.corners[at + 1],
            field.corners[at + 2],
            field.corners[at + 3],
          ]
        : [];
      const full =
        owned && (progress >= 1 || (progress > 0 && values.every((v) => v <= threshold)));
      if (full && start < 0) start = x;
      if (!full && start >= 0) {
        runs.push(rect(start, y, x - start));
        start = -1;
      }
      if (owned && !full && progress > 0 && values.some((v) => v <= threshold)) {
        const a: Vertex = [x, y, values[0]],
          b: Vertex = [x + 1, y, values[1]],
          c: Vertex = [x + 1, y + 1, values[2]],
          d: Vertex = [x, y + 1, values[3]];
        runs.push(
          clippedTriangle([a, b, c], threshold),
          clippedTriangle([a, c, d], threshold),
        );
      }
    }
  }
  return runs;
}

/**
 * SVG path revealing `stroke` at `fraction` of its progress, plus everything before it.
 *
 * Results are memoized on the quantized step, so replaying the same frame, or two
 * frames that land on the same reveal step, costs nothing.
 */
export function maskPath(
  tile: FontAnimationTile,
  field: MaskField,
  stroke: number,
  fraction: number,
): string {
  if (stroke < field.first) return '';
  if (stroke > field.last || (stroke === field.last && fraction >= 1)) return field.full;

  // Memoized on the exact progress. Quantizing the key to a fixed number of reveal
  // steps was tried as a way to make consecutive frames share a cache entry; at 960 px
  // and device pixel ratio 3 the analytic tolerance is about 2.3e-4, and rounding to
  // 512 steps introduces up to 9.8e-4 of error, which the contour gate detects as
  // thousands of pixels on the wrong side of the front. The exact key still pays for
  // itself whenever render() runs twice for one animation state, as cancel() and
  // resize both do.
  const progress = Math.min(1, Math.max(0, fraction));
  const threshold = progress * 65535;
  const key = `${stroke}:${threshold}`;
  if (field.key === key) return field.path;

  // The completed prefix only changes when the stroke index does.
  if (field.stroke !== stroke) {
    field.completed = outline(completedBefore(tile, stroke));
    field.stroke = stroke;
  }

  field.key = key;
  field.path = outline([
    field.completed,
    ...activeStrokeAt(tile, field, stroke, progress, threshold),
  ]);
  return field.path;
}
