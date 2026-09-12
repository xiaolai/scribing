import { fitTerminalShaft } from './progress.mjs';
const stop = (signal) => {
  if (signal?.aborted)
    throw new DOMException('Animation preparation canceled', 'AbortError');
};
import yieldWork from './yield-work.mjs';

/**
 * Math.min/max over an array without spreading it into the argument list. The spread
 * form throws RangeError past roughly 125,000 entries, and source records reach the
 * validator's 1,000,000-point ceiling. NaN propagates as the spread form does.
 */
/**
 * Smallest and largest of an array-like, NaN-propagating, without spreading it.
 *
 * Exported so animation.mjs can use these rather than keep its own copy. `Math.min(...)`
 * is not a substitute: it throws RangeError once the array passes the engine's argument
 * limit, which the point budgets here permit. The core has its own copy in src/utils.ts
 * on purpose, because extras/fonts must stay importable without the core bundle.
 */
export const minOf = (values) => {
  let best = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (Number.isNaN(value)) return NaN;
    if (value < best) best = value;
  }
  return best;
};
export const maxOf = (values) => {
  let best = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (Number.isNaN(value)) return NaN;
    if (value > best) best = value;
  }
  return best;
};

/**
 * Reject a mask that does not match the dimensions it is handed with.
 *
 * These helpers index a flat mask as `y * width + x`, and nothing checked that the two
 * agreed. A mask shorter than `width * height` sent `holeCount` into an unbounded loop:
 * a write past the end of a typed array is silently dropped, so a cell outside the mask
 * never recorded as seen and was enqueued again on every visit.
 */
const assertGrid = (mask, width, height, label) => {
  if (
    !ArrayBuffer.isView(mask) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    mask.length !== width * height
  )
    throw new RangeError(`${label} needs a mask of exactly width * height cells`);
};

/**
 * Thin a binary ink mask to a one-cell-wide skeleton.
 *
 * @param {Uint8Array} input binary mask, exactly `width * height` cells
 * @param {number} width positive integer
 * @param {number} height positive integer
 * @param {AbortSignal} [signal] aborting it throws AbortError from the next checkpoint
 * @returns {Promise<Uint8Array>} a new mask; `input` is not modified
 */
export async function thinInk(input, width, height, signal) {
  assertGrid(input, width, height, 'thinInk');
  // Thin a one-cell-padded copy, then crop it back. The passes below need all eight
  // neighbours and so never consider the first or last row or column, which left a mask
  // whose ink reaches the edge with a solid bar there instead of the one-cell-wide
  // result this promises: a 5x5 block touching two edges lost no cells at all. Padding
  // moves the real edge inside the examined region without changing any pass.
  const w = width + 2,
    h = height + 2;
  const padded = new Uint8Array(w * h);
  for (let y = 0; y < height; y++)
    padded.set(input.subarray(y * width, (y + 1) * width), (y + 1) * w + 1);
  const thinned = await thinPadded(padded, w, h, signal);
  const cropped = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    cropped.set(thinned.subarray((y + 1) * w + 1, (y + 1) * w + 1 + width), y * width);
  stop(signal);
  return cropped;
}

/** The thinning passes themselves, on a grid whose border is known to be clear. */
async function thinPadded(input, width, height, signal) {
  // Same reason as `dilateCoverage`: a Buffer's `slice` is a view, and thinning reads
  // the grid it is erasing from.
  const ink = new Uint8Array(input),
    remove = [];
  let changed = true,
    iteration = 0;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      remove.length = 0;
      for (let y = 1; y < height - 1; y++) {
        if (y % Math.max(1, Math.floor(32768 / width)) === 0) {
          await yieldWork();
          stop(signal);
        }
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x;
          if (!ink[i]) continue;
          const p = [
            ink[i - width],
            ink[i - width + 1],
            ink[i + 1],
            ink[i + width + 1],
            ink[i + width],
            ink[i + width - 1],
            ink[i - 1],
            ink[i - width - 1],
          ];
          let n = 0,
            a = 0;
          for (let k = 0; k < 8; k++) {
            n += p[k];
            if (!p[k] && p[(k + 1) % 8]) a++;
          }
          if (n < 2 || n > 6 || a !== 1) continue;
          if (
            pass === 0
              ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6]
              : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]
          )
            continue;
          remove.push(i);
        }
      }
      if (remove.length) {
        changed = true;
        for (const i of remove) ink[i] = 0;
      }
    }
    if (++iteration % 4 === 0) {
      await yieldWork();
      stop(signal);
    }
  }
  // Parallel deletion can consume a compact 2×2 component. Preserve every original
  // connected ink component with an interior medial seed, including detached marks.
  const seen = new Uint8Array(input.length),
    queue = new Int32Array(input.length);
  for (let start = 0; start < input.length; start++) {
    if (!input[start] || seen[start]) continue;
    let head = 0,
      tail = 1,
      hasSkeleton = false,
      sx = 0,
      sy = 0;
    queue[0] = start;
    seen[start] = 1;
    while (head < tail) {
      if (head % 32768 === 0) {
        await yieldWork();
        stop(signal);
      }
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      hasSkeleton ||= !!ink[i];
      sx += x;
      sy += y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (
            (!dx && !dy) ||
            x + dx < 0 ||
            x + dx >= width ||
            y + dy < 0 ||
            y + dy >= height
          )
            continue;
          const n = i + dy * width + dx;
          if (input[n] && !seen[n]) {
            seen[n] = 1;
            queue[tail++] = n;
          }
        }
    }
    if (!hasSkeleton) {
      let best = start,
        distance = Infinity;
      for (let i = 0; i < tail; i++) {
        const at = queue[i],
          d = Math.hypot((at % width) - sx / tail, Math.floor(at / width) - sy / tail);
        if (d < distance) {
          distance = d;
          best = at;
        }
      }
      ink[best] = 1;
    }
  }
  stop(signal);
  return ink;
}
/**
 * Indices of the eight-connected set cells around `index`.
 *
 * @param {number} index flat cell index
 * @param {Uint8Array} ink binary mask, exactly `width * height` cells
 * @param {number} width positive integer
 * @param {number} height positive integer
 * @returns {number[]} neighbouring indices that are set, in raster order
 */
export function neighbors(index, ink, width, height) {
  const x = index % width,
    y = Math.floor(index / width),
    out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height)
        continue;
      const n = index + dy * width + dx;
      if (!ink[n]) continue;
      // Remove redundant diagonals around an orthogonal junction while retaining diagonal chains.
      if (dx && dy && (ink[index + dx] || ink[index + dy * width])) continue;
      out.push(n);
    }
  return out;
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function smooth(points) {
  if (points.length < 4) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = [
      (points[i - 1][0] + 2 * points[i][0] + points[i + 1][0]) / 4,
      (points[i - 1][1] + 2 * points[i][1] + points[i + 1][1]) / 4,
    ];
    if (distance(p, out[out.length - 1]) >= 1.4) out.push(p);
  }
  out.push(points[points.length - 1]);
  return out;
}
/**
 * Ordered cell-space trails through a thinned skeleton.
 *
 * Trails that meet end to end and continue smoothly are joined; branches stay separate.
 *
 * @param {Uint8Array} ink one-cell-wide skeleton, exactly `width * height` cells
 * @param {number} width positive integer
 * @param {number} height positive integer
 * @returns {Array<Array<[number, number]>>} trails, sorted top-left first
 */
