import { Point } from '../typings/types';

type BoundEvent = {
  getPoint(): Point;
  preventDefault(): void;
};

/** Generic render target */
export default class RenderTargetBase<
  TElement extends
    | HTMLElement
    | SVGElement
    | SVGSVGElement
    | HTMLCanvasElement = HTMLElement
> {
  node: TElement;
  _listenerCleanup: (() => void)[] = [];
  _ownsNode = false;

  constructor(node: TElement) {
    this.node = node;
  }

  addPointerStartListener(callback: (arg: BoundEvent) => void) {
    this._addEventListener(this.node, 'mousedown', (evt) => {
      callback(this._eventify(evt as MouseEvent, this._getMousePoint));
    });
    this._addEventListener(this.node, 'touchstart', (evt) => {
      callback(this._eventify(evt as TouchEvent, this._getTouchPoint));
    });
  }

  addPointerMoveListener(callback: (arg: BoundEvent) => void) {
    this._addEventListener(this.node, 'mousemove', (evt) => {
      callback(this._eventify(evt as MouseEvent, this._getMousePoint));
    });
    this._addEventListener(this.node, 'touchmove', (evt) => {
      callback(this._eventify(evt as TouchEvent, this._getTouchPoint));
    });
  }

  addPointerEndListener(callback: () => void) {
    // TODO: find a way to not need global listeners
    this._addEventListener(this.node.ownerDocument, 'mouseup', callback);
    this._addEventListener(this.node.ownerDocument, 'touchend', callback);
  }

  _addEventListener(target: EventTarget, type: string, callback: EventListener) {
    target.addEventListener(type, callback);
    this._listenerCleanup.push(() => target.removeEventListener(type, callback));
  }

  /** Removes listeners and DOM nodes created by this render target. */
  destroy() {
    this._listenerCleanup.forEach((cleanup) => cleanup());
    this._listenerCleanup = [];
    if (this._ownsNode) this.node.remove();
  }

  addPointerCancelListener(callback: () => void) {
    this._addEventListener(this.node.ownerDocument, 'touchcancel', callback);
  }

  getBoundingClientRect() {
    return this.node.getBoundingClientRect();
  }

  updateDimensions(width: string | number, height: string | number) {
    this.node.setAttribute('width', `${width}`);
    this.node.setAttribute('height', `${height}`);
  }

  _eventify<TEvent extends Event>(evt: TEvent, pointFunc: (event: TEvent) => Point) {
    return {
      getPoint: () => pointFunc.call(this, evt),
      preventDefault: () => evt.preventDefault(),
    };
  }

  _getMousePoint(evt: MouseEvent): Point {
    const { left, top } = this.getBoundingClientRect();
    const x = evt.clientX - left;
    const y = evt.clientY - top;
    return { x, y };
  }

  _getTouchPoint(evt: TouchEvent): Point {
    const { left, top } = this.getBoundingClientRect();
    const x = evt.touches[0].clientX - left;
    const y = evt.touches[0].clientY - top;
    return { x, y };
  }
}
