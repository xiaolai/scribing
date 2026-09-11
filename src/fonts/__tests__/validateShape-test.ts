import validateShape from '../validateShape';
import { FontShape } from '../types';

const base = (): FontShape => ({
  schemaVersion: 1,
  text: 'ab',
  font: { id: 'fixture', name: 'Fixture', sha256: 'd'.repeat(64) },
  script: 'Latn',
  language: 'en',
  direction: 'ltr',
  em: 1000,
  bounds: [0, 0, 100, 100],
  glyphs: [
    { id: 1, cluster: 0, path: 'M0 0H10V10H0Z', x: 0, y: 0, advanceX: 10, advanceY: 0 },
    { id: 2, cluster: 1, path: 'M0 0H10V10H0Z', x: 20, y: 0, advanceX: 10, advanceY: 0 },
  ],
});

/**
 * A shape whose coordinates are each inside the limit but whose span is not.
 *
 * Every value here passes on its own: the declared bounds sit at the 1e7 ceiling and the
 * far glyph reaches it only after its own offset is added. The measured width is their
 * difference, which is what exceeds the ceiling.
 */
const spanning = (): FontShape => ({
  ...base(),
  bounds: [0, 0, 1e7, 10],
  glyphs: [
    { id: 1, cluster: 0, path: 'M0 0H10V10H0Z', x: 0, y: 0, advanceX: 10, advanceY: 0 },
    {
      id: 2,
      cluster: 1,
      path: 'M0 0H10000000V10H0Z',
      x: 1,
      y: 0,
      advanceX: 10,
      advanceY: 0,
    },
  ],
});

describe('validateShape', () => {
  it('returns a shape it would accept again', () => {
    const once = validateShape(base());
    expect(() => validateShape(once)).not.toThrow();
    expect(validateShape(once).bounds).toEqual(once.bounds);
  });

  it('refuses a shape whose measured span exceeds the coordinate limit', () => {
    // The recomputed bounds were written back without being checked, so this returned a
    // width above the limit every input value had to satisfy. Feeding that result back
    // in threw, which made the function reject its own output.
    expect(() => validateShape(spanning())).toThrow('Invalid FontShape');
  });
});