export function graphTrails(ink, width, height) {
  assertGrid(ink, width, height, 'graphTrails');
  const active = [];
  for (let i = 0; i < ink.length; i++) if (ink[i]) active.push(i);
  const adjacent = new Map(active.map((i) => [i, neighbors(i, ink, width, height)]));
  const nodeAt = new Int32Array(ink.length);
  nodeAt.fill(-1);
  const nodes = [];
  // Collapse connected junction pixels. Degree-one endpoints remain individual nodes.
  for (const i of active) {
    const degree = adjacent.get(i).length;
    if (degree === 2 || nodeAt[i] >= 0) continue;
    const id = nodes.length,
      queue = [i],
      pixels = [];
    nodeAt[i] = id;
    for (let q = 0; q < queue.length; q++) {
      const current = queue[q];
      pixels.push(current);
      if (degree > 2)
        for (const n of adjacent.get(current)) {
          if (adjacent.get(n).length > 2 && nodeAt[n] < 0) {
            nodeAt[n] = id;
            queue.push(n);
          }
        }
    }
    nodes.push({
      pixels,
      point: [
        pixels.reduce((s, p) => s + (p % width), 0) / pixels.length,
        pixels.reduce((s, p) => s + Math.floor(p / width), 0) / pixels.length,
      ],
    });
  }
  const used = new Set(),
    trails = [];
  const edge = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const i of active)
    for (const n of adjacent.get(i))
      if (nodeAt[i] >= 0 && nodeAt[i] === nodeAt[n]) used.add(edge(i, n));
  const walk = (from, next, points) => {
    let previous = from,
      current = next;
    used.add(edge(from, next));
    let guard = 0;
    while (guard++ <= active.length) {
      points.push([current % width, Math.floor(current / width)]);
      const node = nodeAt[current];
      if (node >= 0) {
        points.push(nodes[node].point);
        break;
      }
      const choices = adjacent
        .get(current)
        .filter((n) => n !== previous && !used.has(edge(current, n)));
      if (!choices.length) break;
      const following = choices[0];
      used.add(edge(current, following));
      previous = current;
      current = following;
    }
    return smooth(points);
  };
  for (let id = 0; id < nodes.length; id++) {
    const node = nodes[id];
    let emitted = false;
    for (const i of node.pixels)
      for (const n of adjacent.get(i)) {
        if (nodeAt[n] === id || used.has(edge(i, n))) continue;
        trails.push(walk(i, n, [node.point]));
        emitted = true;
      }
    if (!emitted && node.pixels.every((i) => !adjacent.get(i).length))
      trails.push([node.point]);
  }
  // Remaining degree-two components are loops. Start at the top-leftmost pixel deterministically.
  for (const i of active)
    for (const n of adjacent.get(i)) {
      if (used.has(edge(i, n))) continue;
      const trail = walk(i, n, [[i % width, Math.floor(i / width)]]);
      if (trail.length > 1) trails.push(trail);
    }
  // Join smooth continuations through junctions; retain branches as separate trails.
  const merged = trails.filter((t) => t.length);
  // After a join, keep scanning from the trail that just grew instead of restarting the
  // whole double loop. The restart made this cubic in the number of trails, on the main
  // thread with nothing able to interrupt it, and thousands of separated strokes stall
  // the page. The outer pass still repeats to a fixed point, so the same set of joins
  // is reachable.
  //
  // Candidates now come from an endpoint index rather than from scanning every later
  // trail. A join needs one of A's endpoints to coincide with one of B's, and trail
  // points are integer cell coordinates, so sharing a key is the same test the distance
  // comparison makes. Without the index the pass was still quadratic in the number of
  // trails and spent all of it rediscovering that unrelated trails cannot join: a noisy
  // mask yields hundreds of thousands of them, and this function is synchronous with no
  // checkpoint, so the page simply stopped.
  //
  // A consumed trail is left as a hole rather than spliced out. Splicing renumbers every
  // later trail, which an index would have to chase; leaving holes keeps the surviving
  // trails in the order the scan visited them, so the same join still wins.
  const endKey = (point) => `${point[0]},${point[1]}`;
  const ends = new Map();
  const addEnd = (k, i) => {
    const at = ends.get(k);
    if (at) at.add(i);
    else ends.set(k, new Set([i]));
  };
  const dropEnd = (k, i) => {
    const at = ends.get(k);
    if (!at) return;
    at.delete(i);
    if (!at.size) ends.delete(k);
  };
  const eachEnd = (i, visit) => {
    const t = merged[i];
    visit(endKey(t[0]), i);
    visit(endKey(t[t.length - 1]), i);
  };
  for (let i = 0; i < merged.length; i++) eachEnd(i, addEnd);

  for (let changed = true; changed;) {
    changed = false;
    for (let a = 0; a < merged.length; a++) {
      for (let joined = true; joined;) {
        joined = false;
        const A = merged[a];
        if (!A || A.length < 2) break;
        const candidates = new Set();
        for (const k of [endKey(A[0]), endKey(A[A.length - 1])])
          for (const b of ends.get(k) ?? []) if (b > a) candidates.add(b);
        for (const b of [...candidates].sort((x, y) => x - y)) {
          if (joined) break;
          const B = merged[b];
          if (!B || B.length < 2) continue;
          for (const ra of [false, true])
            for (const rb of [false, true]) {
              if (joined) continue;
              const aa = ra ? A.slice().reverse() : A,
                bb = rb ? B.slice().reverse() : B;
              if (distance(aa[aa.length - 1], bb[0]) > 0.0001) continue;
              const p = aa[Math.max(0, aa.length - 3)],
                q = aa[aa.length - 1],
                r = bb[Math.min(2, bb.length - 1)];
              const u = [q[0] - p[0], q[1] - p[1]],
                v = [r[0] - q[0], r[1] - q[1]],
                den = Math.hypot(...u) * Math.hypot(...v);
              if (den && (u[0] * v[0] + u[1] * v[1]) / den > 0.75) {
                eachEnd(a, dropEnd);
                eachEnd(b, dropEnd);
                merged[a] = aa.concat(bb.slice(1));
                merged[b] = null;
                eachEnd(a, addEnd);
                joined = true;
                changed = true;
              }
            }
        }
      }
    }
  }
  return merged
    .filter(Boolean)
    .sort(
      (a, b) =>
        minOf(a.map((p) => p[1])) - minOf(b.map((p) => p[1])) ||
        minOf(a.map((p) => p[0])) - minOf(b.map((p) => p[0])),
    );
}
/**
 * For every cell, the index of the nearest skeleton cell by 8-connected flood order.
 *
 * @param {Uint8Array} skeleton binary mask, exactly `width * height` cells
 * @param {number} width positive integer
 * @param {number} height positive integer
 * @param {AbortSignal} [signal] aborting it throws AbortError
 * @returns {Promise<Int32Array>} nearest index per cell, or -1 where the mask is empty
 */
export async function nearestSkeletonMap(skeleton, width, height, signal) {
  assertGrid(skeleton, width, height, 'nearestSkeletonMap');
  // An empty skeleton never enters the loop below, so without these an already-aborted
  // request still resolved, and a request aborted during the final yield resolved with
  // a completed map.
  stop(signal);
  const nearest = new Int32Array(skeleton.length);
  nearest.fill(-1);
  const queue = new Int32Array(skeleton.length);
  let tail = 0;
  for (let i = 0; i < skeleton.length; i++)
    if (skeleton[i]) {
      nearest[i] = i;
      queue[tail++] = i;
    }
  for (let head = 0; head < tail; head++) {
    if (head % 32768 === 0) {
      await yieldWork();
      stop(signal);
    }
    const i = queue[head],
      x = i % width,
      y = Math.floor(i / width);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dy) ||
          x + dx < 0 ||
          x + dx >= width ||
          y + dy < 0 ||
          y + dy >= height
        )
          continue;
        const n = i + dy * width + dx;
        if (nearest[n] < 0) {
          nearest[n] = nearest[i];
          queue[tail++] = n;
        }
      }
  }
  stop(signal);
  return nearest;
}

/**
 * Number of enclosed holes in a binary mask, ignoring regions that touch the border.
 *
 * @param {Uint8Array} mask binary mask, exactly `width * height` cells
 * @param {number} width positive integer
 * @param {number} height positive integer
 * @returns {number} count of interior background regions of at least nine cells
 */
