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
      ({ left: 10, top: 20, width: 200, height: 100 }) as DOMRect;
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

describe('bitmap sizing', () => {
  // The width and height attributes take a pixel count. '100%' was parsed as its
  // leading digits, so every default canvas got a 100x100 buffer, and because a canvas
  // takes its CSS size from that buffer the writer measured a 100x100 box too.
  it('does not turn a percentage into a hundred-pixel bitmap', () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    const target = RenderTarget.init('target');
    expect(target.node.width).not.toBe(100);
    expect(target.node.style.width).toBe('100%');
  });

  it('keeps a percentage on one axis from shrinking the other', () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    const target = RenderTarget.init('target', 300);
    expect(target.node.width).toBe(300);
    expect(target.node.height).not.toBe(100);
  });

  it('leaves author CSS alone for a pixel count', () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    const target = RenderTarget.init('target', '250px', '250px');
    expect(target.node.width).toBe(250);
    expect(target.node.style.width).toBe('');
  });

  it('resizes the bitmap to the painted region', () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    const target = RenderTarget.init('target');
    target.resizeBitmap(420, 380);
    expect(target.node.width).toBe(420);
    expect(target.node.height).toBe(380);
  });

  it('does not rewrite an unchanged bitmap size', () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    const target = RenderTarget.init('target', 200, 200);
    // Assigning width or height clears the canvas even when the value is unchanged.
    const widths: number[] = [];
    Object.defineProperty(target.node, 'width', {
      get: () => 200,
      set: (value: number) => widths.push(value),
      configurable: true,
    });
    target.resizeBitmap(200, 200);
    expect(widths).toEqual([]);
  });

  it('clamps a degenerate painted region to a usable bitmap', () => {
    document.body.innerHTML = '<canvas id="target"></canvas>';
    const target = RenderTarget.init('target');
    target.resizeBitmap(0, NaN);
    expect(target.node.width).toBe(1);
    expect(target.node.height).toBe(1);
  });
});

describe('pointer coordinates with border and padding', () => {
  // getBoundingClientRect reports the border box; the bitmap maps onto the content box.
  // Scaling against the border box both offset and stretched every coordinate.
  it('maps through the content box', () => {
    document.body.innerHTML =
      '<canvas id="target" style="border: 10px solid black; padding: 5px"></canvas>';
    const target = RenderTarget.init('target', '400', '400');
    // 200 CSS pixels of content inside a 230-pixel border box.
    target.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 230, height: 230 }) as DOMRect;

    const point = target._getMousePoint(
      new MouseEvent('mousemove', { clientX: 115, clientY: 115 }),
    );
    expect(point.x).toBeCloseTo(200, 6);
    expect(point.y).toBeCloseTo(200, 6);
  });
});
