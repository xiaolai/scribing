import { createElm, attrs } from './svgUtils';
import RenderTargetBase from '../RenderTargetBase';

export default class RenderTarget extends RenderTargetBase<SVGSVGElement | SVGElement> {
  static init(elmOrId: Element | string, width = '100%', height = '100%') {
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

    const svg = (() => {
      if (nodeType === 'SVG' || nodeType === 'G') {
        return element;
      }
      const created = createElm('svg');
      element.appendChild(created);
      return created;
    })() as SVGSVGElement;

    attrs(svg, { width, height });
    const defs = createElm('defs');
    svg.appendChild(defs);

    const target = new RenderTarget(svg, defs);
    target._ownsNode = svg !== element;
    return target;
  }

  svg: SVGSVGElement | SVGElement;
  defs: SVGElement;
  /** False for sub-targets, which borrow the root target's <defs>. */
  _ownsDefs = true;
  _pt: DOMPoint | undefined;

  constructor(svg: SVGElement | SVGSVGElement, defs: SVGElement) {
    super(svg);

    this.svg = svg;
    this.defs = defs;

    if ('createSVGPoint' in svg) {
      this._pt = svg.createSVGPoint();
    }
  }

  override destroy() {
    super.destroy();
    // A sub-target shares its parent's <defs>; only the owner may remove it.
    if (this._ownsDefs) this.defs.remove();
  }

  createSubRenderTarget() {
    const group = createElm('g');
    this.svg.appendChild(group);
    const sub = new RenderTarget(group, this.defs);
    sub._ownsNode = true;
    sub._ownsDefs = false;
    return sub;
  }

  /**
   * Convert a client point into SVG user space.
   *
   * `getScreenCTM()` returns null for an element that is not rendered, and
   * `DOMPoint.matrixTransform(undefined)` silently defaults to the identity matrix.
   * Passing that through would return raw client coordinates that look valid and
   * grade every stroke against the wrong space, so a missing or singular matrix
   * falls back to the bounding-rect path instead.
   */
  private _toUserSpace(clientX: number, clientY: number) {
    if (!this._pt || !('getScreenCTM' in this.node)) return undefined;
    const matrix = (this.node as SVGSVGElement).getScreenCTM();
    if (!matrix) return undefined;
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    if (!Number.isFinite(determinant) || determinant === 0) return undefined;
    this._pt.x = clientX;
    this._pt.y = clientY;
    const localPt = this._pt.matrixTransform(matrix.inverse());
    if (!Number.isFinite(localPt.x) || !Number.isFinite(localPt.y)) return undefined;
    return { x: localPt.x, y: localPt.y };
  }

  override _getMousePoint(evt: MouseEvent) {
    return this._toUserSpace(evt.clientX, evt.clientY) ?? super._getMousePoint(evt);
  }

  override _getTouchPoint(evt: TouchEvent) {
    const touch = evt.touches[0] ?? evt.changedTouches[0];
    if (!touch) return super._getTouchPoint(evt);
    return this._toUserSpace(touch.clientX, touch.clientY) ?? super._getTouchPoint(evt);
  }
}
