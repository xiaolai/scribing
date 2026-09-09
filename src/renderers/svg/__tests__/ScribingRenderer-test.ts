import ren from 'hanzi-writer-data/人.json';
import ScribingRenderer from '../ScribingRenderer';
import RenderTarget from '../RenderTarget';
import { copyAndMergeDeep } from '../../../utils';
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

  it('adds and removes user stroke renderers as needed', () => {
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

    const props1: RenderStateObject = {
      options: {
        drawingWidth: 4,
        drawingColor: { r: 255, g: 255, b: 0, a: 0.1 },
        highlightColor: { r: 255, g: 255, b: 255, a: 1 },
        strokeColor: { r: 255, g: 255, b: 255, a: 1 },
        radicalColor: { r: 255, g: 255, b: 255, a: 1 },
        outlineColor: { r: 255, g: 255, b: 255, a: 1 },
        drawingFadeDuration: 400,
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

    const props2 = copyAndMergeDeep(props1, { userStrokes: null });

    const renderer = new ScribingRenderer(char, positioner);
    renderer.mount(target);
    renderer.render(props1);

    expect(Object.keys(renderer._userStrokeRenderers)).toEqual(['17']);
    const userStrokes = document.querySelectorAll('svg > g > path');
    expect(userStrokes.length).toBe(1);
    expect(userStrokes[0].getAttribute('opacity')).toBe('0.9');
    expect(userStrokes[0].getAttribute('stroke-width')).toBe('4');
    expect(userStrokes[0].getAttribute('stroke')).toBe('rgba(255,255,0,0.1)');
    expect(userStrokes[0].getAttribute('d')).toBe('M 0 0 L 1 3');

    renderer.render(props2);
    expect(Object.keys(renderer._userStrokeRenderers)).toEqual([]);
    expect(document.querySelectorAll('svg > g > path').length).toBe(0);
  });
});

describe('destroy', () => {
  const strokeStates = (opacity: number) =>
    Object.fromEntries(
      char.strokes.map((_stroke, i) => [i, { opacity, displayPortion: 1 }]),
    );

  // Sub-targets share the root target's <defs>, so emptying it removed the clip paths
  // of every other renderer mounted on the same svg and clipped their strokes away.
  it('leaves another renderer on the same svg intact', () => {
    document.body.innerHTML = '<div id="target"></div>';
    const shared = RenderTarget.init('target');

    const first = new ScribingRenderer(char, positioner);
    const second = new ScribingRenderer(char, positioner);
    first.mount(shared);
    second.mount(shared);

    const clipsAfterMount = shared.defs.querySelectorAll('clipPath').length;
    expect(clipsAfterMount).toBe(char.strokes.length * 6);

    first.destroy();

    // Exactly the first renderer's three character layers are gone.
    expect(shared.defs.querySelectorAll('clipPath').length).toBe(clipsAfterMount / 2);
    expect(shared.svg.querySelectorAll(':scope > g').length).toBe(1);
  });

  it('removes its own group and user strokes', () => {
    document.body.innerHTML = '<div id="target"></div>';
    const shared = RenderTarget.init('target');
    const renderer = new ScribingRenderer(char, positioner);
    renderer.mount(shared);

    renderer.render({
      options: {
        drawingWidth: 4,
        drawingFadeDuration: 300,
        drawingColor: { r: 0, g: 0, b: 0, a: 1 },
        strokeColor: { r: 0, g: 0, b: 0, a: 1 },
        outlineColor: { r: 0, g: 0, b: 0, a: 1 },
        radicalColor: null,
        highlightColor: { r: 0, g: 0, b: 0, a: 1 },
      },
      character: {
        main: { opacity: 1, strokes: strokeStates(1) },
        outline: { opacity: 0, strokes: strokeStates(1) },
        highlight: { opacity: 0, strokes: strokeStates(0) },
      },
      userStrokes: { 17: { points: [{ x: 0, y: 0 }], opacity: 1 } },
    } as unknown as RenderStateObject);

    renderer.destroy();
    expect(renderer._userStrokeRenderers).toEqual({});
    expect(shared.svg.querySelectorAll(':scope > g').length).toBe(0);
    expect(shared.defs.querySelectorAll('clipPath').length).toBe(0);
  });

  it('is safe on a renderer that was never mounted', () => {
    expect(() => new ScribingRenderer(char, positioner).destroy()).not.toThrow();
  });
});
