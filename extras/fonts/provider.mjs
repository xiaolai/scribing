import * as hb from './vendor/index.mjs';
import { readCapped as readCappedStream } from './capped-read.mjs';

const MAX_CODEPOINTS = 32;
const MAX_FONT_BYTES = 32 * 1024 * 1024;
const MAX_GLYPHS = 256;
const MAX_PATH_CHARS = 500000;
const JOINING_SCRIPTS = new Set([
  'Arab',
  'Syrc',
  'Nkoo',
  'Adlm',
  'Rohg',
  'Mand',
  'Mong',
  'Deva',
  'Beng',
  'Gujr',
  'Guru',
  'Orya',
  'Taml',
  'Telu',
  'Knda',
  'Mlym',
  'Sinh',
  'Mymr',
  'Khmr',
  'Bali',
  'Java',
  'Gran',
  'Tibt',
]);
const contains = (ranges, cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
const abort = (signal) => {
  if (signal?.aborted) throw new DOMException('Font shaping canceled', 'AbortError');
};
const error = (code, message) => Object.assign(new Error(message), { code });
const boundedString = (value, label, max = 160) => {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > max ||
    // C1 included: src/fonts/validateShape.ts rejects U+0080-U+009F because U+0085 is a
    // line break and U+009B an escape introducer, so metadata that passed here was then
    // refused by the core validator.
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    /[\u0000-\u001f\u007f\u0080-\u009f]/u.test(value)
  )
    throw error('INVALID_METADATA', `Invalid ${label}`);
  return value;
};

function validateSfnt(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 12 ||
    bytes.byteLength > MAX_FONT_BYTES
  )
    throw error('INVALID_FONT', 'Choose a TTF or OTF font up to 32 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = view.getUint32(0);
  if (signature !== 0x00010000 && signature !== 0x4f54544f)
    throw error('INVALID_FONT', 'Only standalone TTF and OTF font files are supported.');
  const count = view.getUint16(4);
  if (!count || count > 4096 || 12 + 16 * count > bytes.length)
    throw error('INVALID_FONT', 'Invalid font table directory.');
  const tables = new Set();
  for (let i = 0; i < count; i += 1) {
    const p = 12 + 16 * i;
    const tag = String.fromCharCode(...bytes.subarray(p, p + 4));
    const offset = view.getUint32(p + 8),
      size = view.getUint32(p + 12);
    if (tables.has(tag) || offset > bytes.length || size > bytes.length - offset)
      throw error('INVALID_FONT', 'Invalid font table bounds.');
    tables.add(tag);
  }
  if (
    !['head', 'cmap', 'maxp'].every((tag) => tables.has(tag)) ||
    !(tables.has('glyf') || tables.has('CFF ') || tables.has('CFF2'))
  )
    throw error('INVALID_FONT', 'The font has no supported outline tables.');
}

async function digest(bytes) {
  const sum = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...sum].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function snapshot(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(snapshot));
  if (value && typeof value === 'object')
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([k, v]) => [k, snapshot(v)])),
    );
  return value;
}

