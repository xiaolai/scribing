import { projectCurveProgress } from './progress.mjs';
import pathGeometry, { contourProbes } from './path-geometry.mjs';
import { readCapped } from './capped-read.mjs';
import { orderByModel } from './stroke-order.mjs';
import {
  thinInk,
  graphTrails,
  nearestSkeletonMap,
  holeCount,
  dilateCoverage,
  assignOwnership,
  componentTrails,
  normalizeOwnership,
  repairSourceJunctions,
} from './skeleton.mjs';
const MAX_CELLS = 2097152,
  MAX_STROKES = 8192,
  MAX_POINTS = 1000000,
  /** The core's per-tile edge limit; a tile wider or taller than this is rejected. */
  MAX_TILE_EDGE = 16384;
const stop = (signal) => {
  if (signal?.aborted)
    throw new DOMException('Animation preparation canceled', 'AbortError');
};
import pause from './yield-work.mjs';

/**
 * Math.min/max over an array without spreading it into the argument list. The spread
 * form throws RangeError past roughly 125,000 entries, and source records reach the
 * validator's 1,000,000-point ceiling. NaN propagates as the spread form does.
 */
const minOf = (values) => {
  let best = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (Number.isNaN(value)) return NaN;
    if (value < best) best = value;
  }
  return best;
};
const maxOf = (values) => {
  let best = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (Number.isNaN(value)) return NaN;
    if (value > best) best = value;
  }
  return best;
};

