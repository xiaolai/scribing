/**
 * Every property, recursively, made read-only. Arrays become readonly arrays.
 *
 * Fixed-length tuples keep their length. Mapping every array through `readonly U[]`
 * turned `bounds` into `readonly number[]` in the public type, so a consumer lost the
 * guarantee that it holds exactly four numbers and could index past the end without the
 * compiler objecting. `number extends T['length']` is what separates the two: a tuple's
 * length is a literal, an array's is `number`.
 */
export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? number extends T['length']
    ? readonly DeepReadonly<U>[]
    : { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Filled font outlines. These paths never imply handwritten motor strokes. */
export interface FontShape {
  schemaVersion: 1;
  text: string;
  font: { id: string; name: string; sha256: string };
  script: string;
  language: string;
  direction: 'ltr' | 'rtl' | 'ttb';
  em: number;
  bounds: [number, number, number, number];
  glyphs: {
    id: number;
    cluster: number;
    path: string;
    x: number;
    y: number;
    advanceX: number;
    advanceY: number;
  }[];
}
/**
 * What `getShape()` hands back: the validated shape, deeply frozen.
 *
 * The mutable `FontShape` is the form a caller builds and passes in. Typing the result
 * as that same shape invited writes that throw in strict mode and are dropped silently
 * everywhere else.
 */
export type ReadonlyFontShape = DeepReadonly<FontShape>;

export interface FontComparison {
  kind: 'unordered-shape-comparison';
  shapeId: string;
  hasInput: boolean;
  targetCoverage: number;
  userAlignment: number;
}
export interface FontWriterOptions {
  width: number;
  height: number;
  padding?: number;
  renderer?: 'svg' | 'canvas';
  referenceColor?: string;
  drawingColor?: string;
  animationColor?: string;
  onChange?: (result: FontComparison) => void;
}
export type FontGuideProvenance =
  'source-adapted' | 'source-ordered' | 'generated' | 'mixed';
export interface FontAnimation {
  schemaVersion: 1;
  shapeKey: string;
  provenance: FontGuideProvenance;
  strokes: Array<{
    id: string;
    points: [number, number][];
    kind: 'curve' | 'dot';
    /**
     * `source-adapted` means the model's own geometry survived the fit.
     * `source-ordered` means the glyph's skeleton was drawn in the model's order,
     * used where the letterform differs too much for the geometry to be fitted.
     */
    provenance: 'source-adapted' | 'source-ordered' | 'generated';
    source?: { packId: string; unitId: string; planId: string; strokeId: string };
  }>;
  tiles: Array<{
    glyphIndices: number[];
    bounds: [number, number, number, number];
    width: number;
    height: number;
    /** Zero is outside conservative coverage; otherwise global stroke index + 1. */
    owners: Uint16Array;
    progress: Uint16Array;
  }>;
}
export interface FontAnimationOptions {
  speed?: number;
  loop?: boolean;
}
