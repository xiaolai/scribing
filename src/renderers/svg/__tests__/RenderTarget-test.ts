import RenderTarget from '../RenderTarget';

/**
 * jsdom implements neither `getScreenCTM` nor `createSVGPoint`, so every coordinate
 * fell back to subtracting the bounding rect and the inverse-CTM path was never
 * exercised. Install the smallest stubs that let the real mapping code run: a matrix
 * that scales by two and offsets by (10, 20), and a point that applies it.
 */
const installMatrix = (matrix: {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}) => {
  const inverse = () => {
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    return {
      a: matrix.d / determinant,
      b: -matrix.b / determinant,
      c: -matrix.c / determinant,
      d: matrix.a / determinant,
      e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
      f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
    };
  };
  const graphicsProto = SVGGraphicsElement.prototype as unknown as Record<
    string,
    unknown
  >;
  const svgProto = SVGSVGElement.prototype as unknown as Record<string, unknown>;
  graphicsProto.getScreenCTM = () => ({ ...matrix, inverse });
  svgProto.createSVGPoint = () => ({
    x: 0,
    y: 0,
    matrixTransform(this: { x: number; y: number }, m: typeof matrix) {
      return {
        x: m.a * this.x + m.c * this.y + m.e,
        y: m.b * this.x + m.d * this.y + m.f,
      };
    },
  });
  return () => {
    delete graphicsProto.getScreenCTM;
    delete svgProto.createSVGPoint;
  };
};

describe('SVG pointer coordinates', () => {
  let restore = () => undefined as void;

  afterEach(() => restore());

  it('uses the inverse screen matrix on an svg target', () => {
    document.body.innerHTML = '<svg id="target"></svg>';
    restore = installMatrix({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 });
    const target = RenderTarget.init('target');

    expect(
      target._getMousePoint(new MouseEvent('mousedown', { clientX: 50, clientY: 60 })),
    ).toEqual({ x: 20, y: 20 });
  });

  it('uses the inverse screen matrix on a g target', () => {
    // createSVGPoint lives on the <svg> element, so taking it from the node itself left
    // every <g> target subtracting a painted bounding box whose origin is wherever the
    // ink happens to start.
    document.body.innerHTML = '<svg><g id="target"></g></svg>';
    restore = installMatrix({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 });
    const target = RenderTarget.init('target');
    expect(target._pt).toBeDefined();

    expect(
      target._getMousePoint(new MouseEvent('mousedown', { clientX: 50, clientY: 60 })),
    ).toEqual({ x: 20, y: 20 });
  });

  it('falls back to the bounding rect when the matrix is missing', () => {
    document.body.innerHTML = '<svg id="target"></svg>';
    const target = RenderTarget.init('target');
    target.getBoundingClientRect = () => ({ left: 5, top: 7 }) as DOMRect;

    expect(
      target._getMousePoint(new MouseEvent('mousedown', { clientX: 50, clientY: 60 })),
    ).toEqual({ x: 45, y: 53 });
  });

  it('falls back to the bounding rect for a singular matrix', () => {
    // A zero determinant has no inverse, and matrixTransform(undefined) silently uses
    // the identity, which would return raw client coordinates that look plausible.
    document.body.innerHTML = '<svg id="target"></svg>';
    restore = installMatrix({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 });
    const target = RenderTarget.init('target');
    target.getBoundingClientRect = () => ({ left: 5, top: 7 }) as DOMRect;

    expect(
      target._getMousePoint(new MouseEvent('mousedown', { clientX: 50, clientY: 60 })),
    ).toEqual({ x: 45, y: 53 });
  });

  it('reads the touch that started the stroke, not the first finger down', () => {
    document.body.innerHTML = '<svg id="target"></svg>';
    restore = installMatrix({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    const target = RenderTarget.init('target');
    target._activeTouchId = 4;

    const evt = {
      touches: [
        { identifier: 9, clientX: 900, clientY: 900 },
        { identifier: 4, clientX: 30, clientY: 40 },
      ],
      changedTouches: [],
    } as unknown as TouchEvent;
    expect(target._getTouchPoint(evt)).toEqual({ x: 30, y: 40 });
  });
});
