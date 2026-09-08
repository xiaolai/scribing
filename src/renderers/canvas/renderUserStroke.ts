import { ColorObject, Point } from '../../typings/types';
import { drawPath } from './canvasUtils';

export default function renderUserStroke(
  ctx: CanvasRenderingContext2D,
  props: {
    opacity: number;
    strokeWidth: number;
    strokeColor: ColorObject;
    points: Point[];
  },
) {
  if (props.opacity < 0.05) {
    return;
  }
  const { opacity, strokeWidth, strokeColor, points } = props;
  const { r, g, b, a } = strokeColor;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 1) {
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, strokeWidth / 2, 0, 2 * Math.PI);
    ctx.fill();
  } else if (points.length > 1) {
    drawPath(ctx, points);
  }
  ctx.restore();
}
