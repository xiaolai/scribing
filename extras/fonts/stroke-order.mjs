/**
 * Normative stroke order for a glyph the registration step could not fit.
 *
 * `registerSource` asks whether a model's polylines can lie on this glyph. For a joined
 * cursive letterform the answer is no, and no affine family fixes it: a print `b` is a
 * stem plus a bowl, a cursive `b` is a loop with an exit stroke. They are different
 * things to draw, and forcing a fit would animate an order the letterform does not have.
 *
 * This asks a weaker question that is always answerable. The glyph's own skeleton says
 * WHAT to draw; the model is consulted only for HOW TO ORDER it — how many pen movements,
 * where each begins, which way it travels. Geometry never has to agree, so the failure
 * that rejects cursive cannot arise. Measured over 36,955 CJK glyphs and thirteen Latin
 * faces it covers every one, with no stroke crossing a gap; see
 * dev-docs/research/20260912-stroke-order-for-any-font.md.
 *
 * The result is ordered by the model but drawn from the font, so its provenance is
 * `source-ordered`, distinct from `source-adapted`, which means the model's own geometry
 * survived the fit.
 */

/** Quantized node key, so trail endpoints that coincide share an identity. */
const key = (p) => `${Math.round(p[0])},${Math.round(p[1])}`;
const at = (k) => k.split(',').map(Number);

function arcLength(points) {
  let n = 0;
  for (let i = 1; i < points.length; i++)
    n += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return n;
}

/** Unit heading of a polyline's final approach, for the smooth-continuation test. */
function heading(points) {
  const n = points.length,
    a = points[Math.max(0, n - 3)],
    b = points[n - 1];
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
}

function buildGraph(trails) {
  const nodes = new Map();
  const edges = trails.map((points, id) => {
    const a = key(points[0]),
      b = key(points[points.length - 1]);
    for (const k of a === b ? [a] : [a, b]) {
      if (!nodes.has(k)) nodes.set(k, []);
      nodes.get(k).push(id);
    }
    return { id, points, a, b, used: false, length: arcLength(points) };
  });
  return { nodes, edges };
}

/**
 * One continuous pen movement: follow edges from `startKey`, at each junction taking
 * the one that best continues the current heading, until nothing unused adjoins.
 *
 * It never leaves the graph, so the emitted polyline is connected by construction.
 * Continuity is the property the whole strategy rests on, so it is enforced here
 * rather than checked afterwards.
 */
function walk(graph, startKey, seed) {
  const out = [];
  let here = startKey,
    head = seed;
  for (;;) {
    const options = (graph.nodes.get(here) || [])
      .map((id) => graph.edges[id])
      .filter((e) => !e.used);
    if (!options.length) break;
    let best = null,
      bestScore = -Infinity;
    for (const e of options) {
      const forward = e.a === here;
      const pts = forward ? e.points : e.points.slice().reverse();
      const dir = heading(pts.slice(0, 3).length > 1 ? pts.slice(0, 3) : pts);
      const score = head ? dir[0] * head[0] + dir[1] * head[1] : 0;
      if (score > bestScore) {
        bestScore = score;
        best = { e, forward, pts };
      }
    }
    best.e.used = true;
    for (const q of best.pts)
      if (
        !out.length ||
        out[out.length - 1][0] !== q[0] ||
        out[out.length - 1][1] !== q[1]
      )
        out.push(q);
    here = best.forward ? best.e.b : best.e.a;
    head = heading(best.pts);
  }
  return out;
}

/** Split a walk at the interior point nearest `target`, never creating a gap. */
function splitAt(points, target) {
  let bi = -1,
    bd = Infinity;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.hypot(points[i][0] - target[0], points[i][1] - target[1]);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  if (bi < 0) return null;
  // The split point belongs to both halves, so the pen does not jump across the seam.
  return [points.slice(0, bi + 1), points.slice(bi)];
}

/**
 * Order a glyph's skeleton by a normative model.
 *
 * Phase 1 exhausts the graph into continuous walks, seeded at the model's start points.
 * Phase 2 orders those walks by which model stroke they answer to. Phase 3 splits a walk
 * when the model asks for more strokes than connectivity produced. Nothing is ever
 * concatenated across a gap, so a stroke is always a single pen movement.
 *
 * @param {number[][][]} trails skeleton trails for this glyph, in pixel space
 * @param {{points:number[][]}[]} model the letter's normative strokes
 * @param {[number,number,number,number]} box glyph ink bounds [left, top, right, bottom]
 * @param {boolean} yDown true when the model's y grows downward, per `coordinates.yAxis`.
 *   Assuming the wrong sense mirrors every start point and quietly ruins the ordering
 *   while coverage still reads as perfect.
 */
