import { prepareMaskField, maskPath, MaskField } from './animationMask';
import validateShape from './validateShape';
import validateAnimation from './validateAnimation';
import pathGeometry, { contourProbes } from './pathGeometry';
import {
  FontShape,
  FontComparison,
  FontWriterOptions,
  FontAnimation,
  FontAnimationOptions,
} from './types';

type Point = { x: number; y: number };
const NS = 'http://www.w3.org/2000/svg';
const MAX_STROKES = 1024;
const MAX_POINTS = 65536;
const MASK_SIZE = 192;

/** Unordered tracing/copying against filled font outlines; no stroke-order quiz. */
export default class FontWriter {
  private host: HTMLElement;
  private surface: SVGSVGElement | HTMLCanvasElement;
  private owned = true;
  private options: FontWriterOptions;
  private shape?: FontShape;
  private animation?: FontAnimation;
  private animationState?: { stroke: number; progress: number };
  private animationSerial = 0;
  private animationRestoreEnabled?: boolean;
  private maskCaches: MaskField[] = [];
  private animationLayer?: HTMLCanvasElement;
  /** SVG mask/ink elements, rebuilt only when the attached animation changes. */
  private svgAnimationNodes?: {
    animation: FontAnimation;
    tiles: { mask: SVGMaskElement; reveal: SVGPathElement; ink: SVGGElement }[];
  };
  // Declared before the instance field that consumes it: a static initializer runs at
  // class-definition time, but reading it from an instance field before its own
  // declaration is a temporal-dead-zone hazard the compiler now rejects.
  private static nextAnimationId = 0;
  private animationId = `scribing-font-animation-${FontWriter.nextAnimationId++}`;
  private shapeId = '';
  private paths: Path2D[] = [];
  private strokes: Point[][] = [];
  /** Total points across committed strokes; avoids an O(n) reduce per pointer event. */
  private committedPoints = 0;
  private gesture?: Point[];
  private pointer?: number;
  private enabled = false;
  private visible = true;
  private destroyed = false;
  private frame?: number;
  private replayDone?: () => void;
  private replayInk?: Point[][];
  private generation = 0;
  private transform = { x: 0, y: 0, scale: 1 };
  private oldTouchAction = '';
  /**
   * Attributes this writer set on a surface it did not create, with the value to put
   * back on destroy. `null` means the attribute was absent and must be removed again.
   */
  private restoreAttributes: [string, string | null][] = [];

