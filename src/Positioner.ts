import { Point } from './typings/types';
import { UnitBounds } from './units/types';

// All makemeahanzi characters have the same bounding box
const CHARACTER_BOUNDS = [
  { x: 0, y: -124 },
  { x: 1024, y: 900 },
];
const [from, to] = CHARACTER_BOUNDS;
const preScaledWidth = to.x - from.x;
const preScaledHeight = to.y - from.y;

/** Floor for the drawable area, so `scale` is never zero and stays invertible. */
const MIN_EFFECTIVE_SIZE = 1e-6;

export type PositionerOptions = {
  bounds?: UnitBounds;
  /** Default: 0 */
  width: number;
  /** Default: 0 */
  height: number;
  /** Default: 20 */
  padding: number;
};

export default class Positioner {
  padding: number;
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  scale: number;

  constructor(options: PositionerOptions) {
    const { padding, width, height } = options;
    // Sanitise once, then store the sanitised values. convertExternalPoint reads
    // this.height directly, so keeping the raw value here would reintroduce the NaN
    // or Infinity that the scale computation below carefully excludes.
    const finite = (value: number) => (Number.isFinite(value) ? value : 0);
    const safePadding = Math.max(0, finite(padding));
    this.padding = safePadding;
    this.width = finite(width);
    this.height = finite(height);

    const bounds = options.bounds;
    const origin = bounds ? { x: bounds[0], y: bounds[1] } : from;
    const sourceWidth = bounds ? bounds[2] : preScaledWidth;
    const sourceHeight = bounds ? bounds[3] : preScaledHeight;
    // Clamp on both paths. An element that is not laid out reports a zero-sized
    // bounding rect, which produced scale 0 and made convertExternalPoint divide by
    // zero, silently mapping every pointer coordinate to Infinity or NaN. Previously
    // only the writing-unit path was clamped.
    // Math.max(1e-6, NaN) is NaN, so clamping alone does not stop a non-finite
    // dimension reaching scale and offset. A NaN scale makes every converted pointer
    // coordinate NaN, which reads as a writer that silently rejects all input.
    const effectiveWidth = Math.max(MIN_EFFECTIVE_SIZE, this.width - 2 * this.padding);
    const effectiveHeight = Math.max(MIN_EFFECTIVE_SIZE, this.height - 2 * this.padding);
    const scaleX = effectiveWidth / sourceWidth;
    const scaleY = effectiveHeight / sourceHeight;

    this.scale = Math.min(scaleX, scaleY);

    const xCenteringBuffer =
      this.padding + (effectiveWidth - this.scale * sourceWidth) / 2;
    const yCenteringBuffer =
      this.padding + (effectiveHeight - this.scale * sourceHeight) / 2;

    this.xOffset = -1 * origin.x * this.scale + xCenteringBuffer;
    this.yOffset = -1 * origin.y * this.scale + yCenteringBuffer;
  }

  convertExternalPoint(point: Point) {
    const x = (point.x - this.xOffset) / this.scale;
    const y = (this.height - this.yOffset - point.y) / this.scale;
    return { x, y };
  }
}
