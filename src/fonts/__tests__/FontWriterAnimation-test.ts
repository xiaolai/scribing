import Scribing from '../../Scribing';
import { FontAnimation, FontShape } from '../types';

/**
 * Animation, playback, pointer input and comparison paths of FontWriter.
 *
 * Canvas is mocked, so pixel semantics are not asserted here; those are covered by the
 * browser gates. What is asserted is the state machine: what supersedes what, what a
 * cancellation releases, and which DOM nodes survive a frame.
 */

const shape = (): FontShape => ({
  schemaVersion: 1,
  text: 'o',
  font: { id: 'fixture', name: 'Fixture', sha256: 'b'.repeat(64) },
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

const animationFor = (shapeKey: string, strokes = 1): FontAnimation => {
  const owners = [1, 1, 2, 2].map((o) => Math.min(o, strokes));
  return {
    schemaVersion: 1,
    shapeKey,
    provenance: 'generated',
    strokes: Array.from({ length: strokes }, (_unused, i) => ({
      id: `s${i}`,
      points: [
        [0, 0],
        [100, 100],
      ] as [number, number][],
      kind: 'curve' as const,
      provenance: 'generated' as const,
    })),
    tiles: [
      {
        glyphIndices: [0],
        bounds: [0, 0, 100, 100],
        width: 2,
        height: 2,
        owners: Uint16Array.from(owners),
        progress: Uint16Array.from([0, 21845, 43690, 65535]),
      },
    ],
  };
};

/**
 * jsdom reports a zero-sized bounding rect and implements neither getScreenCTM nor
 * createSVGPoint, so FontWriter.point() rejects every coordinate. Install the smallest
 * stubs that let the real mapping code run: a 300x300 rect at the origin and an
 * identity screen matrix.
 */
function installGeometryStubs() {
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 300,
    bottom: 300,
    width: 300,
    height: 300,
    toJSON: () => ({}),
  } as DOMRect);

  const identity = {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: 0,
    f: 0,
    inverse() {
      return identity;
    },
  };
  const svgProto = SVGSVGElement.prototype as unknown as Record<string, unknown>;
  svgProto.getScreenCTM = () => identity;
  svgProto.createSVGPoint = () => ({
    x: 0,
    y: 0,
    matrixTransform(this: { x: number; y: number }) {
      return { x: this.x, y: this.y };
    },
  });
  return () => {
    delete svgProto.getScreenCTM;
    delete svgProto.createSVGPoint;
  };
}

const pointerEvent = (type: string, init: Record<string, unknown> = {}) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId: 1,
    button: 0,
    isPrimary: true,
    clientX: 0,
    clientY: 0,
    ...init,
  });

