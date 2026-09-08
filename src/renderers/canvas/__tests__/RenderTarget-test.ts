import RenderTarget from '../RenderTarget';

describe('RenderTarget', () => {
  it('can render a canvas into a div on the page', () => {
    document.body.innerHTML = '<div id="target"></canvas>';
    const target = RenderTarget.init('target', '200px', '120px');
    const canvas = document.querySelector<HTMLCanvasElement>('#target canvas');
    expect(canvas!.width).toBe(200);
    expect(canvas!.height).toBe(120);
    expect(target.node).toBe(canvas);
  });

  it('can use an existing canvas on the page', () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    const target = RenderTarget.init('target', '200px', '120px');
    const canvas = document.querySelector<HTMLCanvasElement>('canvas#target');
    expect(canvas!.width).toBe(200);
    expect(canvas!.height).toBe(120);
    expect(target.node).toBe(canvas);
  });

  it('converts mouse and touch CSS pixels to canvas drawing coordinates', () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    const target = RenderTarget.init('target', '400', '300');
    target.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 200, height: 100 } as DOMRect);
    expect(
      target._getMousePoint(new MouseEvent('mousemove', { clientX: 110, clientY: 70 })),
    ).toEqual({ x: 200, y: 150 });
    expect(
      target._getTouchPoint({ touches: [{ clientX: 110, clientY: 70 }] } as any),
    ).toEqual({ x: 200, y: 150 });
  });

  it('does not divide by zero for targets without layout dimensions', () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    const target = RenderTarget.init('target', '400', '300');
    expect(
      target._getMousePoint(new MouseEvent('mousemove', { clientX: 10, clientY: 20 })),
    ).toEqual({ x: 10, y: 20 });
  });

  it("Errors if the element can't be found", () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    expect(() => {
      RenderTarget.init('wrong-target', '200px', '120px');
    }).toThrow('Scribing target element not found: wrong-target');
  });
});
