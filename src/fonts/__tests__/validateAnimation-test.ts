import validateAnimation from '../validateAnimation';
import validateShape from '../validateShape';
import { FontAnimation, FontShape } from '../types';

const noCancel = () => undefined;

/** A single square glyph, 100x100 at the origin. */
const shape = (): FontShape =>
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
