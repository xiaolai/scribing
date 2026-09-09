import Scribing from '../Scribing';
import { FontShape } from '../fonts/types';
import validateShape from '../fonts/validateShape';
const sample = (): FontShape => ({
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
      path: 'M0 0H100V100H0Z M25 25V75H75V25Z',
      x: 0,
      y: 0,
      advanceX: 100,
      advanceY: 0,
    },
  ],
});
const create = (renderer: 'svg' | 'canvas' = 'svg') => {
  document.body.innerHTML = '<div id="font"></div>';
  return Scribing.createFontWriter('font', { width: 300, height: 300, renderer });
};
describe('formal font shapes', () => {
  // This unit suite exercises lifecycle with mocked Canvas. Real pixel semantics are browser-gated.
  const originalContext = (
    HTMLCanvasElement.prototype.getContext as jest.Mock
  ).getMockImplementation()!;
  beforeEach(() => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      ...args: any[]
    ) {
      const context = originalContext.apply(
        this,
        args as any,
      ) as CanvasRenderingContext2D;
      if (context)
        context.getImageData = jest.fn(
          () =>
            ({
              data: new Uint8ClampedArray([0, 0, 0, 255]),
              width: 1,
              height: 1,
            }) as ImageData,
        );
      return context;
    } as any);
  });
  afterEach(() => jest.restoreAllMocks());
  it('rejects malformed numeric paths, nonfinite positions and oversized geometry', () => {
    for (const path of [
      'M0',
      'M0 0L1',
      'M0 0Z 2',
      'MNaN 0',
      'M0 0L1e99 2',
      '<script>',
      'M0 0A1 1 0 3 0 2 2',
    ]) {
      const s = sample();
      s.glyphs[0].path = path;
      expect(() => validateShape(s)).toThrow();
    }
    const s = sample();
    s.glyphs[0].x = NaN;
    expect(() => validateShape(s)).toThrow();
  });
  it('rejects accessors, coercion objects, invalid scalar clusters and false bounds without executing code', () => {
    let called = 0;
    const withGetter = sample();
    Object.defineProperty(withGetter, 'text', {
      enumerable: true,
      get() {
        called += 1;
        return 'o';
      },
    });
    expect(() => validateShape(withGetter)).toThrow();
    const withJSON = {
      ...sample(),
      toJSON() {
        called += 1;
        return sample();
      },
    };
    expect(() => validateShape(withJSON)).toThrow();
    const withHash = sample();
    (withHash.font as any).sha256 = {
      toString() {
        called += 1;
        return 'a'.repeat(64);
      },
    };
    expect(() => validateShape(withHash)).toThrow();
    expect(called).toBe(0);
    for (const [value, cluster] of [
      ['\ud800', 0],
      ['o', 1],
      ['𧒑', 1],
    ] as [string, number][]) {
      const s = sample();
      s.text = value;
      s.glyphs[0].cluster = cluster;
      expect(() => validateShape(s)).toThrow();
    }
    const bounds = sample();
    bounds.bounds = [0, 0, 1, 1];
    expect(() => validateShape(bounds)).toThrow();
    const separators = sample();
    separators.glyphs[0].path = 'M,0,0L100 0L100 100L0 100Z';
    expect(() => validateShape(separators)).toThrow();
  });
  it('snapshots outline geometry, maintains holes and distinguishes changed shapes', async () => {
    const w = create(),
      s = sample();
    await w.setShape(s);
    const original = document.querySelector('path')!.getAttribute('d');
    s.glyphs[0].path = 'M1 1L2 2';
    expect(document.querySelector('path')!.getAttribute('d')).toBe(original);
    expect(document.querySelector('path')!.getAttribute('fill-rule')).toBe('nonzero');
    const first = w.check().shapeId;
    const next = sample();
    next.glyphs[0].x = 10;
    next.bounds[0] = 10;
    await w.setShape(next);
    expect(w.check().shapeId).not.toBe(first);
    w.destroy();
  });
  it.each(['svg', 'canvas'] as const)(
    'supports trace/copy visibility, resize, cancellation and teardown in %s',
    async (renderer) => {
      const w = create(renderer);
      await w.setShape(sample());
      w.startCopy();
      expect(w.check().hasInput).toBe(false);
      w.showReference();
      w.startTrace();
      w.updateDimensions({ width: 400, height: 250 });
      const replay = w.replay();
      w.cancel();
      await replay;
      w.clear();
      w.destroy();
      w.destroy();
      expect(document.querySelector('#font')!.children.length).toBe(0);
      expect(() => w.startTrace()).toThrow(/destroyed/);
    },
  );
});

describe('font shape rejection boundaries', () => {
  it.each([
    ['a line separator', 0x85],
    ['a control sequence introducer', 0x9b],
    ['a C1 control at the low end', 0x80],
    ['a C1 control at the high end', 0x9f],
  ])('rejects text containing %s', (_label, code) => {
    // The check only looked below U+0020 and at U+007F, so the whole C1 block passed.
    const shape = sample();
    shape.text = `o${String.fromCharCode(code)}`;
    expect(() => validateShape(shape)).toThrow('Invalid FontShape');
  });

  it.each([
    ['an empty text', { text: '' }],
    ['a zero em', { em: 0 }],
    ['a negative em', { em: -1000 }],
    ['a non-finite em', { em: Infinity }],
    ['an unknown direction', { direction: 'diagonal' }],
    ['a wrong schema version', { schemaVersion: 2 }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => validateShape(Object.assign(sample(), overrides) as any)).toThrow(
      'Invalid FontShape',
    );
  });

  it('rejects an empty glyph list', () => {
    const shape = sample();
    shape.glyphs = [];
    expect(() => validateShape(shape)).toThrow('Invalid FontShape');
  });

  it('rejects a cluster that does not start a scalar', () => {
    const shape = sample();
    shape.text = '\u{1F600}';
    // Offset 1 is the middle of the surrogate pair.
    shape.glyphs[0].cluster = 1;
    expect(() => validateShape(shape)).toThrow('Invalid FontShape');
  });

  it('rejects a path separated by a non-breaking space', () => {
    // The SVG grammar allows only tab, newline, form feed, carriage return and space.
    // JavaScript's \s also matches U+00A0, so a path separated by one validated here
    // and was then rejected or silently truncated by the renderer parsing it for real.
    const shape = sample();
    shape.glyphs[0].path = 'M0 0H100\u00A0V100H0Z';
    expect(() => validateShape(shape)).toThrow('Invalid FontShape');
  });

  it('still accepts the ordinary separators the grammar allows', () => {
    const shape = sample();
    shape.glyphs[0].path = 'M0,0\tH100\nV100\r H0 Z';
    expect(() => validateShape(shape)).not.toThrow();
  });
});