export function holeCount(mask, width, height) {
  assertGrid(mask, width, height, 'holeCount');
  const seen = new Uint8Array(mask.length),
    queue = new Int32Array(mask.length);
  let holes = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] || seen[i]) continue;
    let head = 0,
      tail = 1,
      edge = false;
    queue[0] = i;
    seen[i] = 1;
    while (head < tail) {
      const k = queue[head++],
        x = k % width,
        y = Math.floor(k / width);
      if (!x || !y || x === width - 1 || y === height - 1) edge = true;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        const n = k + dx + dy * width;
        if (!mask[n] && !seen[n]) {
          seen[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    if (!edge && tail >= 9) holes++;
  }
  return holes;
}
/**
 * Grow a binary mask by one cell in all eight directions.
 *
 * @param {Uint8Array} mask binary mask, exactly `width * height` cells
 * @param {number} width positive integer
 * @param {number} height positive integer
 * @returns {Uint8Array} a new mask; `mask` is not modified
 */
export function dilateCoverage(mask, width, height) {
  assertGrid(mask, width, height, 'dilateCoverage');
  // Not `mask.slice()`. Node's Buffer is a Uint8Array subclass whose `slice` returns a
  // view over the same memory, so the output aliased the input: the loop then read
  // cells it had just written and spread coverage further than one cell.
  const out = new Uint8Array(mask);
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      const x = i % width,
        y = Math.floor(i / width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height)
            out[i + dy * width + dx] = 1;
    }
  return out;
}
/**
 * Owner and progress maps for a set of trails over a coverage mask.
 *
 * @param {Uint8Array} coverage binary mask, exactly `width * height` cells
 * @param {Uint8Array} skeleton binary mask of the same size
 * @param {Array<Array<[number, number]>>} trails ordered cell-space points per stroke
 * @param {number} width positive integer
 * @param {number} height positive integer
 * @param {number} startIndex global index of the first trail; owners are one-based
 * @param {AbortSignal} [signal] aborting it throws AbortError
 * @returns {Promise<{owners: Uint16Array, progress: Uint16Array}>} owner 0 means unowned
 */
export async function assignOwnership(
  coverage,
  skeleton,
  trails,
  width,
  height,
  startIndex,
  signal,
) {
  assertGrid(coverage, width, height, 'assignOwnership');
  assertGrid(skeleton, width, height, 'assignOwnership');
  // `owners` is a Uint16Array in which 0 means unowned, so an id past 65535 wraps to
  // zero and reads back as a cell nothing ever draws: startIndex 65535 silently made
  // the first trail invisible. Ids run `startIndex + index + 1`, so the largest one is
  // `startIndex + trails.length`; 65535 is representable and only 0 is reserved, so the
  // bound is that sum, not one below it.
  if (
    !Number.isInteger(startIndex) ||
    startIndex < 0 ||
    startIndex + trails.length > 65535
  )
    throw new RangeError('assignOwnership cannot address more than 65535 strokes');
  const owners = new Uint16Array(coverage.length),
    progress = new Uint16Array(coverage.length),
    nearest = await nearestSkeletonMap(skeleton, width, height, signal),
    queue = new Int32Array(coverage.length);
  // Sampling twice per cell along a trail cannot resolve more than the grid's own
  // diagonal, and an unvalidated point made `steps` non-finite: the loop below then ran
  // forever, synchronously, with no checkpoint able to interrupt it.
  const maxSteps = 2 * (width + height);
  let tail = 0,
    sampled = 0;
  for (let index = 0; index < trails.length; index++) {
    const trail = trails[index];
    const lengths = [0];
    for (let i = 1; i < trail.length; i++)
      lengths.push(lengths[i - 1] + distance(trail[i - 1], trail[i]));
    const total = lengths[lengths.length - 1] || 1;
    for (let segment = 0; segment < trail.length; segment++) {
      const a = trail[Math.max(0, segment - 1)],
        b = trail[segment],
        length = distance(a, b);
      if (!Number.isFinite(length))
        throw new RangeError('assignOwnership needs finite trail points');
      const steps = Math.max(1, Math.min(maxSteps, Math.ceil(length * 2)));
      for (let n = 0; n <= steps; n++) {
        const t = n / steps,
          x = Math.max(0, Math.min(width - 1, Math.round(a[0] + (b[0] - a[0]) * t))),
          y = Math.max(0, Math.min(height - 1, Math.round(a[1] + (b[1] - a[1]) * t))),
          seed = nearest[y * width + x];
        // The nearest skeleton cell can sit outside the coverage mask, and taking it
        // anyway produced an owner for a cell the caller does not consider covered.
        if (seed < 0 || owners[seed] || !coverage[seed]) continue;
        owners[seed] = startIndex + index + 1;
        progress[seed] = Math.round(
          ((segment ? lengths[segment - 1] + length * t : 0) / total) * 65535,
        );
        queue[tail++] = seed;
      }
      // Sampling is bounded per segment but not in total, so one long trail could hold
      // the loop for half a second with nothing able to interrupt it. Paced on samples
      // rather than trails, because a single trail was the case that hurt.
      if (++sampled % 4096 === 0) {
        await yieldWork();
        stop(signal);
      }
    }
  }
  for (let head = 0; head < tail; head++) {
    if (head % 32768 === 0) {
      await yieldWork();
      stop(signal);
    }
    const i = queue[head],
      x = i % width,
      y = Math.floor(i / width);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dy) ||
          x + dx < 0 ||
          x + dx >= width ||
          y + dy < 0 ||
          y + dy >= height
        )
          continue;
        const n = i + dy * width + dx;
        if (coverage[n] && !owners[n]) {
          owners[n] = owners[i];
          progress[n] = progress[i];
          queue[tail++] = n;
        }
      }
  }
  stop(signal);
  return { owners, progress };
}
/**
 * Regroup trails by the connected ink component they belong to.
 *
 * @param {Uint8Array} ink binary mask, exactly `width * height` cells
 * @param {Array<Array<[number, number]>>} trails ordered cell-space points per stroke
 * @param {number} width positive integer
 * @param {number} height positive integer
 * @param {AbortSignal} [signal] aborting it throws AbortError
 * @returns {Promise<{trails: Array<Array<[number, number]>>, kinds: string[]}>}
 */
export async function componentTrails(ink, trails, width, height, signal) {
  assertGrid(ink, width, height, 'componentTrails');
  const labels = new Int32Array(ink.length);
  labels.fill(-1);
  const components = [],
    queue = new Int32Array(ink.length);
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || labels[start] >= 0) continue;
    const id = components.length;
    let head = 0,
      tail = 1,
      x1 = width,
      y1 = height,
      x2 = 0,
      y2 = 0,
      sx = 0,
      sy = 0;
    labels[start] = id;
    queue[0] = start;
    while (head < tail) {
      if (head % 32768 === 0) {
        await yieldWork();
        stop(signal);
      }
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      x1 = Math.min(x1, x);
      y1 = Math.min(y1, y);
      x2 = Math.max(x2, x);
      y2 = Math.max(y2, y);
      sx += x;
      sy += y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (
            (!dx && !dy) ||
            x + dx < 0 ||
            x + dx >= width ||
            y + dy < 0 ||
            y + dy >= height
          )
            continue;
          const n = i + dx + dy * width;
          if (ink[n] && labels[n] < 0) {
            labels[n] = id;
            queue[tail++] = n;
          }
        }
    }
    components.push({
      area: tail,
      x1,
      y1,
      x2,
      y2,
      center: [sx / tail, sy / tail],
      trails: [],
    });
  }
  for (const trail of trails) {
    let id = -1;
    for (const p of trail) {
      const x = Math.max(0, Math.min(width - 1, Math.round(p[0]))),
        y = Math.max(0, Math.min(height - 1, Math.round(p[1])));
      if (labels[y * width + x] >= 0) {
        id = labels[y * width + x];
        break;
      }
    }
    if (id >= 0) components[id].trails.push(trail);
  }
  const maxArea = Math.max(1, maxOf(components.map((c) => c.area)));
  components.sort(
    (a, b) =>
      Number(a.area < maxArea * 0.2) - Number(b.area < maxArea * 0.2) ||
      a.y1 - b.y1 ||
      a.x1 - b.x1,
  );
  const out = [],
    kinds = [];
  for (const c of components) {
    const w = c.x2 - c.x1 + 1,
      h = c.y2 - c.y1 + 1,
      length = c.trails.reduce(
        (sum, t) => sum + t.slice(1).reduce((s, p, i) => s + distance(t[i], p), 0),
        0,
      );
    if (
      Math.max(w, h) / Math.max(1, Math.min(w, h)) < 1.8 &&
      c.area / (w * h) > 0.5 &&
      length < Math.max(w, h) * 0.8
    ) {
      out.push([c.center]);
      kinds.push('dot');
    } else
      for (const trail of c.trails) {
        out.push(trail);
        kinds.push(trail.length === 1 ? 'dot' : 'curve');
      }
  }
  stop(signal);
  return { trails: out, kinds };
}
/**
 * Rescale each stroke's progress to the full 0..65535 clock and drop empty strokes.
 *
 * @param {{owners: Uint16Array, progress: Uint16Array}} assignment mutated in place
 * @param {Array<Array<[number, number]>>} trails ordered cell-space points per stroke
 * @param {string[]} kinds one entry per trail
 * @param {number} startIndex global index of the first trail
 * @param {number} width positive integer
 * @param {AbortSignal} [signal] aborting it throws AbortError
 */