describe('FontWriter animation and input', () => {
  const originalGetContext = (
    HTMLCanvasElement.prototype.getContext as jest.Mock
  ).getMockImplementation()!;

  let frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames = [];
    document.body.innerHTML = '<div id="font"></div>';

    // Every raster probe reports opaque ink, so coverage proofs pass and the tests
    // stay about the state machine rather than about mocked pixels.
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      ...args: unknown[]
    ) {
      const context = originalGetContext.apply(
        this,
        args as never,
      ) as CanvasRenderingContext2D | null;
      if (context) {
        context.getImageData = jest.fn((_x, _y, w: number, h: number) => ({
          data: new Uint8ClampedArray(
            Array.from({ length: Math.max(1, w * h) }, () => [0, 0, 0, 255]).flat(),
          ),
          width: w,
          height: h,
        })) as unknown as CanvasRenderingContext2D['getImageData'];
        context.isPointInPath = jest.fn(() => true) as never;
      }
      return context;
    } as never);

    // Drive requestAnimationFrame by hand so playback is deterministic.
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  /** Run one queued animation frame at the given timestamp. */
  const tick = (time: number) => {
    const queued = frames;
    frames = [];
    queued.forEach((cb) => cb(time));
  };

  const writer = (renderer: 'svg' | 'canvas' = 'svg') =>
    Scribing.createFontWriter('font', { width: 300, height: 300, renderer });

  it('rejects an animation bound to a different shape', async () => {
    const w = writer();
    await w.setShape(shape());
    await expect(w.setAnimation(animationFor('not-this-shape'))).rejects.toThrow(
      'Invalid or mismatched font animation',
    );
    w.destroy();
  });

  it('refuses to play before an animation is attached', async () => {
    const w = writer();
    await w.setShape(shape());
    expect(() => w.animate()).toThrow('Prepare a font animation first');
    w.destroy();
  });

  it.each([
    ['too slow', { speed: 0.1 }],
    ['too fast', { speed: 5 }],
    ['not a number', { speed: NaN }],
    ['a non-boolean loop', { loop: 'yes' as unknown as boolean }],
  ])('rejects playback options that are %s', async (_label, options) => {
    const w = writer();
    await w.setShape(shape());
    await w.setAnimation(animationFor(w.check().shapeId));
    expect(() => w.animate(options)).toThrow('Invalid animation playback options');
    w.destroy();
  });

  it('renders one mask per tile while playing and removes it on cancel', async () => {
    const w = writer('svg');
    await w.setShape(shape());
    await w.setAnimation(animationFor(w.check().shapeId));

    const playback = w.animate();
    tick(0);
    expect(document.querySelectorAll('#font mask')).toHaveLength(1);

    w.cancel();
    await playback;
    expect(document.querySelectorAll('#font mask')).toHaveLength(0);
    w.destroy();
  });

  it('reuses the same mask element across frames instead of rebuilding it', async () => {
    const w = writer('svg');
    await w.setShape(shape());
    await w.setAnimation(animationFor(w.check().shapeId));

    const playback = w.animate();
    tick(0);
    const first = document.querySelector('#font mask');
    tick(50);
    expect(document.querySelector('#font mask')).toBe(first);

    w.cancel();
    await playback;
    w.destroy();
  });

  it('resolves playback once the final stroke completes', async () => {
    const w = writer('svg');
    await w.setShape(shape());
    await w.setAnimation(animationFor(w.check().shapeId));

    const playback = w.animate({ speed: 4 });
    tick(0);
    // Well past the longest possible stroke duration at speed 4.
    tick(100000);
    await expect(playback).resolves.toBeUndefined();
    w.destroy();
  });

  it('keeps looping past the final stroke until cancelled', async () => {
    const w = writer('svg');
    await w.setShape(shape());
    await w.setAnimation(animationFor(w.check().shapeId));

    const playback = w.animate({ loop: true });
    tick(0);
    tick(100000);
    tick(200000);
    expect(document.querySelectorAll('#font mask')).toHaveLength(1);

    w.cancel();
    await playback;
    w.destroy();
  });

  it('supersedes a running animation when the shape changes', async () => {
    const w = writer('svg');
    await w.setShape(shape());
    await w.setAnimation(animationFor(w.check().shapeId));

    const playback = w.animate();
    tick(0);
    const next = shape();
    next.glyphs[0].x = 10;
    next.bounds[0] = 10;
    await w.setShape(next);

    await expect(playback).resolves.toBeUndefined();
    expect(document.querySelectorAll('#font mask')).toHaveLength(0);
    w.destroy();
  });

  it('discards the attached animation when the shape changes', async () => {
    const w = writer('svg');
    await w.setShape(shape());
    await w.setAnimation(animationFor(w.check().shapeId));

    const next = shape();
    next.glyphs[0].x = 10;
    next.bounds[0] = 10;
    await w.setShape(next);

    expect(() => w.animate()).toThrow('Prepare a font animation first');
    w.destroy();
  });

  it('draws the animation on a canvas surface without throwing', async () => {
    const w = writer('canvas');
    await w.setShape(shape());
    await w.setAnimation(animationFor(w.check().shapeId));

    const playback = w.animate();
    tick(0);
    tick(50);
    w.cancel();
    await playback;
    w.destroy();
  });

  describe('pointer input', () => {
    let removeGeometryStubs: () => void;
    beforeEach(() => {
      removeGeometryStubs = installGeometryStubs();
    });
    afterEach(() => removeGeometryStubs());

    const drawStroke = (surface: Element) => {
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }));
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 90 }));
      window.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 90 }));
    };

    it('ignores input until trace or copy is started', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      drawStroke(document.querySelector('#font svg')!);
      expect(w.check().hasInput).toBe(false);
      w.destroy();
    });

    it('records a stroke and reports it through onChange', async () => {
      document.body.innerHTML = '<div id="font"></div>';
      const onChange = jest.fn();
      const w = Scribing.createFontWriter('font', {
        width: 300,
        height: 300,
        renderer: 'svg',
        onChange,
      });
      await w.setShape(shape());
      w.startTrace();
      drawStroke(document.querySelector('#font svg')!);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(w.check().hasInput).toBe(true);
      expect(onChange.mock.calls[0][0].kind).toBe('unordered-shape-comparison');
      w.destroy();
    });

    it('discards a gesture that is cancelled mid-stroke', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      w.startTrace();
      const surface = document.querySelector('#font svg')!;
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }));
      window.dispatchEvent(pointerEvent('pointercancel', { clientX: 20, clientY: 20 }));
      window.dispatchEvent(pointerEvent('pointerup', { clientX: 20, clientY: 20 }));

      expect(w.check().hasInput).toBe(false);
      w.destroy();
    });

    it('ignores a secondary pointer while one is already down', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      w.startTrace();
      const surface = document.querySelector('#font svg')!;
      surface.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1 }));
      surface.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2 }));
      window.dispatchEvent(pointerEvent('pointerup', { pointerId: 2 }));

      expect(w.check().hasInput).toBe(false);
      w.destroy();
    });

    it.each([
      ['a non-primary pointer', { isPrimary: false }],
      ['a secondary button', { button: 2 }],
    ])('ignores %s', async (_label, init) => {
      const w = writer('svg');
      await w.setShape(shape());
      w.startTrace();
      const surface = document.querySelector('#font svg')!;
      surface.dispatchEvent(pointerEvent('pointerdown', init));
      window.dispatchEvent(pointerEvent('pointerup', init));

      expect(w.check().hasInput).toBe(false);
      w.destroy();
    });

    it('clears recorded ink', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      w.startTrace();
      drawStroke(document.querySelector('#font svg')!);
      expect(w.check().hasInput).toBe(true);

      w.clear();
      expect(w.check().hasInput).toBe(false);
      w.destroy();
    });

    it('keeps ink across a resize', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      w.startTrace();
      drawStroke(document.querySelector('#font svg')!);

      w.updateDimensions({ width: 400, height: 260 });
      expect(w.check().hasInput).toBe(true);
      w.destroy();
    });

    it('rejects dimensions outside the supported range', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      expect(() => w.updateDimensions({ width: 8, height: 300 })).toThrow(
        'Invalid FontWriter dimensions',
      );
      expect(() => w.updateDimensions({ width: 300, height: 300, padding: 200 })).toThrow(
        'Invalid FontWriter dimensions',
      );
      w.destroy();
    });
  });

  describe('replay', () => {
    let removeGeometryStubs: () => void;
    beforeEach(() => {
      removeGeometryStubs = installGeometryStubs();
    });
    afterEach(() => removeGeometryStubs());

    it('animates only the recorded ink and then resolves', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      w.startTrace();
      const surface = document.querySelector('#font svg')!;
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }));
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 60, clientY: 90 }));
      window.dispatchEvent(pointerEvent('pointerup', { clientX: 60, clientY: 90 }));

      const playback = w.replay();
      for (let i = 0; i < 10 && frames.length; i += 1) tick(i);
      await expect(playback).resolves.toBeUndefined();
      // Committed ink survives its own replay.
      expect(w.check().hasInput).toBe(true);
      w.destroy();
    });

    it('settles when the shape changes mid-replay', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      w.startTrace();
      const playback = w.replay();
      tick(0);

      const next = shape();
      next.glyphs[0].x = 10;
      next.bounds[0] = 10;
      await w.setShape(next);

      await expect(playback).resolves.toBeUndefined();
      w.destroy();
    });
  });

  it('does not allocate a backing canvas larger than the surface', async () => {
    // A tile only has to CONTAIN its glyphs; validateAnimation never bounds how much
    // larger it may be, and its bounds are capped only at 1e7. Sizing the scratch
    // layer straight from those bounds lets a valid animation descriptor ask for a
    // canvas tens of thousands of pixels on a side.
    const created: HTMLCanvasElement[] = [];
    const realCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation(((
      tag: string,
      ...rest: unknown[]
    ) => {
      const element = realCreate(tag, ...(rest as []));
      if (tag === 'canvas') created.push(element as HTMLCanvasElement);
      return element;
    }) as typeof document.createElement);

    const w = writer('canvas');
    await w.setShape(shape());
    const huge = animationFor(w.check().shapeId);
    huge.tiles[0].bounds = [0, 0, 10_000_000, 10_000_000];
    await w.setAnimation(huge);

    const playback = w.animate();
    tick(0);

    // The surface is 300 CSS px at a device ratio the writer caps at 3.
    const budget = 300 * 3 + 64;
    for (const canvas of created) {
      expect(canvas.width).toBeLessThanOrEqual(budget);
      expect(canvas.height).toBeLessThanOrEqual(budget);
    }

    w.cancel();
    await playback;
    w.destroy();
  });

  describe('work avoided', () => {
    // These pin the two performance claims as observable behaviour rather than as a
    // timing number, which would be noisy on a shared runner and would not say which
    // work was skipped.
    let removeGeometryStubs: () => void;
    beforeEach(() => {
      removeGeometryStubs = installGeometryStubs();
    });
    afterEach(() => removeGeometryStubs());

    it('does not re-render for a pointer move that records no point', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      w.startTrace();
      const surface = document.querySelector('#font svg')!;
      surface.dispatchEvent(pointerEvent('pointerdown', { clientX: 10, clientY: 10 }));

      // render() replaces the whole root group, so its identity is a reliable witness.
      const groupBefore = surface.querySelector('g');
      // Same coordinates: below the movement threshold, so nothing is recorded.
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 10, clientY: 10 }));
      expect(surface.querySelector('g')).toBe(groupBefore);

      // A move that clears the threshold must still render.
      window.dispatchEvent(pointerEvent('pointermove', { clientX: 90, clientY: 90 }));
      expect(surface.querySelector('g')).not.toBe(groupBefore);
      w.destroy();
    });

    it('reuses every animation element across frames, not just the mask', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      await w.setAnimation(animationFor(w.check().shapeId));

      const playback = w.animate();
      tick(0);
      const surface = document.querySelector('#font svg')!;
      const first = {
        mask: surface.querySelector('mask'),
        reveal: surface.querySelector('mask path'),
        ink: surface.querySelector('g[mask]'),
      };
      tick(40);
      tick(80);
      expect(surface.querySelector('mask')).toBe(first.mask);
      expect(surface.querySelector('mask path')).toBe(first.reveal);
      expect(surface.querySelector('g[mask]')).toBe(first.ink);

      w.cancel();
      await playback;
      w.destroy();
    });
  });

  describe('a caller-supplied surface', () => {
    // The writer borrows the canvas; it does not own it. Overwriting role and
    // aria-label and never putting them back leaves the caller's element altered
    // after destroy, which is a mutation of something the caller still holds.
    it('restores attributes it overwrote', async () => {
      document.body.innerHTML =
        '<canvas id="own" role="application" aria-label="mine"></canvas>';
      const canvas = document.querySelector<HTMLCanvasElement>('#own')!;
      const w = Scribing.createFontWriter(canvas, {
        width: 300,
        height: 300,
        renderer: 'canvas',
      });
      await w.setShape(shape());
      expect(canvas.getAttribute('role')).toBe('img');

      w.destroy();
      expect(canvas.getAttribute('role')).toBe('application');
      expect(canvas.getAttribute('aria-label')).toBe('mine');
    });

    it('removes attributes that were absent before it mounted', async () => {
      document.body.innerHTML = '<canvas id="own"></canvas>';
      const canvas = document.querySelector<HTMLCanvasElement>('#own')!;
      const w = Scribing.createFontWriter(canvas, {
        width: 300,
        height: 300,
        renderer: 'canvas',
      });
      await w.setShape(shape());
      w.destroy();

      expect(canvas.hasAttribute('role')).toBe(false);
      expect(canvas.hasAttribute('aria-label')).toBe(false);
    });

    it('still labels a surface it created itself', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      expect(document.querySelector('#font svg')!.getAttribute('role')).toBe('img');
      w.destroy();
    });
  });

  describe('comparison', () => {
    it('reports zero coverage with no ink', async () => {
      const w = writer('svg');
      await w.setShape(shape());
      const result = w.check();

      expect(result.hasInput).toBe(false);
      expect(result.targetCoverage).toBeGreaterThanOrEqual(0);
      expect(result.userAlignment).toBeGreaterThanOrEqual(0);
      expect(result.shapeId).toMatch(/^b{64}:[0-9a-f]+$/);
      w.destroy();
    });

    it('refuses to report before a shape is set', () => {
      const w = writer('svg');
      expect(() => w.check()).toThrow('Set a font shape first');
      w.destroy();
    });
  });
});
