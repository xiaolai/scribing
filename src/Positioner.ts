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
    this.padding = padding;
    this.width = width;
    this.height = height;

    const bounds = options.bounds;
    const origin = bounds ? { x: bounds[0], y: bounds[1] } : from;
    const sourceWidth = bounds ? bounds[2] : preScaledWidth;
    const sourceHeight = bounds ? bounds[3] : preScaledHeight;
    const effectiveWidth = bounds
      ? Math.max(1e-6, width - 2 * padding)
      : width - 2 * padding;
    const effectiveHeight = bounds
      ? Math.max(1e-6, height - 2 * padding)
      : height - 2 * padding;
    const scaleX = effectiveWidth / sourceWidth;
    const scaleY = effectiveHeight / sourceHeight;

    this.scale = Math.min(scaleX, scaleY);

    const xCenteringBuffer = padding + (effectiveWidth - this.scale * sourceWidth) / 2;
    const yCenteringBuffer = padding + (effectiveHeight - this.scale * sourceHeight) / 2;

    this.xOffset = -1 * origin.x * this.scale + xCenteringBuffer;
    this.yOffset = -1 * origin.y * this.scale + yCenteringBuffer;
  }

  convertExternalPoint(point: Point) {
    const x = (point.x - this.xOffset) / this.scale;
    const y = (this.height - this.yOffset - point.y) / this.scale;
    return { x, y };
  }
}
