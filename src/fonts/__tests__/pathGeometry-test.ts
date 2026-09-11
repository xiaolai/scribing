import pathGeometry, { contourProbes } from '../pathGeometry';
import yieldWork from '../yieldWork';

/** Shorthand for the bounding box, which is what callers actually consume. */
const box = (d: string) => {
  const g = pathGeometry(d)!;
  return [g.minX, g.minY, g.maxX, g.maxY].map((n) => Math.round(n * 1e6) / 1e6);
};

describe('pathGeometry', () => {
  it('returns undefined for an empty path', () => {
    expect(pathGeometry('')).toBeUndefined();
  });

  it('measures straight line commands, absolute and relative', () => {
    expect(box('M0 0L10 20Z')).toEqual([0, 0, 10, 20]);
    expect(box('M0 0l10 20Z')).toEqual([0, 0, 10, 20]);
    expect(box('M5 5H15V25Z')).toEqual([5, 5, 15, 25]);
    expect(box('M5 5h10v20Z')).toEqual([5, 5, 15, 25]);
  });

  it('finds the true extremum of a quadratic, not just its endpoints', () => {
    // Control point at y=100 pulls the curve to y=50 at its apex, never to 100.
    const g = pathGeometry('M0 0Q50 100 100 0Z')!;
    expect(g.maxY).toBeCloseTo(50, 6);
    expect(g.minY).toBeCloseTo(0, 6);
  });

  it('finds the true extremum of a cubic', () => {
    // Both controls at y=100; the curve peaks at 75, well inside the control hull.
    const g = pathGeometry('M0 0C0 100 100 100 100 0Z')!;
    expect(g.maxY).toBeCloseTo(75, 6);
  });

  it('solves a cubic whose leading coefficient vanishes', () => {
    // a = -v0 + 3v1 - 3v2 + v3 == 0, so the derivative is linear, not quadratic.
    const g = pathGeometry('M0 0C0 30 100 30 100 0Z')!;
    expect(g.maxY).toBeGreaterThan(0);
    expect(g.maxY).toBeLessThan(30);
  });

  it('reflects the previous control point for a smooth cubic', () => {
    const smooth = pathGeometry('M0 0C0 50 50 50 50 0S100 -50 100 0Z')!;
    // The reflected control pushes the second segment below the axis.
    expect(smooth.minY).toBeLessThan(0);
  });

  it('treats a smooth command after a non-curve as starting from the current point', () => {
    const g = pathGeometry('M0 0L10 0S20 20 30 0Z')!;
    expect(g.maxY).toBeGreaterThan(0);
    expect(g.maxX).toBeCloseTo(30, 6);
  });

  it('reflects the previous control point for a smooth quadratic', () => {
    const g = pathGeometry('M0 0Q10 20 20 0T40 0Z')!;
    // T mirrors the Q control below the axis on the second segment.
    expect(g.minY).toBeLessThan(0);
    expect(g.maxX).toBeCloseTo(40, 6);
  });

  it('accumulates area across subpaths and reports each contour', () => {
    const g = pathGeometry('M0 0H10V10H0Z M20 0H30V10H20Z')!;
    expect(g.contours).toHaveLength(2);
    expect(g.area).toBeCloseTo(200, 6);
  });

  it('treats trailing coordinate pairs after M as implicit line commands', () => {
    expect(box('M0 0 10 0 10 10Z')).toEqual([0, 0, 10, 10]);
  });

  it.each([
    ['no leading moveto', 'L10 10'],
    ['a truncated coordinate pair', 'M0 0L1'],
    ['a stray token', 'M0 0Z 2'],
    ['a non-numeric coordinate', 'MNaN 0'],
    ['an out-of-range magnitude', 'M0 0L1e99 2'],
    ['a doubled comma', 'M0,,0'],
    ['a comma against a command', 'M0 0,L1 1'],
    ['a trailing comma', 'M0 0L1 1,'],
    ['an unknown command', 'M0 0X5 5'],
    ['arguments on a close command', 'M0 0Z5'],
  ])('rejects %s', (_label, d) => {
    expect(() => pathGeometry(d)).toThrow('Invalid FontShape outline geometry');
  });
});

describe('contourProbes', () => {
  const contour = pathGeometry('M0 0H10V10H0Z')!.contours[0];

  it('returns nothing for a contour that is already solid enough to sample', () => {
    // Wide, tall and well filled: the caller's raster already covers it.
    expect(contourProbes(contour, 1, () => true)).toEqual([]);
  });

  it('probes interior points of a thin contour', () => {
    const thin = pathGeometry('M0 0H10V0.5H0Z')!.contours[0];
    const points = contourProbes(thin, 1, () => true);
    expect(points.length).toBeGreaterThan(0);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(thin.minX);
      expect(x).toBeLessThanOrEqual(thin.maxX);
      expect(y).toBeGreaterThanOrEqual(thin.minY);
      expect(y).toBeLessThanOrEqual(thin.maxY);
    }
  });

  it('falls back to a fixed lattice when no scanline point is accepted', () => {
    const thin = pathGeometry('M0 0H10V0.5H0Z')!.contours[0];
    let calls = 0;
    // Reject every scanline candidate, then accept once the lattice fallback starts.
    const points = contourProbes(thin, 1, () => ++calls > 40);
    expect(points.length).toBeLessThanOrEqual(1);
  });

  it('returns nothing when the caller accepts no point at all', () => {
    const thin = pathGeometry('M0 0H10V0.5H0Z')!.contours[0];
    expect(contourProbes(thin, 1, () => false)).toEqual([]);
  });
});

