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
