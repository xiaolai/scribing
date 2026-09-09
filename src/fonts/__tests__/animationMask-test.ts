import { prepareMaskField, maskPath } from '../animationMask';
import { FontAnimation } from '../types';

type Tile = FontAnimation['tiles'][number];

const noCancel = () => undefined;

/**
 * Build a tile whose cells are laid out row-major, `owners` holding stroke index + 1
 * and `progress` holding the reveal clock normalized to 0..65535.
 */
function tile(width: number, height: number, owners: number[], progress: number[]): Tile {
  return {
    glyphIndices: [0],
    bounds: [0, 0, width, height],
    width,
    height,
    owners: Uint16Array.from(owners),
    progress: Uint16Array.from(progress),
  };
}

/**
 * Signed area of every subpath in an SVG path made only of M/L/Z, which is all
 * animationMask emits. Area is the load-bearing property: the mask covers exactly the
 * cells it should, and shared edges between adjacent cells have cancelled rather than
 * leaving a seam or a doubled region.
 */
function pathArea(d: string): number {
  let total = 0;
  for (const sub of d.split('M').filter(Boolean)) {
    const numbers = (sub.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let area = 0;
    for (let i = 0; i + 3 < numbers.length; i += 2) {
      area += numbers[i] * numbers[i + 3] - numbers[i + 2] * numbers[i + 1];
    }
    // Close the ring back to its first point.
    if (numbers.length >= 4) {
      const lastX = numbers[numbers.length - 2];
      const lastY = numbers[numbers.length - 1];
      area += lastX * numbers[1] - numbers[0] * lastY;
    }
    total += area / 2;
  }
  return total;
}

/** Count of distinct subpaths, i.e. rings, in the emitted path. */
const ringCount = (d: string) => (d.match(/M/g) ?? []).length;

describe('animationMask', () => {
  describe('prepareMaskField', () => {
    it('reports the first and last stroke present in the tile', async () => {
      // Two strokes: row 0 belongs to stroke 1, row 1 to stroke 2.
      const t = tile(2, 2, [1, 1, 2, 2], [0, 65535, 0, 65535]);
      const field = await prepareMaskField(t, noCancel);
      expect(field.first).toBe(0);
      expect(field.last).toBe(1);
    });

    it('ignores cells outside conservative coverage', async () => {
      const t = tile(3, 1, [0, 1, 0], [0, 32767, 0]);
      const field = await prepareMaskField(t, noCancel);
      expect(field.first).toBe(0);
      expect(field.last).toBe(0);
      // Only the middle cell is owned, so the completed mask has unit area.
      expect(pathArea(field.full)).toBeCloseTo(1, 9);
    });

    it('propagates a cancellation from the checkpoint', async () => {
      const t = tile(2, 1, [1, 1], [0, 65535]);
      await expect(
        prepareMaskField(t, () => {
          throw new Error('superseded');
        }),
      ).rejects.toThrow('superseded');
    });
  });

  describe('outline geometry', () => {
    it('cancels the shared edge between adjacent cells into one ring', async () => {
      // Four cells in a row. Emitted naively that is four unit squares sharing three
      // internal edges; the outline must collapse to a single 4x1 ring, because a
      // compound fill of abutting squares shows rasterizer seams at the joins.
      const t = tile(4, 1, [1, 1, 1, 1], [0, 21845, 43690, 65535]);
      const field = await prepareMaskField(t, noCancel);

      expect(ringCount(field.full)).toBe(1);
      expect(pathArea(field.full)).toBeCloseTo(4, 9);
    });

    it('keeps a disconnected component as its own ring', async () => {
      // Two cells separated by a gap belong to the same stroke but do not touch.
      const t = tile(3, 1, [1, 0, 1], [0, 0, 65535]);
      const field = await prepareMaskField(t, noCancel);

      expect(ringCount(field.full)).toBe(2);
      expect(pathArea(field.full)).toBeCloseTo(2, 9);
    });

    it('emits a hole with opposite winding to its enclosing ring', async () => {
      // A 3x3 ring of owned cells around one unowned centre. Signed areas must cancel
      // to the covered area, which only happens if the hole winds the other way.
      const owners = [1, 1, 1, 1, 0, 1, 1, 1, 1];
      const t = tile(
        3,
        3,
        owners,
        owners.map((o) => (o ? 32767 : 0)),
      );
      const field = await prepareMaskField(t, noCancel);

      expect(ringCount(field.full)).toBe(2);
      expect(Math.abs(pathArea(field.full))).toBeCloseTo(8, 9);
    });
  });

  describe('maskPath', () => {
    const bar = () => tile(4, 1, [1, 1, 1, 1], [0, 21845, 43690, 65535]);

    it('reveals nothing before the stroke starts', async () => {
      const t = bar();
      const field = await prepareMaskField(t, noCancel);
      expect(maskPath(t, field, -1, 0.5)).toBe('');
    });

    it('returns the completed mask once the last stroke finishes', async () => {
      const t = bar();
      const field = await prepareMaskField(t, noCancel);
      expect(maskPath(t, field, 0, 1)).toBe(field.full);
      expect(maskPath(t, field, 1, 0)).toBe(field.full);
    });

    it('never shrinks the revealed area as the stroke progresses', async () => {
      const t = bar();
      const field = await prepareMaskField(t, noCancel);

      let previous = -Infinity;
      for (let i = 0; i <= 20; i += 1) {
        const area = pathArea(maskPath(t, field, 0, i / 20));
        expect(area).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = area;
      }
      // The final frame covers every owned cell.
      expect(previous).toBeCloseTo(4, 9);
    });

    it('reveals no more than the stroke it is playing', async () => {
      // Stroke 1 owns the top row, stroke 2 the bottom row. Halfway through stroke 1,
      // no part of stroke 2 may have appeared.
      const t = tile(2, 2, [1, 1, 2, 2], [0, 65535, 0, 65535]);
      const field = await prepareMaskField(t, noCancel);

      expect(pathArea(maskPath(t, field, 0, 1))).toBeLessThanOrEqual(2 + 1e-9);
      expect(pathArea(maskPath(t, field, 1, 1))).toBeCloseTo(4, 9);
    });

    it('carries completed strokes into every later frame', async () => {
      const t = tile(2, 2, [1, 1, 2, 2], [0, 65535, 0, 65535]);
      const field = await prepareMaskField(t, noCancel);

      // At the very start of stroke 2, all of stroke 1 is still revealed.
      expect(pathArea(maskPath(t, field, 1, 0))).toBeGreaterThanOrEqual(2 - 1e-9);
    });

    it('memoizes a repeated frame instead of recomputing it', async () => {
      const t = bar();
      const field = await prepareMaskField(t, noCancel);

      // render() runs more than once for a single animation state: cancel() and
      // resize both re-render. The memo must return the identical string, not an
      // equal one rebuilt from scratch.
      const first = maskPath(t, field, 0, 0.5);
      expect(maskPath(t, field, 0, 0.5)).toBe(first);
    });

    it('does not round distinct frames together', async () => {
      // Quantizing the memo key was tried and reverted: at high device pixel ratios
      // the analytic tolerance is tighter than the rounding error, and the contour
      // gate detects the difference. Nearby fractions must stay distinguishable.
      const t = bar();
      const field = await prepareMaskField(t, noCancel);

      const frames = new Set<string>();
      for (let i = 0; i <= 64; i += 1) frames.add(maskPath(t, field, 0, i / 64));
      expect(frames.size).toBeGreaterThan(4);
    });
  });
});
