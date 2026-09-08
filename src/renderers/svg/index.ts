import { RenderTargetInitFunction } from '../../typings/types';
import ScribingRenderer from './ScribingRenderer';
import RenderTarget from './RenderTarget';

export default {
  ScribingRenderer,
  createRenderTarget: RenderTarget.init as RenderTargetInitFunction<
    SVGSVGElement | SVGElement
  >,
};