export async function normalizeOwnership(
  assignment,
  trails,
  kinds,
  startIndex,
  width,
  signal,
) {
  const { owners, progress } = assignment,
    used = new Uint32Array(trails.length),
    mins = new Float64Array(trails.length),
    maxes = new Float64Array(trails.length);
  mins.fill(Infinity);
  for (let i = 0; i < owners.length; i++) {
    if (i % 65536 === 0) {
      await yieldWork();
      stop(signal);
    }
    if (!owners[i]) continue;
    const k = owners[i] - startIndex - 1;
    used[k]++;
    const p =
      kinds[k] === 'dot'
        ? Math.hypot(
            (i % width) - trails[k][0][0],
            Math.floor(i / width) - trails[k][0][1],
          )
        : progress[i];
    mins[k] = Math.min(mins[k], p);
    maxes[k] = Math.max(maxes[k], p);
  }
  const mapping = new Uint16Array(trails.length);
  let n = 0;
  for (let k = 0; k < trails.length; k++) if (used[k]) mapping[k] = startIndex + ++n;
  for (let i = 0; i < owners.length; i++) {
    if (i % 65536 === 0) {
      await yieldWork();
      stop(signal);
    }
    if (!owners[i]) continue;
    const k = owners[i] - startIndex - 1,
      p =
        kinds[k] === 'dot'
          ? Math.hypot(
              (i % width) - trails[k][0][0],
              Math.floor(i / width) - trails[k][0][1],
            )
          : progress[i];
    progress[i] =
      maxes[k] > mins[k]
        ? Math.round(((p - mins[k]) / (maxes[k] - mins[k])) * 65535)
        : 32767;
    owners[i] = mapping[k];
  }
  stop(signal);
  return [...used].map((count, i) => (count ? i : -1)).filter((i) => i >= 0);
}
// Source-plan crossings share physical ink. Reserve a conservative local portion
// of the earlier stem before the later stroke, without flooding along that branch.
/**
 * Reassign ownership around junctions where two source-adapted strokes meet.
 *
 * Repairs are committed pair by pair. When the work budget runs out mid-pair, the pair
 * in progress is abandoned and every pair committed before it stands, which is what
 * makes the result of a truncated run still coherent.
 *
 * @param {{owners: Uint16Array, progress: Uint16Array}} assignment mutated in place
 * @param {Uint8Array} ink binary mask, exactly `width * height` cells
 * @param {Array<Array<[number, number]>>} trails ordered cell-space points per stroke
 * @param {Array<object|null>} sources one entry per trail; null means generated
 * @param {number} width positive integer
 * @param {number} height positive integer
 * @param {number} startIndex global index of the first trail
 * @param {AbortSignal} [signal] aborting it throws AbortError
 * @param {number} [maxWork] geometric operations before the run gives up
 */