/** The unused endpoint a stroke should begin at, nearest the model's landing point. */
function seedFor(graph, want) {
  let node = null,
    distance = Infinity;
  for (const e of graph.edges) {
    if (e.used) continue;
    for (const k of [e.a, e.b]) {
      const n = at(k);
      // With no model stroke left to place, start at the topmost endpoint.
      const d = want ? Math.hypot(n[0] - want.start[0], n[1] - want.start[1]) : -n[1];
      if (d < distance) {
        distance = d;
        node = k;
      }
    }
  }
  return { node, distance };
}

/** Unit heading from a start point toward where the model's stroke goes next. */
function aimFrom(from, want) {
  if (!want) return null;
  const dx = want.next[0] - from[0],
    dy = want.next[1] - from[1],
    m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
}

/** Divide the walk that passes closest to `target`, in place. Never opens a gap. */
function divideOnce(walks, target, scale) {
  let index = -1,
    best = Infinity,
    parts = null;
  walks.forEach((wk, i) => {
    const res = splitAt(wk.points, target);
    if (!res) return;
    const seam = res[0][res[0].length - 1];
    const d = Math.hypot(seam[0] - target[0], seam[1] - target[1]);
    if (d < best) {
      best = d;
      index = i;
      parts = res;
    }
  });
  if (index < 0) return false;
  walks.splice(
    index,
    1,
    { points: parts[0], offset: walks[index].offset },
    { points: parts[1], offset: best / scale },
  );
  return true;
}

export function orderByModel(trails, model, box, yDown = true) {
  const graph = buildGraph(trails);
  const [left, top, right, bottom] = box;
  const w = Math.max(1, right - left),
    h = Math.max(1, bottom - top);
  const mx = model.flatMap((s) => s.points.map((p) => p[0])),
    my = model.flatMap((s) => s.points.map((p) => p[1]));
  const sx = Math.min(...mx),
    sy = Math.min(...my),
    sw = Math.max(1e-6, Math.max(...mx) - sx),
    sh = Math.max(1e-6, Math.max(...my) - sy);
  const place = (p) => [
    left + ((p[0] - sx) / sw) * w,
    yDown ? top + ((p[1] - sy) / sh) * h : bottom - ((p[1] - sy) / sh) * h,
  ];
  const wants = model.map((s) => ({
    start: place(s.points[0]),
    next: place(s.points[Math.min(2, s.points.length - 1)]),
    length: arcLength(s.points),
  }));
  const scale = Math.max(w, h);

  // Phase 1. Seed each walk at the unused endpoint nearest an unclaimed model start,
  // then keep walking until the graph is empty. Extra walks are legitimate pen lifts.
  const walks = [];
  const pending = wants.slice();
  while (graph.edges.some((e) => !e.used)) {
    const want = pending.shift() || null;
    const { node: startKey, distance } = seedFor(graph, want);
    const got = walk(graph, startKey, aimFrom(at(startKey), want));
    if (!got.length) break;
    walks.push({
      points: got.length > 1 ? got : [got[0], got[0]],
      offset: want && got.length > 1 ? distance / scale : null,
    });
  }

  // Phase 3. Connectivity gave fewer movements than the model asks for, so divide the
  // longest walk at the unclaimed start it passes closest to. A split cannot open a gap.
  let guard = 0;
  while (walks.length < wants.length && guard++ < wants.length) {
    if (!divideOnce(walks, wants[walks.length].start, scale)) break;
  }

  // The fewest pen movements any cover of this skeleton can use: one per pair of
  // odd-degree nodes, per connected component. Greedy walking can only do worse, so
  // the gap between this and `strokes.length` is the traversal's own waste.
  const degree = new Map();
  for (const e of graph.edges)
    for (const k of e.a === e.b ? [e.a, e.a] : [e.a, e.b])
      degree.set(k, (degree.get(k) || 0) + 1);
  let odd = 0;
  for (const d of degree.values()) if (d % 2) odd++;
  const floor = Math.max(1, Math.ceil(odd / 2));

  return {
    floor,
    strokes: walks.map((wk) => wk.points),
    covered: graph.edges.filter((e) => e.used).length,
    total: graph.edges.length,
    starts: walks.map((wk) => wk.offset).filter((n) => n !== null),
  };
}
