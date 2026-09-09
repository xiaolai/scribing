import test from 'node:test';
import assert from 'node:assert/strict';
import {
  graphTrails,
  thinInk,
  componentTrails,
  assignOwnership,
  normalizeOwnership,
  dilateCoverage,
} from '../../extras/fonts/skeleton.mjs';
const mask = (rows) => Uint8Array.from(rows.join(''), (c) => (c === '#' ? 1 : 0));
test('near disconnected strokes retain a pen lift', () => {
  const rows = [
    '.......',
    '...#...',
    '...#...',
    '...#...',
    '.......',
    '...#...',
    '...#...',
    '...#...',
    '.......',
  ];
  const trails = graphTrails(mask(rows), 7, 9);
  assert.equal(trails.length, 2);
  assert(trails.every((t) => t.every((p) => p[1] < 4) || t.every((p) => p[1] > 4)));
});
test('closed medial loops remain deterministic and complete', () => {
  const m = mask([
    '.......',
    '..###..',
    '.#...#.',
    '.#...#.',
    '.#...#.',
    '..###..',
    '.......',
  ]);
  assert.deepEqual(graphTrails(m, 7, 7), graphTrails(m, 7, 7));
  assert(graphTrails(m, 7, 7).some((t) => t.length > 5));
});
test('compact dot grows radially rather than appearing all at once', async () => {
  const width = 25,
    height = 25,
    m = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (Math.hypot(x - 12, y - 12) < 8) m[y * width + x] = 1;
  const sk = await thinInk(m, width, height),
    g = await componentTrails(m, graphTrails(sk, width, height), width, height);
  assert.deepEqual(g.kinds, ['dot']);
  const a = await assignOwnership(
    dilateCoverage(m, width, height),
    sk,
    g.trails,
    width,
    height,
    0,
  );
  await normalizeOwnership(a, g.trails, g.kinds, 0, width);
  const times = Array.from(a.progress).filter((_, i) => a.owners[i]);
  assert.equal(Math.max(...times), 65535);
  assert(times.some((t) => t > 10000 && t < 55000));
});
test('thinning yields to cancellation during work', async () => {
  const signal = new AbortController(),
    m = new Uint8Array(512 * 512).fill(1);
  setTimeout(() => signal.abort(), 0);
  await assert.rejects(
    thinInk(m, 512, 512, signal.signal),
    (e) => e.name === 'AbortError',
  );
});
test('parallel thinning never deletes a complete compact component', async () => {
  const m = mask([
    '.......',
    '.......',
    '..##...',
    '..##...',
    '.......',
    '.....#.',
    '.......',
  ]);
  const sk = await thinInk(m, 7, 7);
  assert(
    sk.some(
      (v, i) =>
        v && i % 7 >= 2 && i % 7 <= 3 && Math.floor(i / 7) >= 2 && Math.floor(i / 7) <= 3,
    ),
  );
  assert.equal(sk[5 * 7 + 5], 1);
});
