import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignOwnership,
  dilateCoverage,
  repairSourceJunctions,
} from '../../extras/fonts/skeleton.mjs';
const width = 81,
  height = 81;
const line = (x1, y1, x2, y2) =>
  Array.from({ length: Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) + 1 }, (_, i) => {
    const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    return [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n];
  });
async function prepare(trails, rects) {
  const ink = new Uint8Array(width * height),
    skeleton = new Uint8Array(ink.length);
  for (const [x1, y1, x2, y2] of rects)
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) ink[y * width + x] = 1;
  for (const trail of trails)
    for (const [x, y] of trail) skeleton[Math.round(y) * width + Math.round(x)] = 1;
  return {
    ink,
    assignment: await assignOwnership(
      dilateCoverage(ink, width, height),
      skeleton,
      trails,
      width,
      height,
      0,
    ),
  };
}
test('plus junction completes the first stem and delays the horizontal wings', async () => {
  const trails = [line(40, 5, 40, 75), line(10, 40, 70, 40)],
    { ink, assignment } = await prepare(trails, [
      [36, 5, 44, 75],
      [10, 36, 70, 44],
    ]),
    before = assignment.owners.slice();
  await repairSourceJunctions(assignment, ink, trails, [{}, {}], width, height, 0);
  let changed = 0;
  for (let y = 6; y < 75; y++)
    for (let x = 37; x < 44; x++) assert.equal(assignment.owners[y * width + x], 1);
  for (let y = 37; y < 44; y++)
    for (const x of [15, 25, 55, 65]) assert.equal(assignment.owners[y * width + x], 2);
  for (let i = 0; i < before.length; i++)
    if (before[i] === 2 && assignment.owners[i] === 1) {
      changed++;
      assert(assignment.progress[i] > 65535 * 0.25);
      assert(
        Math.abs(assignment.progress[i] / 65535 - (Math.floor(i / width) - 5) / 70) <
          0.0001,
      );
    }
  assert(changed > 0);
  assert(Math.abs(assignment.progress[40 * width + 40] / 65535 - 0.5) < 0.02);
});
test('T junction completes the earlier bar without drawing the later stem', async () => {
  const trails = [line(10, 10, 70, 10), line(40, 10, 40, 75)],
    { ink, assignment } = await prepare(trails, [
      [10, 6, 70, 14],
      [36, 10, 44, 75],
    ]);
  await repairSourceJunctions(assignment, ink, trails, [{}, {}], width, height, 0);
  for (let y = 7; y < 14; y++)
    for (let x = 11; x < 70; x++) assert.equal(assignment.owners[y * width + x], 1);
  for (let y = 25; y < 70; y++) assert.equal(assignment.owners[y * width + 40], 2);
});
for (const [name, trails, rects, sources] of [
  [
    'parallel',
    [line(25, 5, 25, 75), line(40, 5, 40, 75)],
    [
      [22, 5, 28, 75],
      [37, 5, 43, 75],
    ],
    [{}, {}],
  ],
  [
    'near-parallel crossing',
    [line(25, 5, 25, 75), line(20, 5, 30, 75)],
    [
      [22, 5, 28, 75],
      [17, 5, 33, 75],
    ],
    [{}, {}],
  ],
  [
    'disconnected',
    [line(40, 5, 40, 30), line(48, 40, 75, 40)],
    [
      [37, 5, 43, 30],
      [48, 37, 75, 43],
    ],
    [{}, {}],
  ],
  [
    'generated',
    [line(40, 5, 40, 75), line(10, 40, 70, 40)],
    [
      [36, 5, 44, 75],
      [10, 36, 70, 44],
    ],
    [undefined, undefined],
  ],
])
  test(name + ' ownership is unchanged', async () => {
    const { ink, assignment } = await prepare(trails, rects),
      owners = assignment.owners.slice(),
      progress = assignment.progress.slice();
    await repairSourceJunctions(assignment, ink, trails, sources, width, height, 0);
    assert.deepEqual(assignment.owners, owners);
    assert.deepEqual(assignment.progress, progress);
  });

test('a run that exhausts its work budget commits nothing from the pair it was on', async () => {
  // Repairs are committed pair by pair. When the budget runs out mid-pair, the pair in
  // progress is abandoned and every pair committed before it stands; nothing pinned
  // either half of that, so a partial commit would have gone unnoticed.
  const trails = [line(40, 5, 40, 75), line(10, 40, 70, 40)];
  const rects = [
    [36, 5, 44, 75],
    [10, 36, 70, 44],
  ];

  const full = await prepare(trails, rects);
  await repairSourceJunctions(
    full.assignment,
    full.ink,
    trails,
    [{}, {}],
    width,
    height,
    0,
  );
  const repaired = full.assignment.owners.slice();

  const starved = await prepare(trails, rects);
  const before = starved.assignment.owners.slice();
  // One operation is not enough to finish the only pair there is.
  await repairSourceJunctions(
    starved.assignment,
    starved.ink,
    trails,
    [{}, {}],
    width,
    height,
    0,
    undefined,
    1,
  );

  assert.deepEqual(starved.assignment.owners, before);
  assert.notDeepEqual(repaired, before);
});
