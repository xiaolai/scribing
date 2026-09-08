import { makeUnit, svgPath } from './adapters.mjs';

/** Compile explicitly authored pen movements; a path must never hide a pen lift. */
export function authoredUnit(source, id, model) {
  if (!Array.isArray(model.strokes) || !model.strokes.length || model.strokes.length > 64)
    throw Error(`Invalid authored stroke inventory: ${id}`);
  if (!Number.isFinite(source.width) || source.width <= 0)
    throw Error('Invalid authored stroke width');
  const dots = [];
  const strokes = model.strokes.map((stroke, index) => {
    if (Object.hasOwn(stroke, 'dot')) {
      if (
        Object.hasOwn(stroke, 'path') ||
        !Array.isArray(stroke.dot) ||
        stroke.dot.length !== 2 ||
        !stroke.dot.every(Number.isFinite) ||
        !Number.isFinite(stroke.radius) ||
        stroke.radius <= 0
      )
        throw Error(`Invalid authored dot: ${id}`);
      dots.push(index);
      return [stroke.dot];
    }
    const paths = svgPath(stroke.path);
    if (paths.length !== 1)
      throw Error(`Each authored stroke must contain exactly one pen movement: ${id}`);
    return paths[0];
  });
  const unit = makeUnit(id, id, strokes, source.coordinates, {
    width: source.width,
    dots,
    script: source.script,
    style: source.style,
  });
  for (const index of dots) unit.motorStrokes[index].radius = model.strokes[index].radius;
  unit.plans[0].id = 'textbook';
  unit.defaultPlanId = 'textbook';
  const [x, y, width, height] = source.coordinates.bounds;
  for (const stroke of unit.motorStrokes) {
    const margin = stroke.kind === 'dot' ? stroke.radius : stroke.width / 2;
    const points = stroke.kind === 'dot' ? [stroke.center] : stroke.points;
    if (
      points.some(
        ([px, py]) =>
          px - margin < x ||
          py - margin < y ||
          px + margin > x + width ||
          py + margin > y + height,
      )
    )
      throw Error(`Authored stroke is clipped by its writing frame: ${id}`);
  }
  return unit;
}
