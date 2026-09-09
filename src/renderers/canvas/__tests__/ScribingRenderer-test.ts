import ren from 'hanzi-writer-data/人.json';
import ScribingRenderer from '../ScribingRenderer';
import RenderTarget from '../RenderTarget';
import Positioner from '../../../Positioner';
import parseCharData from '../../../parseCharData';
import { RenderStateObject } from '../../../RenderState';

const char = parseCharData('人', ren);
const positioner = new Positioner({
  width: 100,
  height: 100,
  padding: 10,
});

describe('ScribingRenderer', () => {
  let target: RenderTarget;

  beforeEach(() => {
    document.body.innerHTML = '<div id="target"></div>';
    target = RenderTarget.init('target');
  });

  it('renders the character and user strokes into the target', () => {
    const charProps = {
      opacity: 0.7,
      strokes: {
        0: {
          opacity: 1,
          displayPortion: 1,
        },
        1: {
          opacity: 1,
          displayPortion: 1,
        },
      },
    };

    const props: RenderStateObject = {
      options: {
        drawingWidth: 4,
        drawingFadeDuration: 400,
        drawingColor: { r: 255, g: 255, b: 0, a: 0.1 },
        strokeColor: { r: 255, g: 100, b: 10, a: 0.9 },
        radicalColor: { r: 0, g: 100, b: 10, a: 1 },
        outlineColor: { r: 255, g: 150, b: 100, a: 0.7 },
        highlightColor: { r: 0, g: 0, b: 255, a: 1 },
      },
      character: {
        outline: charProps,
        main: charProps,
        highlight: charProps,
      },
      userStrokes: {
        17: {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 3 },
          ],
          opacity: 0.9,
        },
      },
    };

    const renderer = new ScribingRenderer(char, positioner);
    renderer.mount(target);
    renderer.render(props);

    expect((target.node.getContext('2d') as any).__getEvents()).toMatchSnapshot();
  });

  it('handles empty user strokes', () => {
    const charProps = {
      opacity: 0.7,
      strokes: {
        0: {
          opacity: 1,
          displayPortion: 1,
        },
        1: {
          opacity: 1,
          displayPortion: 1,
        },
      },
    };

    const props: RenderStateObject = {
      options: {
        drawingWidth: 4,
        drawingFadeDuration: 400,
        drawingColor: { r: 255, g: 255, b: 0, a: 0.1 },
        strokeColor: { r: 255, g: 100, b: 10, a: 0.9 },
        radicalColor: { r: 0, g: 100, b: 10, a: 1 },
        outlineColor: { r: 255, g: 150, b: 100, a: 0.7 },
        highlightColor: { r: 0, g: 0, b: 255, a: 1 },
      },
      character: {
        outline: charProps,
        main: charProps,
        highlight: charProps,
      },
      userStrokes: {
        17: undefined,
      },
    };

    const renderer = new ScribingRenderer(char, positioner);
    renderer.mount(target);
    renderer.render(props);

    expect((target.node.getContext('2d') as any).__getEvents()).toMatchSnapshot();
  });
});

