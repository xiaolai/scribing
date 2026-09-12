import yieldWork from './yieldWork';
import { FontAnimation } from './types';
type FontAnimationTile = FontAnimation['tiles'][number];
export type MaskField = {
  corners: Float32Array;
  first: number;
  last: number;
  /**
   * Cell bounding box of each stroke, four entries per stroke from `first`, as
   * minX, minY, maxX, maxY. A stroke with no cells has minX greater than maxX.
   */
  strokeBounds: Int32Array;
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
async function progressGradients(
  tile: FontAnimationTile,
  cutoffs: Float64Array,
  checkpoint: () => void,
) {
  const { owners } = tile;
  const gx = new Float32Array(owners.length),
    gy = new Float32Array(owners.length);

  for (let i = 0; i < owners.length; i++) {
    if (i % 32768 === 0) {
      await yieldWork();
      checkpoint();
    }
    if (!owners[i]) continue;
    const { xx, xy, yy, xp, yp } = neighbourMoments(tile, i, cutoffs[owners[i]]);
    const det = xx * yy - xy * xy;
    if (det) {
      gx[i] = (xp * yy - yp * xy) / det;
      gy[i] = (yp * xx - xp * xy) / det;
    } else {
      // A zero determinant means every contributing neighbour lies along one direction,
      // so the system has a line of solutions rather than none. Solving each axis on its
      // own returned the full step for both, predicting twice the real difference for a
      // single diagonal neighbour. For a rank-one positive-semidefinite A the
      // minimum-norm solution is A·b / trace², which reduces to xp/xx on a purely
      // horizontal neighbourhood and agrees with the general case everywhere else.
      const trace = xx + yy;
      gx[i] = trace ? (xx * xp + xy * yp) / (trace * trace) : 0;
      gy[i] = trace ? (xy * xp + yy * yp) / (trace * trace) : 0;
    }
  }
  return { gx, gy };
}

/**
 * Largest progress step between neighbouring cells that still counts as continuous.
 *
 * A stroke's progress advances by about 65535 / L from one cell to the next, where L is
 * how many cells long it is. The fixed 16384 this replaces rejected every neighbour of a
 * stroke shorter than eight cells: no gradient survived, the corner field went flat, and
 * the stroke revealed in whole-cell jumps.
 *
 * Dividing by the owned-cell count instead of L repeated that failure for thick strokes.
 * Area is L times the thickness, so `2 * 65535 / area` exceeds the real step only while
 * the stroke is under two cells thick; at four cells wide and two long it lands back on
 * the old constant and rejects every advancing neighbour again.
 *
 * L is therefore measured rather than inferred. assignOwnership seeds progress along the
 * trail and floods it sideways unchanged, so cells across a stroke's width hold equal
 * progress and only cells apart along it differ. The smallest nonzero difference between
 * neighbours is one longitudinal step, which is exactly what the cutoff needs to admit,
 * and unlike a mean it cannot be inflated by the large jumps where a stroke doubles back
 * on itself — which is the discontinuity the cutoff exists to keep out.
 */
/** Right, down, and both forward diagonals: the forward half of the eight-neighbourhood. */
const FORWARD_NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
];

/** The largest owner present, which is what the per-owner scratch arrays must address. */
function highestOwner(owners: Uint16Array): number {
  let maxOwner = 0;
  for (let i = 0; i < owners.length; i++) if (owners[i] > maxOwner) maxOwner = owners[i];
  return maxOwner;
}

function neighbourCutoffs(tile: FontAnimationTile) {
  const { width, height, owners, progress } = tile;
  const maxOwner = highestOwner(owners);
  const finest = new Float64Array(maxOwner + 1).fill(Infinity);
  const consider = (owner: number, delta: number) => {
    if (delta > 0 && delta < finest[owner]) finest[owner] = delta;
  };
  // Forward half of the neighbourhood only, so each pair is measured once. The two
  // diagonals belong here because `neighbourMoments` reads all eight neighbours: a
  // stroke whose cells touch only at their corners had no pair measured at all, so its
  // cutoff fell back, every neighbour was rejected, and it revealed in one jump.
  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i];
    if (!owner) continue;
    const x = i % width,
      y = Math.floor(i / width);
    for (const [dx, dy] of FORWARD_NEIGHBOURS) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || nx >= width || ny >= height) continue;
      const j = i + dy * width + dx;
      if (owners[j] === owner) consider(owner, Math.abs(progress[j] - progress[i]));
    }
  }
  const cutoffs = new Float64Array(maxOwner + 1);
  for (let owner = 1; owner <= maxOwner; owner++) {
    // A stroke whose cells all carry one progress value has no step to measure.
    cutoffs[owner] = Number.isFinite(finest[owner])
      ? Math.max(16384, 2 * finest[owner])
      : 16384;
  }
  return cutoffs;
}