  constructor(target: string | HTMLElement, options: FontWriterOptions) {
    const host = typeof target === 'string' ? document.getElementById(target) : target;
    if (!host) throw new Error('FontWriter target was not found');
    this.host = host;
    this.options = {
      padding: 16,
      renderer: 'svg',
      referenceColor: '#cbd1d8',
      drawingColor: '#2467aa',
      animationColor: '#222a33',
      ...options,
    };
    this.validateDimensions(this.options);
    if (this.options.renderer === 'canvas' && host instanceof HTMLCanvasElement) {
      this.surface = host;
      this.owned = false;
    } else {
      this.surface =
        this.options.renderer === 'canvas'
          ? document.createElement('canvas')
          : document.createElementNS(NS, 'svg');
      host.appendChild(this.surface);
    }
    this.oldTouchAction = this.surface.style.touchAction;
    this.surface.style.touchAction = 'none';
    // A caller-supplied canvas belongs to the caller. Record what was there so destroy
    // can put it back, including the case where the attribute was absent entirely.
    this.setOwnedAttribute('role', 'img');
    this.setOwnedAttribute('aria-label', 'Font outline drawing area');
    this.surface.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancelPointer);
    this.surface.addEventListener('lostpointercapture', this.cancelPointer);
    this.render();
  }
  private setOwnedAttribute(name: string, value: string) {
    if (!this.owned) {
      this.restoreAttributes.push([name, this.surface.getAttribute(name)]);
    }
    this.surface.setAttribute(name, value);
  }
  private alive() {
    if (this.destroyed) throw new Error('FontWriter has been destroyed');
  }
  private validateDimensions(o: { width: number; height: number; padding?: number }) {
    const p = o.padding === undefined ? 16 : o.padding;
    if (
      ![o.width, o.height, p].every(Number.isFinite) ||
      o.width < 32 ||
      o.height < 32 ||
      o.width > 4096 ||
      o.height > 4096 ||
      p < 0 ||
      p * 2 >= Math.min(o.width, o.height)
    )
      throw new Error('Invalid FontWriter dimensions');
  }
  private required() {
    this.alive();
    if (!this.shape) throw new Error('Set a font shape first');
    return this.shape;
  }
  async setShape(shape: FontShape) {
    this.alive();
    const next = validateShape(shape);
    if (typeof Path2D === 'undefined')
      throw new Error('FontWriter requires a browser with Path2D support');
    const paths = next.glyphs.map((g) => new Path2D(g.path));
    const proof = document.createElement('canvas');
    proof.width = 256;
    proof.height = 256;
    const context = proof.getContext('2d');
    if (!context) throw new Error('FontWriter requires Canvas raster support');
    const [x, y, width, height] = next.bounds;
    const scale = Math.min(248 / width, 248 / height);
    context.translate(
      (256 - width * scale) / 2 - x * scale,
      (256 - height * scale) / 2 + (y + height) * scale,
    );
    context.scale(scale, -scale);
    next.glyphs.forEach((glyph, index) => {
      context.save();
      context.translate(glyph.x, glyph.y);
      context.fill(paths[index], 'nonzero');
      context.restore();
    });
    const pixels = context.getImageData(0, 0, 256, 256).data;
    let hasInk = false;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i] > 0) {
        hasInk = true;
        break;
      }
    if (!hasInk) throw new Error('FontShape has no visible nonzero-filled outline');
    this.cancel();
    this.generation += 1;
    this.shape = next;
    this.animation = undefined;
    this.maskCaches = [];
    this.animationLayer = undefined;
    this.svgAnimationNodes = undefined;
    const serialized = JSON.stringify(next);
    let hash = 2166136261;
    for (let i = 0; i < serialized.length; i += 1)
      hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
    this.shapeId = `${next.font.sha256}:${(hash >>> 0).toString(16)}`;
    this.paths = paths;
    this.strokes = [];
    this.committedPoints = 0;
    this.enabled = false;
    this.visible = true;
    this.render();
  }
  getShape(): FontShape {
    return this.required();
  }
  async setAnimation(value: FontAnimation): Promise<void> {
    const shape = this.required(),
      serial = this.animationSerial,
      shapeGeneration = this.generation;
    const checkpoint = () => {
      if (
        this.destroyed ||
        serial !== this.animationSerial ||
        shapeGeneration !== this.generation
      )
        throw new Error('Font animation superseded');
    };
    const next = await validateAnimation(value, shape, this.shapeId, checkpoint);
    const caches: FontWriter['maskCaches'] = [];
    for (const tile of next.tiles) {
      if (this.destroyed || serial !== this.animationSerial)
        throw new Error('Font animation superseded');
      const c = document.createElement('canvas');
      c.width = tile.width;
      c.height = tile.height;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Animation needs Canvas');
      const [x, y, w, h] = tile.bounds;
      ctx.translate((-x * tile.width) / w, ((y + h) * tile.height) / h);
      ctx.scale(tile.width / w, -tile.height / h);
      tile.glyphIndices.forEach((i) => {
        const g = shape.glyphs[i];
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.fill(this.paths[i], 'nonzero');
        ctx.restore();
      });
      const ink = ctx.getImageData(0, 0, tile.width, tile.height).data;
      for (let i = 0; i < tile.owners.length; i++)
        if (ink[i * 4 + 3] > 0 && !tile.owners[i])
          throw new Error('Animation leaves font ink uncovered');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const i of tile.glyphIndices) {
        const glyph = shape.glyphs[i],
          geometry = pathGeometry(glyph.path);
        if (!geometry) continue;
        for (const box of geometry.contours)
          for (const [px, py] of contourProbes(box, h / tile.height, (a, b) =>
            ctx.isPointInPath(this.paths[i], a, b, 'nonzero'),
          )) {
            const col = Math.max(
              0,
              Math.min(tile.width - 1, Math.floor(((px + glyph.x - x) * tile.width) / w)),
            );
            const row = Math.max(
              0,
              Math.min(
                tile.height - 1,
                Math.floor(((y + h - py - glyph.y) * tile.height) / h),
              ),
            );
            if (!tile.owners[row * tile.width + col])
              throw new Error('Animation leaves a thin font component uncovered');
          }
      }
      caches.push(
        await prepareMaskField(tile, () => {
          if (
            this.destroyed ||
            serial !== this.animationSerial ||
            shapeGeneration !== this.generation
          )
            throw new Error('Font animation superseded');
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (this.destroyed || serial !== this.animationSerial)
      throw new Error('Font animation superseded');
    if (shapeGeneration !== this.generation) throw new Error('Font animation superseded');
    this.cancel();
    this.animation = next;
    this.maskCaches = caches;
    this.svgAnimationNodes = undefined;
  }
  animate({ speed = 1, loop = false }: FontAnimationOptions = {}): Promise<void> {
    const shape = this.required();
    if (!this.animation) throw new Error('Prepare a font animation first');
    if (!Number.isFinite(speed) || speed < 0.25 || speed > 4 || typeof loop !== 'boolean')
      throw new Error('Invalid animation playback options');
    this.cancel();
    const serial = this.animationSerial,
      animation = this.animation;
    this.animationRestoreEnabled = this.enabled;
    this.enabled = false;
    const durations = animation.strokes.map((s) => {
      let length = 0;
      for (let i = 1; i < s.points.length; i++)
        length += Math.hypot(
          s.points[i][0] - s.points[i - 1][0],
          s.points[i][1] - s.points[i - 1][1],
        );
      return (
        (s.kind === 'dot'
          ? 260
          : Math.max(180, Math.min(1400, (length / shape.em) * 1000 + 160))) / speed
      );
    });
    let stroke = 0,
      start: number | undefined,
      waiting = false;
    this.animationState = { stroke: 0, progress: 0 };
    this.render();
    return new Promise((resolve) => {
      this.replayDone = resolve;
      const tick = (now: number) => {
        if (this.destroyed || serial !== this.animationSerial) return;
        if (start === undefined) start = now;
        if (waiting) {
          if (now < start) {
            this.frame = requestAnimationFrame(tick);
            return;
          }
          waiting = false;
          stroke = 0;
        }
        const progress = Math.min(1, Math.max(0, (now - start) / durations[stroke]));
        this.animationState = { stroke, progress };
        this.render();
        if (progress >= 1) {
          if (stroke === durations.length - 1) {
            if (loop) {
              waiting = true;
              start = now + 400 / speed;
            } else {
              this.frame = undefined;
              this.replayDone = undefined;
              this.enabled = this.animationRestoreEnabled ?? false;
              this.animationRestoreEnabled = undefined;
              resolve();
              return;
            }
          } else {
            stroke++;
            start = now;
          }
        }
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }
  startTrace() {
    this.required();
    this.clear();
    this.visible = true;
    this.enabled = true;
    this.render();
  }
  startCopy() {
    this.required();
    this.clear();
    this.visible = false;
    this.enabled = true;
    this.render();
  }
  showReference() {
    this.alive();
    this.visible = true;
    this.render();
  }
  hideReference() {
    this.alive();
    this.visible = false;
    this.render();
  }
  clear() {
    this.alive();
    this.cancel();
    this.strokes = [];
    this.committedPoints = 0;
    this.render();
  }
  cancel() {
    this.alive();
    this.animationSerial += 1;
    this.animationState = undefined;
    if (this.animationRestoreEnabled !== undefined) {
      this.enabled = this.animationRestoreEnabled;
      this.animationRestoreEnabled = undefined;
    }
    this.release();
    this.gesture = undefined;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.replayInk = undefined;
    const done = this.replayDone;
    this.replayDone = undefined;
    if (done) done();
    this.render();
  }
  updateDimensions(dimensions: { width: number; height: number; padding?: number }) {
    this.alive();
    const next = { ...this.options, ...dimensions };
    this.validateDimensions(next);
    this.cancel();
    this.options = next;
    this.render();
  }
  /** Scale and offset that centre the shape's bounds inside the padded box. */
  private fitToBox(width: number, height: number, padding: number) {
    if (!this.shape) return { x: 0, y: 0, scale: 1 };
    const [x, y, w, h] = this.shape.bounds;
    const scale = Math.min((width - 2 * padding) / w, (height - 2 * padding) / h);
    return {
      x: (width - w * scale) / 2 - x * scale,
      y: (height - h * scale) / 2 + (y + h) * scale,
      scale,
    };
  }
  private reference(
    ctx: CanvasRenderingContext2D,
    fit: { x: number; y: number; scale: number },
    indices?: number[],
  ) {
    if (!this.shape) return;
    ctx.save();
    ctx.translate(fit.x, fit.y);
    ctx.scale(fit.scale, -fit.scale);
    (indices || this.shape.glyphs.map((_, i) => i)).forEach((i) => {
      const g = this.shape!.glyphs[i];
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.fill(this.paths[i], 'nonzero');
      ctx.restore();
    });
    ctx.restore();
  }
  private ink(
    ctx: CanvasRenderingContext2D,
    fit: { x: number; y: number; scale: number },
    strokes: Point[][],
    pen: number,
  ) {
    ctx.save();
    ctx.translate(fit.x, fit.y);
    ctx.scale(fit.scale, -fit.scale);
    ctx.lineWidth = pen;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokes.forEach((stroke) => {
      if (!stroke.length) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      stroke.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      if (stroke.length === 1) {
        ctx.arc(stroke[0].x, stroke[0].y, pen / 2, 0, 2 * Math.PI);
        ctx.fill();
      } else ctx.stroke();
    });
    ctx.restore();
  }
  private updateMask(index: number): string {
    const state = this.animationState!;
    return maskPath(
      this.animation!.tiles[index],
      this.maskCaches[index],
      state.stroke,
      state.progress,
    );
  }
  private animationCanvas(ctx: CanvasRenderingContext2D, ratio: number) {
    if (!this.animation || !this.animationState) return;
    if (!this.animationLayer) this.animationLayer = document.createElement('canvas');
    const layer = this.animationLayer;
    this.animation.tiles.forEach((tile, index) => {
      const t = this.transform,
        [x, y, w, h] = tile.bounds;
      // A tile owns only its referenced glyphs. Rasterize its local display rectangle,
      // rather than clearing a full high-DPI practice surface once per character.
      //
      // Clip that rectangle to the surface first. Validation only requires a tile to
      // CONTAIN its glyphs, never bounding how much larger it may be, and tile bounds
      // are capped at 1e7, so sizing the layer straight from them let a structurally
      // valid animation request a 26,800,003-pixel-wide canvas on a 300-pixel writer.
      // Nothing outside the surface is ever drawn, so the clip costs no output.
      const rawLeft = Math.floor((t.x + x * t.scale) * ratio) - 1,
        rawTop = Math.floor((t.y - (y + h) * t.scale) * ratio) - 1;
      const left = Math.max(0, rawLeft),
        top = Math.max(0, rawTop);
      const pixelWidth = Math.min(
          ctx.canvas.width - left,
          rawLeft + Math.ceil(w * t.scale * ratio) + 3 - left,
        ),
        pixelHeight = Math.min(
          ctx.canvas.height - top,
          rawTop + Math.ceil(h * t.scale * ratio) + 3 - top,
        );
      // Entirely off-surface, or degenerate: nothing of this tile is visible.
      if (pixelWidth <= 0 || pixelHeight <= 0) return;

      layer.width = pixelWidth;
      layer.height = pixelHeight;
      const layerContext = layer.getContext('2d');
      // A refused context means the allocation failed; skip rather than throw a
      // TypeError from inside an animation frame.
      if (!layerContext) return;
      layerContext.scale(ratio, ratio);
      layerContext.translate(t.x - left / ratio, t.y - top / ratio);
      layerContext.scale(t.scale, -t.scale);
      layerContext.translate(x, y + h);
      layerContext.scale(w / tile.width, -h / tile.height);
      layerContext.clip(new Path2D(this.updateMask(index)), 'nonzero');
      layerContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      layerContext.fillStyle = this.options.animationColor!;
      this.reference(
        layerContext,
        { x: t.x - left / ratio, y: t.y - top / ratio, scale: t.scale },
        tile.glyphIndices,
      );
      ctx.drawImage(
        layer,
        left / ratio,
        top / ratio,
        pixelWidth / ratio,
        pixelHeight / ratio,
      );
    });
  }

  /**
   * Build the per-tile mask and ink elements once per animation.
   *
   * Only the reveal path's `d` changes between frames; the mask geometry, the glyph
   * outlines and their fills are fixed for the life of the animation. Recreating them
   * every frame meant dozens of element allocations and attribute writes per tile at
   * playback frame rate, for identical output.
   */
  private buildAnimationSvgNodes(animation: FontAnimation, shape: FontShape) {
    return animation.tiles.map((tile, index) => {
      const [x, y, w, h] = tile.bounds;
      const id = `${this.animationId}-${index}`;

      const mask = document.createElementNS(NS, 'mask');
      mask.setAttribute('id', id);
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
      mask.setAttribute('x', String(x));
      mask.setAttribute('y', String(y));
      mask.setAttribute('width', String(w));
      mask.setAttribute('height', String(h));

      const reveal = document.createElementNS(NS, 'path');
      reveal.setAttribute('fill', '#fff');
      reveal.setAttribute(
        'transform',
        `translate(${x} ${y + h}) scale(${w / tile.width} ${-h / tile.height})`,
      );
      mask.appendChild(reveal);

      const ink = document.createElementNS(NS, 'g');
      ink.setAttribute('mask', `url(#${id})`);
      tile.glyphIndices.forEach((i) => {
        const glyph = shape.glyphs[i];
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', glyph.path);
        path.setAttribute('transform', `translate(${glyph.x} ${glyph.y})`);
        path.setAttribute('fill', this.options.animationColor!);
        path.setAttribute('fill-rule', 'nonzero');
        ink.appendChild(path);
      });

      return { mask, reveal, ink };
    });
  }

  private animationSvg(group: SVGGElement) {
    if (!this.animation || !this.animationState || !this.shape) return;
    if (this.svgAnimationNodes?.animation !== this.animation) {
      this.svgAnimationNodes = {
        animation: this.animation,
        tiles: this.buildAnimationSvgNodes(this.animation, this.shape),
      };
    }
    this.svgAnimationNodes.tiles.forEach(({ mask, reveal, ink }, index) => {
      reveal.setAttribute('d', this.updateMask(index));
      group.appendChild(mask);
      group.appendChild(ink);
    });
  }
  private render() {
    if (this.destroyed) return;
    const { width, height } = this.options,
      padding = this.options.padding || 0;
    this.transform = this.fitToBox(width, height, padding);
    const ink = this.animationState
      ? []
      : this.replayInk || [...this.strokes, ...(this.gesture ? [this.gesture] : [])];
    const pen = (this.shape?.em || 1000) * 0.035;
    if (this.surface instanceof HTMLCanvasElement) {
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      this.surface.width = Math.round(width * ratio);
      this.surface.height = Math.round(height * ratio);
      this.surface.style.width = `${width}px`;
      this.surface.style.height = `${height}px`;
      const ctx = this.surface.getContext('2d');
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.fillStyle = this.options.referenceColor!;
      if (this.visible) this.reference(ctx, this.transform);
      this.animationCanvas(ctx, ratio);
      ctx.fillStyle = this.options.drawingColor!;
      ctx.strokeStyle = this.options.drawingColor!;
      this.ink(ctx, this.transform, ink, pen);
    } else {
      this.surface.setAttribute('width', String(width));
      this.surface.setAttribute('height', String(height));
      this.surface.setAttribute('viewBox', `0 0 ${width} ${height}`);
      while (this.surface.firstChild) this.surface.removeChild(this.surface.firstChild);
      const group = document.createElementNS(NS, 'g');
      const t = this.transform;
      group.setAttribute(
        'transform',
        `translate(${t.x} ${t.y}) scale(${t.scale} ${-t.scale})`,
      );
      if (this.visible && this.shape)
        this.shape.glyphs.forEach((g) => {
          const path = document.createElementNS(NS, 'path');
          path.setAttribute('d', g.path);
          path.setAttribute('transform', `translate(${g.x} ${g.y})`);
          path.setAttribute('fill', this.options.referenceColor!);
          path.setAttribute('fill-rule', 'nonzero');
          group.appendChild(path);
        });
      this.animationSvg(group);
      ink.forEach((stroke) => {
        if (!stroke.length) return;
        if (stroke.length === 1) {
          const dot = document.createElementNS(NS, 'circle');
          dot.setAttribute('cx', String(stroke[0].x));
          dot.setAttribute('cy', String(stroke[0].y));
          dot.setAttribute('r', String(pen / 2));
          dot.setAttribute('fill', this.options.drawingColor!);
          group.appendChild(dot);
        } else {
          const line = document.createElementNS(NS, 'polyline');
          line.setAttribute('points', stroke.map((p) => `${p.x},${p.y}`).join(' '));
          line.setAttribute('fill', 'none');
          line.setAttribute('stroke', this.options.drawingColor!);
          line.setAttribute('stroke-width', String(pen));
          line.setAttribute('stroke-linecap', 'round');
          line.setAttribute('stroke-linejoin', 'round');
          group.appendChild(line);
        }
      });
      this.surface.appendChild(group);
    }
  }
  private point(event: PointerEvent): Point | undefined {
    const rect = this.surface.getBoundingClientRect();
    const t = this.transform;
    if (
      ![rect.left, rect.top, rect.width, rect.height, event.clientX, event.clientY].every(
        Number.isFinite,
      ) ||
      rect.width <= 0 ||
      rect.height <= 0
    )
      return undefined;
    let x: number, y: number;
    if (this.surface instanceof HTMLCanvasElement) {
      x = ((event.clientX - rect.left) * this.options.width) / rect.width;
      y = ((event.clientY - rect.top) * this.options.height) / rect.height;
    } else {
      const matrix = this.surface.getScreenCTM?.();
      if (
        !matrix ||
        !Number.isFinite(matrix.a * matrix.d - matrix.b * matrix.c) ||
        matrix.a * matrix.d - matrix.b * matrix.c === 0
      )
        return undefined;
      const point = this.surface.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(matrix.inverse());
      x = local.x;
      y = local.y;
    }
    const result = { x: (x - t.x) / t.scale, y: (t.y - y) / t.scale };
    if (
      ![result.x, result.y].every(Number.isFinite) ||
      Math.abs(result.x) > 1e7 ||
      Math.abs(result.y) > 1e7
    )
      return undefined;
    return result;
  }
  private down = (event: Event) => {
    const e = event as PointerEvent;
    if (
      this.destroyed ||
      !this.enabled ||
      !this.shape ||
      this.pointer !== undefined ||
      e.button !== 0 ||
      e.isPrimary === false ||
      this.strokes.length >= MAX_STROKES ||
      this.committedPoints >= MAX_POINTS
    )
      return;
    e.preventDefault();
    this.cancel();
    this.pointer = e.pointerId;
    const initial = this.point(e);
    if (!initial) {
      this.pointer = undefined;
      return;
    }
    this.gesture = [initial];
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* Window handlers cover unavailable capture. */
    }
    this.render();
  };
  private move = (e: PointerEvent) => {
    if (this.destroyed || e.pointerId !== this.pointer || !this.gesture) return;
    e.preventDefault();
    if (this.gesture.length + this.committedPoints >= MAX_POINTS) return;
    const point = this.point(e);
    if (
      !point ||
      ![point.x, point.y].every(Number.isFinite) ||
      Math.abs(point.x) > 1e7 ||
      Math.abs(point.y) > 1e7
    )
      return;
    const last = this.gesture[this.gesture.length - 1];
    // A pointer that has not moved far enough to record a point has not changed
    // anything to draw. Rendering anyway rebuilt the whole SVG tree per event, at
    // pointer sampling rates, for an identical result.
    if (Math.hypot(last.x - point.x, last.y - point.y) * this.transform.scale < 0.5)
      return;
    this.gesture.push(point);
    this.render();
  };
  private up = (e: PointerEvent) => {
    if (this.destroyed || e.pointerId !== this.pointer || !this.gesture) return;
    this.move(e);
    const stroke = this.gesture;
    this.gesture = undefined;
    this.release();
    this.strokes.push(stroke);
    this.committedPoints += stroke.length;
    this.render();
    if (this.options.onChange) this.options.onChange(this.check());
  };
  private cancelPointer = (event: Event) => {
    if ((event as PointerEvent).pointerId !== this.pointer || this.destroyed) return;
    this.gesture = undefined;
    this.release();
    this.render();
  };
  private release() {
    const id = this.pointer;
    this.pointer = undefined;
    if (id !== undefined)
      try {
        this.surface.releasePointerCapture(id);
      } catch {
        /* Capture may already have ended. */
      }
  }
  check(): FontComparison {
    const shape = this.required();
    const canvas = document.createElement('canvas');
    canvas.width = MASK_SIZE;
    canvas.height = MASK_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas raster comparison is unavailable');
    const [bx, by, bw, bh] = shape.bounds;
    const radius = (shape.em * 0.035) / 2;
    let x1 = bx,
      y1 = by,
      x2 = bx + bw,
      y2 = by + bh;
    this.strokes.forEach((stroke) =>
      stroke.forEach((point) => {
        x1 = Math.min(x1, point.x - radius);
        y1 = Math.min(y1, point.y - radius);
        x2 = Math.max(x2, point.x + radius);
        y2 = Math.max(y2, point.y + radius);
      }),
    );
    const spanX = x2 - x1,
      spanY = y2 - y1;
    const scale = Math.min(
      MASK_SIZE / shape.em,
      Math.sqrt(1960000 / (spanX * spanY)),
      8188 / Math.max(spanX, spanY),
    );
    const rasterWidth = Math.ceil(spanX * scale) + 2,
      rasterHeight = Math.ceil(spanY * scale) + 2;
    canvas.width = rasterWidth;
    canvas.height = rasterHeight;
    const fit = {
      x: 1 - x1 * scale,
      y: 1 + y2 * scale,
      scale,
    };
    ctx.fillStyle = '#000';
    this.reference(ctx, fit);
    const target = ctx.getImageData(0, 0, rasterWidth, rasterHeight).data;
    ctx.clearRect(0, 0, rasterWidth, rasterHeight);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    this.ink(ctx, fit, this.strokes, shape.em * 0.035);
    const user = ctx.getImageData(0, 0, rasterWidth, rasterHeight).data;
    let targetPixels = 0,
      userPixels = 0,
      overlap = 0;
    for (let i = 3; i < target.length; i += 4) {
      const t = target[i] >= 128,
        u = user[i] >= 128;
      if (t) targetPixels += 1;
      if (u) userPixels += 1;
      if (t && u) overlap += 1;
    }
    return {
      kind: 'unordered-shape-comparison',
      shapeId: this.shapeId,
      hasInput: this.strokes.length > 0,
      targetCoverage: targetPixels ? overlap / targetPixels : 0,
      userAlignment: userPixels ? overlap / userPixels : 0,
    };
  }
  replay(): Promise<void> {
    this.required();
    this.cancel();
    const strokes = this.strokes.map((s) => s.map((p) => ({ ...p })));
    const generation = this.generation;
    let strokeIndex = 0,
      pointIndex = 0;
    this.replayInk = [];
    return new Promise((resolve) => {
      this.replayDone = resolve;
      const tick = () => {
        if (this.destroyed || generation !== this.generation) return;
        if (strokeIndex >= strokes.length) {
          this.frame = undefined;
          this.replayInk = undefined;
          this.replayDone = undefined;
          this.render();
          resolve();
          return;
        }
        if (!this.replayInk![strokeIndex]) this.replayInk![strokeIndex] = [];
        this.replayInk![strokeIndex].push(
          ...strokes[strokeIndex].slice(pointIndex, pointIndex + 8),
        );
        pointIndex += 8;
        if (pointIndex >= strokes[strokeIndex].length) {
          strokeIndex += 1;
          pointIndex = 0;
        }
        this.render();
        this.frame = requestAnimationFrame(tick);
      };
      this.frame = requestAnimationFrame(tick);
    });
  }
  destroy() {
    if (this.destroyed) return;
    this.cancel();
    this.destroyed = true;
    this.generation += 1;
    this.surface.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.cancelPointer);
    this.surface.removeEventListener('lostpointercapture', this.cancelPointer);
    this.surface.style.touchAction = this.oldTouchAction;
    for (const [name, previous] of this.restoreAttributes) {
      if (previous === null) this.surface.removeAttribute(name);
      else this.surface.setAttribute(name, previous);
    }
    this.restoreAttributes = [];
    if (this.owned && this.surface.parentNode)
      this.surface.parentNode.removeChild(this.surface);
    else if (this.surface instanceof HTMLCanvasElement)
      this.surface
        .getContext('2d')
        ?.clearRect(0, 0, this.surface.width, this.surface.height);
    this.animation = undefined;
    this.maskCaches = [];
    this.animationLayer = undefined;
    this.svgAnimationNodes = undefined;
    this.paths = [];
    this.strokes = [];
    this.committedPoints = 0;
    this.shape = undefined;
  }
}
