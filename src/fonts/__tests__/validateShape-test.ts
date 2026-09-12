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
  it('types its frozen result as read-only', () => {
    // The result is deeply frozen, so a write throws at runtime. Typing it mutable
    // offered callers a write the object refuses. `@ts-expect-error` fails the build if
    // these ever type-check again.
    const validated = validateShape(base());
    const write = () => {
      // @ts-expect-error a validated shape is read-only.
      validated.em = 2000;
      // @ts-expect-error its bounds are read-only too.
      validated.bounds[0] = 5;
    };
    // The compiler refuses both lines above; the object refuses them at run time too.
    expect(Object.isFrozen(validated)).toBe(true);
    expect(write).toThrow(TypeError);
  });

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

  it.each([
    ['bounds that are not an array', { bounds: 'nope' }],
    ['bounds with the wrong number of entries', { bounds: [0, 0] }],
    ['no glyphs at all', { glyphs: [] }],
    ['a font that is not an object', { font: null }],
    ['a font that is a string', { font: 'fixture' }],
  ])('still refuses %s', (_label, override) => {
    // These were each rejected twice: once by the structural copy and once by a predicate
    // after it. The predicates are gone; the copy still has to refuse every one of them.
    expect(() =>
      validateShape({ ...base(), ...(override as Partial<FontShape>) }),
    ).toThrow('Invalid FontShape');
  });

  it('refuses more glyphs than the copy admits', () => {
    const glyph = base().glyphs[0];
    expect(() =>
      validateShape({
        ...base(),
        text: 'a'.repeat(64),
        glyphs: Array.from({ length: 5000 }, (_unused, i) => ({
          ...glyph,
          id: i + 1,
          cluster: 0,
        })),
      }),
    ).toThrow('Invalid FontShape');
  });
});

test('a shape whose outlines measure to zero size is rejected, not returned', () => {
  // The measured bounds must satisfy the rule the declared bounds did. Checking only
  // finiteness let a subpixel outline at a large offset measure zero width, so
  // validateShape returned a shape that validateShape itself would throw on.
  const shape = base();
  shape.bounds = [1e7, 1e7, 1, 1];
  shape.glyphs = [
    {
      id: 1,
      cluster: 0,
      path: 'M0 0H1e-10V1e-10H0Z',
      x: 1e7,
      y: 1e7,
      advanceX: 10,
      advanceY: 0,
    },
  ];
  shape.text = 'a';
  expect(() => validateShape(shape)).toThrow();
});