/** Least-squares moments of cell `i` against the neighbours that share its stroke. */
function neighbourMoments(tile: FontAnimationTile, i: number, cutoff: number) {
  const { width, height, owners, progress } = tile;
  const x = i % width,
    y = Math.floor(i / width);
  let xx = 0,
    xy = 0,
    yy = 0,
    xp = 0,
    yp = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height)
        continue;
      const j = i + dy * width + dx;
      if (owners[j] !== owners[i] || Math.abs(progress[j] - progress[i]) > cutoff)
        continue;
      const p = progress[j] - progress[i];
      xx += dx * dx;
      xy += dx * dy;
      yy += dy * dy;
      xp += dx * p;
      yp += dy * p;
    }
  }
  return { xx, xy, yy, xp, yp };
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
  cutoffs: Float64Array,
  checkpoint: () => void,
) {
  const { width, height, owners, progress } = tile;
  const { gx, gy } = gradients;
  const corners = new Float32Array(owners.length * 4);

  for (let i = 0; i < owners.length; i++) {
    if (i % 32768 === 0) {
      await yieldWork();
      checkpoint();
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
          if (
            owners[j] !== owners[i] ||
            Math.abs(progress[j] - progress[i]) > cutoffs[owners[i]]
          )
            continue;
          total += progress[j] + gx[j] * (vx - px - 0.5) + gy[j] * (vy - py - 0.5);
          count++;
        }
      }
      // `count` is never zero: whichever corner this is, the offsets reach cell `i`
      // itself, which shares its own owner and differs from itself by zero. Every
      // cutoff is at least 16384, so that contributor is always admitted.
      corners[i * 4 + corner] = total / count;
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
  const maxOwner = highestOwner(owners);
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
      await yieldWork();
      checkpoint();
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

/**
 * Row-run outline of every owned cell, the stroke range the tile covers, and each
 * stroke's cell bounding box.
 *
 * The bounding boxes let playback scan only the rows and columns a stroke occupies
 * instead of the whole tile on every changing frame.
 */
async function completedOutline(tile: FontAnimationTile, checkpoint: () => void) {
  const { width, height, owners } = tile;
  let first = Infinity,
    last = -1;
  const runs: string[] = [];
  const boxes = new Map<number, [number, number, number, number]>();
  for (let y = 0; y < height; y++) {
    // A large guide can have hundreds of thousands of cells here, and this used to run
    // in one uninterruptible burst with no way to observe a superseding request.
    if (y % 256 === 0) {
      await yieldWork();
      checkpoint();
    }
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const owner = x < width ? owners[y * width + x] : 0;
      if (owner) {
        first = Math.min(first, owner - 1);
        last = Math.max(last, owner - 1);
        const box = boxes.get(owner);
        if (!box) boxes.set(owner, [x, y, x, y]);
        else {
          // No minimum-y update: rows are walked in ascending order and the box is
          // created on the first row this owner appears in, so y never goes below it.
          if (x < box[0]) box[0] = x;
          if (x > box[2]) box[2] = x;
          if (y > box[3]) box[3] = y;
        }
        if (start < 0) start = x;
      } else if (start >= 0) {
        runs.push(rect(start, y, x - start));
        start = -1;
      }
    }
  }
  checkpoint();
  const count = last >= first ? last - first + 1 : 0;
  const strokeBounds = new Int32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const box = boxes.get(first + i + 1);
    // An absent stroke gets an empty box: minX above maxX, so no row is scanned.
    strokeBounds.set(box ?? [1, 0, -1, -1], i * 4);
  }
  return { first, last, strokeBounds, full: await outlinePaced(runs, checkpoint) };
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
  // One cutoff per stroke, shared by both stages. Computed separately, they disagreed
  // about which neighbours were continuous and assigned different progress to a shared
  // corner, which stalls playback and detaches the leading fragment of a stroke.
  const cutoffs = neighbourCutoffs(tile);
  const gradients = await progressGradients(tile, cutoffs, checkpoint);
  const corners = await cornerProgress(tile, gradients, cutoffs, checkpoint);
  await normalizeCorners(tile, corners, checkpoint);
  const { first, last, strokeBounds, full } = await completedOutline(tile, checkpoint);
  checkpoint();

  return {
    corners,
    first,
    last,
    strokeBounds,
    full,
    completed: '',
    stroke: -1,
    key: '',
    path: '',
  };
}

