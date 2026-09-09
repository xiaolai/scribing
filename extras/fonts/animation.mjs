import { projectCurveProgress } from './progress.mjs';
import pathGeometry, { contourProbes } from './path-geometry.mjs';
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
  MAX_POINTS = 1000000;
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
function validSourceRecord(record) {
  const u = record?.unit;
  if (
    !plain(record) ||
    typeof record.packId !== 'string' ||
    typeof record.unitId !== 'string' ||
    !plain(u) ||
    !plain(u.coordinates) ||
    !Number.isFinite(u.coordinates.em) ||
    u.coordinates.em <= 0 ||
    !['up', 'down'].includes(u.coordinates.yAxis) ||
    !Array.isArray(u.motorStrokes) ||
    !u.motorStrokes.length ||
    u.motorStrokes.length > MAX_STROKES ||
    !Array.isArray(u.plans) ||
    typeof u.defaultPlanId !== 'string'
  )
    return false;
  const ids = new Set();
  let points = 0;
  for (const stroke of u.motorStrokes) {
    if (!plain(stroke) || typeof stroke.id !== 'string' || ids.has(stroke.id))
      return false;
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
      typeof plan.id !== 'string' ||
      !plan.id ||
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
export function createMotorSourceLoader({
  baseUrl = new URL('../../', import.meta.url),
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  let index;
  const cache = new Map();
  return async ({ text, script, language }, { signal } = {}) => {
    stop(signal);
    const group =
      script === 'Latn'
        ? 'english'
        : script === 'Hang'
          ? 'korean'
          : language.startsWith('ja')
            ? 'japanese'
            : language.startsWith('zh')
              ? 'chinese'
              : null;
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
      } catch {
        throw error('JSON', `The ${group} stroke source contains invalid JSON.`);
      }
    };
    try {
      if (!index) {
        const response = await request('fonts/motor/index.json');
        let candidate;
        try {
          candidate = await response.json();
        } catch {
          stop(signal);
          throw error('JSON', 'The stroke source index contains invalid JSON.');
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
          bytes = await response.arrayBuffer();
        } catch {
          stop(signal);
          throw error('NETWORK', `The ${group} stroke source could not be read.`);
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
      const value = units[text];
      let record = value;
      if (group === 'chinese') {
        if (
          !Array.isArray(value) ||
          !value.length ||
          value.length > MAX_STROKES ||
          !value.every(
            (points) =>
              Array.isArray(points) && points.length && points.every(sourcePoint),
          )
        )
          throw error('SCHEMA', 'The Chinese stroke source has invalid median data.');
        record = {
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
            plans: [
              { id: 'source', steps: value.map((_, i) => ({ strokeId: `s${i + 1}` })) },
            ],
          },
        };
      }
      if (!validSourceRecord(record))
        throw error('SCHEMA', `The ${group} stroke source has an invalid writing unit.`);
      return record;
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
      for (const point of contourProbes(box, h / height, (px, py) =>
        ctx.isPointInPath(path, px, py, 'nonzero'),
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
function resample(points, step = 2) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 1; j <= n; j++)
      out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
  }
  return out;
}
async function registerSource(record, skeleton, ink, width, height, signal) {
  const unit = record?.unit;
  if (!unit?.motorStrokes?.length || unit.motorStrokes.length > MAX_STROKES) return null;
  const plan = unit.plans?.find((p) => p.id === unit.defaultPlanId);
  if (!plan || plan.steps.length !== unit.motorStrokes.length) return null;
  const sign = unit.coordinates.yAxis === 'up' ? 1 : -1;
  const source = plan.steps.map((step) => {
    const s = unit.motorStrokes.find((stroke) => stroke.id === step.strokeId);
    return (
      s && {
        id: s.id,
        kind: s.kind,
        points: (s.kind === 'dot' ? [s.center] : s.points).map(([x, y]) => [x, y * sign]),
      }
    );
  });
  if (source.some((s) => !s)) return null;
  const src = source.flatMap((s) => s.points),
    active = [];
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) active.push(i);
  if (!active.length) return null;
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
    return null;
  // Fit the source body to stems rather than letting terminal serif tips set its width.
  // This bounded frame search changes registration only; all original ink remains owned.
  const nearest = await nearestSkeletonMap(skeleton, width, height, signal);
  const project = (scaleX, offsetX) =>
    source.map((s) =>
      resample(
        s.points.map(([x, y]) => [
          sw
            ? (tx + tr) / 2 +
              offsetX * (tr - tx) +
              ((x - sx) / sw - 0.5) * (tr - tx) * scaleX
            : (tx + tr) / 2,
          sh ? tb - ((y - sy) / sh) * (tb - ty) : (ty + tb) / 2,
        ]),
      ),
    );
  let trails = project(1, 0),
    best = Infinity;
  for (const scaleX of [1, 0.95, 0.9, 0.85, 0.8])
    for (const offsetX of [0, -0.025, 0.025]) {
      const candidate = project(scaleX, offsetX),
        d = [];
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
  if (holeCount(sourceMask, width, height) !== holeCount(ink, width, height)) return null;
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
  if (mean > span * 0.065 || p95 > span * 0.15) return null;
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
      if (!parent.has(end)) return null;
      const route = [];
      for (let k = end; k !== begin; k = parent.get(k))
        route.push([k % width, Math.floor(k / width)]);
      routed.push(...route.reverse());
    }
    snapped[n] = routed;
  }
  if (snapped.some((trail, i) => source[i].kind === 'curve' && trail.length < 2))
    return null;
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
  const pilots = { 가: ['ㄱ', 'ㅏ'], 한: ['ㅎ', 'ㅏ', 'ㄴ'], 글: ['ㄱ', 'ㅡ', 'ㄹ'] };
  const letters = pilots[text];
  if (!letters) return null;
  // These three declared Unicode compositions are the complete syllable pilot.
  const expected = { 가: [0, 0, 0], 한: [18, 0, 4], 글: [0, 18, 8] },
    n = text.codePointAt(0) - 0xac00;
  if (
    JSON.stringify([Math.floor(n / 588), Math.floor(n / 28) % 21, n % 28]) !==
    JSON.stringify(expected[text])
  )
    return null;
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
  const w = right - left,
    h = bottom - top;
  let regions;
  if (text === '가') {
    const x = cut('x', left + w * 0.42, left + w * 0.68, top, bottom);
    regions = [
      [left, top, x, bottom],
      [x + 1, top, right, bottom],
    ];
  } else if (text === '한') {
    const y = cut('y', top + h * 0.6, top + h * 0.79, left, right),
      x = cut('x', left + w * 0.42, left + w * 0.69, top, y);
    regions = [
      [left, top, x, y],
      [x + 1, top, right, y],
      [left, y + 1, right, bottom],
    ];
  } else {
    // Identify the actual wide ㅡ band first; a broad valley search can otherwise
    // put that vowel into the initial ㄱ region and leave an empty middle region.
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
    const y1 = cut('y', Math.max(top, first - h * 0.12), first - 1, left, right),
      y2 = cut('y', last + 1, Math.min(bottom, last + h * 0.12), left, right);
    if (y1 >= first || y2 <= last) return null;
    regions = [
      [left, top, right, y1],
      [left, y1 + 1, right, y2],
      [left, y2 + 1, right, bottom],
    ];
  }
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
    if (fitted) {
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
    let adapted = null;
    if (loader && Array.from(spec.text).length === 1) {
      const record = await loader(
        { text: spec.text, script: shape.script, language: shape.language },
        { signal },
      );
      stop(signal);
      if (record)
        adapted = await registerSource(record, skeleton, ink, width, height, signal);
      else if (shape.script === 'Hang')
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
    let trails = adapted?.trails || generated.trails,
      kinds = adapted?.kinds || generated.kinds,
      sources = adapted?.source || [];
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
        provenance: source ? 'source-adapted' : 'generated',
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
  const provenances = new Set(strokes.map((s) => s.provenance));
  return {
    schemaVersion: 1,
    shapeKey,
    provenance: provenances.size > 1 ? 'mixed' : strokes[0]?.provenance || 'generated',
    strokes,
    tiles,
  };
}
