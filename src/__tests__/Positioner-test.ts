import Positioner from '../Positioner';

describe('Positioner', () => {
  it('calculates scale and offset to transform characters to fix in the box on screen', () => {
    const positioner = new Positioner({ width: 400, height: 400, padding: 20 });

    expect(positioner.xOffset).toBe(20);
    expect(positioner.yOffset).toBe(63.59375);
    expect(positioner.scale).toBe(0.3515625);
    expect(positioner.height).toBe(400);
  });

  it('converts points from the external reference frame to the character reference frame', () => {
    const positioner = new Positioner({ width: 400, height: 400, padding: 20 });
    expect(positioner.convertExternalPoint({ x: 30, y: 50 })).toEqual({
      x: 28.444444444444443,
      y: 814.6666666666666,
    });
  });

  // A target that is not laid out reports a zero-sized bounding rect, and padding then
  // exceeds it. Before the clamp this produced a negative scale on the character path,
  // which silently mirrored the coordinate space; a zero scale would have produced
  // Infinity and NaN out of convertExternalPoint. Both look like a working writer that
  // rejects every stroke.
  describe.each([
    ['character data', undefined],
    ['a writing unit', [0, 0, 1000, 1000] as [number, number, number, number]],
  ])('with a degenerate target using %s', (_label, bounds) => {
    it('keeps the scale positive and finite', () => {
      const positioner = new Positioner({ width: 0, height: 0, padding: 20, bounds });
      expect(positioner.scale).toBeGreaterThan(0);
      expect(Number.isFinite(positioner.scale)).toBe(true);
    });

    it('keeps converted points finite', () => {
      const positioner = new Positioner({ width: 0, height: 0, padding: 20, bounds });
      const point = positioner.convertExternalPoint({ x: 30, y: 50 });
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    });
  });

  it('does not clamp a drawable area that is merely small', () => {
    const positioner = new Positioner({ width: 100, height: 100, padding: 20 });
    // 100 - 2*20 = 60 across a 1024-unit character box.
    expect(positioner.scale).toBeCloseTo(60 / 1024, 12);
  });
});
