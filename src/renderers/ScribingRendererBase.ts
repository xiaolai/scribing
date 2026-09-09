import Character from '../models/Character';
import Positioner from '../Positioner';
import { RenderStateObject } from '../RenderState';
import RenderTargetBase from './RenderTargetBase';

export default interface ScribingRendererBase<
  TElementType extends HTMLElement | HTMLCanvasElement | SVGElement | SVGSVGElement,
  TRenderTarget extends RenderTargetBase<TElementType>,
> {
  _character: Character;
  _positioner: Positioner;

  mount(target: TRenderTarget): void;

  render(props: RenderStateObject): void;

  destroy(): void;
}

/** Any element a render target can be built on. */
export type RenderTargetElement =
  HTMLElement | HTMLCanvasElement | SVGElement | SVGSVGElement;

/**
 * A renderer for any supported element type.
 *
 * The two parameters used to be `any`, which accepted anything at all — including a
 * `mount` that wanted a number — and pushed the mismatch to the first frame.
 */
export type AnyScribingRenderer = ScribingRendererBase<
  RenderTargetElement,
  RenderTargetBase<RenderTargetElement>
>;

export interface ScribingRendererConstructor {
  new (character: Character, positioner: Positioner): AnyScribingRenderer;
}
