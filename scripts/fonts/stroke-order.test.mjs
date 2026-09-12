import test from 'node:test';
import assert from 'node:assert/strict';
import { orderByModel } from '../../extras/fonts/stroke-order.mjs';

/**
 * Ordering a glyph's own skeleton by a normative model.
 *
 * The properties that matter are coverage and continuity. An earlier version of this
 * reached full coverage while its strokes teleported across the glyph, because leftover
 * edges were appended to whichever stroke ended nearest. Coverage alone is not evidence.
 */

/** Two separate horizontal bars, the lower one longer. */
const twoBars = () => [
  [
    [10, 20],
    [30, 20],
    [50, 20],
  ],
  [
    [10, 60],
    [40, 60],
    [70, 60],
  ],
];

/** An L: one vertical trail meeting one horizontal trail at a shared corner. */
const elbow = () => [
  [
    [20, 10],
    [20, 40],
    [20, 70],
  ],
  [
    [20, 70],
    [50, 70],
    [80, 70],
  ],
];

const model = (...starts) =>
  starts.map(([x1, y1, x2, y2]) => ({
    points: [
      [x1, y1],
      [x2, y2],
    ],
  }));

/**
 * Largest step between consecutive points.
 *
 * The invariant is comparative, not absolute: walking may not introduce a gap wider than
 * the input trails already contain. An absolute threshold would only measure how coarsely
 * the fixture was written.
 */
