import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFontProvider } from '../../extras/fonts/provider.mjs';
const catalog = JSON.parse(
  await readFile(new URL('../../fonts/catalog.json', import.meta.url), 'utf8'),
);
const scriptRanges = JSON.parse(
  await readFile(new URL('../../fonts/script-ranges.json', import.meta.url), 'utf8'),
);
const baseUrl = new URL('../../', import.meta.url);
const localFetch = async (url, { signal } = {}) => {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const bytes = await readFile(new URL(url));
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-length': String(bytes.length) }),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
  };
};
const make = () =>
  createFontProvider({ catalog, scriptRanges, baseUrl, fetch: localFetch });
const shape = (
  p,
  scriptId,
  text,
  fontId = catalog.scripts.find((s) => s.id === scriptId).fontIds[0],
) => p.shape({ scriptId, text, fontId });
test('all advertised examples and inventory characters shape to visible outlines with each font', async () => {
  const p = make();
  let count = 0;
  try {
    for (const s of catalog.scripts) {
      for (const fontId of s.fontIds) {
        for (const text of new Set([...s.inventory, ...s.examples.map((e) => e.text)])) {
          const result = await shape(p, s.id, text, fontId).catch((e) => {
            e.message += ` (${s.id}, ${fontId}, ${JSON.stringify(text)} U+${text.codePointAt(0).toString(16)})`;
            throw e;
          });
          assert(result.glyphs.every((g) => g.id > 0));
          assert(result.bounds[2] > 0 && result.bounds[3] > 0);
          assert(Object.isFrozen(result.glyphs));
          count++;
        }
      }
    }
  } finally {
    p.destroy();
  }
  console.log('Verified shaped font inventory/examples:', count);
});
test('font choice changes actual outlines and identity; custom font matches original bytes', async () => {
  const p = make();
  try {
    const a = await shape(p, 'english', 'ag', 'NotoSans'),
      b = await shape(p, 'english', 'ag', 'NotoSerif');
    assert.notDeepEqual(
      a.glyphs.map((g) => g.path),
      b.glyphs.map((g) => g.path),
    );
    assert.notEqual(a.font.sha256, b.font.sha256);
    const bytes = await readFile(
      new URL('../../fonts/assets/NotoSerif-Regular.ttf', import.meta.url),
    );
    const custom = await p.shapeCustom({
      scriptId: 'english',
      text: 'ag',
      bytes,
      name: 'My serif',
    });
    assert.equal(custom.font.sha256, b.font.sha256);
    assert.deepEqual(custom.glyphs, b.glyphs);
  } finally {
    p.destroy();
  }
});
test('Arabic joining, Indic reordering, marks and vertical advances are actually shaped', async () => {
  const p = make();
  try {
    const arabic = await shape(p, 'arabic', 'سلام');
    assert.equal(arabic.direction, 'rtl');
    assert(arabic.glyphs[0].cluster > arabic.glyphs.at(-1).cluster);
    const indic = await shape(p, 'devanagari', 'कि');
    assert(indic.glyphs.length >= 2);
    assert(indic.glyphs.every((g) => g.cluster === 0));
    const mark = await shape(p, 'arabic', 'بِ');
    assert(mark.glyphs.some((g) => g.advanceX === 0));
    const vertical = await shape(p, 'mongolian', 'ᠮᠣᠩᠭᠣᠯ');
    assert.equal(vertical.direction, 'ttb');
    assert(vertical.glyphs.some((g) => g.advanceY < 0));
  } finally {
    p.destroy();
  }
});
test('unsupported input and canceled/destroyed requests fail explicitly', async () => {
  const p = make();
  try {
    for (const [script, text, code] of [
      ['english', 'aא', 'MIXED_SCRIPT'],
      ['arabic', 'ب1', 'UNSUPPORTED_BIDI'],
      ['english', 'a\u200d', 'UNSUPPORTED_CONTROL'],
      ['japanese', '字\ufe00', 'UNSUPPORTED_VARIATION'],
      ['english', 'a\u202e', 'UNSUPPORTED_CONTROL'],
      ['english', 'a\u034f', 'UNSUPPORTED_CONTROL'],
      ['mongolian', 'ᠠ\u180b', 'UNSUPPORTED_VARIATION'],
      ['english', 'x'.repeat(33), 'INVALID_TEXT'],
      ['japanese', '𧒑', 'MISSING_GLYPH'],
    ]) {
      await assert.rejects(shape(p, script, text), { code });
    }
    await assert.rejects(
      p.shapeCustom({
        scriptId: 'english',
        text: 'a',
        bytes: new Uint8Array(32),
        name: 'bad',
      }),
      { code: 'INVALID_FONT' },
    );
    const c = new AbortController();
    c.abort();
    await assert.rejects(
      p.shape(
        { scriptId: 'english', text: 'a', fontId: 'NotoSans' },
        { signal: c.signal },
      ),
      { name: 'AbortError' },
    );
  } finally {
    p.destroy();
  }
  await assert.rejects(shape(p, 'english', 'a'), { code: 'DESTROYED' });
});
test('all verified old Unicode texts shape, with only the explicitly recorded font gaps', async () => {
  const p = make();
  let count = 0;
  try {
    const visited = new Set();
    for (const entry of catalog.sourceCoverage.filter(
      (e) => e.status === 'verified-text',
    )) {
      const s = catalog.scripts.find((script) => script.id === entry.scriptId);
      for (const fontId of s.fontIds)
        for (const text of new Set(entry.unitMappings.map((m) => m.text))) {
          const key = fontId + '|' + s.id + '|' + text;
          if (visited.has(key)) continue;
          visited.add(key);
          if (entry.unsupportedTexts.includes(text))
            await assert.rejects(shape(p, s.id, text, fontId), { code: 'MISSING_GLYPH' });
          else assert((await shape(p, s.id, text, fontId)).glyphs.some((g) => g.path));
          count++;
        }
    }
  } finally {
    p.destroy();
  }
  console.log('Verified mapped source text/font cases:', count);
});
test('custom Node Buffer is copied before asynchronous hashing', async () => {
  const p = make();
  try {
    const bytes = await readFile(
      new URL('../../fonts/assets/NotoSerif-Regular.ttf', import.meta.url),
    );
    const original = await shape(p, 'english', 'ag', 'NotoSerif');
    const pending = p.shapeCustom({
      scriptId: 'english',
      text: 'ag',
      bytes,
      name: 'Copied buffer',
    });
    bytes.fill(0);
    const result = await pending;
    assert.equal(result.font.sha256, original.font.sha256);
    assert.deepEqual(result.glyphs, original.glyphs);
  } finally {
    p.destroy();
  }
});
test('provider matches independent native HarfBuzz positions in 85 fixtures', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('./fixtures/native-shaping.json', import.meta.url), 'utf8'),
  );
  const p = make();
  try {
    for (const c of fixture.cases) {
      const result = await shape(p, c.scriptId, c.text, c.fontId);
      assert.equal(result.font.sha256, c.fontSha256);
      assert.equal(result.direction, c.direction);
      assert.deepEqual(
        result.glyphs.map(({ path, ...g }) => g),
        c.expected,
        `${c.scriptId} ${c.fontId} ${c.text}`,
      );
    }
  } finally {
    p.destroy();
  }
});
