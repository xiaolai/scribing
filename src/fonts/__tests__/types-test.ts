import { ReadonlyFontShape } from '../types';

/**
 * Compile-time assertions. `@ts-expect-error` fails the build when the following line
 * type-checks, so these are real checks rather than documentation.
 */
describe('ReadonlyFontShape', () => {
  it('keeps bounds a four-element tuple', () => {
    const bounds: ReadonlyFontShape['bounds'] = [0, 0, 100, 100];
    expect(bounds).toHaveLength(4);

    // @ts-expect-error bounds holds exactly four numbers, not an arbitrary list.
    const tooMany: ReadonlyFontShape['bounds'] = [0, 0, 100, 100, 100];
    // @ts-expect-error three is not enough either.
    const tooFew: ReadonlyFontShape['bounds'] = [0, 0, 100];
    void tooMany;
    void tooFew;
  });

  it('keeps glyphs a variable-length readonly array', () => {
    const glyphs: ReadonlyFontShape['glyphs'] = [];
    expect(glyphs).toHaveLength(0);
  });
});