describe('canvas context discipline', () => {
  // The event-log snapshots above are keyed to jest-canvas-mock's internals and told
  // us nothing when its `restore` bookkeeping changed between versions. This asserts
  // the property that actually matters and survives a mock upgrade: the renderer
  // leaves the context stack exactly as it found it.
  it('pairs every save with a restore', () => {
    document.body.innerHTML = '<div id="target"></div>';
    const target = RenderTarget.init('target');
    const strokes = {
      0: { opacity: 1, displayPortion: 1 },
      1: { opacity: 1, displayPortion: 1 },
    };
    const charProps = { opacity: 0.7, strokes };
    const props: RenderStateObject = {
      options: {
        drawingWidth: 4,
        drawingFadeDuration: 400,
        drawingColor: { r: 255, g: 255, b: 0, a: 0.1 },
        strokeColor: { r: 255, g: 100, b: 10, a: 0.9 },
        radicalColor: { r: 0, g: 100, b: 10, a: 1 },
        outlineColor: { r: 255, g: 150, b: 100, a: 0.7 },
        highlightColor: { r: 0, g: 0, b: 255, a: 1 },
      },
      character: { outline: charProps, main: charProps, highlight: charProps },
      userStrokes: {
        17: {
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 3 },
          ],
          opacity: 0.9,
        },
      },
    };

    const renderer = new ScribingRenderer(char, positioner);
    renderer.mount(target);
    const ctx = target.node.getContext('2d')!;
    ctx.__clearEvents();
    renderer.render(props);

    const types = ctx.__getEvents().map((event) => event.type);
    expect(types.filter((type) => type === 'save')).toHaveLength(
      types.filter((type) => type === 'restore').length,
    );

    let depth = 0;
    for (const type of types) {
      if (type === 'save') depth += 1;
      if (type === 'restore') depth -= 1;
      // A restore without a matching save silently unwinds the caller's own state.
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});

describe('canvas lifecycle', () => {
  const strokeStates = (opacity: number) =>
    Object.fromEntries(
      char.strokes.map((_stroke, i) => [i, { opacity, displayPortion: 1 }]),
    );

  const props = (): RenderStateObject => ({
    options: {
      drawingWidth: 4,
      drawingFadeDuration: 300,
      drawingColor: { r: 10, g: 20, b: 30, a: 1 },
      strokeColor: { r: 0, g: 0, b: 0, a: 1 },
      outlineColor: { r: 200, g: 200, b: 200, a: 1 },
      radicalColor: null,
      highlightColor: { r: 255, g: 0, b: 0, a: 1 },
    },
    character: {
      main: { opacity: 1, strokes: strokeStates(1) },
      outline: { opacity: 1, strokes: strokeStates(1) },
      highlight: { opacity: 0, strokes: strokeStates(0) },
    },
    userStrokes: null,
  });

  it('sizes the bitmap to the region it paints', () => {
    document.body.innerHTML = '<div id="target"></div>';
    const target = RenderTarget.init('target');
    const renderer = new ScribingRenderer(char, positioner);
    renderer.mount(target);
    expect(target.node.width).toBe(100);
    expect(target.node.height).toBe(100);
  });

  it('clears what it drew on destroy', () => {
    // Canvas has no scene graph: without this the previous character stayed on screen
    // for the whole of its replacement's load, and forever if that load failed.
    document.body.innerHTML = '<div id="target"></div>';
    const target = RenderTarget.init('target');
    const renderer = new ScribingRenderer(char, positioner);
    renderer.mount(target);
    const ctx = target.getContext()!;
    const clearRect = jest.spyOn(ctx, 'clearRect');

    renderer.destroy();
    expect(clearRect).toHaveBeenCalledWith(0, 0, 100, 100);
  });

  it('paints nothing rather than dereferencing a missing 2d context', () => {
    document.body.innerHTML = '<div id="target"></div>';
    const target = RenderTarget.init('target');
    target.getContext = () => null;
    const renderer = new ScribingRenderer(char, positioner);
    renderer.mount(target);
    expect(() => renderer.render(props())).not.toThrow();
  });

  it('restores the context when a stroke renderer throws', () => {
    // The saved transform would otherwise stay on the stack and every later frame
    // would paint through it a second time.
    document.body.innerHTML = '<div id="target"></div>';
    const target = RenderTarget.init('target');
    const renderer = new ScribingRenderer(char, positioner);
    renderer.mount(target);
    const ctx = target.getContext()!;
    const save = jest.spyOn(ctx, 'save');
    const restore = jest.spyOn(ctx, 'restore');
    jest.spyOn(renderer._mainCharRenderer, 'render').mockImplementation(() => {
      throw new Error('stroke renderer exploded');
    });

    expect(() => renderer.render(props())).toThrow('stroke renderer exploded');
    expect(restore.mock.calls.length).toBe(save.mock.calls.length);
  });
});
