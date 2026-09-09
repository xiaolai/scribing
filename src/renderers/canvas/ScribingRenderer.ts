import Character from '../../models/Character';
import Positioner from '../../Positioner';
import ScribingRendererBase from '../ScribingRendererBase';
import CanvasRenderTarget from '../canvas/RenderTarget';
import CharacterRenderer from './CharacterRenderer';
import renderUserStroke from './renderUserStroke';
import { RenderStateObject } from '../../RenderState';

export default class ScribingRenderer implements ScribingRendererBase<
  HTMLCanvasElement,
  CanvasRenderTarget
> {
  _character: Character;
  _positioner: Positioner;
  _mainCharRenderer: CharacterRenderer;
  _outlineCharRenderer: CharacterRenderer;
  _highlightCharRenderer: CharacterRenderer;
  _target: CanvasRenderTarget | undefined;

  constructor(character: Character, positioner: Positioner) {
    this._character = character;
    this._positioner = positioner;
    this._mainCharRenderer = new CharacterRenderer(character);
    this._outlineCharRenderer = new CharacterRenderer(character);
    this._highlightCharRenderer = new CharacterRenderer(character);
  }

  mount(target: CanvasRenderTarget) {
    this._target = target;
    // The bitmap has to cover the region this renderer paints. Sizing it from the CSS
    // attributes could not do that: they take a pixel count, so a percentage was
    // truncated to its leading digits and the character was clipped to the remainder.
    target.resizeBitmap(this._positioner.width, this._positioner.height);
  }

  /**
   * Canvas has no scene graph: the last frame stays on the bitmap until something
   * overwrites it. Destruction was a no-op, so the previous character stayed on screen
   * for the whole of its replacement's load, and forever if that load failed.
   */
  destroy() {
    const { width, height } = this._positioner;
    this._target?.getContext()?.clearRect(0, 0, width, height);
    this._target = undefined;
  }

  _animationFrame(cb: (ctx: CanvasRenderingContext2D) => void) {
    const { width, height, scale, xOffset, yOffset } = this._positioner;
    // getContext returns null when the canvas already holds a context of another type,
    // or when the browser refuses one. The non-null assertions turned that into a null
    // dereference on the first frame instead of a frame that simply does not paint.
    const ctx = this._target?.getContext();
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(xOffset, height - yOffset);
    ctx.transform(1, 0, 0, -1, 0, 0);
    ctx.scale(scale, scale);
    try {
      cb(ctx);
    } finally {
      // Restore even when a stroke renderer throws. The saved transform would otherwise
      // stay on the stack and every later frame would paint through it a second time.
      ctx.restore();
    }
    // @ts-expect-error Verify if this is still needed for the "wechat miniprogram".
    if (ctx.draw) {
      // @ts-expect-error
      ctx.draw();
    }
  }

  render(props: RenderStateObject) {
    const { outline, main, highlight } = props.character;
    const {
      outlineColor,
      strokeColor,
      radicalColor,
      highlightColor,
      drawingColor,
      drawingWidth,
    } = props.options;

    this._animationFrame((ctx) => {
      this._outlineCharRenderer.render(ctx, {
        opacity: outline.opacity,
        strokes: outline.strokes,
        strokeColor: outlineColor,
      });
      this._mainCharRenderer.render(ctx, {
        opacity: main.opacity,
        strokes: main.strokes,
        strokeColor: strokeColor,
        radicalColor: radicalColor,
      });
      this._highlightCharRenderer.render(ctx, {
        opacity: highlight.opacity,
        strokes: highlight.strokes,
        strokeColor: highlightColor,
      });

      const userStrokes = props.userStrokes || {};

      for (const userStrokeId in userStrokes) {
        const userStroke = userStrokes[userStrokeId];
        if (userStroke) {
          const userStrokeProps = {
            strokeWidth: drawingWidth,
            strokeColor: drawingColor,
            ...userStroke,
          };
          renderUserStroke(ctx, userStrokeProps);
        }
      }
    });
  }
}
