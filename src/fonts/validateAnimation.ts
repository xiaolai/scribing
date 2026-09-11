import yieldWork from './yieldWork';
import { FontAnimation, ReadonlyFontShape } from './types';
import pathGeometry from './pathGeometry';
import {
  assertPlainArray,
  readPlainArray,
  readPlainArrayIndex,
  readPlainObject,
  readUint16Array,
} from '../validation/plainStructure';

type Stroke = FontAnimation['strokes'][number];
type Tile = FontAnimation['tiles'][number];

const MAX_STROKES = 8192;
const MAX_POINTS = 1000000;
const MAX_TILES = 256;
const MAX_TILE_EDGE = 16384;
const MAX_TOTAL_CELLS = 2097152;
const MAX_GLYPHS_PER_TILE = 256;
/** Font units are bounded well inside this; anything larger is not a real outline. */
const COORD_LIMIT = 1e7;
const BOUNDS_EPSILON = 1e-6;

const fail = (): never => {
  throw new Error('Invalid or mismatched font animation');
};
const object = (value: unknown, keys: string[], optional: string[] = []) =>
  readPlainObject(value, fail, { keys, optional });
const array = (value: unknown, max: number) =>
  readPlainArray(value, fail, { min: 1, max });

const isNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= COORD_LIMIT;
const isLabel = (s: unknown): s is string =>
  typeof s === 'string' && s.length > 0 && s.length <= 256;

/**
 * True every `every` items, so the caller can yield to input.
 *
 * This is a plain predicate rather than an async helper: awaiting a call per item
 * allocated a promise and burned a microtask for the 8,191 items out of 8,192 that were
 * only ever going to return immediately.
 */
const shouldYield = (count: number, every: number) => count % every === 0;

async function readStrokePoints(
  value: unknown,
  budget: { points: number },
  checkpoint: () => void,
) {
  // Validate the container, then read its entries inside the pacing loop. Copying the
  // whole array first meant up to a million descriptors were materialized in one
  // uninterruptible pass before any of the pacing below could run.
  const length = assertPlainArray(value, fail, { min: 1, max: MAX_POINTS });
  const source = value as unknown[];
  const points: ReadonlyArray<number>[] = [];
  for (let i = 0; i < length; i += 1) {
    if (shouldYield(budget.points, 8192)) {
      await yieldWork();
      checkpoint();
    }
    const pair = readPlainArray(readPlainArrayIndex(source, i, fail), fail, {
      min: 2,
      max: 2,
    });
    if (!pair.every(isNumber)) fail();
    if ((budget.points += 1) > MAX_POINTS) fail();
    points.push(Object.freeze(pair as number[]));
  }
  return points;
}

function readStrokeSource(value: unknown, provenance: unknown) {
  if (value === undefined) {
    if (provenance === 'source-adapted') fail();
    return undefined;
  }
  const source = object(value, ['packId', 'unitId', 'planId', 'strokeId']);
  if (!Object.keys(source).every((key) => isLabel(source[key]))) fail();
  if (provenance !== 'source-adapted') fail();
  return Object.freeze(source);
}

async function readStrokes(value: unknown, checkpoint: () => void): Promise<Stroke[]> {
  const raw = array(value, MAX_STROKES);
  const ids = new Set<string>();
  const budget = { points: 0 };
  const strokes: Stroke[] = [];

  for (const entry of raw) {
    checkpoint();
    if (shouldYield(strokes.length, 32)) {
      await yieldWork();
      checkpoint();
    }

    const stroke = object(
      entry,
      ['id', 'points', 'kind', 'provenance', 'source'],
      ['source'],
    );
    if (
      !isLabel(stroke.id) ||
      ids.has(stroke.id) ||
      ['curve', 'dot'].indexOf(stroke.kind as string) < 0 ||
      ['source-adapted', 'generated'].indexOf(stroke.provenance as string) < 0
    ) {
      fail();
    }
    ids.add(stroke.id as string);

    const points = await readStrokePoints(stroke.points, budget, checkpoint);
    if (stroke.kind === 'dot' ? points.length !== 1 : points.length < 2) fail();

    stroke.points = Object.freeze(points);
    stroke.source = readStrokeSource(stroke.source, stroke.provenance);
    if (stroke.source === undefined) delete stroke.source;
    strokes.push(Object.freeze(stroke) as unknown as Stroke);
  }
  return strokes;
}

/**
 * Every glyph the tile claims must fit inside the bounds the tile declares.
 *
 * Returns whether any of them had outline geometry at all. A pathless glyph has nothing
 * to contain, so it is skipped, and a tile whose glyphs are all pathless was therefore
 * left entirely unconstrained by this check.
 */
function assertTileCoversGlyphs(
  tile: Record<string, unknown>,
  shape: ReadonlyFontShape,
): boolean {
  const [x, y, w, h] = tile.bounds as number[];
  let drawable = false;
  for (const index of tile.glyphIndices as number[]) {
    const glyph = shape.glyphs[index];
    const box = pathGeometry(glyph.path);
    if (!box) continue;
    drawable = true;
    if (
      x > box.minX + glyph.x + BOUNDS_EPSILON ||
      y > box.minY + glyph.y + BOUNDS_EPSILON ||
      x + w < box.maxX + glyph.x - BOUNDS_EPSILON ||
      y + h < box.maxY + glyph.y - BOUNDS_EPSILON
    ) {
      fail();
    }
  }
  return drawable;
}

/** Bookkeeping carried across every tile of one animation. */
type TileState = {
  cells: number;
  covered: Set<number>;
  used: Uint8Array;
  /** Tile that claimed each stroke, or -1. See the cross-tile check in readTile. */
  owningTile: Int32Array;
  /** Index of the tile currently being read. */
  tile: number;
};

