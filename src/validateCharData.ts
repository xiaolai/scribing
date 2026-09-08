import { CharacterJson } from './typings/types';

// Validate the shape used by rendering and geometry before reporting a successful load.
export default function validateCharData(data: CharacterJson) {
  const invalid = (detail: string) => {
    throw new Error(`Invalid character data: ${detail}`);
  };
  if (!data || !Array.isArray(data.strokes) || data.strokes.length === 0) {
    invalid('strokes must be a non-empty array');
  }
  if (!Array.isArray(data.medians) || data.medians.length !== data.strokes.length) {
    invalid('medians must have one entry per stroke');
  }
  for (let index = 0; index < data.strokes.length; index++) {
    if (typeof data.strokes[index] !== 'string' || !data.strokes[index].trim()) {
      invalid(`stroke ${index} must be a non-empty SVG path string`);
    }
    const median = data.medians[index];
    if (!Array.isArray(median) || median.length < 2) {
      invalid(`median ${index} must contain at least two points`);
    }
    for (const point of median) {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !point.every(
          (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
        )
      ) {
        invalid(`median ${index} points must be pairs of finite numbers`);
      }
    }
  }
  if (
    data.radStrokes !== undefined &&
    (!Array.isArray(data.radStrokes) ||
      !data.radStrokes.every(
        (index) => Number.isInteger(index) && index >= 0 && index < data.strokes.length,
      ))
  ) {
    invalid('radStrokes must contain valid stroke indices');
  }
}
