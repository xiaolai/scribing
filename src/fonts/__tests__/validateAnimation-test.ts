import validateAnimation from '../validateAnimation';
import validateShape from '../validateShape';
import { FontAnimation, ReadonlyFontShape } from '../types';

const noCancel = () => undefined;

/** A single square glyph, 100x100 at the origin. */
const shape = (): ReadonlyFontShape =>
  validateShape({
    schemaVersion: 1,
    text: 'o',
    font: { id: 'fixture', name: 'Fixture', sha256: 'a'.repeat(64) },
    script: 'Latn',
    language: 'en',
    direction: 'ltr',
    em: 1000,
    bounds: [0, 0, 100, 100],
    glyphs: [
      {
        id: 1,
        cluster: 0,
        path: 'M0 0H100V100H0Z',
        x: 0,
        y: 0,
        advanceX: 100,
        advanceY: 0,
      },
    ],
  });

/** A valid animation covering the whole glyph with one generated stroke. */
function animation(shapeKey: string): FontAnimation {
  const cells = 4;
  return {
    schemaVersion: 1,
    shapeKey,
    provenance: 'generated',
    strokes: [
      {
        id: 's1',
        points: [
          [0, 0],
          [100, 100],
        ],
        kind: 'curve',
        provenance: 'generated',
      },
    ],
    tiles: [
      {
        glyphIndices: [0],
        bounds: [0, 0, 100, 100],
        width: 2,
        height: 2,
        owners: Uint16Array.from(new Array(cells).fill(1)),
        progress: Uint16Array.from([0, 21845, 43690, 65535]),
      },
    ],
  };
}

const KEY = 'shape-key';

describe('validateAnimation', () => {
  it('accepts and freezes a well formed animation', async () => {
    const result = await validateAnimation(animation(KEY), shape(), KEY, noCancel);

    expect(result.provenance).toBe('generated');
    expect(result.strokes).toHaveLength(1);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.strokes)).toBe(true);
    expect(Object.isFrozen(result.tiles)).toBe(true);
    expect(Object.isFrozen(result.strokes[0].points)).toBe(true);
  });

  it('copies the typed arrays so later caller mutation cannot reach validated state', async () => {
    const input = animation(KEY);
    const result = await validateAnimation(input, shape(), KEY, noCancel);

    input.tiles[0].owners[0] = 999;
    expect(result.tiles[0].owners[0]).toBe(1);
  });

  it('rejects an animation bound to a different shape', async () => {
    await expect(
      validateAnimation(animation('other-key'), shape(), KEY, noCancel),
    ).rejects.toThrow('Invalid or mismatched font animation');
  });

  it.each([
    ['a wrong schema version', (a: FontAnimation) => ((a as any).schemaVersion = 2)],
    ['an unknown provenance', (a: FontAnimation) => ((a as any).provenance = 'invented')],
    [
      'a provenance that disagrees with its strokes',
      (a: FontAnimation) => ((a as any).provenance = 'source-adapted'),
    ],
    ['an unknown extra key', (a: FontAnimation) => ((a as any).surprise = 1)],
    ['a duplicated stroke id', (a: FontAnimation) => a.strokes.push({ ...a.strokes[0] })],
    [
      'a dot carrying more than one point',
      (a: FontAnimation) => (a.strokes[0].kind = 'dot'),
    ],
    [
      'a source record on a generated stroke',
      (a: FontAnimation) =>
        (a.strokes[0].source = {
          packId: 'p',
          unitId: 'u',
          planId: 'l',
          strokeId: 's',
        }),
    ],
    ['a non-finite coordinate', (a: FontAnimation) => (a.strokes[0].points[0][0] = NaN)],
    [
      'a glyph index out of range',
      (a: FontAnimation) => (a.tiles[0].glyphIndices[0] = 5),
    ],
    ['a zero width tile', (a: FontAnimation) => (a.tiles[0].width = 0)],
    [
      'bounds that do not enclose the glyph',
      (a: FontAnimation) => (a.tiles[0].bounds = [0, 0, 10, 10]),
    ],
    ['an owner beyond the stroke list', (a: FontAnimation) => (a.tiles[0].owners[0] = 7)],
    [
      'progress recorded outside conservative coverage',
      (a: FontAnimation) => {
        a.tiles[0].owners[0] = 0;
        a.tiles[0].progress[0] = 5;
      },
    ],
    [
      'a stroke that no tile draws',
      (a: FontAnimation) => {
        a.strokes.push({ ...a.strokes[0], id: 's2' });
      },
    ],
  ])('rejects %s', async (_label, corrupt) => {
    const input = animation(KEY);
    corrupt(input);
    await expect(validateAnimation(input, shape(), KEY, noCancel)).rejects.toThrow(
      /Invalid or mismatched font animation/,
    );
  });

  it('rejects a tile whose owners array is the wrong length', async () => {
    const input = animation(KEY);
    input.tiles[0].owners = Uint16Array.from([1, 1]);
    await expect(validateAnimation(input, shape(), KEY, noCancel)).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
  });

  it('rejects a getter smuggled in place of a data property', async () => {
    const input = animation(KEY) as unknown as Record<string, unknown>;
    let reads = 0;
    Object.defineProperty(input, 'provenance', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? 'generated' : 'source-adapted';
      },
    });
    await expect(
      validateAnimation(input as unknown as FontAnimation, shape(), KEY, noCancel),
    ).rejects.toThrow('Invalid or mismatched font animation');
  });

  it('rejects an object whose prototype is not Object.prototype', async () => {
    const input = Object.assign(Object.create({ evil: true }), animation(KEY));
    await expect(
      validateAnimation(input as FontAnimation, shape(), KEY, noCancel),
    ).rejects.toThrow('Invalid or mismatched font animation');
  });

  it('rejects an array carrying an extra named property', async () => {
    const input = animation(KEY);
    (input.strokes as unknown as Record<string, unknown>).smuggled = 1;
    await expect(validateAnimation(input, shape(), KEY, noCancel)).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
  });

  it('aborts when the checkpoint reports the request was superseded', async () => {
    await expect(
      validateAnimation(animation(KEY), shape(), KEY, () => {
        throw new Error('Font animation superseded');
      }),
    ).rejects.toThrow('Font animation superseded');
  });

  it('reports mixed provenance when strokes disagree', async () => {
    const input = animation(KEY);
    input.provenance = 'mixed';
    input.strokes.push({
      id: 's2',
      points: [[50, 50]],
      kind: 'dot',
      provenance: 'source-adapted',
      source: { packId: 'p', unitId: 'u', planId: 'l', strokeId: 's' },
    });
    input.tiles[0].owners = Uint16Array.from([1, 1, 2, 2]);

    const result = await validateAnimation(input, shape(), KEY, noCancel);
    expect(result.provenance).toBe('mixed');
    expect(result.strokes).toHaveLength(2);
  });
});

