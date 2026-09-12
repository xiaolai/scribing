import test from 'node:test';
import assert from 'node:assert/strict';
import {
  graphTrails,
  thinInk,
  componentTrails,
  assignOwnership,
  normalizeOwnership,
  dilateCoverage,
  holeCount,
  nearestSkeletonMap,
} from '../../extras/fonts/skeleton.mjs';
import yieldWork from '../../extras/fonts/yield-work.mjs';
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

test('mask helpers reject dimensions the mask cannot hold', async () => {
  // These index a flat mask as y * width + x. A mask shorter than width * height sent
  // holeCount into an unbounded loop: a write past the end of a typed array is silently
  // dropped, so a cell outside the mask was enqueued again on every visit.
  assert.throws(() => holeCount(new Uint8Array(1), 3, 3), /width \* height/);
  assert.throws(() => dilateCoverage(new Uint8Array(4), 3, 3), /width \* height/);
  assert.throws(() => holeCount(new Uint8Array(9), 0, 9), /width \* height/);
  await assert.rejects(
    () => nearestSkeletonMap(new Uint8Array(1), 3, 3),
    /width \* height/,
  );
});

test('holeCount still counts an enclosed hole', () => {
  const ring = mask(['#####', '#...#', '#...#', '#...#', '#####']);
  assert.equal(holeCount(ring, 5, 5), 1);
});

test('an already aborted request never builds a nearest map', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => nearestSkeletonMap(new Uint8Array(9), 3, 3, controller.signal),
    { name: 'AbortError' },
  );
});

/**
 * A mask of many trails that can never join.
 *
 * Joining compared every trail against every later one, so the cost was quadratic in
 * their number no matter how few joins were possible, and graphTrails is synchronous
 * with no checkpoint. This 300x300 mask yields ten thousand two-cell trails and took
 * over nine seconds of blocked main thread; the permitted tile is two hundred times
 * larger still. The timeout is the assertion — the endpoint index brings it to tens of
 * milliseconds, far enough below to be stable, while the scan cannot come close.
 */
test('joining stays cheap when no trail can join', { timeout: 3000 }, () => {
  const w = 300,
    h = 300;
  const ink = new Uint8Array(w * h);
  for (let y = 0; y + 1 < h; y += 3)
    for (let x = 0; x < w; x += 3) {
      ink[y * w + x] = 1;
      ink[(y + 1) * w + x] = 1;
    }
  const trails = graphTrails(ink, w, h);
  assert.equal(trails.length, 10000);
  assert.ok(
    trails.every((t) => t.length === 3),
    'every isolated domino stays one short trail rather than being joined',
  );
});

/**
 * An abort raised while a pass is suspended in its own final yield.
 *
 * Every loop here checks the signal before yielding and never after, so the last yield
 * of a pass had nothing behind it: the remaining work ran and the function resolved
 * successfully with the caller already cancelled. thinInk and nearestSkeletonMap always
 * checked before returning; these three did not.
 *
 * yieldWork is a MessageChannel post, and those are delivered in order, so awaiting one
 * tick here lands the abort inside a chosen yield rather than an arbitrary one.
 */
test('ownership assignment rejects an abort raised during its final yield', async () => {
  const coverage = new Uint8Array(9).fill(1);
  const skeleton = Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  const controller = new AbortController();
  const pass = assignOwnership(
    coverage,
    skeleton,
    [[[1, 1]]],
    3,
    3,
    0,
    controller.signal,
  );
  await yieldWork();
  controller.abort();
  await assert.rejects(() => pass, { name: 'AbortError' });
});

test('component trails reject an abort raised during their final yield', async () => {
  const ink = new Uint8Array(9).fill(1);
  const controller = new AbortController();
  const pass = componentTrails(ink, [], 3, 3, controller.signal);
  controller.abort();
  await assert.rejects(() => pass, { name: 'AbortError' });
});

test('ownership normalization rejects an abort raised during its final yield', async () => {
  const assignment = { owners: new Uint16Array(9), progress: new Uint16Array(9) };
  const controller = new AbortController();
  const pass = normalizeOwnership(assignment, [], [], 0, 3, controller.signal);
  await yieldWork();
  controller.abort();
  await assert.rejects(() => pass, { name: 'AbortError' });
});

test('ownership refuses more strokes than a 16-bit owner map can address', async () => {
  // owners is a Uint16Array where 0 means unowned, so an id past 65535 wraps to zero
  // and reads back as a cell nothing ever draws. Ids run `startIndex + index + 1`, so
  // the largest is `startIndex + trails.length`.
  const coverage = new Uint8Array(9);
  const skeleton = new Uint8Array(9);
  // 65535 is representable and only 0 is reserved, so this is the last usable id and
  // must be accepted; the bound used to stop one short and reject it.
  await assignOwnership(coverage, skeleton, [[[0, 0]]], 3, 3, 65534);
  await assert.rejects(
    () => assignOwnership(coverage, skeleton, [[[0, 0]]], 3, 3, 65535),
    /65535 strokes/,
  );
  await assert.rejects(
    () => assignOwnership(coverage, skeleton, [[[0, 0]]], 3, 3, -1),
    /65535 strokes/,
  );
});

test('ownership refuses a trail with non-finite points', async () => {
  const coverage = Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const skeleton = Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]);
  await assert.rejects(
    () =>
      assignOwnership(
        coverage,
        skeleton,
        [
          [
            [0, 0],
            [Infinity, 0],
          ],
        ],
        3,
        3,
        0,
      ),
    /finite trail points/,
  );
});

test('thinning reaches ink that touches the edge of the grid', async () => {
  // The passes need all eight neighbours and so skip the first and last row and column.
  // A mask whose ink runs to the edge kept a solid bar there: this block lost no cells
  // at all, against the one-cell-wide skeleton thinInk returns.
  const solid = new Uint8Array(25).fill(1);
  const touching = await thinInk(solid, 5, 5);
  assert.equal(
    Array.from(touching).filter(Boolean).length,
    1,
    'a solid block touching two edges thins to a single cell',
  );

  // A block with a clear border already worked, and must still give the same answer.
  const padded = mask([
    '.......',
    '.#####.',
    '.#####.',
    '.#####.',
    '.#####.',
    '.#####.',
    '.......',
  ]);
  assert.equal(Array.from(await thinInk(padded, 7, 7)).filter(Boolean).length, 1);
});

test('a Buffer input is copied, not aliased', () => {
  // Node's Buffer is a Uint8Array subclass whose `slice` returns a view over the same
  // memory. Both thinning and dilation copy their input with `slice`, so a Buffer
  // caller had its own grid rewritten and the dilation read cells it had just written.
  const width = 5,
    height = 5;
  const grid = Buffer.alloc(width * height);
  grid[2 * width + 2] = 1;
  const before = Uint8Array.from(grid);
  const out = dilateCoverage(grid, width, height);
  assert.deepEqual(Uint8Array.from(grid), before, 'the caller’s mask is not modified');
  assert.notEqual(out.buffer, grid.buffer, 'the result owns its storage');
  // One cell dilates to exactly its 3x3 neighbourhood, never further.
  assert.equal(
    out.reduce((n, v) => n + v, 0),
    9,
  );
});