describe('yieldWork', () => {
  it('falls back to a timer when MessageChannel is unavailable', async () => {
    // jsdom does not implement MessageChannel, so this is the path tests take by
    // default. Asserted explicitly so the fallback is not merely incidental.
    expect(typeof MessageChannel).toBe('undefined');
    await expect(yieldWork()).resolves.toBeUndefined();
  });

  it('uses a MessageChannel when one exists, and releases both ports', async () => {
    const closed: string[] = [];
    class StubPort {
      onmessage: ((event: unknown) => void) | null = null;
      peer?: StubPort;
      constructor(private readonly name: string) {}
      postMessage() {
        // Deliver on the entangled port, asynchronously, as a real channel does.
        setTimeout(() => this.peer?.onmessage?.({}), 0);
      }
      close() {
        closed.push(this.name);
      }
    }
    class StubChannel {
      port1 = new StubPort('port1');
      port2 = new StubPort('port2');
      constructor() {
        this.port1.peer = this.port2;
        this.port2.peer = this.port1;
      }
    }
    (globalThis as Record<string, unknown>).MessageChannel = StubChannel;
    try {
      await expect(yieldWork()).resolves.toBeUndefined();
    } finally {
      delete (globalThis as Record<string, unknown>).MessageChannel;
    }

    // A retained port keeps the task source alive; both ends must be released.
    expect(closed.sort()).toEqual(['port1', 'port2']);
  });
});

describe('numerical conditioning', () => {
  it('finds a curve extremum that the direct quadratic formula loses', () => {
    // The derivative's roots come from a quadratic whose linear term dominates here, so
    // `(-b + sqrt(d)) / 2a` subtracts two nearly equal numbers and most of that root's
    // digits go with it. The reported maximum was 431.4049586776862 against a true
    // 432.1428571428564, and these bounds are what every fit and containment check uses.
    const g = pathGeometry('M0 0C1 1100 2 100 3 -2999.99999999999Z')!;
    expect(g.maxY).toBeCloseTo(432.1428571428564, 6);
  });

  it('sweeps a tall sparse contour without an entry per edge per row', () => {
    // Every edge here spans the full height, so recording each one in every row it
    // crosses cost 602 edges times 16,384 rows. This path is under four thousand
    // characters against a half-million limit and allocated 189 MB; the active-edge
    // sweep holds each edge once.
    const H = 100000;
    const parts: string[] = ['M0 0'];
    for (let i = 1; i <= 600; i++) parts.push(`L${i % 2 ? 1 : 0} ${i % 2 ? H : 0}`);
    const box = pathGeometry(parts.join('') + 'Z')!.contours[0];

    global.gc?.();
    const before = process.memoryUsage().heapUsed;
    contourProbes(box, 1, () => false);
    const usedMb = (process.memoryUsage().heapUsed - before) / 1048576;
    expect(usedMb).toBeLessThan(60);
  });

  it('probes a thin annulus whose rings are each individually dense', () => {
    // A ring's own area is the whole region it encloses, so both rings of a thin annulus
    // look nearly solid and the density shortcut fired for each. The ink actually
    // present is the sliver between them, and it was never probed at all.
    const ring = (r: number, cx = 50, cy = 50, n = 64) => {
      const points: string[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        points.push(
          `${(cx + r * Math.cos(a)).toFixed(4)} ${(cy + r * Math.sin(a)).toFixed(4)}`,
        );
      }
      return 'M' + points.join('L') + 'Z';
    };
    const geometry = pathGeometry(ring(50) + ring(49.7))!;
    const outer = geometry.contours[0];

    expect(contourProbes(outer, 1, () => true)).toEqual([]);
    expect(contourProbes(outer, 1, () => true, geometry.contours).length).toBeGreaterThan(
      0,
    );
  });

  it('still skips a solid contour once its holes are discounted', () => {
    // The discount must not turn every filled shape into a probing job: a square with a
    // modest hole is still dense enough to skip.
    const geometry = pathGeometry('M0 0H100V100H0Z M25 25V75H75V25Z')!;
    expect(contourProbes(geometry.contours[0], 1, () => true, geometry.contours)).toEqual(
      [],
    );
  });
});
