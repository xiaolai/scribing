import ren from 'hanzi-writer-data/人.json';
import CharacterRenderer from '../CharacterRenderer';
import RenderTarget from '../RenderTarget';
import { copyAndMergeDeep } from '../../../utils';
import parseCharData from '../../../parseCharData';

const char = parseCharData('人', ren);

describe('CharacterRenderer', () => {
  let target: RenderTarget;

  beforeEach(() => {
    document.body.innerHTML = '<div id="target"></div>';
    target = RenderTarget.init('target');
  });

  it('renders a g element and puts strokes inside', () => {
    const props = {
      strokeColor: { r: 120, g: 17, b: 101, a: 0.3 },
      radicalColor: null,
      strokeWidth: 2,
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

    const charRenderer = new CharacterRenderer(char);
    charRenderer.mount(target);
    charRenderer.render(props);

    const subCanvas = target.svg.childNodes[1] as SVGGElement;
    expect(subCanvas.nodeName).toBe('g');
    expect(subCanvas.style.opacity).toBe('0.7');
    // 2 strokes of 人
    expect(subCanvas.childNodes.length).toBe(2);
    (Array.from(subCanvas.childNodes) as SVGElement[]).forEach((node) => {
      expect(node.nodeName).toBe('path');
      expect(node.getAttribute('stroke')).toBe('rgba(120,17,101,0.3)');
    });
  });

  it('updates opacity and updates passed-through props', () => {
    const props1 = {
      strokeColor: { r: 120, g: 17, b: 101, a: 0.3 },
      radicalColor: null,
      strokeWidth: 2,
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

    const props2 = copyAndMergeDeep(props1, {
      strokeColor: { r: 255, g: 255, b: 0, a: 0.1 },
      opacity: 0.9,
    });

    const charRenderer = new CharacterRenderer(char);
    charRenderer.mount(target);
    charRenderer.render(props1);
    charRenderer.render(props2);

    const subCanvas = target.svg.childNodes[1] as SVGGElement;
    expect(subCanvas.nodeName).toBe('g');
    expect(subCanvas.style.opacity).toBe('0.9');
    // 2 strokes of 人
    expect(subCanvas.childNodes.length).toBe(2);
    (Array.from(subCanvas.childNodes) as SVGElement[]).forEach((node) => {
      expect(node.nodeName).toBe('path');
      expect(node.getAttribute('stroke')).toBe('rgba(255,255,0,0.1)');
    });
  });

  it('sets display: none if opacity is 0', () => {
    const props1 = {
      strokeColor: { r: 101, g: 101, b: 101, a: 1 },
      radicalColor: null,
      strokeWidth: 2,
      opacity: 0,
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

    const props2 = copyAndMergeDeep(props1, {
      strokeColor: { r: 255, g: 255, b: 0, a: 0.1 },
      opacity: 0.9,
    });

    const charRenderer = new CharacterRenderer(char);
    charRenderer.mount(target);
    charRenderer.render(props1);
    const subCanvas = target.svg.childNodes[1] as SVGGElement;

    expect(subCanvas.style.opacity).toBe('0');
    expect(subCanvas.style.display).toBe('none');

    charRenderer.render(props2);

    expect(subCanvas.style.opacity).toBe('0.9');
    expect(subCanvas.style.display).toBe('');
  });
});

describe('redundant repainting', () => {
  // The destructuring default `radicalColor = null` applied only to the incoming props,
  // so an omitted radicalColor read as null here and as undefined on the stored props.
  // They never matched, and the outline and highlight layers repainted every stroke on
  // every frame for the life of the writer.
  it('skips strokes whose state has not changed when radicalColor is absent', () => {
    document.body.innerHTML = '<div id="target"></div>';
    const target = RenderTarget.init('target');
    const renderer = new CharacterRenderer(char);
    renderer.mount(target);

    const strokeColor = { r: 1, g: 2, b: 3, a: 1 };
    const strokes = {
      0: { opacity: 1, displayPortion: 1 },
      1: { opacity: 1, displayPortion: 1 },
    };
    renderer.render({ opacity: 1, strokes, strokeColor });

    const spies = renderer._strokeRenderers.map((strokeRenderer) =>
      jest.spyOn(strokeRenderer, 'render'),
    );
    renderer.render({ opacity: 1, strokes, strokeColor });
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('still repaints when the radical colour actually changes', () => {
    document.body.innerHTML = '<div id="target"></div>';
    const target = RenderTarget.init('target');
    const renderer = new CharacterRenderer(char);
    renderer.mount(target);

    const strokeColor = { r: 1, g: 2, b: 3, a: 1 };
    const strokes = {
      0: { opacity: 1, displayPortion: 1 },
      1: { opacity: 1, displayPortion: 1 },
    };
    renderer.render({ opacity: 1, strokes, strokeColor });

    const spies = renderer._strokeRenderers.map((strokeRenderer) =>
      jest.spyOn(strokeRenderer, 'render'),
    );
    renderer.render({
      opacity: 1,
      strokes,
      strokeColor,
      radicalColor: { r: 9, g: 9, b: 9, a: 1 },
    });
    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });
});