export function fontShapeKey(shape) {
  let hash = 2166136261;
  const text = JSON.stringify(shape);
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${shape.font.sha256}:${(hash >>> 0).toString(16)}`;
}
const digest = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
export class MotorSourceError extends Error {
  /** `cause` carries the underlying transport or parse failure, when there was one. */
  constructor(code, group, message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'MotorSourceError';
    this.code = code;
    this.group = group;
    this.recoverable = true;
  }
}
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);
const sourcePoint = (p) =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7);
/**
 * The label rule src/fonts/validateAnimation.ts applies to every identifier it accepts.
 *
 * Repeated here because a source record whose ids are empty or longer than 256 characters
 * passed this validator and was then rejected downstream, so the loader approved data
 * that could only ever produce an unusable animation.
 */
const sourceLabel = (v) => typeof v === 'string' && v.length > 0 && v.length <= 256;

function validSourceRecord(record) {
  const u = record?.unit;
  if (
    !plain(record) ||
    !sourceLabel(record.packId) ||
    !sourceLabel(record.unitId) ||
    !plain(u) ||
    !plain(u.coordinates) ||
    !Number.isFinite(u.coordinates.em) ||
    u.coordinates.em <= 0 ||
    !['up', 'down'].includes(u.coordinates.yAxis) ||
    !Array.isArray(u.motorStrokes) ||
    !u.motorStrokes.length ||
    u.motorStrokes.length > MAX_STROKES ||
    !Array.isArray(u.plans) ||
    !sourceLabel(u.defaultPlanId)
  )
    return false;
  const ids = new Set();
  let points = 0;
  for (const stroke of u.motorStrokes) {
    if (!plain(stroke) || !sourceLabel(stroke.id) || ids.has(stroke.id)) return false;
    ids.add(stroke.id);
    if (stroke.kind === 'dot') {
      if (!sourcePoint(stroke.center)) return false;
      points++;
    } else if (stroke.kind === 'curve') {
      if (
        !Array.isArray(stroke.points) ||
        !stroke.points.length ||
        !stroke.points.every(sourcePoint)
      )
        return false;
      points += stroke.points.length;
    } else return false;
    if (points > MAX_POINTS) return false;
  }
  if (!u.plans.length || u.plans.length > 8) return false;
  const planIds = new Set();
  for (const plan of u.plans) {
    if (
      !plain(plan) ||
      !sourceLabel(plan.id) ||
      planIds.has(plan.id) ||
      !Array.isArray(plan.steps) ||
      plan.steps.length !== ids.size
    )
      return false;
    planIds.add(plan.id);
    const used = new Set();
    for (const step of plan.steps) {
      if (
        !plain(step) ||
        !ids.has(step.strokeId) ||
        used.has(step.strokeId) ||
        (step.direction !== undefined && !['forward', 'either'].includes(step.direction))
      )
        return false;
      used.add(step.strokeId);
    }
  }
  return planIds.has(u.defaultPlanId);
}
/** Ceiling for the stroke-source index, which is a few tens of kilobytes in practice. */
const MAX_INDEX_BYTES = 4 * 1024 * 1024;

/**
 * Read a response body under a hard byte cap.
 *
 * `arrayBuffer()` buffers everything that arrives and only then hands it back, so a
 * response far larger than expected was already in memory by the time its length was
 * compared. Streaming stops at the cap instead.
 */

/**
 * Which motor group, if any, holds recorded stroke data for a script.
 *
 * Exported because scripts/fonts/check-assets.mjs asserts the catalog's stroke-order
 * claims against it. That check used to repeat this selection instead, which cannot
 * detect the divergence it exists to prevent: changing the policy here alone left the
 * copy agreeing with the catalog and the gate green, while the loader no longer looked
 * up the text the catalog advertised.
 */
/**
 * The record the loader would build for one unit, or the reason it would refuse it.
 *
 * Exported because scripts/fonts/check-assets.mjs verifies the shipped motor inventories
 * against it. That gate checked hashes, counts and text mappings but never the schema the
 * loader actually enforces, so it could bless data the runtime then rejected. Mirroring
 * the rules there would have been a second copy able only to agree with itself.
 */
export function motorRecordFor(group, text, value) {
  if (group !== 'chinese')
    return validSourceRecord(value) ? { record: value } : { reason: 'unit' };
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > MAX_STROKES ||
    !value.every(
      (points) => Array.isArray(points) && points.length && points.every(sourcePoint),
    )
  )
    return { reason: 'median' };
  const record = {
    packId: 'hanzi-writer-data-2.0.1',
    unitId: text,
    unit: {
      coordinates: { em: 1024, yAxis: 'up' },
      motorStrokes: value.map((points, i) => ({
        id: `s${i + 1}`,
        kind: 'curve',
        points,
      })),
      defaultPlanId: 'source',
      plans: [{ id: 'source', steps: value.map((_, i) => ({ strokeId: `s${i + 1}` })) }],
    },
  };
  return validSourceRecord(record) ? { record } : { reason: 'unit' };
}

export function motorGroupFor({ script, language }) {
  if (script === 'Latn') return 'english';
  if (script === 'Hang') return 'korean';
  if (language.startsWith('ja')) return 'japanese';
  if (language.startsWith('zh')) return 'chinese';
  return null;
}

export function createMotorSourceLoader({
  baseUrl = new URL('../../', import.meta.url),
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  let index;
  const cache = new Map();
  return async ({ text, script, language }, { signal } = {}) => {
    stop(signal);
    const group = motorGroupFor({ script, language });
    if (!group) return null;
    const error = (code, message, cause) =>
      new MotorSourceError(code, group, message, cause);
    const request = async (file) => {
      let response;
      try {
        response = await fetchImpl(new URL(file, baseUrl), { signal, cache: 'no-store' });
      } catch (cause) {
        stop(signal);
        throw error('NETWORK', `The ${group} stroke source could not be reached.`, cause);
      }
      stop(signal);
      if (!response?.ok)
        throw error(
          'HTTP',
          `The ${group} stroke source returned HTTP ${response?.status ?? 'error'}.`,
        );
      return response;
    };
    const parse = (body) => {
      try {
        return JSON.parse(body);
      } catch (cause) {
        // MotorSourceError documents that `cause` carries the underlying failure, and
        // dropping it here left a caller with nothing to diagnose from.
        throw error('JSON', `The ${group} stroke source contains invalid JSON.`, cause);
      }
    };
    try {
      if (!index) {
        const response = await request('fonts/motor/index.json');
        // Read and parse are separate, as they are for a group body below. Folded
        // together, a stream that failed mid-body was reported as invalid JSON.
        let raw;
        try {
          raw = await readCapped(response, MAX_INDEX_BYTES);
        } catch (cause) {
          stop(signal);
          if (cause instanceof RangeError)
            throw error('SCHEMA', 'The stroke source index is larger than 4 MiB.', cause);
          throw error('NETWORK', 'The stroke source index could not be read.', cause);
        }
        stop(signal);
        let candidate;
        try {
          candidate = JSON.parse(new TextDecoder().decode(raw));
        } catch (cause) {
          throw error('JSON', 'The stroke source index contains invalid JSON.', cause);
        }
        if (
          !plain(candidate) ||
          candidate.schemaVersion !== 1 ||
          !Array.isArray(candidate.groups)
        )
          throw error('SCHEMA', 'The stroke source index has an invalid schema.');
        index = candidate;
      }
      stop(signal);
      if (!cache.has(group)) {
        const entries = index.groups.filter((g) => g?.id === group),
          meta = entries[0];
        if (
          entries.length !== 1 ||
          typeof meta.file !== 'string' ||
          !/^fonts\/motor\/[a-z-]+\.json$/.test(meta.file) ||
          typeof meta.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(meta.sha256) ||
          !Number.isInteger(meta.sizeBytes) ||
          meta.sizeBytes <= 0 ||
          meta.sizeBytes > 32 * 1024 * 1024 ||
          !Number.isInteger(meta.unitCount) ||
          meta.unitCount < 1
        )
          throw error(
            'SCHEMA',
            `The ${group} stroke source is missing or invalid in the index.`,
          );
        const response = await request(meta.file);
        let bytes;
        try {
          // The index already declared how large this file is, so the read is capped at
          // exactly that. `arrayBuffer()` buffered whatever arrived and only then
          // compared the length, which is too late to matter.
          bytes = await readCapped(response, meta.sizeBytes);
        } catch (cause) {
          stop(signal);
          if (cause instanceof RangeError)
            throw error(
              'INTEGRITY',
              `The ${group} stroke source has an unexpected byte length.`,
              cause,
            );
          throw error('NETWORK', `The ${group} stroke source could not be read.`, cause);
        }
        stop(signal);
        if (bytes.byteLength !== meta.sizeBytes)
          throw error(
            'INTEGRITY',
            `The ${group} stroke source has an unexpected byte length.`,
          );
        let hash;
        try {
          hash = await digest(bytes);
        } catch {
          throw error(
            'CRYPTO',
            `The ${group} stroke source integrity could not be checked.`,
          );
        }
        stop(signal);
        if (hash !== meta.sha256)
          throw error(
            'INTEGRITY',
            `The ${group} stroke source failed its integrity check.`,
          );
        const data = parse(new TextDecoder().decode(bytes));
        if (
          !plain(data) ||
          data.schemaVersion !== 1 ||
          !plain(data.units) ||
          Object.keys(data.units).length !== meta.unitCount
        )
          throw error('SCHEMA', `The ${group} stroke source has an invalid schema.`);
        cache.set(group, data.units);
      }
      const units = cache.get(group);
      if (!Object.prototype.hasOwnProperty.call(units, text)) return null;
      const outcome = motorRecordFor(group, text, units[text]);
      if (outcome.reason === 'median')
        throw error('SCHEMA', 'The Chinese stroke source has invalid median data.');
      if (outcome.reason)
        throw error('SCHEMA', `The ${group} stroke source has an invalid writing unit.`);
      return outcome.record;
    } catch (e) {
      index = undefined;
      cache.delete(group);
      stop(signal);
      if (e instanceof MotorSourceError) throw e;
      throw error('SCHEMA', `The ${group} stroke source could not be validated.`);
    }
  };
}

let defaultSourceLoader;
function canvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Animation preparation requires Canvas');
  return { canvas: c, ctx };
}
function raster(shape, indices, bounds, width, height) {
  const { canvas: c, ctx } = canvas(width, height),
    [x, y, w, h] = bounds;
  ctx.translate((-x * width) / w, ((y + h) * height) / h);
  ctx.scale(width / w, -height / h);
  for (const i of indices) {
    const g = shape.glyphs[i];
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.fill(new Path2D(g.path), 'nonzero');
    ctx.restore();
  }
  const data = ctx.getImageData(0, 0, width, height).data,
    mask = new Uint8Array(width * height),
    anchors = new Map();
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Exact interior probes preserve subpixel components whose 8-bit alpha rounds to zero.
  for (const i of indices) {
    const g = shape.glyphs[i],
      geometry = pathGeometry(g.path);
    if (!geometry) continue;
    const path = new Path2D(g.path);
    for (const box of geometry.contours)
      for (const point of contourProbes(
        box,
        h / height,
        (px, py) => ctx.isPointInPath(path, px, py, 'nonzero'),
        geometry.contours,
      )) {
        const anchor = [point[0] + g.x, point[1] + g.y],
          col = Math.max(
            0,
            Math.min(width - 1, Math.floor(((anchor[0] - x) * width) / w)),
          ),
          row = Math.max(
            0,
            Math.min(height - 1, Math.floor(((y + h - anchor[1]) * height) / h)),
          ),
          index = row * width + col;
        mask[index] = 1;
        anchors.set(index, anchor);
      }
  }
  c.width = 0;
  c.height = 0;
  return { mask, anchors };
}
function boundsOfGlyphs(shape, indices) {
  let x = Infinity,
    y = Infinity,
    r = -Infinity,
    t = -Infinity;
  for (const i of indices) {
    const g = shape.glyphs[i],
      b = pathGeometry(g.path);
    if (!b) continue;
    x = Math.min(x, g.x + b.minX);
    y = Math.min(y, g.y + b.minY);
    r = Math.max(r, g.x + b.maxX);
    t = Math.max(t, g.y + b.maxY);
  }
  return Number.isFinite(x) && r > x && t > y ? [x, y, r - x, t - y] : null;
}
/**
 * Ceiling on the points one source registration may expand into.
 *
 * A source record's own point count is bounded, but resampling places a point every two
 * cells, so the expansion is set by the tile's size rather than by the record: a stack
 * of long strokes across a large tile reaches tens of millions of points, and fifteen
 * candidate placements are scored against them below. Past this the source registration
 * is abandoned and the generated skeleton is used instead.
 */
const MAX_RESAMPLED_POINTS = 200000;

export function resample(points, step = 2, budget = Infinity) {
  const out = [points[0]];
  if (out.length > budget) return null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    // Refuse the segment before allocating it. The caller's budget check ran only
    // between whole strokes, so one stroke at the source validator's million-point
    // ceiling expanded to roughly 128 million points here — tens of gigabytes — before
    // anything compared a total against the limit.
    if (out.length + n > budget) return null;
    for (let j = 1; j <= n; j++)
      out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
  }
  return out;
}
/**
 * Draw the glyph's own skeleton in the model's order, for glyphs a fit cannot reach.
 *
 * Returns the same shape `registerSource` does, so the caller's tiering stays a single
 * expression. Every stroke names the unit that ordered it, which is what distinguishes
 * `source-ordered` from `generated` downstream.
 */
export function orderGlyph(record, skeleton, ink, width, height) {
  const unit = record?.unit;
  if (!unit?.motorStrokes?.length) return null;
  const plan = unit.plans?.find((p) => p.id === unit.defaultPlanId) || unit.plans?.[0];
  if (!plan) return null;
  const model = plan.steps.map((step) => {
    const st = unit.motorStrokes.find((x) => x.id === step.strokeId);
    return (
      st && { points: st.kind === 'dot' ? [st.center, st.center] : st.points, id: st.id }
    );
  });
  if (model.some((m) => !m)) return null;
  const trails = graphTrails(skeleton, width, height);
  if (!trails.length) return null;
  let left = width,
    top = height,
    right = 0,
    bottom = 0;
  for (let i = 0; i < ink.length; i++)
    if (ink[i]) {
      left = Math.min(left, i % width);
      right = Math.max(right, i % width);
      top = Math.min(top, Math.floor(i / width));
      bottom = Math.max(bottom, Math.floor(i / width));
    }
  if (right <= left || bottom <= top) return null;
  const res = orderByModel(
    trails,
    model,
    [left, top, right, bottom],
    unit.coordinates.yAxis === 'down',
  );
  if (!res.strokes.length) return null;
  return {
    trails: res.strokes,
    kinds: res.strokes.map((t) => (t.length > 1 ? 'curve' : 'dot')),
    source: res.strokes.map((_t, i) => ({
      packId: record.packId,
      unitId: record.unitId,
      planId: plan.id,
      strokeId: (model[Math.min(i, model.length - 1)] || model[0]).id,
    })),
  };
}

// `registerSource` declines in three materially different ways, and the ordering tier
// depends on which. A `fit` decline means the model's rendered topology matched this
// glyph and only the affine frame (scaleX and offsetX only) could not place it closely
// enough, so the model's sequence still applies to the font's own skeleton. An
// `allograph` decline means the rendered model encloses a different number of holes
// than the glyph: it is a different letterform, not a badly placed one. NotoSerif's
// double-storey `g` has two counters where the single-storey model has one, so the
// model owns no stroke for the lower loop and has no order to lend.
//
// `untested` is the one that is easy to miss. Those declines happen before the topology
// comparison runs at all, so they carry no evidence either way. Treating them as `fit`
// handed the ordering tier glyphs whose topology had never been checked — a straight
// model against a closed skeleton was enough to reproduce it. Only a decline that has
// actually passed the hole comparison may lend its order.
const FIT_DECLINED = Object.freeze({ declined: 'fit' }),
  UNTESTED_DECLINED = Object.freeze({ declined: 'untested' }),
  ALLOGRAPH_DECLINED = Object.freeze({ declined: 'allograph' });

async function registerSource(record, skeleton, ink, width, height, signal) {
  const unit = record?.unit;
  if (!unit?.motorStrokes?.length || unit.motorStrokes.length > MAX_STROKES)
    return UNTESTED_DECLINED;
  const plan = unit.plans?.find((p) => p.id === unit.defaultPlanId);
  if (!plan || plan.steps.length !== unit.motorStrokes.length) return UNTESTED_DECLINED;
  const sign = unit.coordinates.yAxis === 'up' ? 1 : -1;
  // Keyed once rather than scanned per step. Stroke ids are unique by validSourceRecord,
  // and a permitted record can carry 8,192 of them, so the linear find made a record the
  // validator accepts cost up to 67 million comparisons with no cancellation point.
  const strokeById = new Map(unit.motorStrokes.map((stroke) => [stroke.id, stroke]));
  const source = plan.steps.map((step) => {
    const s = strokeById.get(step.strokeId);
    return (
      s && {
        id: s.id,
        kind: s.kind,
        points: (s.kind === 'dot' ? [s.center] : s.points).map(([x, y]) => [x, y * sign]),
      }
    );
  });
  if (source.some((s) => !s)) return UNTESTED_DECLINED;
  const src = source.flatMap((s) => s.points),
    active = [];
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) active.push(i);
  if (!active.length) return UNTESTED_DECLINED;
  const sx = minOf(src.map((p) => p[0])),
    sy = minOf(src.map((p) => p[1])),
    sw = maxOf(src.map((p) => p[0])) - sx,
    sh = maxOf(src.map((p) => p[1])) - sy;
  let tx = width,
    ty = height,
    tr = 0,
    tb = 0;
  for (const i of active) {
    tx = Math.min(tx, i % width);
    ty = Math.min(ty, Math.floor(i / width));
    tr = Math.max(tr, i % width);
    tb = Math.max(tb, Math.floor(i / width));
  }
  if (
    (sw < 1e-6 && tr - tx > Math.max(8, (tb - ty) * 0.3)) ||
    (sh < 1e-6 && tb - ty > Math.max(8, (tr - tx) * 0.3))
  )
    return UNTESTED_DECLINED;
  // Fit the source body to stems rather than letting terminal serif tips set its width.
  // This bounded frame search changes registration only; all original ink remains owned.
  const nearest = await nearestSkeletonMap(skeleton, width, height, signal);
  const project = (scaleX, offsetX) => {
    const projected = [];
    let total = 0;
    for (const s of source) {
      const trail = resample(
        s.points.map(([x, y]) => [
          sw
            ? (tx + tr) / 2 +
              offsetX * (tr - tx) +
              ((x - sx) / sw - 0.5) * (tr - tx) * scaleX
            : (tx + tr) / 2,
          sh ? tb - ((y - sy) / sh) * (tb - ty) : (ty + tb) / 2,
        ]),
        2,
        MAX_RESAMPLED_POINTS - total,
      );
      if (!trail) return null;
      total += trail.length;
      projected.push(trail);
    }
    return projected;
  };
  let trails = project(1, 0),
    best = Infinity;
  if (!trails) return UNTESTED_DECLINED;
  for (const scaleX of [1, 0.95, 0.9, 0.85, 0.8])
    for (const offsetX of [0, -0.025, 0.025]) {
      const candidate = project(scaleX, offsetX);
      if (!candidate) return UNTESTED_DECLINED;
      const d = [];
      for (const trail of candidate)
        for (const p of trail) {
          const at =
              Math.max(0, Math.min(height - 1, Math.round(p[1]))) * width +
              Math.max(0, Math.min(width - 1, Math.round(p[0]))),
            n = nearest[at];
          d.push(Math.hypot(p[0] - (n % width), p[1] - Math.floor(n / width)));
        }
      d.sort((a, b) => a - b);
      const score =
        d.reduce((a, b) => a + b, 0) / d.length +
        d[Math.floor(d.length * 0.9)] * 0.25 +
        (1 - scaleX) * 0.25;
      if (score < best) {
        best = score;
        trails = candidate;
      }
    }

  const { canvas: c, ctx } = canvas(width, height);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const trail of trails) {
    ctx.beginPath();
    ctx.moveTo(...trail[0]);
    for (const p of trail.slice(1)) ctx.lineTo(...p);
    if (trail.length === 1) {
      ctx.arc(...trail[0], 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.stroke();
  }
  const bytes = ctx.getImageData(0, 0, width, height).data,
    sourceMask = new Uint8Array(ink.length);
  for (let i = 0; i < sourceMask.length; i++)
    sourceMask[i] = bytes[4 * i + 3] > 0 ? 1 : 0;
  c.width = 0;
  c.height = 0;
  if (holeCount(sourceMask, width, height) !== holeCount(ink, width, height))
    return ALLOGRAPH_DECLINED;
  const sourceNearest = await nearestSkeletonMap(sourceMask, width, height, signal);
  const distances = [];
  for (const trail of trails)
    for (const p of trail) {
      const x = Math.max(0, Math.min(width - 1, Math.round(p[0]))),
        y = Math.max(0, Math.min(height - 1, Math.round(p[1]))),
        n = nearest[y * width + x];
      distances.push(Math.hypot(p[0] - (n % width), p[1] - Math.floor(n / width)));
    }
  for (const i of active) {
    const n = sourceNearest[i];
    distances.push(
      Math.hypot(
        (i % width) - (n % width),
        Math.floor(i / width) - Math.floor(n / width),
      ),
    );
  }
  distances.sort((a, b) => a - b);
  const span = Math.max(tr - tx, tb - ty, 1),
    mean = distances.reduce((a, b) => a + b, 0) / distances.length,
    p95 = distances[Math.floor(distances.length * 0.95)];
  if (mean > span * 0.065 || p95 > span * 0.15) return FIT_DECLINED;
  const snapped = trails.map((trail) =>
    trail
      .map((p) => {
        const n =
          nearest[
            Math.max(0, Math.min(height - 1, Math.round(p[1]))) * width +
              Math.max(0, Math.min(width - 1, Math.round(p[0])))
          ];
        return [n % width, Math.floor(n / width)];
      })
      .filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]),
  );
  const safe = dilateCoverage(ink, width, height);
  // A projection may jump to another branch. Never call a chord through blank ink
  // an adapted source stroke; the generated graph remains available for that form.
  for (let n = 0; n < snapped.length; n++) {
    const trail = snapped[n],
      routed = [trail[0]];
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1],
        b = trail[i],
        chord = resample([a, b], 0.5);
      if (chord.every(([x, y]) => safe[Math.round(y) * width + Math.round(x)])) {
        routed.push(b);
        continue;
      }
      const begin = Math.round(a[1]) * width + Math.round(a[0]),
        end = Math.round(b[1]) * width + Math.round(b[0]),
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        limit = Math.ceil(length * 3 + 8),
        corridor = Math.max(3, length * 0.45);
      const queue = [begin],
        parent = new Map([[begin, -1]]),
        depth = new Map([[begin, 0]]);
      for (let head = 0; head < queue.length && !parent.has(end); head++) {
        if (head % 4096 === 0) {
          stop(signal);
          await pause();
        }
        const at = queue[head],
          x = at % width,
          y = Math.floor(at / width);
        if (depth.get(at) >= limit) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy,
              k = ny * width + nx;
            if (
              (!dx && !dy) ||
              nx < 0 ||
              nx >= width ||
              ny < 0 ||
              ny >= height ||
              !skeleton[k] ||
              parent.has(k)
            )
              continue;
            const t = length
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    ((nx - a[0]) * (b[0] - a[0]) + (ny - a[1]) * (b[1] - a[1])) /
                      (length * length),
                  ),
                )
              : 0;
            if (
              Math.hypot(nx - a[0] - t * (b[0] - a[0]), ny - a[1] - t * (b[1] - a[1])) >
              corridor
            )
              continue;
            parent.set(k, at);
            depth.set(k, depth.get(at) + 1);
            queue.push(k);
          }
      }
      if (!parent.has(end)) return FIT_DECLINED;
      const route = [];
      for (let k = end; k !== begin; k = parent.get(k))
        route.push([k % width, Math.floor(k / width)]);
      routed.push(...route.reverse());
    }
    snapped[n] = routed;
  }
  if (snapped.some((trail, i) => source[i].kind === 'curve' && trail.length < 2))
    return FIT_DECLINED;
  return {
    trails: snapped,
    source: source.map((s) => ({
      packId: record.packId,
      unitId: record.unitId,
      planId: plan.id,
      strokeId: s.id,
    })),
    kinds: source.map((s) => s.kind),
  };
}
/**
 * Modern Hangul jamo, in the order Unicode composes them.
 *
 * A syllable is L + V + optional T, and Unicode 3.12 gives the arithmetic:
 * S = 0xAC00 + (L * 21 + V) * 28 + T. Writing order follows the same sequence, with
 * the batchim last and its parts left to right.
 */
const HANGUL_L = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const HANGUL_V = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const HANGUL_T = [null, ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

/**
 * Compound finals, written as their parts from left to right.
 *
 * The jamo pack draws the 40 standalone letters and none of these eleven, so a
 * 겹받침 syllable is unreachable without splitting the final first.
 */
const HANGUL_COMPOUND_T = {
  ㄳ: 'ㄱㅅ',
  ㄵ: 'ㄴㅈ',
  ㄶ: 'ㄴㅎ',
  ㄺ: 'ㄹㄱ',
  ㄻ: 'ㄹㅁ',
  ㄼ: 'ㄹㅂ',
  ㄽ: 'ㄹㅅ',
  ㄾ: 'ㄹㅌ',
  ㄿ: 'ㄹㅍ',
  ㅀ: 'ㄹㅎ',
  ㅄ: 'ㅂㅅ',
};

/** Vowels whose dominant stroke is vertical; the initial sits to their left. */
const HANGUL_VOWEL_VERTICAL = new Set([...'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ']);
/** Vowels whose dominant stroke is horizontal; the initial sits above them. */
const HANGUL_VOWEL_HORIZONTAL = new Set([...'ㅗㅛㅜㅠㅡ']);

/** Decompose one modern syllable into the letters that are written, in order. */
export function decomposeHangul(text) {
  if (Array.from(text).length !== 1) return null;
  const n = text.codePointAt(0) - 0xac00;
  if (!Number.isInteger(n) || n < 0 || n > 11171) return null;
  const initial = HANGUL_L[Math.floor(n / 588)],
    vowel = HANGUL_V[Math.floor(n / 28) % 21],
    final = HANGUL_T[n % 28];
  const finals = final ? Array.from(HANGUL_COMPOUND_T[final] || final) : [];
  return { letters: [initial, vowel, ...finals], vowel, finals };
}

/**
 * Rectangular sub-regions of the ink, one per written letter, in writing order.
 *
 * Each region is masked out of the ink and skeleton and fitted on its own, which is
 * why they must be rectangles. That is also the limitation: a wrapping vowel such as
 * ㅘ occupies an L-shape around the initial and cannot be separated from it by one
 * rectangle, so those syllables are declined here and fall back to a generated
 * sequence rather than being fitted wrongly.
 */
export function hangulRegions({ vowel, finals, ink, width, box, cut }) {
  const [left, top, right, bottom] = box;
  const w = right - left,
    h = bottom - top;
  if (HANGUL_VOWEL_VERTICAL.has(vowel))
    return withFinal(verticalLayout(box, w, h, finals, cut), finals, cut);
  if (HANGUL_VOWEL_HORIZONTAL.has(vowel))
    return withFinal(horizontalLayout(box, w, h, finals, ink, width, cut), finals, cut);
  // A wrapping vowel such as ㅘ occupies an L-shape around the initial. Each region is
  // masked out of the ink as a rectangle and fitted on its own, and no rectangle can
  // separate those two, so these are declined and fall back to a generated sequence
  // rather than being fitted wrongly.
  return null;
}

/** Attach the batchim regions a layout reserved for them, splitting a compound final. */
function withFinal(layout, finals, cut) {
  if (!layout) return null;
  const { body, final } = layout;
  if (!finals.length) return body;
  if (!final) return null;
  const [fx1, fy1, fx2, fy2] = final;
  if (finals.length === 1) return [...body, final];
  const xm = cut('x', fx1 + (fx2 - fx1) * 0.3, fx1 + (fx2 - fx1) * 0.7, fy1, fy2);
  if (xm <= fx1 || xm >= fx2) return null;
  return [...body, [fx1, fy1, xm, fy2], [xm + 1, fy1, fx2, fy2]];
}

/**
 * Vertical vowel: batchim off the bottom first, then the body split down the middle.
 *
 * Taking the batchim first is safe here because the initial and the vowel are side by
 * side, so the bottom band is genuinely the emptiest horizontal line.
 */
function verticalLayout(box, w, h, finals, cut) {
  const [left, top, right, bottom] = box;
  let bodyBottom = bottom,
    final = null;
  if (finals.length) {
    const y = cut('y', top + h * 0.6, top + h * 0.79, left, right);
    if (y <= top || y >= bottom) return null;
    bodyBottom = y;
    final = [left, y + 1, right, bottom];
  }
  const x = cut('x', left + w * 0.42, left + w * 0.69, top, bodyBottom);
  if (x <= left || x >= right) return null;
  return {
    body: [
      [left, top, x, bodyBottom],
      [x + 1, top, right, bodyBottom],
    ],
    final,
  };
}

/**
 * Horizontal vowel: locate the vowel's wide bar first, then cut above and below it.
 *
 * The bar has to be found across the whole box before anything is split off. A generic
 * valley search for the batchim runs first in the vertical layout, but here it lands
 * near the bar itself and disturbs the detection; 글 regressed exactly that way.
 * The bar is the widest run of ink rather than a gap, so it is found by span, not by
 * emptiness, or the search puts it inside the initial's region and leaves the vowel
 * with nothing.
 */
function horizontalLayout(box, w, h, finals, ink, width, cut) {
  const [left, top, right, bottom] = box;
  let band = -1,
    span = 0;
  for (let y = Math.round(top + h * 0.3); y <= Math.round(top + h * 0.56); y++) {
    let a = width,
      b = -1;
    for (let x = left; x <= right; x++)
      if (ink[y * width + x]) {
        a = Math.min(a, x);
        b = Math.max(b, x);
      }
    if (b - a > span) {
      span = b - a;
      band = y;
    }
  }
  if (band < 0 || span < w * 0.55) return null;
  let first = band,
    last = band;
  const occupied = (y) => {
    let count = 0;
    for (let x = left; x <= right; x++) count += ink[y * width + x];
    return count > w * 0.45;
  };
  while (first > top && occupied(first - 1)) first--;
  while (last < bottom && occupied(last + 1)) last++;
  const y1 = cut('y', Math.max(top, first - h * 0.12), first - 1, left, right);
  // cut() reports "nothing found" as -1, which happens here whenever the bar reaches the
  // top of the box and leaves it an empty range to search. Testing only the upper bound
  // let that -1 through and produced an inverted first region plus a second one covering
  // the whole box. The four other cut() call sites compare against a lower bound that is
  // never negative, so they reject the sentinel already; this one did not.
  if (y1 < top || y1 >= first) return null;
  if (!finals.length)
    return {
      body: [
        [left, top, right, y1],
        [left, y1 + 1, right, bottom],
      ],
      final: null,
    };
  const y2 = cut('y', last + 1, Math.min(bottom, last + h * 0.12), left, right);
  if (y2 <= last) return null;
  return {
    body: [
      [left, top, right, y1],
      [left, y1 + 1, right, y2],
    ],
    final: [left, y2 + 1, right, bottom],
  };
}

async function registerKoreanPilot(
  text,
  loader,
  shape,
  skeleton,
  ink,
  width,
  height,
  signal,
) {
  const decomposed = decomposeHangul(text);
  if (!decomposed) return null;
  const { letters, vowel, finals } = decomposed;
  let left = width,
    right = 0,
    top = height,
    bottom = 0;
  for (let i = 0; i < ink.length; i++)
    if (ink[i]) {
      left = Math.min(left, i % width);
      right = Math.max(right, i % width);
      top = Math.min(top, Math.floor(i / width));
      bottom = Math.max(bottom, Math.floor(i / width));
    }
  if (right <= left || bottom <= top) return null;
  const cut = (axis, lo, hi, otherLo, otherHi) => {
    let best = -1,
      score = Infinity;
    for (let k = Math.round(lo); k <= Math.round(hi); k++) {
      let sum = 0;
      for (let q = Math.round(otherLo); q <= Math.round(otherHi); q++)
        sum += axis === 'x' ? ink[q * width + k] : ink[k * width + q];
      const v = sum + Math.abs(k - (lo + hi) / 2) * 0.001;
      if (v < score) {
        best = k;
        score = v;
      }
    }
    return best;
  };
  const regions = hangulRegions({
    vowel,
    finals,
    ink,
    width,
    box: [left, top, right, bottom],
    cut,
  });
  if (!regions || regions.length !== letters.length) return null;
  // Regions are taken as cut, with no margin. Widening them by 3% was tried and made
  // things worse, 7 fully adapted down to 3: a letter's fit is hurt more by seeing a
  // sliver of its neighbour than by having its own stroke clipped at the boundary.
  const result = { trails: [], kinds: [], source: [] };
  for (let k = 0; k < letters.length; k++) {
    stop(signal);
    const partInk = new Uint8Array(ink.length),
      partSkeleton = new Uint8Array(ink.length),
      [x1, y1, x2, y2] = regions[k];
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++) {
        const i = y * width + x;
        partInk[i] = ink[i];
        partSkeleton[i] = skeleton[i];
      }
    const record = await loader(
      { text: letters[k], script: shape.script, language: shape.language },
      { signal },
    );
    stop(signal);
    const fitted = await registerSource(
      record,
      partSkeleton,
      partInk,
      width,
      height,
      signal,
    );
    if (!fitted.declined) {
      result.trails.push(...fitted.trails);
      result.kinds.push(...fitted.kinds);
      result.source.push(...fitted.source);
    } else {
      const generated = await componentTrails(
        partInk,
        graphTrails(partSkeleton, width, height),
        width,
        height,
        signal,
      );
      if (!generated.trails.length) return null;
      result.trails.push(...generated.trails);
      result.kinds.push(...generated.kinds);
      result.source.push(...generated.trails.map(() => undefined));
    }
  }
  return result;
}
export async function prepareFontAnimation(
  shape,
  { signal, sourceLoader, pixelsPerEm = 256, maxCells = MAX_CELLS } = {},
) {
  stop(signal);
  if (
    !shape ||
    shape.schemaVersion !== 1 ||
    !Array.isArray(shape.glyphs) ||
    !Number.isFinite(shape.em) ||
    typeof document === 'undefined' ||
    typeof Path2D === 'undefined'
  )
    throw new Error(
      'Prepare an immutable FontWriter.getShape() in a Canvas-capable browser.',
    );
  if (
    !Number.isFinite(pixelsPerEm) ||
    pixelsPerEm < 32 ||
    pixelsPerEm > 512 ||
    !Number.isInteger(maxCells) ||
    maxCells < 4096 ||
    maxCells > MAX_CELLS
  )
    throw new Error('Invalid animation preparation limits');
  const shapeKey = fontShapeKey(shape),
    groups = new Map();
  shape.glyphs.forEach((g, i) => {
    if (!groups.has(g.cluster)) groups.set(g.cluster, []);
    groups.get(g.cluster).push(i);
  });
  const ordered = [...groups].sort((a, b) => a[0] - b[0]),
    specs = [];
  for (let n = 0; n < ordered.length; n++) {
    const [cluster, glyphIndices] = ordered[n],
      bounds = boundsOfGlyphs(shape, glyphIndices);
    if (bounds)
      specs.push({
        glyphIndices,
        bounds,
        text: shape.text.slice(cluster, ordered[n + 1]?.[0] ?? shape.text.length),
      });
  }
  if (!specs.length) throw new Error('No visible font ink to animate');
  let resolution = pixelsPerEm / shape.em;
  const cost = () =>
    specs.reduce(
      (sum, s) =>
        sum +
        (Math.ceil(s.bounds[2] * resolution) + 4) *
          (Math.ceil(s.bounds[3] * resolution) + 4),
      0,
    );
  // Bound each edge as well as the total area. A long, narrow glyph can satisfy the
  // cell budget at 25,604 x 30, which the core then rejects outright: its tile edge
  // limit is 16,384, and the whole animation would fail validation. The +4 below is the
  // padding each edge picks up.
  const longestSide = specs.reduce(
    (longest, spec) => Math.max(longest, spec.bounds[2], spec.bounds[3]),
    0,
  );
  if (longestSide * resolution > MAX_TILE_EDGE - 4)
    resolution = (MAX_TILE_EDGE - 4) / longestSide;
  if (cost() > maxCells) resolution *= Math.sqrt(maxCells / cost()) * 0.98;
  while (cost() > maxCells) resolution *= 0.98;
  const strokes = [],
    tiles = [],
    templates = new Map();
  let pointCount = 0;
  defaultSourceLoader ||= createMotorSourceLoader();
  const loader = sourceLoader === undefined ? defaultSourceLoader : sourceLoader;
  for (const spec of specs) {
    stop(signal);
    await pause();
    stop(signal);
    const width = Math.ceil(spec.bounds[2] * resolution) + 4,
      height = Math.ceil(spec.bounds[3] * resolution) + 4,
      bounds = [
        spec.bounds[0] - 2 / resolution,
        spec.bounds[1] - 2 / resolution,
        width / resolution,
        height / resolution,
      ];
    const templateKey = JSON.stringify([
      spec.text,
      width,
      height,
      spec.glyphIndices.map((i) => {
        const g = shape.glyphs[i];
        return [
          g.id,
          g.path,
          Math.round((g.x - spec.bounds[0]) * 1e5),
          Math.round((g.y - spec.bounds[1]) * 1e5),
        ];
      }),
    ]);
    const previous = templates.get(templateKey);
    if (previous) {
      const dx = bounds[0] - previous.bounds[0],
        dy = bounds[1] - previous.bounds[1],
        offset = strokes.length - previous.start;
      for (const stroke of previous.strokes) {
        const points = stroke.points.map(([x, y]) => [x + dx, y + dy]);
        pointCount += points.length;
        if (pointCount > MAX_POINTS || strokes.length >= MAX_STROKES)
          throw new Error('Animation exceeds guide limits');
        strokes.push({ ...stroke, id: `stroke-${strokes.length + 1}`, points });
      }
      const owners = new Uint16Array(previous.tile.owners.length);
      for (let i = 0; i < owners.length; i++)
        if (previous.tile.owners[i]) owners[i] = previous.tile.owners[i] + offset;
      tiles.push({
        glyphIndices: spec.glyphIndices.slice(),
        bounds,
        width,
        height,
        owners,
        progress: new Uint16Array(previous.tile.progress),
      });
      continue;
    }
    const { mask: ink, anchors } = raster(
        shape,
        spec.glyphIndices,
        bounds,
        width,
        height,
      ),
      skeleton = await thinInk(ink, width, height, signal),
      generated = await componentTrails(
        ink,
        graphTrails(skeleton, width, height),
        width,
        height,
        signal,
      );
    stop(signal);
    let adapted = null,
      sourceRecord = null,
      orderable = false;
    if (loader && Array.from(spec.text).length === 1) {
      const record = await loader(
        { text: spec.text, script: shape.script, language: shape.language },
        { signal },
      );
      stop(signal);
      if (record) {
        sourceRecord = record;
        const fitted = await registerSource(record, skeleton, ink, width, height, signal);
        if (fitted.declined) orderable = fitted.declined === 'fit';
        else adapted = fitted;
      } else if (shape.script === 'Hang')
        adapted = await registerKoreanPilot(
          spec.text,
          loader,
          shape,
          skeleton,
          ink,
          width,
          height,
          signal,
        );
    }
    // Three tiers, strongest first. A fit keeps the model's own geometry and is the
    // only one that can promise the drawn path is the taught path. Ordering keeps the
    // font's geometry and takes only the sequence from the model, which works on
    // letterforms no fit can reach. Generation keeps neither and orders by shape alone.
    // `orderable` is true only on a `fit` decline, which is the one decline that has
    // actually compared topology and found it equal. An allograph decline knows the
    // model is the wrong letterform; an untested decline never got far enough to know.
    // Both fall straight through to generation rather than lend an order.
    let byOrder = null;
    if (orderable) byOrder = orderGlyph(sourceRecord, skeleton, ink, width, height);
    const orderedTier = !adapted && !!byOrder;
    let trails = adapted?.trails || byOrder?.trails || generated.trails,
      kinds = adapted?.kinds || byOrder?.kinds || generated.kinds,
      sources = adapted?.source || byOrder?.source || [];
    if (!trails.length) {
      const at = ink.findIndex((n) => n);
      if (at < 0) throw new Error('A visible glyph component could not be rasterized');
      trails = [[[at % width, Math.floor(at / width)]]];
      kinds = ['dot'];
    }
    const start = strokes.length,
      coverage = dilateCoverage(ink, width, height);
    let assignment = await assignOwnership(
      coverage,
      skeleton,
      trails,
      width,
      height,
      start,
      signal,
    );
    // Preserve any disconnected ink missed by graph reduction as its own generated guide.
    if (coverage.some((v, i) => v && !assignment.owners[i])) {
      const missing = new Uint8Array(coverage.length);
      for (let i = 0; i < missing.length; i++)
        missing[i] = coverage[i] && !assignment.owners[i] ? 1 : 0;
      const extra = graphTrails(
        await thinInk(missing, width, height, signal),
        width,
        height,
      );
      for (const trail of extra) {
        trails.push(trail);
        kinds.push(trail.length === 1 ? 'dot' : 'curve');
        sources.push(undefined);
      }
      assignment = await assignOwnership(
        coverage,
        skeleton,
        trails,
        width,
        height,
        start,
        signal,
      );
    }
    if (adapted)
      await repairSourceJunctions(
        assignment,
        ink,
        trails,
        sources,
        width,
        height,
        start,
        signal,
      );
    await projectCurveProgress(assignment, trails, kinds, start, width, signal, ink);
    let retained = await normalizeOwnership(
      assignment,
      trails,
      kinds,
      start,
      width,
      signal,
    );
    if (adapted && adapted.source.some((source, i) => source && !retained.includes(i))) {
      // Missing ownership means this font does not preserve the source motor plan.
      trails = generated.trails;
      kinds = generated.kinds;
      sources = [];
      assignment = await assignOwnership(
        coverage,
        skeleton,
        trails,
        width,
        height,
        start,
        signal,
      );
      await projectCurveProgress(assignment, trails, kinds, start, width, signal, ink);
      retained = await normalizeOwnership(
        assignment,
        trails,
        kinds,
        start,
        width,
        signal,
      );
    }
    trails = retained.map((i) => trails[i]);
    kinds = retained.map((i) => kinds[i]);
    sources = retained.map((i) => sources[i]);
    if (strokes.length + trails.length > MAX_STROKES)
      throw new Error('Generated animation exceeds 8192 strokes');
    trails.forEach((trail, i) => {
      const points = trail.map(
        ([x, y]) =>
          anchors.get(Math.round(y) * width + Math.round(x)) || [
            bounds[0] + ((x + 0.5) * bounds[2]) / width,
            bounds[1] + bounds[3] - ((y + 0.5) * bounds[3]) / height,
          ],
      );
      pointCount += points.length;
      if (pointCount > MAX_POINTS)
        throw new Error('Generated animation exceeds 1 million points');
      const source = sources[i];
      strokes.push({
        id: `stroke-${strokes.length + 1}`,
        points,
        kind: kinds[i],
        provenance: source
          ? orderedTier
            ? 'source-ordered'
            : 'source-adapted'
          : 'generated',
        ...(source ? { source } : {}),
      });
    });
    if (coverage.some((v, i) => v && !assignment.owners[i]))
      throw new Error('Animation left unowned font ink');
    const tile = {
      glyphIndices: spec.glyphIndices.slice(),
      bounds,
      width,
      height,
      ...assignment,
    };
    tiles.push(tile);
    templates.set(templateKey, { bounds, start, strokes: strokes.slice(start), tile });
    stop(signal);
    await pause();
  }
  // The loop's last iteration ends on a pause, and a cancellation during it used to be
  // reported as a completed animation.
  stop(signal);
  const provenances = new Set(strokes.map((s) => s.provenance));
  return {
    schemaVersion: 1,
    shapeKey,
    provenance: provenances.size > 1 ? 'mixed' : strokes[0]?.provenance || 'generated',
    strokes,
    tiles,
  };
}
