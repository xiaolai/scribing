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

test('rejects a catalog whose font entries do not pin a digest and a size', () => {
  // Without the pin the integrity comparison in makeFont is skipped silently while
  // still looking like it ran, so whatever the URL serves would be accepted.
  for (const overrides of [
    { sha256: undefined },
    { sha256: '' },
    { sha256: 'not-a-digest' },
    { sizeBytes: undefined },
    { sizeBytes: 0 },
    { sizeBytes: -1 },
  ]) {
    const broken = JSON.parse(JSON.stringify(catalog));
    Object.assign(broken.fonts[0], overrides);
    assert.throws(
      () =>
        createFontProvider({ catalog: broken, scriptRanges, baseUrl, fetch: localFetch }),
      /pin a SHA-256/,
    );
  }
});

test('rejects a catalog whose structure or script metadata is unusable', () => {
  // These reached the shaper instead of the constructor. A missing `fonts` array threw
  // an uncoded TypeError from deep inside a request, a script with no `language` did
  // the same, and an unrecognised direction produced a successful shape carrying it.
  const cases = [
    [(c) => delete c.fonts, /fonts array/],
    [(c) => delete c.scripts, /scripts array/],
    [(c) => (c.fonts = {}), /fonts array/],
    [(c) => delete c.scripts[0].language, /script tag, a language/],
    [(c) => delete c.scripts[0].unicodeScripts, /script tag, a language/],
    [(c) => delete c.fonts[0].file, /needs an id and a file/],
    [(c) => (c.scripts[0].direction = 'sideways'), /unsupported direction/],
    [(c) => c.fonts.push({ ...c.fonts[0] }), /Duplicate catalog font id/],
    [(c) => c.scripts.push({ ...c.scripts[0] }), /Duplicate catalog script id/],
    [(c) => (c.scripts[0].fontIds = ['NoSuchFont']), /names unknown font/],
  ];
  for (const [breakIt, expected] of cases) {
    const broken = JSON.parse(JSON.stringify(catalog));
    breakIt(broken);
    assert.throws(
      () =>
        createFontProvider({ catalog: broken, scriptRanges, baseUrl, fetch: localFetch }),
      expected,
    );
  }
});

test('simultaneous misses for one font share a single transfer', async () => {
  // The cache was written only after a load finished, so every concurrent miss
  // downloaded, hashed and instantiated the same bytes independently.
  let downloads = 0;
  const counting = (url, init) => {
    if (String(url).endsWith('.ttf')) downloads += 1;
    return localFetch(url, init);
  };
  const provider = createFontProvider({
    catalog,
    scriptRanges,
    baseUrl,
    fetch: counting,
  });
  const text = 'a';
  await Promise.all(
    Array.from({ length: 8 }, () =>
      provider.shape({ text, fontId: 'NotoSans', scriptId: 'english' }),
    ),
  );
  assert.equal(downloads, 1, 'eight concurrent callers must share one download');
  provider.destroy();
});

test('one caller giving up does not cancel a transfer the others still need', async () => {
  // A guard, not a regression pin: this held trivially when every caller had its own
  // transfer. Coalescing is what could break it, so it is asserted from here on.
  const provider = createFontProvider({
    catalog,
    scriptRanges,
    baseUrl,
    fetch: localFetch,
  });
  const quitter = new AbortController();
  const staying = provider.shape({ text: 'a', fontId: 'NotoSerif', scriptId: 'english' });
  const leaving = provider
    .shape(
      { text: 'a', fontId: 'NotoSerif', scriptId: 'english' },
      { signal: quitter.signal },
    )
    .catch((error) => error);
  quitter.abort();
  await leaving;
  const kept = await staying;
  assert.equal(kept.glyphs.length, 1, 'the remaining caller still gets its shape');
  provider.destroy();
});

test('stops reading a font body once it passes the size cap', async () => {
  // content-length is advisory and often absent, and Number(null) is 0, so a response
  // without the header used to reach arrayBuffer() and buffer whatever arrived.
  let delivered = 0;
  const chunk = new Uint8Array(1024 * 1024);
  const streamingFetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    body: {
      getReader: () => ({
        read: async () => {
          delivered += chunk.byteLength;
          return { done: false, value: chunk };
        },
        cancel: async () => undefined,
      }),
    },
    arrayBuffer: async () => {
      throw new Error('the body should have been streamed');
    },
  });

  const p = createFontProvider({ catalog, scriptRanges, baseUrl, fetch: streamingFetch });
  try {
    const script = catalog.scripts[0];
    await assert.rejects(
      p.shape({
        scriptId: script.id,
        text: script.examples[0].text,
        fontId: script.fontIds[0],
      }),
      /exceeds 32 MiB/,
    );
    // The cap is 32 MiB; the reader is not allowed to run away past it.
    assert.ok(delivered <= 33 * 1024 * 1024, `read ${delivered} bytes`);
  } finally {
    p.destroy();
  }
});

test('rejects an oversized custom font before copying it', async () => {
  const p = make();
  try {
    const huge = new ArrayBuffer(33 * 1024 * 1024);
    await assert.rejects(
      p.shapeCustom({ text: 'a', bytes: huge, name: 'Huge', scriptId: 'english' }),
      /up to 32 MiB/,
    );
    await assert.rejects(
      p.shapeCustom({
        text: 'a',
        bytes: new Uint8Array(4),
        name: 'Tiny',
        scriptId: 'english',
      }),
      /up to 32 MiB/,
    );
  } finally {
    p.destroy();
  }
});

test('an abandoned response is cancelled rather than left downloading', async () => {
  // A rejected status throws before anything reads the body, and load() then removed its
  // abort listeners, detaching the request from destroy(). Nothing could stop the
  // transfer, so it ran to completion in the background.
  const seen = [];
  const refusingFetch = async (url, { signal } = {}) => {
    seen.push(signal);
    return {
      ok: false,
      status: 503,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  const provider = createFontProvider({
    catalog,
    scriptRanges,
    baseUrl,
    fetch: refusingFetch,
  });
  const script = catalog.scripts[0];
  await assert.rejects(
    () =>
      provider.shape({
        scriptId: script.id,
        text: script.examples?.[0]?.text ?? 'a',
        fontId: script.fontIds[0],
      }),
    (e) => e.code === 'FONT_LOAD' || e.code === 'INVALID_TEXT',
  );
  assert.equal(seen.length, 1, 'the font was requested once');
  assert.ok(seen[0].aborted, 'the abandoned request was aborted');
  provider.destroy?.();
});