describe('limits and cross-tile constraints', () => {
  it('paces a large tile so cancellation can interrupt its scan', async () => {
    // Reading a tile's two cell arrays materializes one own property name per cell to
    // prove the instance carries no extra properties, and the ownership scan then walks
    // every cell. At the two-million-cell limit that ran as one uninterruptible block,
    // so a superseding request could not be noticed until it finished.
    const sized = (edge: number): FontAnimation => ({
      ...animation(KEY),
      tiles: [
        {
          glyphIndices: [0],
          bounds: [0, 0, 100, 100],
          width: edge,
          height: edge,
          owners: Uint16Array.from(new Array(edge * edge).fill(1)),
          progress: new Uint16Array(edge * edge),
        },
      ],
    });
    const count = async (edge: number) => {
      let calls = 0;
      await validateAnimation(sized(edge), shape(), KEY, () => {
        calls += 1;
      });
      return calls;
    };
    // The count has to grow with the cell count; before, reading a tile offered no
    // cancellation point at all and both sizes checked the same number of times.
    expect(await count(256)).toBeGreaterThan(await count(2));
  });

  it('rejects a tile whose glyphs are all pathless yet owns a stroke', async () => {
    // A space carries no outline, so the per-glyph containment check has nothing to
    // compare against and skips it. A tile made only of such glyphs was therefore
    // unconstrained, and a stroke it owned became a timed step revealing nothing.
    const spaced = validateShape({
      schemaVersion: 1,
      text: 'o ',
      font: { id: 'fixture', name: 'Fixture', sha256: 'a'.repeat(64) },
      script: 'Latn',
      language: 'en',
      direction: 'ltr',
      em: 1000,
      bounds: [0, 0, 300, 100],
      glyphs: [
        {
          id: 1,
          cluster: 0,
          path: 'M0 0H100V100H0Z',
          x: 0,
          y: 0,
          advanceX: 200,
          advanceY: 0,
        },
        { id: 2, cluster: 1, path: '', x: 200, y: 0, advanceX: 100, advanceY: 0 },
      ],
    });
    const blank: FontAnimation = {
      schemaVersion: 1,
      shapeKey: `${spaced.font.sha256}:blank`,
      provenance: 'generated',
      strokes: [
        {
          id: 's1',
          points: [
            [0, 0],
            [100, 100],
          ],
          kind: 'curve',
          provenance: 'generated',
        },
        {
          id: 's2',
          points: [
            [200, 0],
            [300, 100],
          ],
          kind: 'curve',
          provenance: 'generated',
        },
      ],
      tiles: [
        {
          glyphIndices: [0],
          bounds: [0, 0, 100, 100],
          width: 2,
          height: 2,
          owners: Uint16Array.from([1, 1, 1, 1]),
          progress: Uint16Array.from([0, 21845, 43690, 65535]),
        },
        {
          glyphIndices: [1],
          bounds: [200, 0, 100, 100],
          width: 2,
          height: 2,
          owners: Uint16Array.from([2, 2, 2, 2]),
          progress: Uint16Array.from([0, 21845, 43690, 65535]),
        },
      ],
    };
    await expect(
      validateAnimation(blank, spaced, `${spaced.font.sha256}:blank`, noCancel),
    ).rejects.toThrow();
  });

  it('rejects a stroke split across two tiles', async () => {
    // Each tile rescales its strokes' progress to the full clock range on its own, so
    // the two halves of a split stroke would reveal over the same interval instead of
    // one after the other. There is no coherent timing for it.
    const wide = validateShape({
      schemaVersion: 1,
      text: 'oo',
      font: { id: 'fixture', name: 'Fixture', sha256: 'a'.repeat(64) },
      script: 'Latn',
      language: 'en',
      direction: 'ltr',
      em: 1000,
      bounds: [0, 0, 300, 100],
      glyphs: [
        {
          id: 1,
          cluster: 0,
          path: 'M0 0H100V100H0Z',
          x: 0,
          y: 0,
          advanceX: 200,
          advanceY: 0,
        },
        {
          id: 2,
          cluster: 1,
          path: 'M0 0H100V100H0Z',
          x: 200,
          y: 0,
          advanceX: 100,
          advanceY: 0,
        },
      ],
    });

    const split: FontAnimation = {
      schemaVersion: 1,
      shapeKey: KEY,
      provenance: 'generated',
      strokes: [
        {
          id: 's1',
          points: [
            [0, 0],
            [300, 100],
          ],
          kind: 'curve',
          provenance: 'generated',
        },
      ],
      tiles: [0, 200].map((offset) => ({
        glyphIndices: [offset ? 1 : 0],
        bounds: [offset, 0, 100, 100] as [number, number, number, number],
        width: 2,
        height: 2,
        owners: Uint16Array.from([1, 1, 1, 1]),
        progress: Uint16Array.from([0, 21845, 43690, 65535]),
      })),
    };

    await expect(validateAnimation(split, wide, KEY, noCancel)).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
  });

  it.each([
    ['a tile edge of zero', { width: 0 }],
    ['a negative tile edge', { width: -2 }],
    ['a fractional tile edge', { width: 2.5 }],
    ['a tile edge past the limit', { width: 16385 }],
  ])('rejects %s', async (_label, overrides) => {
    const input = animation(KEY);
    Object.assign(input.tiles[0], overrides);
    await expect(validateAnimation(input, shape(), KEY, noCancel)).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
  });

  it('rejects an empty stroke list', async () => {
    const input = animation(KEY);
    input.strokes = [];
    await expect(validateAnimation(input, shape(), KEY, noCancel)).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
  });

  it('rejects an empty tile list', async () => {
    const input = animation(KEY);
    input.tiles = [];
    await expect(validateAnimation(input, shape(), KEY, noCancel)).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
  });

  it('rejects a stroke with a single point', async () => {
    const input = animation(KEY);
    input.strokes[0].points = [[0, 0]];
    await expect(validateAnimation(input, shape(), KEY, noCancel)).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
  });

  it('rejects an owner beyond the declared stroke count', async () => {
    const input = animation(KEY);
    input.tiles[0].owners = Uint16Array.from([1, 1, 1, 2]);
    await expect(validateAnimation(input, shape(), KEY, noCancel)).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
  });

  it('rejects progress recorded outside conservative coverage', async () => {
    const input = animation(KEY);
    input.tiles[0].owners = Uint16Array.from([1, 1, 1, 0]);
    input.tiles[0].progress = Uint16Array.from([0, 21845, 43690, 65535]);
    await expect(validateAnimation(input, shape(), KEY, noCancel)).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
  });
});