const rect = (x: number, y: number, w: number) => `M${x} ${y}h${w}v1h-${w}Z`;
/** One rounding contract for emitted coordinates and for quantized edge endpoints. */
/** One rounding contract, shared by emitted coordinates and quantized edge endpoints. */
const EDGE_SCALE = 100000;
const number = (n: number) => String(Math.round(n * EDGE_SCALE) / EDGE_SCALE);
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
/**
 * Preparation's outline pass, paced so cancellation can land between its stages.
 *
 * Playback calls the synchronous `outline` below on every frame and cannot yield, but
 * preparation can and must: on a 1024x512 tile whose ownership alternates per cell,
 * collecting, tracing and serialising ran end to end with nothing between them, and
 * the gap between preparation's checkpoints reached about twelve seconds. Splitting
 * the stages does not make any one of them interruptible, but it bounds the span an
 * abort has to wait out to a single stage instead of all three.
 */
async function outlinePaced(parts: string[], checkpoint: () => void): Promise<string> {
  checkpoint();
  const edges = collectEdges(parts);
  checkpoint();
  await yieldWork();
  checkpoint();
  const rings = traceRings(edges);
  checkpoint();
  await yieldWork();
  checkpoint();
  return serializeRings(rings);
}

function outline(parts: string[]): string {
  return serializeRings(traceRings(collectEdges(parts)));
}

function serializeRings(rings: XY[][]): string {
  return rings
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
  const { owners, width } = tile;
  const runs: string[] = [];
  // Scan only the cells this stroke occupies. Every changing frame used to walk the
  // whole tile, which for a 65,536-cell guide meant reading four corner values per cell
  // for a stroke covering a fraction of them.
  const at = (stroke - field.first) * 4;
  const minX = field.strokeBounds[at],
    minY = field.strokeBounds[at + 1],
    maxX = field.strokeBounds[at + 2],
    maxY = field.strokeBounds[at + 3];
  if (minX > maxX) return runs;

  for (let y = minY; y <= maxY; y++) {
    let start = -1;
    for (let x = minX; x <= maxX + 1; x++) {
      const i = y * width + x;
      const cell =
        x <= maxX && owners[i] === stroke + 1
          ? cellState(field, i, progress, threshold)
          : undefined;
      const full = cell ? cell.full : false;
      if (full && start < 0) start = x;
      if (!full && start >= 0) {
        runs.push(rect(start, y, x - start));
        start = -1;
      }
      if (cell && !cell.full && cell.partial) {
        // Only this branch needs the corners, so it reads them itself.
        const base = i * 4;
        runs.push(
          ...cellTriangles(
            [
              field.corners[base],
              field.corners[base + 1],
              field.corners[base + 2],
              field.corners[base + 3],
            ],
            x,
            y,
            threshold,
          ),
        );
      }
    }
  }
  return runs;
}

/**
 * Whether a cell is fully or partly reached.
 *
 * The corner values are deliberately not returned. Only a partly-reached cell needs
 * them, and it can read them straight out of the field, so classifying a cell allocates
 * nothing. The previous version read the corners into locals and then packed them back
 * into a tuple for every cell on every frame, including the fully-revealed and
 * unreached ones that never looked at it, which is the allocation its own comment
 * claimed to have removed.
 */
function cellState(field: MaskField, index: number, progress: number, threshold: number) {
  const at = index * 4;
  const v0 = field.corners[at],
    v1 = field.corners[at + 1],
    v2 = field.corners[at + 2],
    v3 = field.corners[at + 3];
  const every = v0 <= threshold && v1 <= threshold && v2 <= threshold && v3 <= threshold;
  const some = v0 <= threshold || v1 <= threshold || v2 <= threshold || v3 <= threshold;
  return {
    full: progress >= 1 || (progress > 0 && every),
    partial: progress > 0 && some,
  };
}

/** The two clipped triangles that give a partly-reached cell its analytic edge. */
function cellTriangles(
  corners: readonly [number, number, number, number],
  x: number,
  y: number,
  threshold: number,
) {
  const a: Vertex = [x, y, corners[0]],
    b: Vertex = [x + 1, y, corners[1]],
    c: Vertex = [x + 1, y + 1, corners[2]],
    d: Vertex = [x, y + 1, corners[3]];
  return [clippedTriangle([a, b, c], threshold), clippedTriangle([a, c, d], threshold)];
}

/**
 * SVG path revealing `stroke` at `fraction` of its progress, plus everything before it.
 *
 * Results are memoized on the exact progress, so replaying the same animation state
 * costs nothing. The comment inside records why the key is not quantized.
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
