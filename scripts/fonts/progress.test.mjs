import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCurveProgress, fitTerminalShaft } from '../../extras/fonts/progress.mjs';
const width = 81,
  height = 81;
const fixture = (rects, points) => {
  const owners = new Uint16Array(width * height),
    ink = new Uint8Array(owners.length),
    progress = new Uint16Array(owners.length);
  for (const [x1, y1, x2, y2] of rects)
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++) {
        owners[y * width + x] = 1;
        ink[y * width + x] = 1;
      }
  return { assignment: { owners, progress }, ink, trails: [points] };
};
test('horizontal geometric front is straight across the full width; owners and public guides unchanged', async () => {
  const f = fixture(
      [[5, 30, 75, 50]],
      [
        [15, 40],
        [65, 40],
      ],
    ),
    owners = f.assignment.owners.slice(),
    paths = JSON.stringify(f.trails);
  await projectCurveProgress(
    f.assignment,
    f.trails,
    ['curve'],
    0,
    width,
    undefined,
    f.ink,
  );
  assert.deepEqual(f.assignment.owners, owners);
  assert.equal(JSON.stringify(f.trails), paths);
  for (let x = 5; x <= 75; x++)
    for (let y = 30; y <= 50; y++)
      assert.equal(
        f.assignment.progress[y * width + x],
        f.assignment.progress[40 * width + x],
      );
  assert(f.assignment.progress[40 * width + 10] < f.assignment.progress[40 * width + 15]);
  assert(f.assignment.progress[40 * width + 70] > f.assignment.progress[40 * width + 65]);
});
test('diagonal projections share perpendicular cross sections', async () => {
  const f = fixture(
    [[10, 10, 65, 65]],
    [
      [10, 10],
      [65, 65],
    ],
  );
  await projectCurveProgress(f.assignment, f.trails, ['curve'], 0, width);
  for (let k = 20; k < 50; k++)
    assert.equal(
      f.assignment.progress[(k + 2) * width + k - 2],
      f.assignment.progress[k * width + k],
    );
});
test('turn cap spreads the outside L corner over time instead of one vertex plateau', async () => {
  const f = fixture(
    [
      [6, 5, 14, 44],
      [6, 36, 70, 44],
    ],
    [
      [10, 5],
      [10, 40],
      [70, 40],
    ],
  );
  await projectCurveProgress(
    f.assignment,
    f.trails,
    ['curve'],
    0,
    width,
    undefined,
    f.ink,
  );
  const values = new Set();
  for (let y = 40; y <= 44; y++)
    for (let x = 6; x <= 10; x++) values.add(f.assignment.progress[y * width + x]);
  assert(values.size > 10, `corner has only ${values.size} times`);
});
test('radial dots retain their previous time field', async () => {
  const f = fixture([[30, 30, 50, 50]], [[40, 40]]);
  f.assignment.progress.fill(1234);
  await projectCurveProgress(f.assignment, f.trails, ['dot'], 0, width, undefined, f.ink);
  assert(f.assignment.progress.every((p) => p === 1234));
});
test('projection yields and observes cancellation', async () => {
  const f = fixture(
      [[1, 1, 79, 79]],
      [
        [1, 1],
        [79, 79],
      ],
    ),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(
    projectCurveProgress(f.assignment, f.trails, ['curve'], 0, width, controller.signal),
    { name: 'AbortError' },
  );
});

test('a terminal shaft with no spread is declined rather than guessed', () => {
  // Repeated source points leave every sample on top of the others, so the covariance is
  // all zeros. atan2(0, 0) is 0 in JavaScript, which used to yield a horizontal tangent
  // with no geometric basis; the residual check could not catch it because every residual
  // is zero as well.
  const flat = [
    [0, 0],
    [10, 0],
    [10, 0],
    [10, 0],
    [10, 0],
  ];
  assert.equal(fitTerminalShaft(flat, false, 5), null);
  // A real shaft still fits: unit spacing puts five samples inside the radius window.
  const real = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
    [6, 0],
    [7, 0],
  ];
  const fit = fitTerminalShaft(real, false, 2);
  assert.ok(fit, 'a straight shaft still produces a fit');
  assert.ok(Math.abs(Math.abs(fit.tangent[0]) - 1) < 1e-9, 'tangent runs along x');
});

test("a neighbouring stroke's ink does not change this stroke's progress", async () => {
  // An L with a corner, and two other strokes placed against the two sides that limit
  // the corner's measured radius. The turn and terminal probes tested the glyph-wide ink
  // mask, so those neighbours let the radius keep growing and moved stroke one's clock by
  // up to 1,892 of 65,535 across 275 of its cells. Nothing about stroke one should depend
  // on whether stroke two and three are beside it.
  const build = (withNeighbours) => {
    const owners = new Uint16Array(width * height),
      ink = new Uint8Array(owners.length),
      progress = new Uint16Array(owners.length);
    const box = (x1, y1, x2, y2, owner) => {
      for (let y = y1; y <= y2; y++)
        for (let x = x1; x <= x2; x++) {
          owners[y * width + x] = owner;
          ink[y * width + x] = 1;
        }
    };
    box(10, 20, 40, 24, 1);
    box(36, 20, 40, 50, 1);
    const trails = [
      [
        [12, 22],
        [38, 22],
        [38, 48],
      ],
    ];
    const kinds = ['curve'];
    if (withNeighbours) {
      box(41, 20, 55, 24, 2);
      box(10, 14, 40, 19, 3);
      trails.push(
        [
          [42, 22],
          [54, 22],
        ],
        [
          [12, 16],
          [38, 16],
        ],
      );
      kinds.push('curve', 'curve');
    }
    return { assignment: { owners, progress }, ink, trails, kinds };
  };
  const run = async (f) => {
    await projectCurveProgress(
      f.assignment,
      f.trails,
      f.kinds,
      0,
      width,
      undefined,
      f.ink,
    );
    return f.assignment.progress;
  };

  const alone = await run(build(false));
  const together = await run(build(true));
  const ownedByOne = (x, y) =>
    (y >= 20 && y <= 24 && x >= 10 && x <= 40) ||
    (x >= 36 && x <= 40 && y >= 20 && y <= 50);
  for (let y = 20; y <= 50; y++)
    for (let x = 10; x <= 40; x++)
      if (ownedByOne(x, y))
        assert.equal(
          together[y * width + x],
          alone[y * width + x],
          `cell ${x},${y} of stroke one changed when its neighbours were present`,
        );
});
