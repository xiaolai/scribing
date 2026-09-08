import { extendStart } from '../../geometry';
import { drawPath, pathStringToCanvas } from './canvasUtils';
import StrokeRendererBase from '../StrokeRendererBase';
import Stroke from '../../models/Stroke';
import { ColorObject, Point } from '../../typings/types';
import { revealPoints, unitPieces, segmentPortion } from '../unitGeometry';

/** this is a stroke composed of several stroke parts */
export default class StrokeRenderer extends StrokeRendererBase {
  _extendedMaskPoints: Point[];

  // Conditionally set on constructor
  _path2D: Path2D | undefined;
  _pathCmd: ((ctx: CanvasRenderingContext2D) => void) | undefined;

  constructor(stroke: Stroke, usePath2D = true) {
    super(stroke);

    if (stroke.unit) {
      this._extendedMaskPoints = [];
      return;
    }
    if (usePath2D && typeof Path2D !== 'undefined') {
      this._path2D = new Path2D(this.stroke.path);
    } else {
      this._pathCmd = pathStringToCanvas(this.stroke.path);
    }
    this._extendedMaskPoints = extendStart(
      this.stroke.points,
      StrokeRendererBase.STROKE_WIDTH / 2,
    );
  }

  render(
    ctx: CanvasRenderingContext2D,
    props: {
      opacity: number;
      strokeColor: ColorObject;
      radicalColor?: ColorObject | null;
      displayPortion: number;
    },
  ) {
    if (this.stroke.unit) {
      const unit = this.stroke.unit;
      const portion = Math.max(0, Math.min(1, props.displayPortion));
      if (props.opacity <= 0 || portion <= 0) return;
      ctx.save();
      const { r, g, b, a } = this._getColor(props);
      ctx.globalAlpha = props.opacity;
      ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      if (unit.kind === 'dot') {
        ctx.beginPath();
        ctx.arc(
          unit.points[0].x,
          unit.points[0].y,
          unit.radius! * portion,
          0,
          2 * Math.PI,
        );
        ctx.fill();
      } else {
        unitPieces(unit).forEach((piece) => {
          const points = revealPoints(
            piece.points,
            segmentPortion(portion, piece.start, piece.end),
          );
          if (points.length < 2) return;
          ctx.lineWidth = piece.width;
          drawPath(ctx, points);
        });
      }
      ctx.restore();
      return;
    }
    if (props.opacity < 0.05) {
      return;
    }
    ctx.save();

    if (this._path2D) {
      ctx.clip(this._path2D);
    } else {
      this._pathCmd?.(ctx);
      // wechat bugs out if the clip path isn't stroked or filled
      ctx.globalAlpha = 0;
      ctx.stroke();
      ctx.clip();
    }

    const { r, g, b, a } = this._getColor(props);
    const color = a === 1 ? `rgb(${r},${g},${b})` : `rgb(${r},${g},${b},${a})`;
    const dashOffset = this._getStrokeDashoffset(props.displayPortion);
    ctx.globalAlpha = props.opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = StrokeRendererBase.STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // wechat sets dashOffset as a second param here. Should be harmless for browsers to add here too
    // @ts-ignore
    ctx.setLineDash([this._pathLength, this._pathLength], dashOffset);
    ctx.lineDashOffset = dashOffset;
    drawPath(ctx, this._extendedMaskPoints);

    ctx.restore();
  }
}
