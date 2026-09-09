import { Point } from '../../typings/types';
import RenderTargetBase from '../RenderTargetBase';

/** Edge lengths reported by `getComputedStyle` that sit outside the content box. */
type BoxInsets = { left: number; top: number; right: number; bottom: number };

const parsePx = (value: string | undefined) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

/** A bare number or a pixel length — the only things a canvas bitmap can be sized by. */
const PIXEL_LENGTH = /^-?\d+(\.\d+)?(px)?$/;

export default class RenderTarget extends RenderTargetBase<HTMLCanvasElement> {
  static init(elmOrId: string | HTMLCanvasElement, width = '100%', height = '100%') {
    const element = (() => {
      if (typeof elmOrId === 'string') {
        return document.getElementById(elmOrId);
      }
      return elmOrId;
    })();

    if (!element) {
      throw new Error(`Scribing target element not found: ${elmOrId}`);
    }

    const nodeType = element.nodeName.toUpperCase();

    const canvas = (() => {
      if (nodeType === 'CANVAS') {
        return element as HTMLCanvasElement;
      }
      const created = document.createElement('canvas');
      element.appendChild(created);
      return created;
    })();

    const target = new RenderTarget(canvas);
    target._ownsNode = canvas !== element;
    target.updateDimensions(width, height);
    return target;
  }

  /**
   * A canvas has two sizes: the CSS box it occupies and the bitmap it draws into. The
   * width and height attributes size the bitmap and accept only a pixel count, so
   * writing the default '100%' there was parsed as the integer 100. Every default
   * canvas got a 100x100 buffer, and because a canvas takes its CSS size from that
   * buffer, the writer then measured a 100x100 box as well. A CSS length belongs in the
   * style; the bitmap is sized from the area the renderer will actually paint.
   */
  override updateDimensions(width: string | number, height: string | number) {
    this._applyLength('width', width);
    this._applyLength('height', height);
  }

  private _applyLength(axis: 'width' | 'height', value: string | number) {
    const text = `${value}`.trim();
    if (PIXEL_LENGTH.test(text)) {
      // A pixel count sizes the bitmap, and the CSS box follows it unless the author
      // has styled the canvas — which stays theirs to decide.
      this.node[axis] = Math.max(1, Math.round(Number.parseFloat(text)));
      return;
    }
    // Any other CSS length can only size the box. Sending it to the attribute parsed it
    // as its leading digits, so the default '100%' became a 100-pixel bitmap.
    this.node.style[axis] = text;
  }

  /**
   * Size the bitmap to the region the renderer paints. Assigning to width or height
   * clears the canvas even when the value is unchanged, so this only writes on a real
   * change.
   */
  resizeBitmap(width: number, height: number) {
    const pixelWidth = Math.max(1, Math.round(Number.isFinite(width) ? width : 0));
    const pixelHeight = Math.max(1, Math.round(Number.isFinite(height) ? height : 0));
    if (this.node.width !== pixelWidth) this.node.width = pixelWidth;
    if (this.node.height !== pixelHeight) this.node.height = pixelHeight;
  }

  override destroy() {
    this.getContext()?.clearRect(0, 0, this.node.width, this.node.height);
    super.destroy();
  }

  /**
   * Border and padding belong to the border box that `getBoundingClientRect` reports
   * but not to the content box the bitmap maps onto. Scaling against the border box
   * both offset and stretched every pointer coordinate.
   */
  private _contentInsets(): BoxInsets {
    const view = this.node.ownerDocument?.defaultView;
    if (!view?.getComputedStyle) return { left: 0, top: 0, right: 0, bottom: 0 };
    const style = view.getComputedStyle(this.node);
    return {
      left: parsePx(style.borderLeftWidth) + parsePx(style.paddingLeft),
      top: parsePx(style.borderTopWidth) + parsePx(style.paddingTop),
      right: parsePx(style.borderRightWidth) + parsePx(style.paddingRight),
      bottom: parsePx(style.borderBottomWidth) + parsePx(style.paddingBottom),
    };
  }

  _scalePoint(point: Point): Point {
    const rect = this.getBoundingClientRect();
    const insets = this._contentInsets();
    const width = rect.width - insets.left - insets.right;
    const height = rect.height - insets.top - insets.bottom;
    const x = point.x - insets.left;
    const y = point.y - insets.top;
    return {
      x: width > 0 ? (x * this.node.width) / width : x,
      y: height > 0 ? (y * this.node.height) / height : y,
    };
  }

  override _getMousePoint(evt: MouseEvent) {
    return this._scalePoint(super._getMousePoint(evt));
  }

  override _getTouchPoint(evt: TouchEvent) {
    return this._scalePoint(super._getTouchPoint(evt));
  }

  getContext() {
    return this.node.getContext('2d');
  }
}
