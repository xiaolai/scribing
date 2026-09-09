import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { authoredUnit } from '../authored.mjs';

const source = async (id) =>
  JSON.parse(
    await readFile(new URL(`../../../packs/authored/${id}.source.json`, import.meta.url)),
  );

test('English A uses three separate strokes with both diagonal strokes starting at the apex', async () => {
  const model = await source('english-textbook');
  assert.equal(
    Object.keys(model.units).join(''),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  );
  const a = authoredUnit(model, 'A', model.units.A);
  assert.equal(a.motorStrokes.length, 3);
  const [left, right, bar] = a.motorStrokes.map((s) => s.points);
  assert.deepEqual(left[0], right[0]);
  assert.ok(left.at(-1)[0] < left[0][0] && left.at(-1)[1] > left[0][1]);
  assert.ok(right.at(-1)[0] > right[0][0] && right.at(-1)[1] > right[0][1]);
  assert.ok(bar[0][0] < bar.at(-1)[0] && bar[0][1] === bar.at(-1)[1]);
  assert.equal(a.defaultPlanId, 'textbook');
});

test('every authored glyph fits a shared writing frame, with explicit visible i/j dots', async () => {
  for (const id of ['english-textbook', 'korean-textbook']) {
    const model = await source(id);
    assert.equal(Object.keys(model.units).length, id === 'english-textbook' ? 52 : 40);
    for (const item of Object.values(model.units)) {
      const unit = authoredUnit(model, id, item);
      assert.equal(unit.motorStrokes.length, item.strokes.length);
      assert.deepEqual(unit.coordinates, model.coordinates);
    }
  }
  const english = await source('english-textbook');
  assert.equal(english.coordinates.baseline - english.coordinates.xHeight, 440);
  for (const id of ['i', 'j']) {
    const [stem, dot] = authoredUnit(english, id, english.units[id]).motorStrokes;
    assert.equal(stem.kind, 'curve');
    assert.equal(dot.kind, 'dot');
    assert.ok(dot.center[1] + dot.radius < stem.points[0][1]);
  }
});

test('authoring rejects hidden pen lifts and clipped or ambiguous geometry', async () => {
  const model = await source('english-textbook');
  assert.throws(
    () =>
      authoredUnit(model, 'bad', {
        strokes: [{ path: 'M200 200L300 300M400 400L500 500' }],
      }),
    /one pen movement/,
  );
  assert.throws(
    () => authoredUnit(model, 'bad', { strokes: [{ path: 'M0 0L100 100' }] }),
    /clipped/,
  );
  assert.throws(
    () =>
      authoredUnit(model, 'bad', {
        strokes: [{ path: 'M200 200L300 300', dot: [300, 300], radius: 16 }],
      }),
    /Invalid authored dot/,
  );
  assert.throws(
    () => authoredUnit(model, 'bad', { strokes: [{ dot: [0, 0], radius: 16 }] }),
    /clipped/,
  );
});

test('Korean print covers the mapped jamo and retains referenced pen lifts', async () => {
  const model = await source('korean-textbook');
  const mapping = JSON.parse(
    await readFile(
      new URL('../../../packs/sources/korean-mapping.json', import.meta.url),
    ),
  );
  assert.deepEqual(
    Object.keys(model.units).sort(),
    mapping.entries.map((entry) => entry.character).sort(),
  );
  for (const [id, count] of [
    ['ㅏ', 2],
    ['ㄹ', 3],
    ['ㅁ', 3],
    ['ㅇ', 1],
    ['ㅈ', 2],
  ])
    assert.equal(authoredUnit(model, id, model.units[id]).motorStrokes.length, count);
});
