import { CompiledUnit, WritingUnit, UnitPoint } from './types';
import validateUnit from './validateUnit';
import simplifyPoints from './simplifyPoints';

export default function compileUnit(input: WritingUnit): CompiledUnit {
  validateUnit(input);
  const data: WritingUnit = JSON.parse(JSON.stringify(input));
  const scale = 1024 / data.coordinates.em;
  const sign = data.coordinates.yAxis === 'up' ? 1 : -1;
  const convert = ([x, y]: UnitPoint) => ({ x: x * scale, y: y * scale * sign || 0 });
  const [x0, y0, width, height] = data.coordinates.bounds;
  const strokes = data.motorStrokes.map((s) => ({
    id: s.id,
    kind: s.kind,
    points:
      s.kind === 'curve'
        ? simplifyPoints(s.points.map(convert), `motorStrokes.${s.id}.points`)
        : [convert(s.center)],
    width: (s.kind === 'curve' ? s.width : 2 * s.radius) * scale,
    ...(s.kind === 'dot' ? { radius: s.radius * scale } : {}),
    segments: (data.visualSegments || [])
      .filter((v) => v.motorStrokeId === s.id)
      .map((v) => ({
        points: simplifyPoints(v.points.map(convert), `visualSegments.${v.id}.points`),
        width: v.width * scale,
        start: v.start,
        end: v.end,
      })),
  }));
  return {
    data,
    bounds: [
      x0 * scale,
      (sign === 1 ? y0 : -(y0 + height)) * scale || 0,
      width * scale,
      height * scale,
    ],
    ...(data.coordinates.baseline !== undefined
      ? { baseline: data.coordinates.baseline * scale * sign }
      : {}),
    ...(data.coordinates.xHeight !== undefined
      ? { xHeight: data.coordinates.xHeight * scale }
      : {}),
    strokes,
    defaultPlanId: data.defaultPlanId,
    plans: data.plans.map((p) => ({
      id: p.id,
      steps: p.steps.map((s) => ({
        strokeIndex: strokes.findIndex((stroke) => stroke.id === s.strokeId),
        direction: s.direction || 'forward',
      })),
    })),
  };
}
