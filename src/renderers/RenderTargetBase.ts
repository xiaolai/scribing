import { Point } from '../typings/types';

type BoundEvent = {
  getPoint(): Point;
  preventDefault(): void;
};

/** Generic render target */
export default class RenderTargetBase<
  TElement extends HTMLElement | SVGElement | SVGSVGElement | HTMLCanvasElement =
    HTMLElement,
> {
  node: TElement;
  _listenerCleanup: (() => void)[] = [];
  _ownsNode = false;
  /**
   * Identifier of the touch that started the stroke in progress.
   *
   * The end listeners have to be bound to the document so a stroke that leaves the
   * target still finishes, but that means every touchend on the page reached them.
   * Releasing an unrelated finger anywhere terminated the stroke being drawn.
   */
  _activeTouchId: number | undefined;

  constructor(node: TElement) {
    this.node = node;
  }

  addPointerStartListener(callback: (arg: BoundEvent) => void) {
    this._addEventListener(this.node, 'mousedown', (evt) => {
      callback(this._eventify(evt as MouseEvent, this._getMousePoint));
    });
    this._addEventListener(this.node, 'touchstart', (evt) => {
      const touchEvent = evt as TouchEvent;
      // A second finger does not start a second stroke. A recorded id whose touch is no
      // longer down is stale — its touchend never reached us — and must not lock the
      // target out of every later gesture.
      if (this._activeTouchId !== undefined && this._resolveTouch(touchEvent)) return;
      const touch = touchEvent.changedTouches[0];
      if (!touch) return;
      this._activeTouchId = touch.identifier;
      callback(this._eventify(touchEvent, this._getTouchPoint));
    });
  }

  addPointerMoveListener(callback: (arg: BoundEvent) => void) {
    this._addEventListener(this.node, 'mousemove', (evt) => {
      callback(this._eventify(evt as MouseEvent, this._getMousePoint));
    });
    this._addEventListener(this.node, 'touchmove', (evt) => {
      const touchEvent = evt as TouchEvent;
      if (this._activeTouchId !== undefined && !this._resolveTouch(touchEvent)) return;
      callback(this._eventify(touchEvent, this._getTouchPoint));
    });
  }

  addPointerEndListener(callback: () => void) {
    // TODO: find a way to not need global listeners
    this._addEventListener(this.node.ownerDocument, 'mouseup', callback);
    this._addEventListener(this.node.ownerDocument, 'touchend', (evt) => {
      if (!this._endsActiveTouch(evt as TouchEvent)) return;
      this._activeTouchId = undefined;
      callback();
    });
  }

  addPointerCancelListener(callback: () => void) {
    this._addEventListener(this.node.ownerDocument, 'touchcancel', (evt) => {
      if (!this._endsActiveTouch(evt as TouchEvent)) return;
      this._activeTouchId = undefined;
      callback();
    });
  }

  _addEventListener(target: EventTarget, type: string, callback: EventListener) {
    target.addEventListener(type, callback);
    this._listenerCleanup.push(() => target.removeEventListener(type, callback));
  }

  /** Removes listeners and DOM nodes created by this render target. */
  destroy() {
    this._listenerCleanup.forEach((cleanup) => cleanup());
    this._listenerCleanup = [];
    this._activeTouchId = undefined;
    if (this._ownsNode) this.node.remove();
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

  /** The touch that started the current stroke, if this event still carries it. */
  _resolveTouch(evt: TouchEvent): Touch | undefined {
    if (this._activeTouchId === undefined) return undefined;
    return (
      findTouch(evt.touches, this._activeTouchId) ??
      findTouch(evt.changedTouches, this._activeTouchId)
    );
  }

  /** True when this touchend or touchcancel is the end of the stroke in progress. */
  _endsActiveTouch(evt: TouchEvent) {
    if (this._activeTouchId === undefined) return false;
    return findTouch(evt.changedTouches, this._activeTouchId) !== undefined;
  }

  _getMousePoint(evt: MouseEvent): Point {
    const { left, top } = this.getBoundingClientRect();
    const x = evt.clientX - left;
    const y = evt.clientY - top;
    return { x, y };
  }

  _getTouchPoint(evt: TouchEvent): Point {
    // Read the touch that started the stroke. `touches[0]` is only the first finger on
    // the screen, which can belong to an entirely different gesture, and it is empty on
    // touchend and touchcancel where the ended touch has already moved to
    // `changedTouches`. Falling back to the origin beats throwing inside a handler.
    const touch = this._resolveTouch(evt) ?? evt.touches[0] ?? evt.changedTouches[0];
    if (!touch) return { x: 0, y: 0 };
    const { left, top } = this.getBoundingClientRect();
    return { x: touch.clientX - left, y: touch.clientY - top };
  }
}

const findTouch = (list: TouchList, identifier: number) => {
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].identifier === identifier) return list[i];
  }
  return undefined;
};
