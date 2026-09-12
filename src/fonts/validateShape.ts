import { FontShape, ReadonlyFontShape } from './types';
import pathGeometry from './pathGeometry';
import { readPlainArray, readPlainObject } from '../validation/plainStructure';

const MAX_GLYPHS = 256;
const MAX_TEXT_SCALARS = 32;
const MAX_TOTAL_PATH_CHARS = 500000;
const MIN_EM = 16;
const MAX_EM = 16384;
/** HarfBuzz extents are integer font units; permit one unit of rounding per edge. */
const BOUNDS_ROUNDING = 1.01;

const finite = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7;

/**
 * Printable, non-control text within a length bound.
 *
 * Both control blocks are excluded. The C1 range U+0080 to U+009F was not: U+0085 is a
 * line break and U+009B an escape introducer, and both passed a check that only looked
 * below U+0020 and at U+007F.
 */
const text = (s: unknown, max: number) =>
  typeof s === 'string' &&
  s.length > 0 &&
  s.length <= max &&
  Array.from(s).every((c) => {
    const code = c.codePointAt(0)!;
    return code >= 32 && code !== 127 && (code < 0x80 || code > 0x9f);
  });

const fail = (): never => {
  throw new Error('Invalid FontShape');
};
const copyObject = (value: unknown, keys: string[]): Record<string, any> =>
  readPlainObject(value, fail, { keys });
const copyArray = (value: unknown, max: number): any[] =>
  readPlainArray(value, fail, { min: 1, max });

/** Copy the caller's object graph into fresh containers before reading any value. */
function snapshot(value: FontShape | ReadonlyFontShape): FontShape {
  const data = copyObject(value, [
    'schemaVersion',
    'text',
    'font',
    'script',
    'language',
    'direction',
    'em',
    'bounds',
    'glyphs',
  ]);
  data.font = copyObject(data.font, ['id', 'name', 'sha256']);
  data.bounds = copyArray(data.bounds, 4);
  data.glyphs = copyArray(data.glyphs, MAX_GLYPHS).map((glyph) =>
    copyObject(glyph, ['id', 'cluster', 'path', 'x', 'y', 'advanceX', 'advanceY']),
  );
  return data as FontShape;
}

function assertFont(font: FontShape['font']) {
  if (
    !text(font.id, 160) ||
    !text(font.name, 160) ||
    typeof font.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(font.sha256)
  ) {
    fail();
  }
}

/**
 * Only what snapshot has not already settled.
 *
 * Everything here runs on the snapshot, which is built from readPlainObject and
 * readPlainArray: font and every glyph are fresh plain objects, bounds and glyphs are
 * fresh arrays, and glyphs already has between one and MAX_GLYPHS entries. Re-testing
 * those made it hard to see which checks still decide anything. bounds keeps its length
 * test, because the copy admits one to four entries and only four is a rectangle.
 */
function assertDeclaredBounds(shape: FontShape) {
  if (
    shape.bounds.length !== 4 ||
    !shape.bounds.every(finite) ||
    shape.bounds[2] <= 0 ||
    shape.bounds[3] <= 0
  ) {
    fail();
  }
}

function assertMetadata(shape: FontShape) {
  if (
    shape.schemaVersion !== 1 ||
    !text(shape.text, 64) ||
    Array.from(shape.text).length > MAX_TEXT_SCALARS ||
    !text(shape.script, 16) ||
    !text(shape.language, 64) ||
    ['ltr', 'rtl', 'ttb'].indexOf(shape.direction) < 0 ||
    !finite(shape.em) ||
    shape.em < MIN_EM ||
    shape.em > MAX_EM
  ) {
    fail();
  }
  assertFont(shape.font);
  assertDeclaredBounds(shape);
}

/**
 * UTF-16 code-unit offsets at which each Unicode scalar of `text` starts.
 *
 * These are the same offsets `String.prototype.slice` and every other JavaScript string
 * index uses, which is what a cluster is compared against; they are not byte offsets,
 * and calling them that was misleading for anything outside the Basic Latin range.
 * Glyph clusters must name one of these, so a cluster cannot point into the middle of a
 * surrogate pair. Lone surrogates are rejected outright.
 */