/** Optional HarfBuzz provider; never imported by the core bundle. */
export function createFontProvider({
  catalog,
  scriptRanges,
  baseUrl,
  fetch: fetchImpl = globalThis.fetch,
}) {
  if (catalog?.schemaVersion !== 1 || scriptRanges?.schemaVersion !== 1)
    throw error('INVALID_CATALOG', 'Unsupported font catalog.');
  // Copy metadata: changing the caller's catalog cannot bypass validation mid-request.
  const metadata = JSON.parse(JSON.stringify(catalog));
  const ranges = JSON.parse(JSON.stringify(scriptRanges));
  // A catalog entry without a pinned digest and byte length turns the integrity check
  // below into a no-op that still looks like it ran. Reject the catalog instead, once,
  // rather than silently downloading whatever the URL happens to serve.
  const HEX64 = /^[0-9a-f]{64}$/;
  // Structure before contents. A catalog missing `fonts` or a script missing `language`
  // used to reach the shaper and fail there as an uncoded TypeError, and a direction
  // the shaper does not recognise produced a successful shape carrying it. Anything
  // this constructor is handed that it cannot honour is refused here, once, with the
  // code the caller already handles.
  const bad = (why) => {
    throw error('INVALID_CATALOG', why);
  };
  if (!Array.isArray(metadata.fonts) || !Array.isArray(metadata.scripts))
    bad('A font catalog needs a fonts array and a scripts array.');
  const DIRECTIONS = new Set(['ltr', 'rtl', 'ttb']);
  const seenFont = new Set();
  for (const font of metadata.fonts) {
    if (
      !HEX64.test(String(font?.sha256 ?? '')) ||
      !Number.isInteger(font?.sizeBytes) ||
      font.sizeBytes <= 0 ||
      font.sizeBytes > MAX_FONT_BYTES
    )
      bad('Every catalog font must pin a SHA-256 and a size.');
    if (typeof font.id !== 'string' || !font.id || typeof font.file !== 'string')
      bad('Every catalog font needs an id and a file.');
    if (seenFont.has(font.id)) bad(`Duplicate catalog font id ${font.id}.`);
    seenFont.add(font.id);
  }
  const seenScript = new Set();
  for (const script of metadata.scripts) {
    if (
      typeof script?.id !== 'string' ||
      !script.id ||
      typeof script.script !== 'string' ||
      typeof script.language !== 'string' ||
      !Array.isArray(script.unicodeScripts)
    )
      bad('Every catalog script needs an id, a script tag, a language and ranges.');
    if (!DIRECTIONS.has(script.direction))
      bad(`Catalog script ${script.id} has an unsupported direction.`);
    if (seenScript.has(script.id)) bad(`Duplicate catalog script id ${script.id}.`);
    seenScript.add(script.id);
    for (const id of script.fontIds || [])
      if (!seenFont.has(id)) bad(`Catalog script ${script.id} names unknown font ${id}.`);
  }
  const fonts = new Map(metadata.fonts.map((f) => [f.id, f]));
  const scripts = new Map(metadata.scripts.map((s) => [s.id, s]));
  const cache = new Map();
  /** In-flight transfers by font id, so simultaneous misses share one download. */
  const pending = new Map();
  const buffer = new hb.Buffer();
  const controller = new AbortController();
  let destroyed = false;
  function alive(signal) {
    if (destroyed) throw error('DESTROYED', 'The font provider has been destroyed.');
    abort(signal);
  }
  function scriptFor(id) {
    const script = scripts.get(id);
    if (!script) throw error('UNKNOWN_SCRIPT', 'Choose a supported script.');
    return script;
  }
  function validateText(text, script) {
    // Length first, in UTF-16 units, before anything spreads the string. A scalar is at
    // most two units, so more than twice the limit cannot be under it, and rejecting
    // there means an oversized input is never materialised as an array of scalars.
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > MAX_CODEPOINTS * 2 ||
      [...text].length > MAX_CODEPOINTS
    )
      throw error('INVALID_TEXT', 'Enter 1–32 Unicode characters.');
    const allowed = [
      ...script.unicodeScripts.flatMap((name) => ranges.scripts[name] || []),
      ...ranges.common,
      ...ranges.inherited,
    ];
    for (const char of text) {
      const cp = char.codePointAt(0);
      if (
        (cp >= 0xd800 && cp <= 0xdfff) ||
        cp < 0x20 ||
        cp === 0x7f ||
        // C1, for the same reason the core validator excludes it.
        (cp >= 0x80 && cp <= 0x9f) ||
        /\p{Line_Separator}|\p{Paragraph_Separator}/u.test(char)
      )
        throw error('INVALID_TEXT', 'Use one line of valid Unicode text.');
      if (/\p{Variation_Selector}/u.test(char))
        throw error(
          'UNSUPPORTED_VARIATION',
          'Unicode variation sequences are not supported in this font mode.',
        );
      if (cp === 0x200c || cp === 0x200d) {
        if (!JOINING_SCRIPTS.has(script.script))
          throw error(
            'UNSUPPORTED_CONTROL',
            'Join controls are not enabled for this script.',
          );
        continue;
      }
      if (/\p{Cf}|\p{Default_Ignorable_Code_Point}/u.test(char))
        throw error(
          'UNSUPPORTED_CONTROL',
          'Bidi controls and invisible formatting characters are not supported.',
        );
      if (!contains(allowed, cp))
        throw error(
          'MIXED_SCRIPT',
          'Use text from the selected script. Mixed-script layout is not supported.',
        );
      // HarfBuzz shapes one directional run; digits need Unicode bidi itemization in RTL text.
      if (script.direction === 'rtl' && /\p{Number}/u.test(char))
        throw error(
          'UNSUPPORTED_BIDI',
          'Numerals in right-to-left text require paragraph bidi layout, which this view does not provide.',
        );
    }
  }
  /**
   * Read a response body under a hard byte cap.
   *
   * `content-length` is advisory and frequently absent, and `Number(null)` is 0, so the
   * previous check let a header-less response straight through to `arrayBuffer()`, which
   * buffers however much arrives. Streaming stops at the cap instead of discovering the
   * overrun once the memory is already committed.
   */
  async function readCapped(response) {
    const declared = Number(response.headers?.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_FONT_BYTES)
      throw error('INVALID_FONT', 'The font exceeds 32 MiB.');
    try {
      return await readCappedStream(response, MAX_FONT_BYTES);
    } catch (cause) {
      // The shared reader reports an overflow as a RangeError so each caller can name it
      // in its own vocabulary; everything else propagates unchanged.
      if (cause instanceof RangeError)
        throw error('INVALID_FONT', 'The font exceeds 32 MiB.');
      throw cause;
    }
  }

  async function makeFont(bytes, identity, signal) {
    alive(signal);
    validateSfnt(bytes);
    const sha256 = await digest(bytes);
    alive(signal);
    if (identity.sha256 && identity.sha256 !== sha256)
      throw error(
        'FONT_INTEGRITY',
        'The selected font file does not match its pinned SHA-256 digest.',
      );
    const blob = new hb.Blob(bytes),
      face = new hb.Face(blob),
      font = new hb.Font(face);
    if (!Number.isFinite(face.upem) || face.upem < 16 || face.upem > 16384)
      throw error('INVALID_FONT', 'Invalid font units per em.');
    font.setScale(face.upem, face.upem);
    return {
      blob,
      face,
      font,
      identity: {
        id: boundedString(identity.id, 'font ID'),
        name: boundedString(identity.name, 'font name'),
        sha256,
      },
    };
  }
  /** The transfer itself, bound only to the shared controller for this font. */
  async function fetchFont(record, id, linked) {
    try {
      const response = await fetchImpl(new URL(record.file, baseUrl).href, {
        signal: linked.signal,
      });
      if (!response.ok)
        throw error('FONT_LOAD', `The font could not be loaded (${response.status}).`);
      const bytes = await readCapped(response);
      if (bytes.length !== record.sizeBytes)
        throw error('FONT_INTEGRITY', 'The font file has an unexpected byte length.');
      const loaded = await makeFont(bytes, record, linked.signal);
      cache.set(id, loaded);
      while (cache.size > 4) cache.delete(cache.keys().next().value);
      return loaded;
    } catch (cause) {
      // Abandoning a response without cancelling it leaves its body downloading with
      // nothing able to stop it. A rejected status and an oversized content-length both
      // throw before anything reads the stream, so the transfer would otherwise run to
      // completion in the background. Aborting cancels the body on every failure.
      linked.abort();
      throw cause;
    }
  }

  /**
   * One transfer per font, however many callers want it at once.
   *
   * The cache was only written after a load finished, so simultaneous misses for the
   * same id each downloaded, hashed and instantiated their own copy: eight callers
   * meant eight downloads of the same bytes. Callers now join a shared transfer.
   *
   * Cancellation stays per caller. The shared transfer is aborted only when every
   * caller waiting on it has gone, so one caller giving up cannot pull the bytes out
   * from under the others, and a lone caller giving up still stops the download as it
   * always did.
   */
  async function load(id, signal) {
    alive(signal);
    if (cache.has(id)) {
      const loaded = cache.get(id);
      cache.delete(id);
      cache.set(id, loaded);
      return loaded;
    }
    const record = fonts.get(id);
    if (!record) throw error('UNKNOWN_FONT', 'Choose a catalog font.');
    let entry = pending.get(id);
    if (!entry) {
      const linked = new AbortController();
      const onDestroy = () => linked.abort();
      controller.signal.addEventListener('abort', onDestroy, { once: true });
      entry = { linked, waiters: 0, promise: null };
      entry.promise = fetchFont(record, id, linked).finally(() => {
        pending.delete(id);
        controller.signal.removeEventListener('abort', onDestroy);
      });
      // A shared rejection with no waiter left would surface as an unhandled rejection;
      // every real caller still sees it through its own await below.
      entry.promise.catch(() => {});
      pending.set(id, entry);
    }
    entry.waiters += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      entry.waiters -= 1;
      if (entry.waiters === 0) entry.linked.abort();
    };
    signal?.addEventListener('abort', release, { once: true });
    try {
      const loaded = await entry.promise;
      alive(signal);
      return loaded;
    } finally {
      signal?.removeEventListener('abort', release);
      release();
    }
  }
  function shapeLoaded(text, script, loaded, signal) {
    alive(signal);
    const { font, face, identity } = loaded;
    // Which characters the cmap lacks, recorded rather than rejected. HarfBuzz can still
    // render one by canonical decomposition: a font carrying `e` and a combining acute
    // but no precomposed `é` shapes `é` correctly, and asking the cmap alone refused it
    // while accepting the identical `e` followed by the combining mark. The shaped
    // output decides, and this list only supplies the precise codepoint for the message.
    const uncovered = [];
    for (const char of text) {
      const cp = char.codePointAt(0);
      if (cp === 0x200c || cp === 0x200d) continue;
      if (!font.nominalGlyph(cp)) uncovered.push(cp);
    }
    const missing = () =>
      error(
        'MISSING_GLYPH',
        uncovered.length
          ? `This font does not contain U+${uncovered[0].toString(16).toUpperCase().padStart(4, '0')}.`
          : 'The shaped text contains a missing glyph.',
      );
    const rotate = script.writingMode === 'vertical-lr';
    const direction = rotate ? 'ttb' : script.direction;
    buffer.reset();
    try {
      buffer.addText(text);
      buffer.setScript(script.script);
      buffer.setLanguage(script.language);
      buffer.setDirection(
        { ltr: hb.Direction.LTR, rtl: hb.Direction.RTL, ttb: hb.Direction.TTB }[
          rotate ? 'ltr' : direction
        ],
      );
      hb.shape(font, buffer);
      const shaped = buffer.getGlyphInfosAndPositions();
      if (!shaped.length || shaped.length > MAX_GLYPHS)
        throw error('INVALID_SHAPE', 'Shaped glyph count is out of bounds.');
      let penX = 0,
        penY = 0,
        minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity,
        pathChars = 0;
      const glyphs = shaped.map((g) => {
        if (!g.codepoint) throw missing();
        const rawX = penX + g.xOffset,
          rawY = penY + g.yOffset;
        const x = rotate ? rawY : rawX,
          y = rotate ? -rawX : rawY;
        if (![x, y, g.xAdvance, g.yAdvance].every(Number.isFinite))
          throw error('INVALID_SHAPE', 'Non-finite glyph positioning.');
        const path = rotate
          ? font
              .glyphToJson(g.codepoint)
              .map((command) => {
                if (
                  !['M', 'L', 'Q', 'C', 'Z'].includes(command.type) ||
                  command.values.length % 2
                )
                  throw error('INVALID_SHAPE', 'Unsupported rotated outline command.');
                const values = [];
                for (let i = 0; i < command.values.length; i += 2)
                  values.push(command.values[i + 1], -command.values[i]);
                return command.type + values.join(',');
              })
              .join('')
          : font.glyphToPath(g.codepoint);
        pathChars += path.length;
        if (
          pathChars > MAX_PATH_CHARS ||
          !/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]*$/.test(path)
        )
          throw error('INVALID_SHAPE', 'Invalid or excessive font outline.');
        const box = font.glyphExtents(g.codepoint);
        if (path && box) {
          const x1 = x + (rotate ? box.yBearing : box.xBearing),
            y1 = y + (rotate ? -box.xBearing : box.yBearing),
            x2 = x1 + (rotate ? box.height : box.width),
            y2 = y1 + (rotate ? -box.width : box.height);
          if (![x1, y1, x2, y2].every(Number.isFinite))
            throw error('INVALID_SHAPE', 'Non-finite glyph bounds.');
          minX = Math.min(minX, x1, x2);
          minY = Math.min(minY, y1, y2);
          maxX = Math.max(maxX, x1, x2);
          maxY = Math.max(maxY, y1, y2);
        }
        penX += g.xAdvance;
        penY += g.yAdvance;
        return {
          id: g.codepoint,
          cluster: g.cluster,
          path,
          x: x || 0,
          y: y || 0,
          advanceX: (rotate ? g.yAdvance : g.xAdvance) || 0,
          advanceY: (rotate ? -g.xAdvance : g.yAdvance) || 0,
        };
      });
      if (
        ![minX, minY, maxX, maxY].every(Number.isFinite) ||
        maxX <= minX ||
        maxY <= minY
      )
        throw error('EMPTY_OUTLINE', 'The text has no visible outline.');
      alive(signal);
      return snapshot({
        schemaVersion: 1,
        text,
        font: identity,
        script: script.script,
        language: script.language,
        direction,
        em: face.upem,
        bounds: [minX, minY, maxX - minX, maxY - minY],
        glyphs,
      });
    } finally {
      buffer.reset();
    }
  }
  return {
    async shape({ text, fontId, scriptId }, { signal } = {}) {
      alive(signal);
      const script = scriptFor(scriptId);
      validateText(text, script);
      if (!script.fontIds.includes(fontId))
        throw error(
          'INCOMPATIBLE_FONT',
          'Choose a font advertised for the selected script.',
        );
      return shapeLoaded(text, script, await load(fontId, signal), signal);
    },
    async shapeCustom({ text, bytes, name, scriptId }, { signal } = {}) {
      alive(signal);
      const script = scriptFor(scriptId);
      validateText(text, script);
      // Measure before copying. An oversized buffer was duplicated in full and only
      // then rejected by validateSfnt, so the caller's mistake cost twice the memory.
      const size =
        bytes instanceof ArrayBuffer
          ? bytes.byteLength
          : bytes instanceof Uint8Array
            ? bytes.byteLength
            : undefined;
      if (size !== undefined && (size < 12 || size > MAX_FONT_BYTES))
        throw error('INVALID_FONT', 'Choose a TTF or OTF font up to 32 MiB.');
      const data =
        bytes instanceof ArrayBuffer
          ? new Uint8Array(bytes.slice(0))
          : bytes instanceof Uint8Array
            ? new Uint8Array(bytes)
            : bytes;
      boundedString(name, 'font name');
      const loaded = await makeFont(data, { id: 'custom-font', name }, signal);
      return shapeLoaded(text, script, loaded, signal);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      controller.abort();
      cache.clear();
      buffer.reset();
    },
  };
}
