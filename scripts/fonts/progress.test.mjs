import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCurveProgress } from '../../extras/fonts/progress.mjs';
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
