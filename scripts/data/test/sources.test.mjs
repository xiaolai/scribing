import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSource, chooseObservation, sha256 } from '../build.mjs';
import { parseJSON, parseSVG, parseOmniglot, letterpathsUnit } from '../adapters.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'),
  sourceDir = path.join(root, 'packs/sources');
const lock = JSON.parse(await readFile(path.join(sourceDir, 'lock.json')));
test('pinned real English/Japanese/Korean fixtures retain documented motor counts', async () => {
  const lp = await loadSource(
    sourceDir,
    lock.sources.find((s) => s.id === 'letterpaths'),
  );
  assert.equal(Object.keys(lp.files).length, 52);
  const find = (c) =>
    Object.values(lp.files)
      .map(parseJSON)
      .find((x) => x.glyph.char === c);
  assert.equal(letterpathsUnit(find('A')).motorStrokes.length, 2);
  assert.equal(letterpathsUnit(find('i')).motorStrokes[1].kind, 'dot');
  assert.equal(
    letterpathsUnit(find('i')).coordinates.xHeight,
    find('i').guides.baseline - find('i').guides.xHeight,
  );
  const k = await loadSource(
    sourceDir,
    lock.sources.find((s) => s.id === 'kanjivg'),
  );
  assert.equal(Object.keys(k.files).length, 6704);
  assert.equal(parseSVG(k.files['kanji/03042.svg']).length, 3);
  assert.equal(parseSVG(k.files['kanji/0306c.svg']).length, 2);
  const ko = await loadSource(
    sourceDir,
    lock.sources.find((s) => s.id === 'omniglot-korean'),
  );
  assert.equal(Object.keys(ko.files).length, 800);
  const samples = Object.entries(ko.files)
    .filter(([p]) => p.includes('/character16/'))
    .map(([sourcePath, s]) => ({ sourcePath, strokes: parseOmniglot(s) }));
  const selection = chooseObservation(samples);
  assert.ok(!selection.ranked[0].sourcePath.endsWith('_01.txt'));
  assert.equal(selection.ranked[0].strokes.length, selection.modalStrokeCount);
  const firstClass = Object.entries(ko.files)
    .filter(([p]) => p.includes('/character01/'))
    .map(([sourcePath, s]) => ({ sourcePath, strokes: parseOmniglot(s) }));
  assert.ok(chooseObservation(firstClass).ranked[0].sourcePath.endsWith('0643_11.txt'));
});
test('source bytes and full license notice are verified before any conversion', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'scribing-source-'));
  try {
    const entry = lock.sources[0];
    await writeFile(path.join(dir, entry.file), 'tampered');
    await assert.rejects(loadSource(dir, entry), /hash mismatch/);
    await writeFile(
      path.join(dir, entry.file),
      await readFile(path.join(sourceDir, entry.file)),
    );
    await writeFile(path.join(dir, entry.licenseFile), 'tampered');
    await assert.rejects(loadSource(dir, entry), /Notice hash/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('emitted source inventories and variants exactly match advertised breadth', async () => {
  const dir = path.join(root, 'packs/generated'),
    cat = JSON.parse(await readFile(path.join(dir, 'catalog.json')));
  const get = (id) => cat.packs.find((p) => p.id === id);
  assert.equal(get('english-letterpaths-print').unitCount, 52);
  assert.equal(get('english-glyphed').unitCount, 249);
  assert.equal(get('english-glyphed').characterCount, 83);
  assert.equal(get('japanese-kana').unitCount, 184);
  assert.equal(get('japanese-grade-1').unitCount, 80);
  assert.equal(get('korean-omniglot').unitCount, 40);
  assert.equal(get('kanjivg-latin').unitCount, 68);
  assert.equal(get('japanese-symbols').unitCount, 5);
  assert.equal(
    cat.packs
      .filter((p) => p.id.startsWith('japanese-kanji-'))
      .reduce((n, p) => n + p.unitCount, 0),
    6367,
  );
  assert.equal(
    cat.packs
      .filter((p) => p.id.startsWith('japanese-') || p.id === 'kanjivg-latin')
      .reduce((n, p) => n + p.unitCount, 0),
    6704,
  );
  assert.equal(
    cat.packs
      .filter((p) => p.id.startsWith('omniglot-') || p.id === 'korean-omniglot')
      .reduce((n, p) => n + p.unitCount, 0),
    1623,
  );
  assert.equal(
    cat.rawObservations.reduce((n, p) => n + p.sampleCount, 0),
    32460,
  );
  const en = JSON.parse(await readFile(path.join(dir, 'english-glyphed.json')));
  assert.equal(en.units['.'].motorStrokes[0].kind, 'dot');
  assert.equal(en.units.i.coordinates.xHeight, 11);
  assert.equal(en.units['8'].motorStrokes.length, 2);
  assert.equal(en.aliases['A@0'], 'A');
  assert.ok(en.units['A@1']);
  assert.ok(!en.units[';']);
  assert.equal(
    sha256(await readFile(path.join(dir, get('english-glyphed').file))),
    get('english-glyphed').sha256,
  );
});

test('real Tomoe XML preserves duplicate labels and recorded format fixtures retain all XYT points', async () => {
  const { parseTomoe, parseInkML, parseUnipen } = await import('../adapters.mjs');
  const fixtures = path.join(root, 'scripts/data/test/fixtures');
  const tomoe = parseTomoe(
    await readFile(path.join(fixtures, 'tomoe-excerpt.xml'), 'utf8'),
  );
  assert.deepEqual(
    tomoe.filter((r) => r.text === '字').map((r) => r.strokes.length),
    [5, 6, 5],
  );
  assert.equal(tomoe.find((r) => r.text === 'あ').strokes.length, 3);
  assert.equal(tomoe.find((r) => r.text === 'ぬ').strokes.length, 2);
  const expected = JSON.parse(
    await readFile(path.join(fixtures, 'recording.json')),
  ).strokes;
  assert.deepEqual(
    parseInkML(await readFile(path.join(fixtures, 'recording.inkml'), 'utf8')),
    expected,
  );
  assert.deepEqual(
    parseUnipen(await readFile(path.join(fixtures, 'recording.unipen'), 'utf8')),
    expected,
  );
});

test('representative selection uses shape medoids, not aspect or source name', () => {
  const sample = (sourcePath, x) => ({
    sourcePath,
    strokes: [
      [
        [0, 0],
        [x, 10],
        [10, 0],
      ],
    ],
  });
  const candidates = [
    sample('a-outlier', 10),
    sample('b-left', 0),
    sample('c-right', 1),
    sample('d-middle', 0.5),
  ];
  assert.equal(chooseObservation(candidates).ranked[0].sourcePath, 'd-middle');
  const transformed = candidates.map((s) => ({
    ...s,
    strokes: s.strokes.map((st) => st.map(([x, y]) => [x * 3 + 80, y * 3 - 40])),
  }));
  assert.equal(chooseObservation(transformed).ranked[0].sourcePath, 'd-middle');
  assert.deepEqual(
    chooseObservation(candidates.slice().reverse()).ranked.map((s) => s.sourcePath),
    chooseObservation(candidates).ranked.map((s) => s.sourcePath),
  );
});

test('medoid normalization retains relative motor placement and prioritizes clean modal counts', () => {
  const a = {
    sourcePath: 'a',
    strokes: [
      [
        [0, 0],
        [10, 0],
      ],
      [
        [0, 20],
        [10, 20],
      ],
    ],
  };
  const b = {
    sourcePath: 'b',
    strokes: [
      [
        [0, 0],
        [10, 0],
      ],
      [
        [0, 10],
        [10, 10],
      ],
    ],
  };
  assert.ok(chooseObservation([a, b]).ranked.every((s) => s.score > 0));
  const stationary = {
    sourcePath: '0-stationary',
    strokes: [
      [
        [0, 0],
        [10, 0],
      ],
      [
        [0, 10],
        [0, 10],
      ],
    ],
  };
  const nonmodal = {
    sourcePath: '0-nonmodal',
    strokes: [
      [
        [0, 0],
        [10, 0],
      ],
    ],
  };
  const ranked = chooseObservation([a, b, stationary, nonmodal]).ranked;
  assert.equal(ranked[0].strokes.length, 2);
  assert.equal(ranked[0].stationaryFragments, 0);
  assert.equal(ranked.at(-1).sourcePath, '0-nonmodal');
});