const maxGap = (polylines) => {
  let worst = 0;
  for (const s of polylines)
    for (let i = 1; i < s.length; i++)
      worst = Math.max(worst, Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  return worst;
};

test('every skeleton edge is drawn exactly once', () => {
  const trails = twoBars();
  const res = orderByModel(
    trails,
    model([0, 0, 100, 0], [0, 100, 100, 100]),
    [10, 20, 70, 60],
  );
  assert.equal(res.covered, res.total, 'no edge left undrawn');
  assert.equal(res.total, 2);
});

test('a stroke never jumps across the glyph', () => {
  // Disconnected bars must become separate strokes rather than one stroke that teleports.
  const trails = twoBars();
  const res = orderByModel(
    trails,
    model([0, 0, 100, 0], [0, 100, 100, 100]),
    [10, 20, 70, 60],
  );
  assert.equal(res.strokes.length, 2);
  assert.ok(
    maxGap(res.strokes) <= maxGap(trails),
    `largest emitted gap ${maxGap(res.strokes)} exceeds the input's ${maxGap(trails)}`,
  );
});

test('the model decides which bar is drawn first', () => {
  const box = [10, 20, 70, 60];
  // y grows downward, so a model starting high on the page should pick the upper bar.
  const top = orderByModel(
    twoBars(),
    model([0, 0, 100, 0], [0, 100, 100, 100]),
    box,
    true,
  );
  assert.ok(
    top.strokes[0].some((p) => p[1] === 20),
    'upper bar drawn first',
  );
  const bottom = orderByModel(
    twoBars(),
    model([0, 100, 100, 100], [0, 0, 100, 0]),
    box,
    true,
  );
  assert.ok(
    bottom.strokes[0].some((p) => p[1] === 60),
    'lower bar drawn first',
  );
});

test('the declared y axis is honoured', () => {
  const box = [10, 20, 70, 60];
  const down = orderByModel(
    twoBars(),
    model([0, 0, 100, 0], [0, 100, 100, 100]),
    box,
    true,
  );
  const up = orderByModel(
    twoBars(),
    model([0, 0, 100, 0], [0, 100, 100, 100]),
    box,
    false,
  );
  // The same model read with the opposite axis must start at the opposite bar.
  assert.notEqual(down.strokes[0][0][1], up.strokes[0][0][1]);
});

test('connected trails become one continuous movement', () => {
  // A model asking for a single stroke should get the whole elbow walked in one go.
  const trails = elbow();
  const res = orderByModel(trails, model([0, 0, 100, 100]), [20, 10, 80, 70]);
  assert.equal(res.strokes.length, 1);
  assert.equal(res.covered, 2);
  assert.ok(maxGap(res.strokes) <= maxGap(trails), 'the corner is traversed, not jumped');
});

test('a model wanting more strokes splits the walk rather than tearing it', () => {
  const res = orderByModel(
    elbow(),
    model([20, 10, 20, 40], [40, 70, 80, 70]),
    [20, 10, 80, 70],
  );
  assert.equal(res.strokes.length, 2);
  assert.equal(res.covered, 2);
  // A split shares its seam point, so the two halves still meet.
  const seam = res.strokes[0][res.strokes[0].length - 1];
  const next = res.strokes[1][0];
  assert.deepEqual(seam, next, 'the split point belongs to both halves');
});

test('the topological floor is reported for the caller to judge fragmentation', () => {
  const res = orderByModel(
    twoBars(),
    model([0, 0, 100, 0], [0, 100, 100, 100]),
    [10, 20, 70, 60],
  );
  // Two disjoint open trails cannot be covered by fewer than two pen movements.
  assert.equal(res.floor, 2);
});

/**
 * The runtime tier that binds a motor record to a glyph's raster.
 *
 * It takes plain typed arrays, so it is reachable without a browser even though the
 * pipeline only calls it after rasterizing.
 */
const { orderGlyph } = await import('../../extras/fonts/animation.mjs');

/** A plus sign: one horizontal bar and one vertical bar crossing at the centre. */
const plusRaster = (size = 40) => {
  const ink = new Uint8Array(size * size);
  const skeleton = new Uint8Array(size * size);
  const mid = size >> 1;
  for (let x = 8; x < size - 8; x++) {
    skeleton[mid * size + x] = 1;
    for (let dy = -2; dy <= 2; dy++) ink[(mid + dy) * size + x] = 1;
  }
  for (let y = 8; y < size - 8; y++) {
    skeleton[y * size + mid] = 1;
    for (let dx = -2; dx <= 2; dx++) ink[y * size + mid + dx] = 1;
  }
  return { ink, skeleton, size };
};

const record = (strokes) => ({
  packId: 'p',
  unitId: 'u',
  unit: {
    coordinates: { em: 100, yAxis: 'down' },
    motorStrokes: strokes.map((points, i) => ({
      id: `s${i + 1}`,
      kind: 'curve',
      points,
    })),
    defaultPlanId: 'plan',
    plans: [{ id: 'plan', steps: strokes.map((_p, i) => ({ strokeId: `s${i + 1}` })) }],
  },
});

test('orderGlyph returns strokes that each name the unit that ordered them', () => {
  const { ink, skeleton, size } = plusRaster();
  const res = orderGlyph(
    record([
      [
        [0, 50],
        [100, 50],
      ],
      [
        [50, 0],
        [50, 100],
      ],
    ]),
    skeleton,
    ink,
    size,
    size,
  );
  assert.ok(res, 'a raster with ink produces an ordering');
  assert.ok(res.trails.length >= 1);
  assert.equal(res.trails.length, res.kinds.length);
  assert.equal(res.trails.length, res.source.length);
  for (const src of res.source) {
    assert.equal(src.packId, 'p');
    assert.equal(src.unitId, 'u');
    assert.equal(src.planId, 'plan');
    assert.match(src.strokeId, /^s\d+$/);
  }
});

test('orderGlyph declines a record it cannot read, rather than guessing', () => {
  const { ink, skeleton, size } = plusRaster();
  assert.equal(orderGlyph(null, skeleton, ink, size, size), null);
  assert.equal(
    orderGlyph({ unit: { motorStrokes: [] } }, skeleton, ink, size, size),
    null,
  );
  // A plan naming a stroke the unit does not define is not something to improvise around.
  const broken = record([
    [
      [0, 50],
      [100, 50],
    ],
  ]);
  broken.unit.plans[0].steps = [{ strokeId: 'missing' }];
  assert.equal(orderGlyph(broken, skeleton, ink, size, size), null);
});

test('orderGlyph declines an empty raster', () => {
  const size = 20;
  assert.equal(
    orderGlyph(
      record([
        [
          [0, 0],
          [10, 10],
        ],
      ]),
      new Uint8Array(size * size),
      new Uint8Array(size * size),
      size,
      size,
    ),
    null,
  );
});
