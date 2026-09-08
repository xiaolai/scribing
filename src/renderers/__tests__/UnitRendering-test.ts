import SVGUserStrokeRenderer from '../svg/UserStrokeRenderer';
import renderUserStroke from '../canvas/renderUserStroke';
import Stroke from '../../models/Stroke';
import Positioner from '../../Positioner';
import SVGStrokeRenderer from '../svg/StrokeRenderer';
import CanvasStrokeRenderer from '../canvas/StrokeRenderer';
import RenderTarget from '../svg/RenderTarget';
import { CompiledMotorStroke } from '../../units/types';
const props = {
  strokeColor: { r: 12, g: 30, b: 40, a: 0.4 },
  radicalColor: null,
  opacity: 0.7,
  displayPortion: 0.5,
};
const curve: CompiledMotorStroke = {
  id: 'line',
  kind: 'curve',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 30 },
  ],
  width: 8,
  segments: [],
};
const model = (unit: CompiledMotorStroke) => {
  const stroke = new Stroke('', unit.points, 0);
  stroke.unit = unit;
  return stroke;
};
const mount = (unit: CompiledMotorStroke) => {
  document.body.innerHTML = '<div id="target"></div>';
  const target = RenderTarget.init('target');
  const renderer = new SVGStrokeRenderer(model(unit)).mount(target);
  return { renderer, target };
};
it('reveals native curves by length without a legacy clip mask', () => {
  const { renderer, target } = mount(curve);
  renderer.render(props);
  expect(target.defs.childNodes).toHaveLength(0);
  const path = target.svg.querySelector('path')!;
  expect(path.getAttribute('d')).toBe('M 0 0 L 10 0 L 10 10');
  expect(path.getAttribute('stroke-width')).toBe('8');
  renderer.render({ ...props, displayPortion: 0 });
  expect(path.style.opacity).toBe('0');
});
it('reveals pieces at their own motor-stroke intervals', () => {
  const { renderer, target } = mount({
    ...curve,
    segments: [
      {
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ],
        width: 3,
        start: 0,
        end: 0.5,
      },
      {
        points: [
          { x: 50, y: 0 },
          { x: 70, y: 0 },
        ],
        width: 5,
        start: 0.5,
        end: 1,
      },
    ],
  });
  renderer.render(props);
  const paths = target.svg.querySelectorAll('path');
  expect(paths).toHaveLength(2);
  expect(paths[0].getAttribute('d')).toBe('M 0 0 L 20 0');
  expect((paths[1] as SVGElement).style.opacity).toBe('0');
  renderer.render({ ...props, displayPortion: 0.75 });
  expect(paths[1].getAttribute('d')).toBe('M 50 0 L 60 0');
});
it('renders one-point dots with matching SVG and Canvas radius', () => {
  const dot: CompiledMotorStroke = {
    id: 'dot',
    kind: 'dot',
    points: [{ x: 7, y: 9 }],
    radius: 6,
    width: 12,
    segments: [],
  };
  const { renderer, target } = mount(dot);
  renderer.render(props);
  expect(target.svg.querySelector('circle')!.getAttribute('r')).toBe('3');
  const ctx = document.createElement('canvas').getContext('2d')!;
  new CanvasStrokeRenderer(model(dot), false).render(ctx, props);
  expect(ctx.arc).toHaveBeenCalledWith(7, 9, 3, 0, 2 * Math.PI);
  expect(ctx.fill).toHaveBeenCalled();
  expect(ctx.clip).not.toHaveBeenCalled();
});
it('draws matching partial polylines in Canvas without Path2D', () => {
  const ctx = document.createElement('canvas').getContext('2d')!;
  new CanvasStrokeRenderer(model(curve), false).render(ctx, props);
  expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
  expect(ctx.lineTo).toHaveBeenLastCalledWith(10, 10);
  expect(ctx.clip).not.toHaveBeenCalled();
});
it('fits nonsquare unit bounds and round-trips input coordinates', () => {
  const p = new Positioner({
    width: 400,
    height: 200,
    padding: 20,
    bounds: [-100, -50, 400, 200],
  });
  expect(p.scale).toBe(0.8);
  const point = p.convertExternalPoint({
    x: 42 * p.scale + p.xOffset,
    y: 200 - p.yOffset - 73 * p.scale,
  });
  expect(point.x).toBeCloseTo(42);
  expect(point.y).toBeCloseTo(73);
  const tiny = new Positioner({
    width: 0,
    height: 0,
    padding: 20,
    bounds: [0, 0, 100, 200],
  });
  expect(tiny.scale).toBeGreaterThan(0);
  expect(Number.isFinite(tiny.convertExternalPoint({ x: 0, y: 0 }).x)).toBe(true);
});

it('shows a tap as a genuine circle then removes it when movement starts', () => {
  document.body.innerHTML = '<div id="target"></div>';
  const target = RenderTarget.init('target');
  const renderer = new SVGUserStrokeRenderer();
  renderer.mount(target);
  const tap = {
    strokeColor: props.strokeColor,
    strokeWidth: 8,
    opacity: 0.6,
    points: [{ x: 5, y: 6 }],
  };
  renderer.render(tap);
  expect(target.svg.querySelector('circle')!.getAttribute('r')).toBe('4');
  renderer.render({ ...tap, points: [...tap.points, { x: 8, y: 9 }] });
  expect(target.svg.querySelector('circle')).toBeNull();
  renderer.destroy();
  expect(target.svg.querySelector('path')).toBeNull();
  const ctx = document.createElement('canvas').getContext('2d')!;
  renderUserStroke(ctx, tap);
  expect(ctx.arc).toHaveBeenCalledWith(5, 6, 4, 0, 2 * Math.PI);
  expect(ctx.fill).toHaveBeenCalled();
});

it('keeps fractional unit coordinates identical across renderers', () => {
  const fractional = {
    ...curve,
    points: [
      { x: 0.12345, y: 0.67891 },
      { x: 9.87654, y: 2.34567 },
    ],
  };
  const { renderer, target } = mount(fractional);
  renderer.render({ ...props, displayPortion: 1 });
  expect(target.svg.querySelector('path')!.getAttribute('d')).toBe(
    'M 0.12345 0.67891 L 9.87654 2.34567',
  );
  const ctx = document.createElement('canvas').getContext('2d')!;
  new CanvasStrokeRenderer(model(fractional)).render(ctx, {
    ...props,
    displayPortion: 1,
  });
  expect(ctx.lineTo).toHaveBeenLastCalledWith(9.87654, 2.34567);
});

it('constructs Canvas renderers when the Path2D global is absent', () => {
  const original = globalThis.Path2D;
  try {
    (globalThis as any).Path2D = undefined;
    expect(() => new CanvasStrokeRenderer(model(curve))).not.toThrow();
    expect(
      () => new CanvasStrokeRenderer(new Stroke('M 0 0 L 10 10', curve.points, 0)),
    ).not.toThrow();
  } finally {
    globalThis.Path2D = original;
  }
});