async function readTile(
  value: unknown,
  shape: ReadonlyFontShape,
  strokeCount: number,
  state: TileState,
  checkpoint: () => void,
): Promise<Tile> {
  const tile = object(value, [
    'glyphIndices',
    'bounds',
    'width',
    'height',
    'owners',
    'progress',
  ]);

  if (
    !Number.isInteger(tile.width) ||
    !Number.isInteger(tile.height) ||
    (tile.width as number) < 1 ||
    (tile.height as number) < 1 ||
    (tile.width as number) > MAX_TILE_EDGE ||
    (tile.height as number) > MAX_TILE_EDGE ||
    (state.cells += (tile.width as number) * (tile.height as number)) > MAX_TOTAL_CELLS
  ) {
    fail();
  }

  const bounds = array(tile.bounds, 4);
  if (
    bounds.length !== 4 ||
    !bounds.every(isNumber) ||
    bounds[2] <= 0 ||
    bounds[3] <= 0
  ) {
    fail();
  }
  tile.bounds = Object.freeze(bounds);

  tile.glyphIndices = Object.freeze(
    array(tile.glyphIndices, MAX_GLYPHS_PER_TILE).map((index) => {
      if (
        !Number.isInteger(index) ||
        (index as number) < 0 ||
        (index as number) >= shape.glyphs.length ||
        state.covered.has(index as number)
      ) {
        fail();
      }
      state.covered.add(index as number);
      return index as number;
    }),
  );
  const drawable = assertTileCoversGlyphs(tile, shape);

  const cells = (tile.width as number) * (tile.height as number);
  // A tile is permitted two million cells, and each of these reads materializes one own
  // property name per cell to prove the instance carries no extra properties. That is
  // a fifth of a second apiece and cannot be broken up, so cancellation is checked
  // either side of them and the scan below is paced like every other loop here.
  checkpoint();
  const owners = readUint16Array(tile.owners, cells, fail);
  checkpoint();
  const progress = readUint16Array(tile.progress, cells, fail);
  checkpoint();
  for (let i = 0; i < owners.length; i += 1) {
    if (shouldYield(i, 32768)) {
      await yieldWork();
      checkpoint();
    }
    const owner = owners[i];
    if (owner > strokeCount) fail();
    // Progress outside conservative coverage is meaningless and would be read anyway.
    if (owner) {
      // A tile with no outline anywhere in it has nothing to reveal, so a stroke it owns
      // is a timed playback step that shows the viewer nothing at all.
      if (!drawable) fail();
      // A stroke may not span tiles. Each tile rescales its strokes' progress to the
      // full clock range on its own, so the two halves of a split stroke would be
      // revealed over the same interval instead of one after the other. There is no
      // coherent timing for it, and the generator never emits one.
      if (state.owningTile[owner - 1] >= 0 && state.owningTile[owner - 1] !== state.tile)
        fail();
      state.owningTile[owner - 1] = state.tile;
      state.used[owner - 1] = 1;
    } else if (progress[i]) fail();
  }
  tile.owners = owners;
  tile.progress = progress;

  return Object.freeze(tile) as unknown as Tile;
}

/**
 * Validate a caller-supplied animation against the shape it claims to describe.
 *
 * Rejects anything that is not bound to `shapeKey`, reuses a glyph across tiles, splits
 * one stroke across tiles, declares a stroke that no tile owns, or leaves a glyph with
 * ink outside every tile. Whether the owned cells actually cover the rendered ink is a
 * question about pixels, so FontWriter answers it against the real raster after this
 * returns. Yields periodically and calls `checkpoint`, which throws if the request has
 * been superseded.
 */
export default async function validateAnimation(
  value: FontAnimation,
  shape: ReadonlyFontShape,
  shapeKey: string,
  checkpoint: () => void,
): Promise<FontAnimation> {
  const data = object(value, [
    'schemaVersion',
    'shapeKey',
    'provenance',
    'strokes',
    'tiles',
  ]);
  if (
    data.schemaVersion !== 1 ||
    typeof data.shapeKey !== 'string' ||
    data.shapeKey !== shapeKey ||
    ['source-adapted', 'generated', 'mixed'].indexOf(data.provenance as string) < 0
  ) {
    fail();
  }

  const strokes = await readStrokes(data.strokes, checkpoint);
  const provenances = new Set(strokes.map((stroke) => stroke.provenance));
  const expected = provenances.size > 1 ? 'mixed' : strokes[0].provenance;
  if (data.provenance !== expected) fail();

  const state: TileState = {
    cells: 0,
    covered: new Set<number>(),
    used: new Uint8Array(strokes.length),
    owningTile: new Int32Array(strokes.length).fill(-1),
    tile: 0,
  };
  const tiles: Tile[] = [];
  for (const entry of readPlainArray(data.tiles, fail, { min: 1, max: MAX_TILES })) {
    await yieldWork();
    checkpoint();
    tiles.push(await readTile(entry, shape, strokes.length, state, checkpoint));
    state.tile += 1;
  }

  // Every declared stroke must be drawn somewhere, and every glyph that has ink must
  // belong to some tile; otherwise playback would leave part of the shape unrevealed.
  if (
    strokes.some((_stroke, i) => !state.used[i]) ||
    shape.glyphs.some((glyph, i) => glyph.path && !state.covered.has(i))
  ) {
    fail();
  }

  data.strokes = Object.freeze(strokes);
  data.tiles = Object.freeze(tiles);
  return Object.freeze(data) as unknown as FontAnimation;
}
