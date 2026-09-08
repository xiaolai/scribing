import { Point } from '../../typings/types';
import RenderTargetBase from '../RenderTargetBase';

export default class RenderTarget extends RenderTargetBase<HTMLCanvasElement> {
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);
  }

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
      const canvas = document.createElement('canvas');
      element.appendChild(canvas);
      return canvas;
    })();

    canvas.setAttribute('width', width);
    canvas.setAttribute('height', height);

    const target = new RenderTarget(canvas);
    target._ownsNode = canvas !== element;
    return target;
  }

  destroy() {
    this.getContext()?.clearRect(0, 0, this.node.width, this.node.height);
    super.destroy();
  }

  _scalePoint(point: Point): Point {
    const { width, height } = this.getBoundingClientRect();
    return {
      x: width > 0 ? (point.x * this.node.width) / width : point.x,
      y: height > 0 ? (point.y * this.node.height) / height : point.y,
    };
  }

  _getMousePoint(evt: MouseEvent) {
    return this._scalePoint(super._getMousePoint(evt));
  }

  _getTouchPoint(evt: TouchEvent) {
    return this._scalePoint(super._getTouchPoint(evt));
  }

  getContext() {
    return this.node.getContext('2d');
  }
}