function clusterOffsets(value: string): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const char of Array.from(value)) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) fail();
    offsets.push(cursor);
    cursor += char.length;
  }
  return offsets;
}

function assertGlyph(glyph: FontShape['glyphs'][number], clusters: number[]) {
  if (
    !Number.isInteger(glyph.id) ||
    glyph.id <= 0 ||
    glyph.id > 65535 ||
    !Number.isInteger(glyph.cluster) ||
    glyph.cluster < 0 ||
    clusters.indexOf(glyph.cluster) < 0 ||
    ![glyph.x, glyph.y, glyph.advanceX, glyph.advanceY].every(finite) ||
    typeof glyph.path !== 'string'
  ) {
    fail();
  }
}

/** Union of every glyph outline, in shape coordinates. */
function measureGlyphs(shape: FontShape, clusters: number[]) {
  let pathChars = 0;
  let extended = false;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const glyph of shape.glyphs) {
    assertGlyph(glyph, clusters);
    pathChars += glyph.path.length;
    if (pathChars > MAX_TOTAL_PATH_CHARS) fail();

    const geometry = pathGeometry(glyph.path);
    if (!geometry) continue;
    minX = Math.min(minX, glyph.x + geometry.minX);
    minY = Math.min(minY, glyph.y + geometry.minY);
    maxX = Math.max(maxX, glyph.x + geometry.maxX);
    maxY = Math.max(maxY, glyph.y + geometry.maxY);
    if (geometry.maxX > geometry.minX && geometry.maxY > geometry.minY) extended = true;
  }

  // Extent, not fill. A bounding box with both sides positive says only that some
  // outline covers ground in both axes: `M0 0L10 10Z` passes and encloses nothing.
  // Proving ink requires rasterizing under the nonzero rule, which FontWriter.setShape
  // does, rejecting with "FontShape has no visible nonzero-filled outline". Testing it
  // here by summing contour areas would be worse than not testing it, because a
  // self-intersecting outline can enclose ink while its signed areas cancel to zero.
  if (!extended) fail();
  return { minX, minY, maxX, maxY };
}

/**
 * Validate a caller-supplied font shape and return an immutable snapshot of it.
 *
 * The returned `bounds` are recomputed from the actual outlines rather than trusted
 * from the input, so downstream fitting and rasterization work from measured geometry.
 *
 * Typed readonly because the result is deeply frozen. Returning it as a mutable FontShape
 * invited a caller to write to something that silently refuses the write in sloppy mode
 * and throws in strict mode, with nothing at compile time to say so.
 */
export default function validateShape(
  value: FontShape | ReadonlyFontShape,
): ReadonlyFontShape {
  const shape = snapshot(value);
  assertMetadata(shape);

  const clusters = clusterOffsets(shape.text);
  const { minX, minY, maxX, maxY } = measureGlyphs(shape, clusters);

  const [bx, by, bw, bh] = shape.bounds;
  if (
    bx > minX + BOUNDS_ROUNDING ||
    by > minY + BOUNDS_ROUNDING ||
    bx + bw < maxX - BOUNDS_ROUNDING ||
    by + bh < maxY - BOUNDS_ROUNDING
  ) {
    fail();
  }

  const measured: [number, number, number, number] = [
    minX,
    minY,
    maxX - minX,
    maxY - minY,
  ];
  // The measured bounds have to satisfy the rule the input bounds did. A width is the
  // difference of two separately permitted coordinates, so it can exceed the per-value
  // limit even when every coordinate is inside it, and the function then returned a
  // shape it would itself reject: validateShape(validateShape(value)) threw.
  // Finiteness alone was not the rule the input bounds satisfied: those also had to be
  // strictly positive in width and height. At large offsets the translation loses
  // precision and a real outline measures zero, so the shape this returned still threw
  // when fed back in, which is the exact round trip this block exists to protect.
  if (!measured.every(finite) || measured[2] <= 0 || measured[3] <= 0) fail();
  shape.bounds = measured;
  Object.freeze(shape.bounds);
  Object.freeze(shape.font);
  shape.glyphs.forEach(Object.freeze);
  Object.freeze(shape.glyphs);
  return Object.freeze(shape);
}