export async function repairSourceJunctions(
  assignment,
  ink,
  trails,
  sources,
  width,
  height,
  startIndex,
  signal,
  maxWork = 2000000,
) {
  assertGrid(ink, width, height, 'repairSourceJunctions');
  stop(signal);
  const indices = sources.map((source, i) => (source ? i : -1)).filter((i) => i >= 0);
  if (indices.length < 2) return;
  const counts = new Uint32Array(trails.length);
  for (const owner of assignment.owners) if (owner) counts[owner - startIndex - 1]++;
  const inside = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    !!ink[Math.floor(y) * width + Math.floor(x)];
  const geometry = new Map(
    indices.map((i) => {
      const points = trails[i].map(([x, y]) => [x + 0.5, y + 0.5]),
        arc = [0];
      for (let n = 1; n < points.length; n++)
        arc.push(arc[n - 1] + distance(points[n - 1], points[n]));
      return [i, { points, arc, total: arc.at(-1) }];
    }),
  );
  const projection = (p, a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    if (!length) return null;
    const t = Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length)),
      ),
      q = [a[0] + t * dx, a[1] + t * dy];
    return {
      t,
      q,
      distance: distance(p, q),
      normal: ((p[0] - q[0]) * -dy + (p[1] - q[1]) * dx) / length,
      length,
    };
  };
  const tangent = (g, n) => {
    const a = g.points[Math.max(0, n - 2)],
      b = g.points[Math.min(g.points.length - 1, n + 2)],
      length = distance(a, b);
    return length ? [(b[0] - a[0]) / length, (b[1] - a[1]) / length] : null;
  };
  const widths = (g, at) => {
    const samples = [];
    for (let n = 0; n < g.points.length; n++) {
      const delta = Math.abs(g.arc[n] - at);
      if (delta < g.total * 0.08 || delta > g.total * 0.16) continue;
      const c = g.points[n],
        t = tangent(g, n);
      if (!t || !inside(...c)) continue;
      const pair = [];
      for (const sign of [-1, 1]) {
        let r = 0.25;
        while (r < 40 && inside(c[0] - t[1] * r * sign, c[1] + t[0] * r * sign))
          r += 0.25;
        pair.push(r >= 40 ? 0 : Math.max(0, r - 0.25));
      }
      if (pair.every((r) => r >= 0.5)) samples.push(pair);
    }
    if (samples.length < 3) return null;
    return [0, 1].map(
      (side) =>
        samples.map((p) => p[side]).sort((a, b) => a - b)[Math.floor(samples.length / 4)],
    );
  };
  const corridorWidths = (g, at, radius) => {
    const samples = [];
    for (const sign of [-1, 1])
      for (const multiple of [1, 1.5, 2, 2.5, 3]) {
        const arc = at + sign * multiple * radius;
        if (arc < 0 || arc > g.total) continue;
        const n = g.arc.findIndex(
          (v, i) => i < g.arc.length - 1 && v <= arc && g.arc[i + 1] >= arc,
        );
        if (n < 0) continue;
        const a = g.points[n],
          b = g.points[n + 1],
          length = distance(a, b);
        if (!length) continue;
        const t = (arc - g.arc[n]) / length,
          c = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
          normal = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length],
          pair = [];
        for (const side of [-1, 1]) {
          let r = 0.25;
          while (
            r < 40 &&
            inside(c[0] + normal[0] * r * side, c[1] + normal[1] * r * side)
          )
            r += 0.25;
          pair.push(r >= 40 ? 0 : r - 0.25);
        }
        if (pair.every((r) => r >= 0.5)) samples.push(pair);
      }
    return samples.length >= 3
      ? [0, 1].map(
          (side) =>
            samples.map((p) => p[side]).sort((a, b) => a - b)[
              Math.floor(samples.length / 4)
            ],
        )
      : null;
  };
  // Two counters with two jobs. projectionWork drives only the yield cadence, because
  // how often this pass yields must not change which repairs survive. work is the budget
  // maxWork documents as "geometric operations before the run gives up", so every
  // projection is charged to it: the projection loops are the bulk of the geometry here
  // and counted against nothing, which left the documented cap unable to bound the work
  // it names. Overflow is noticed at the next budget checkpoint, as it already was.
  let work = 0,
    projectionWork = 0;
  for (let ai = 0; ai < indices.length; ai++)
    for (let bi = ai + 1; bi < indices.length; bi++) {
      const earlier = indices[ai],
        later = indices[bi],
        a = geometry.get(earlier),
        b = geometry.get(later);
      if (!a.total || !b.total) continue;
      const crossings = [],
        updates = new Map(),
        returns = new Map();
      for (let i = 0; i < a.points.length - 1; i++)
        for (let j = 0; j < b.points.length - 1; j++) {
          if (++work > maxWork) return;
          if (work % 32768 === 0) {
            await yieldWork();
            stop(signal);
          }
          const p = a.points[i],
            q = a.points[i + 1],
            r = b.points[j],
            s = b.points[j + 1];
          if (
            Math.max(p[0], q[0]) + 1 < Math.min(r[0], s[0]) ||
            Math.max(r[0], s[0]) + 1 < Math.min(p[0], q[0]) ||
            Math.max(p[1], q[1]) + 1 < Math.min(r[1], s[1]) ||
            Math.max(r[1], s[1]) + 1 < Math.min(p[1], q[1])
          )
            continue;
          const ta = tangent(a, i),
            tb = tangent(b, j);
          if (!ta || !tb || Math.abs(ta[0] * tb[0] + ta[1] * tb[1]) > 0.85) continue;
          const dx = q[0] - p[0],
            dy = q[1] - p[1],
            ex = s[0] - r[0],
            ey = s[1] - r[1],
            den = dx * ey - dy * ex;
          let hit;
          if (den) {
            const u = ((r[0] - p[0]) * ey - (r[1] - p[1]) * ex) / den,
              v = ((r[0] - p[0]) * dy - (r[1] - p[1]) * dx) / den;
            if (u >= 0 && u <= 1 && v >= 0 && v <= 1)
              hit = { u, v, point: [p[0] + u * dx, p[1] + u * dy] };
          }
          if (!hit) {
            const candidates = [];
            for (const [point, u] of [
              [p, 0],
              [q, 1],
            ]) {
              const v = projection(point, r, s);
              if (v && v.distance <= 1)
                candidates.push({
                  u,
                  v: v.t,
                  point: [(point[0] + v.q[0]) / 2, (point[1] + v.q[1]) / 2],
                  distance: v.distance,
                });
            }
            for (const [point, v] of [
              [r, 0],
              [s, 1],
            ]) {
              const u = projection(point, p, q);
              if (u && u.distance <= 1)
                candidates.push({
                  u: u.t,
                  v,
                  point: [(point[0] + u.q[0]) / 2, (point[1] + u.q[1]) / 2],
                  distance: u.distance,
                });
            }
            hit = candidates.sort((lhs, rhs) => lhs.distance - rhs.distance)[0];
          }
          if (!hit || !inside(...hit.point)) continue;
          const arc = a.arc[i] + hit.u * distance(p, q),
            other = b.arc[j] + hit.v * distance(r, s);
          if (
            !crossings.some(
              (c) => Math.abs(c.arc - arc) < 3 && Math.abs(c.other - other) < 3,
            )
          )
            crossings.push({ arc, other });
        }
      for (const crossing of crossings) {
        const radii = widths(a, crossing.arc);
        if (!radii) continue;
        const radius = Math.max(...radii),
          window = 2 * radius;
        let x1 = width,
          y1 = height,
          x2 = 0,
          y2 = 0;
        for (let n = 0; n < a.points.length - 1; n++)
          if (
            a.arc[n] <= crossing.arc + window &&
            a.arc[n + 1] >= crossing.arc - window
          ) {
            for (const p of [a.points[n], a.points[n + 1]]) {
              x1 = Math.min(x1, p[0] - radius);
              x2 = Math.max(x2, p[0] + radius);
              y1 = Math.min(y1, p[1] - radius);
              y2 = Math.max(y2, p[1] + radius);
            }
          }
        for (
          let y = Math.max(0, Math.floor(y1));
          y <= Math.min(height - 1, Math.ceil(y2));
          y++
        )
          for (
            let x = Math.max(0, Math.floor(x1));
            x <= Math.min(width - 1, Math.ceil(x2));
            x++
          ) {
            if (++work > maxWork) return;
            if (work % 32768 === 0) {
              await yieldWork();
              stop(signal);
            }
            const cell = y * width + x;
            if (assignment.owners[cell] !== startIndex + later + 1) continue;
            let nearest;
            for (let n = 0; n < a.points.length - 1; n++) {
              if (++work > maxWork) return;
              if (work % 32768 === 0) {
                await yieldWork();
                stop(signal);
              }
              const p = projection([x + 0.5, y + 0.5], a.points[n], a.points[n + 1]);
              if (p && (!nearest || p.distance < nearest.distance))
                nearest = { ...p, arc: a.arc[n] + p.t * p.length };
            }
            if (
              nearest &&
              Math.abs(nearest.arc - crossing.arc) <= window &&
              nearest.normal >= -radii[0] &&
              nearest.normal <= radii[1]
            )
              updates.set(cell, Math.round((nearest.arc / a.total) * 65535));
          }
      }
      // At a true junction near a stable shaft endpoint, use its fitted normal
      // rather than a final one-cell routing kink. Hooks fail the residual gate.
      if (distance(a.points[0], a.points.at(-1)) > 0.001)
        for (const crossing of crossings) {
          const radii = widths(a, crossing.arc);
          if (!radii) continue;
          const radius = Math.max(...radii),
            atEnd = crossing.arc > a.total / 2;
          if (Math.min(crossing.arc, a.total - crossing.arc) > radius) continue;
          const fit = fitTerminalShaft(a.points, atEnd, radius);
          if (!fit) continue;
          const t = fit.tangent,
            normal = [-t[1], t[0]],
            measured = [[], []];
          for (const p of fit.samples)
            for (let side = 0; side < 2; side++) {
              const sign = side ? 1 : -1;
              let r = 0.25;
              while (
                r < 40 &&
                inside(p[0] + normal[0] * r * sign, p[1] + normal[1] * r * sign)
              )
                r += 0.25;
              if (r < 40) measured[side].push(Math.max(0, r - 0.25));
            }
          if (measured.some((side) => side.length < 3)) continue;
          const bounds = measured.map(
              (side) => side.sort((lhs, rhs) => lhs - rhs)[Math.floor(side.length / 4)],
            ),
            span = Math.max(radius, ...bounds),
            p = fit.point;
          for (
            let y = Math.max(0, Math.floor(p[1] - span * 2));
            y <= Math.min(height - 1, Math.ceil(p[1] + span * 2));
            y++
          )
            for (
              let x = Math.max(0, Math.floor(p[0] - span * 2));
              x <= Math.min(width - 1, Math.ceil(p[0] + span * 2));
              x++
            ) {
              if (++work > maxWork) return;
              if (work % 32768 === 0) {
                await yieldWork();
                stop(signal);
              }
              const cell = y * width + x;
              if (assignment.owners[cell] !== startIndex + later + 1 || !ink[cell])
                continue;
              const dx = x + 0.5 - p[0],
                dy = y + 0.5 - p[1],
                along = dx * t[0] + dy * t[1],
                across = dx * normal[0] + dy * normal[1];
              if (
                along >= -radius &&
                along <= radius &&
                across >= -bounds[0] &&
                across <= bounds[1]
              )
                updates.set(
                  cell,
                  Math.max(
                    0,
                    Math.min(
                      65535,
                      Math.round(((atEnd ? a.total + along : -along) / a.total) * 65535),
                    ),
                  ),
                );
            }
        }
      // Some source strokes share a short terminal run before branching. Earlier
      // ink owns that genuinely coincident corridor, never the later branch beyond it.
      for (const endA of [false, true])
        for (const endB of [false, true]) {
          const A = endA ? a.points.slice().reverse() : a.points,
            B = endB ? b.points.slice().reverse() : b.points;
          if (distance(A[0], B[0]) > 1) continue;
          let baseWidths = widths(a, endA ? a.total : 0);
          if (!baseWidths) {
            const next = B.find((p) => distance(p, B[0]) > 0.25);
            if (!next) continue;
            const length = distance(B[0], next),
              normal = [-(next[1] - B[0][1]) / length, (next[0] - B[0][0]) / length];
            baseWidths = [];
            for (const sign of [-1, 1]) {
              let r = 0.25;
              while (
                r < 40 &&
                inside(B[0][0] + normal[0] * r * sign, B[0][1] + normal[1] * r * sign)
              )
                r += 0.25;
              baseWidths.push(r >= 40 ? 0 : Math.max(0, r - 0.25));
            }
            if (baseWidths.some((r) => r < 0.5)) continue;
          }
          const limit = Math.min(64, 4 * Math.max(...baseWidths)),
            segments = [];
          let arc = 0;
          for (let n = 1; n < A.length && arc < limit; n++) {
            const length = distance(A[n - 1], A[n]);
            // `arc` is tracked to stop the scan at `limit`; the segments themselves are
            // only ever projected onto, so it is not carried on them.
            if (length) segments.push({ a: A[n - 1], b: A[n], length });
            arc += length;
          }
          const run = [];
          let scanned = 0,
            failures = 0,
            matched = 0;
          outer: for (let n = 1; n < B.length && scanned < limit; n++) {
            const length = distance(B[n - 1], B[n]);
            if (!length) continue;
            const localTangent = [
                (B[n][0] - B[n - 1][0]) / length,
                (B[n][1] - B[n - 1][1]) / length,
              ],
              steps = Math.ceil(length / 0.75);
            for (let k = 0; k <= steps; k++) {
              if (++work > maxWork) return;
              if (work % 32768 === 0) {
                await yieldWork();
                stop(signal);
              }
              const t = k / steps,
                p = [
                  B[n - 1][0] + t * (B[n][0] - B[n - 1][0]),
                  B[n - 1][1] + t * (B[n][1] - B[n - 1][1]),
                ];
              let best;
              for (const seg of segments) {
                if (++work > maxWork) return;
                if (++projectionWork % 8192 === 0) {
                  await yieldWork();
                  stop(signal);
                }
                const dx = (seg.b[0] - seg.a[0]) / seg.length,
                  dy = (seg.b[1] - seg.a[1]) / seg.length;
                if (Math.abs(dx * localTangent[0] + dy * localTangent[1]) < 0.85)
                  continue;
                const q = projection(p, seg.a, seg.b);
                if (q && (!best || q.distance < best.distance)) best = q;
              }
              if (best && best.distance <= 1.25) {
                if (!run.length || distance(run.at(-1), p) > 0.01) run.push(p);
                matched = scanned + t * length;
                failures = 0;
              } else if (++failures >= 2) break outer;
              if (scanned + t * length >= limit) break outer;
            }
            scanned += length;
          }
          if (matched < 3 || run.length < 2) continue;
          const profile = [];
          for (let n = 1; n < run.length; n++) {
            const p = run[n - 1],
              q = run[n],
              length = distance(p, q);
            if (!length) continue;
            const normal = [-(q[1] - p[1]) / length, (q[0] - p[0]) / length],
              center = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2],
              radii = [];
            for (const sign of [-1, 1]) {
              let r = 0.25;
              while (
                r < 40 &&
                inside(center[0] + normal[0] * r * sign, center[1] + normal[1] * r * sign)
              )
                r += 0.25;
              radii.push(Math.min(2 * Math.max(...baseWidths), Math.max(0, r - 0.25)));
            }
            // The normal is what sizes `radii` above; the consumers below take theirs
            // from `projection`, so carrying it on the entry served nothing.
            if (radii.every((r) => r >= 0.5)) profile.push({ p, q, radii });
          }
          if (!profile.length) continue;
          const radius = Math.max(...profile.flatMap((s) => s.radii)),
            x1 = minOf(run.map((p) => p[0])) - radius,
            x2 = maxOf(run.map((p) => p[0])) + radius,
            y1 = minOf(run.map((p) => p[1])) - radius,
            y2 = maxOf(run.map((p) => p[1])) + radius;
          for (
            let y = Math.max(0, Math.floor(y1));
            y <= Math.min(height - 1, Math.ceil(y2));
            y++
          )
            for (
              let x = Math.max(0, Math.floor(x1));
              x <= Math.min(width - 1, Math.ceil(x2));
              x++
            ) {
              if (++work > maxWork) return;
              if (work % 32768 === 0) {
                await yieldWork();
                stop(signal);
              }
              const cell = y * width + x;
              if (!ink[cell] || assignment.owners[cell] !== startIndex + later + 1)
                continue;
              let nearest;
              for (let n = 0; n < profile.length; n++) {
                if (++work > maxWork) return;
                if (++projectionWork % 8192 === 0) {
                  await yieldWork();
                  stop(signal);
                }
                const seg = profile[n],
                  p = projection([x + 0.5, y + 0.5], seg.p, seg.q);
                if (p && (!nearest || p.distance < nearest.distance))
                  nearest = { ...p, n, seg };
              }
              if (!nearest) continue;
              const { seg, n } = nearest,
                raw =
                  ((x + 0.5 - seg.p[0]) * (seg.q[0] - seg.p[0]) +
                    (y + 0.5 - seg.p[1]) * (seg.q[1] - seg.p[1])) /
                  (nearest.length * nearest.length);
              const cap = profile.at(-1),
                beyond =
                  (x + 0.5 - cap.q[0]) * (cap.q[0] - cap.p[0]) +
                  (y + 0.5 - cap.q[1]) * (cap.q[1] - cap.p[1]);
              if ((n === 0 && raw < 0) || beyond > 0) continue;
              if (nearest.normal >= -seg.radii[0] && nearest.normal <= seg.radii[1])
                updates.set(cell, endA ? 65535 : 0);
            }
          const earlierOwner = startIndex + earlier + 1,
            laterOwner = startIndex + later + 1,
            effective = (cell) =>
              updates.has(cell)
                ? earlierOwner
                : returns.has(cell)
                  ? laterOwner
                  : assignment.owners[cell];
          const cap = profile.at(-1),
            capT = [cap.q[0] - cap.p[0], cap.q[1] - cap.p[1]],
            BArc = [0];
          for (let n = 1; n < B.length; n++)
            BArc.push(BArc[n - 1] + distance(B[n - 1], B[n]));
          let capWidths =
            corridorWidths(
              b,
              endB ? b.total - matched : matched,
              Math.max(...baseWidths),
            ) || baseWidths;
          if (endB) capWidths = capWidths.slice().reverse();
          // Keep later-bar measurements in one stable coordinate frame. Relative radii
          // transplanted onto a differently offset cap point would move the ink band.
          const frameSamples = [],
            frameRadius = Math.max(...baseWidths);
          for (
            let delta = frameRadius;
            delta <= 3 * frameRadius;
            delta += Math.max(0.75, frameRadius / 4)
          ) {
            const sampleArc = matched + delta;
            if (sampleArc > BArc.at(-1)) continue;
            const n = BArc.findIndex(
              (v, i) => i < BArc.length - 1 && v <= sampleArc && BArc[i + 1] >= sampleArc,
            );
            if (n < 0 || BArc[n + 1] === BArc[n]) continue;
            const f = (sampleArc - BArc[n]) / (BArc[n + 1] - BArc[n]);
            frameSamples.push([
              B[n][0] + f * (B[n + 1][0] - B[n][0]),
              B[n][1] + f * (B[n + 1][1] - B[n][1]),
            ]);
          }
          let barFrame;
          for (let skip = 0; skip <= frameSamples.length - 3 && !barFrame; skip++) {
            const samples = frameSamples.slice(skip);
            if (distance(samples[0], samples.at(-1)) < frameRadius) continue;
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
            const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
              normal = [-Math.sin(angle), Math.cos(angle)];
            if (
              samples.some(
                (p) =>
                  Math.abs(
                    (p[0] - center[0]) * normal[0] + (p[1] - center[1]) * normal[1],
                  ) > Math.max(1, frameRadius * 0.1),
              )
            )
              continue;
            const lows = [],
              highs = [];
            for (const p of samples) {
              const bounds = [];
              for (const sign of [-1, 1]) {
                let r = 0.25;
                while (
                  r < 40 &&
                  inside(p[0] + normal[0] * r * sign, p[1] + normal[1] * r * sign)
                )
                  r += 0.25;
                bounds.push(r >= 40 ? 0 : r - 0.25);
              }
              if (bounds.every((r) => r >= 0.5)) {
                const at = p[0] * normal[0] + p[1] * normal[1];
                lows.push(at - bounds[0]);
                highs.push(at + bounds[1]);
              }
            }
            if (lows.length >= 3) {
              lows.sort((lhs, rhs) => lhs - rhs);
              highs.sort((lhs, rhs) => lhs - rhs);
              barFrame = {
                normal,
                min: lows[Math.floor(lows.length * 0.75)],
                max: highs[Math.floor(highs.length * 0.25)],
              };
            }
          }
          for (
            let y = Math.max(0, Math.floor(y1));
            y <= Math.min(height - 1, Math.ceil(y2));
            y++
          )
            for (
              let x = Math.max(0, Math.floor(x1));
              x <= Math.min(width - 1, Math.ceil(x2));
              x++
            ) {
              if (++work > maxWork) return;
              if (++projectionWork % 8192 === 0) {
                await yieldWork();
                stop(signal);
              }
              const cell = y * width + x;
              if (
                !ink[cell] ||
                effective(cell) !== earlierOwner ||
                (x + 0.5 - cap.q[0]) * capT[0] + (y + 0.5 - cap.q[1]) * capT[1] <= 0
              )
                continue;
              let best;
              for (let n = 1; n < B.length; n++) {
                if (++work > maxWork) return;
                if (++projectionWork % 8192 === 0) {
                  await yieldWork();
                  stop(signal);
                }
                if (BArc[n] < matched || BArc[n - 1] > matched + 2 * radius) continue;
                const p = projection([x + 0.5, y + 0.5], B[n - 1], B[n]);
                if (p && (!best || p.distance < best.distance))
                  best = { ...p, arc: BArc[n - 1] + p.t * p.length };
              }
              const across = barFrame
                  ? (x + 0.5) * barFrame.normal[0] + (y + 0.5) * barFrame.normal[1]
                  : 0,
                withinBar = barFrame
                  ? across >= barFrame.min && across <= barFrame.max
                  : best && best.normal >= -capWidths[0] && best.normal <= capWidths[1];
              if (
                best &&
                best.arc >= matched &&
                best.arc <= matched + 2 * radius &&
                withinBar
              ) {
                updates.delete(cell);
                if (assignment.owners[cell] === earlierOwner)
                  returns.set(cell, endB ? 65535 : 0);
              }
            }
          const within = async (x, y) => {
            let best;
            for (let n = 0; n < profile.length; n++) {
              if (++work > maxWork) return;
              if (++projectionWork % 8192 === 0) {
                await yieldWork();
                stop(signal);
              }
              const seg = profile[n],
                p = projection([x, y], seg.p, seg.q);
              if (p && (!best || p.distance < best.distance)) best = { ...p, n, seg };
            }
            if (!best) return false;
            const { seg, n } = best,
              raw =
                ((x - seg.p[0]) * (seg.q[0] - seg.p[0]) +
                  (y - seg.p[1]) * (seg.q[1] - seg.p[1])) /
                (best.length * best.length);
            const lastSegment = profile.at(-1),
              beyond =
                (x - lastSegment.q[0]) * (lastSegment.q[0] - lastSegment.p[0]) +
                (y - lastSegment.q[1]) * (lastSegment.q[1] - lastSegment.p[1]);
            return (
              !((n === 0 && raw < 0) || beyond > 0) &&
              best.normal >= -seg.radii[0] &&
              best.normal <= seg.radii[1]
            );
          };
          const last = profile.at(-1),
            vx = last.q[0] - last.p[0],
            vy = last.q[1] - last.p[1],
            horizontal = Math.abs(vx) >= Math.abs(vy),
            step = horizontal ? (vx >= 0 ? 1 : -1) : vy >= 0 ? width : -width;
          for (
            let y = Math.max(1, Math.floor(y1));
            y <= Math.min(height - 2, Math.ceil(y2));
            y++
          )
            for (
              let x = Math.max(1, Math.floor(x1));
              x <= Math.min(width - 2, Math.ceil(x2));
              x++
            ) {
              if (++work > maxWork) return;
              if (++projectionWork % 8192 === 0) {
                await yieldWork();
                stop(signal);
              }
              const cell = y * width + x;
              if (
                !ink[cell] ||
                effective(cell) !== laterOwner ||
                effective(cell - step) !== earlierOwner ||
                effective(cell + step) !== earlierOwner
              )
                continue;
              // A single boundary cell intersects the established corridor; no extension
              // of the analytic corridor or unrelated morphological closing is performed.
              let intersects = false;
              for (const p of [
                [x, y],
                [x + 1, y],
                [x, y + 1],
                [x + 1, y + 1],
              ])
                if (await within(...p)) {
                  intersects = true;
                  break;
                }
              if (intersects) {
                returns.delete(cell);
                updates.set(cell, endA ? 65535 : 0);
                continue;
              }
              const island = [];
              let k = cell + step;
              while (
                island.length < 3 &&
                k >= 0 &&
                k < ink.length &&
                effective(k) === earlierOwner
              ) {
                island.push(k);
                k += step;
              }
              if (!island.length || effective(k) !== laterOwner) continue;
              let unsupported = true;
              for (const at of island) {
                const px = (at % width) + 0.5,
                  py = Math.floor(at / width) + 0.5,
                  along = (px - last.q[0]) * vx + (py - last.q[1]) * vy;
                if (along <= 0 || along > radius * Math.hypot(vx, vy)) {
                  unsupported = false;
                  break;
                }
                let best;
                for (let n = 1; n < B.length; n++) {
                  if (++work > maxWork) return;
                  if (++projectionWork % 8192 === 0) {
                    await yieldWork();
                    stop(signal);
                  }
                  const p = projection([px, py], B[n - 1], B[n]);
                  if (p && (!best || p.distance < best.distance)) best = p;
                }
                if (!best || best.distance > Math.max(...baseWidths)) {
                  unsupported = false;
                  break;
                }
              }
              if (unsupported)
                for (const at of island) {
                  updates.delete(at);
                  if (assignment.owners[at] === earlierOwner)
                    returns.set(at, endB ? 65535 : 0);
                }
            }
        }
      // Reconcile an existing near-perpendicular join in both directions only
      // when the earlier local shaft is demonstrably straight.
      for (const crossing of crossings) {
        const radii = widths(a, crossing.arc);
        if (!radii) continue;
        const radius = Math.max(...radii),
          laterRadii =
            widths(b, crossing.other) || corridorWidths(b, crossing.other, radius),
          samples = [];
        if (!laterRadii) continue;
        for (const sign of [-1, 1])
          for (
            let delta = radius;
            delta <= 3 * radius;
            delta += Math.max(0.75, radius / 4)
          ) {
            const arc = crossing.arc + sign * delta;
            if (arc < 0 || arc > a.total) continue;
            const n = a.arc.findIndex(
              (v, i) => i < a.arc.length - 1 && v <= arc && a.arc[i + 1] >= arc,
            );
            if (n < 0) continue;
            const length = a.arc[n + 1] - a.arc[n];
            if (!length) continue;
            const t = (arc - a.arc[n]) / length;
            samples.push([
              a.points[n][0] + t * (a.points[n + 1][0] - a.points[n][0]),
              a.points[n][1] + t * (a.points[n + 1][1] - a.points[n][1]),
            ]);
          }
        if (samples.length < 3) continue;
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
        const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
          t = [Math.cos(angle), Math.sin(angle)];
        const at = a.arc.findIndex(
            (v, n) =>
              n < a.arc.length - 1 && v <= crossing.arc && a.arc[n + 1] >= crossing.arc,
          ),
          bt = b.arc.findIndex(
            (v, n) =>
              n < b.arc.length - 1 &&
              v <= crossing.other &&
              b.arc[n + 1] >= crossing.other,
          );
        if (at < 0 || bt < 0) continue;
        const ta = tangent(a, at),
          tb = tangent(b, bt);
        if (!ta || !tb || Math.abs(t[0] * tb[0] + t[1] * tb[1]) > 0.35) continue;
        if (t[0] * ta[0] + t[1] * ta[1] < 0) {
          t[0] *= -1;
          t[1] *= -1;
        }
        const normal = [-t[1], t[0]];
        if (
          samples.some(
            (p) =>
              Math.abs((p[0] - center[0]) * normal[0] + (p[1] - center[1]) * normal[1]) >
              Math.max(1, radius * 0.1),
          )
        )
          continue;
        const fraction = (crossing.arc - a.arc[at]) / (a.arc[at + 1] - a.arc[at]),
          hit = [
            a.points[at][0] + fraction * (a.points[at + 1][0] - a.points[at][0]),
            a.points[at][1] + fraction * (a.points[at + 1][1] - a.points[at][1]),
          ],
          shift = (hit[0] - center[0]) * t[0] + (hit[1] - center[1]) * t[1],
          origin = [center[0] + shift * t[0], center[1] + shift * t[1]],
          measured = [[], []];
        for (const p of samples)
          for (let side = 0; side < 2; side++) {
            const sign = side ? 1 : -1;
            let r = 0.25;
            while (
              r < 40 &&
              inside(p[0] + normal[0] * r * sign, p[1] + normal[1] * r * sign)
            )
              r += 0.25;
            if (r < 40) measured[side].push(r - 0.25);
          }
        if (measured.some((s) => s.length < 3)) continue;
        const limits = measured.map(
          (side) => side.sort((lhs, rhs) => lhs - rhs)[Math.floor(side.length / 4)],
        );
        for (
          let y = Math.max(0, Math.floor(origin[1] - 3 * radius));
          y <= Math.min(height - 1, Math.ceil(origin[1] + 3 * radius));
          y++
        )
          for (
            let x = Math.max(0, Math.floor(origin[0] - 3 * radius));
            x <= Math.min(width - 1, Math.ceil(origin[0] + 3 * radius));
            x++
          ) {
            if (++work > maxWork) return;
            if (work % 32768 === 0) {
              await yieldWork();
              stop(signal);
            }
            const cell = y * width + x;
            if (
              !ink[cell] ||
              (assignment.owners[cell] !== startIndex + earlier + 1 && !updates.has(cell))
            )
              continue;
            const dx = x + 0.5 - origin[0],
              dy = y + 0.5 - origin[1],
              along = dx * t[0] + dy * t[1],
              across = dx * normal[0] + dy * normal[1];
            if (
              Math.abs(along) > 2 * radius ||
              (across >= -limits[0] - 0.25 && across <= limits[1] + 0.25)
            )
              continue;
            let nearest;
            for (let n = 0; n < b.points.length - 1; n++) {
              if (++work > maxWork) return;
              if (++projectionWork % 8192 === 0) {
                await yieldWork();
                stop(signal);
              }
              if (
                b.arc[n] > crossing.other + 2 * radius ||
                b.arc[n + 1] < crossing.other - 2 * radius
              )
                continue;
              const p = projection([x + 0.5, y + 0.5], b.points[n], b.points[n + 1]);
              if (p && (!nearest || p.distance < nearest.distance))
                nearest = { ...p, arc: b.arc[n] + p.t * p.length };
            }
            if (
              nearest &&
              Math.abs(nearest.arc - crossing.other) <= 2 * radius &&
              nearest.normal >= -laterRadii[0] &&
              nearest.normal <= laterRadii[1]
            ) {
              updates.delete(cell);
              if (assignment.owners[cell] === startIndex + earlier + 1)
                returns.set(cell, Math.round((nearest.arc / b.total) * 65535));
            }
          }
      }
      // Acute branches can share an endpoint without sharing their downstream ink.
      // Trim only a stable, continuing shaft; a hooked terminal must remain intact.
      for (const endA of [false, true])
        for (const endB of [false, true]) {
          const endpointA = endA ? a.points.at(-1) : a.points[0],
            endpointB = endB ? b.points.at(-1) : b.points[0];
          if (distance(endpointA, endpointB) > 1) continue;
          const frames = [];
          for (const [g, end] of [
            [a, endA],
            [b, endB],
          ]) {
            const radii = widths(g, end ? g.total : 0);
            if (!radii) break;
            const radius = Math.max(...radii),
              fit = fitTerminalShaft(g.points, end, radius);
            if (!fit) break;
            const ordered = end ? g.points.slice().reverse() : g.points,
              continuation = [];
            let arc = 0;
            for (let n = 1; n < ordered.length; n++) {
              arc += distance(ordered[n - 1], ordered[n]);
              if (arc >= 3 * radius && arc <= 5 * radius) continuation.push(ordered[n]);
              if (arc > 5 * radius) break;
            }
            if (continuation.length < 3) break;
            const center = [
              continuation.reduce((s, p) => s + p[0], 0) / continuation.length,
              continuation.reduce((s, p) => s + p[1], 0) / continuation.length,
            ];
            let xx = 0,
              xy = 0,
              yy = 0;
            for (const p of continuation) {
              const x = p[0] - center[0],
                y = p[1] - center[1];
              xx += x * x;
              xy += x * y;
              yy += y * y;
            }
            const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
              next = [Math.cos(angle), Math.sin(angle)],
              t = [-fit.tangent[0], -fit.tangent[1]],
              normal = [-t[1], t[0]];
            if (
              Math.abs(next[0] * t[0] + next[1] * t[1]) < 0.95 ||
              continuation.some(
                (p) =>
                  Math.abs((p[0] - center[0]) * -next[1] + (p[1] - center[1]) * next[0]) >
                  Math.max(1, radius * 0.1),
              )
            )
              break;
            const lows = [],
              highs = [];
            for (const p of fit.samples) {
              const pair = [];
              for (const sign of [-1, 1]) {
                let r = 0.25;
                while (
                  r < 40 &&
                  inside(p[0] + normal[0] * r * sign, p[1] + normal[1] * r * sign)
                )
                  r += 0.25;
                pair.push(r >= 40 ? 0 : r - 0.25);
              }
              if (pair.every((r) => r >= 0.5)) {
                const at = p[0] * normal[0] + p[1] * normal[1];
                lows.push(at - pair[0]);
                highs.push(at + pair[1]);
              }
            }
            if (lows.length < 3) break;
            lows.sort((lhs, rhs) => lhs - rhs);
            highs.sort((lhs, rhs) => lhs - rhs);
            frames.push({
              radius,
              t,
              normal,
              point: fit.point,
              min: lows[Math.floor(lows.length * 0.75)],
              max: highs[Math.floor(highs.length * 0.25)],
            });
          }
          if (frames.length !== 2) continue;
          const [first, second] = frames,
            dot = first.t[0] * second.t[0] + first.t[1] * second.t[1];
          if (dot <= 0.35 || dot > 0.85) continue;
          const radius = 3 * Math.max(first.radius, second.radius),
            earlierOwner = startIndex + earlier + 1;
          for (
            let y = Math.max(0, Math.floor(endpointA[1] - radius));
            y <= Math.min(height - 1, Math.ceil(endpointA[1] + radius));
            y++
          )
            for (
              let x = Math.max(0, Math.floor(endpointA[0] - radius));
              x <= Math.min(width - 1, Math.ceil(endpointA[0] + radius));
              x++
            ) {
              if (++work > maxWork) return;
              if (++projectionWork % 8192 === 0) {
                await yieldWork();
                stop(signal);
              }
              const cell = y * width + x;
              if (
                !ink[cell] ||
                returns.has(cell) ||
                (assignment.owners[cell] !== earlierOwner && !updates.has(cell))
              )
                continue;
              const px = x + 0.5,
                py = y + 0.5;
              const alongFirst =
                  (px - first.point[0]) * first.t[0] + (py - first.point[1]) * first.t[1],
                alongSecond =
                  (px - second.point[0]) * second.t[0] +
                  (py - second.point[1]) * second.t[1];
              if (
                alongFirst < 0 ||
                alongFirst > 3 * first.radius ||
                alongSecond < 0 ||
                alongSecond > 3 * second.radius
              )
                continue;
              const acrossFirst = px * first.normal[0] + py * first.normal[1],
                acrossSecond = px * second.normal[0] + py * second.normal[1];
              if (
                (acrossFirst >= first.min - 0.25 && acrossFirst <= first.max + 0.25) ||
                acrossSecond < second.min ||
                acrossSecond > second.max
              )
                continue;
              updates.delete(cell);
              if (assignment.owners[cell] === earlierOwner)
                returns.set(cell, endB ? 65535 : 0);
            }
        }
      // The budget is documented as abandoning the pair in progress when it runs out,
      // so a pair whose analysis overran it must not then commit. Several loops above
      // only counted their work without testing it, which is how a pair could reach
      // this point already over the ceiling and change cells anyway.
      if (work > maxWork) return;
      // A local cosmetic repair must never erase a supplied source stroke.
      if (
        counts[later] - updates.size + returns.size > 0 &&
        counts[earlier] + updates.size - returns.size > 0
      ) {
        for (const [cell, progress] of updates) {
          assignment.owners[cell] = startIndex + earlier + 1;
          assignment.progress[cell] = progress;
        }
        for (const [cell, progress] of returns) {
          assignment.owners[cell] = startIndex + later + 1;
          assignment.progress[cell] = progress;
        }
        counts[earlier] += updates.size - returns.size;
        counts[later] += returns.size - updates.size;
      }
    }
  stop(signal);
}
