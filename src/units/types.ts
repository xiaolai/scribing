import { Point } from '../typings/types';

export type UnitPoint = [number, number];
/** [minimumX, minimumY, width, height] in source coordinates. */
export type UnitBounds = [number, number, number, number];
export type UnitDirection = 'forward' | 'either';

/** One complete model of a writing unit, which may span several code points. */
export interface WritingUnit {
  schemaVersion: 2;
  id: string;
  text: string;
  script?: string;
  style?: string;
  coordinates: {
    em: number;
    yAxis: 'up' | 'down';
    bounds: UnitBounds;
    baseline?: number;
    xHeight?: number;
    advance?: number;
  };
  motorStrokes: Array<
    | { id: string; kind: 'curve'; points: UnitPoint[]; width: number }
    | { id: string; kind: 'dot'; center: UnitPoint; radius: number }
  >;
  /** Optional pieces of a motor stroke, with reveal intervals along its animation. */
  visualSegments?: Array<{
    id: string;
    motorStrokeId: string;
    points: UnitPoint[];
    width: number;
    start: number;
    end: number;
  }>;
  plans: Array<{
    id: string;
    steps: Array<{ strokeId: string; direction?: UnitDirection }>;
  }>;
  defaultPlanId: string;
}

/** Canonical coordinates use em=1024 and y-up. */
export interface CompiledMotorStroke {
  id: string;
  kind: 'curve' | 'dot';
  points: Point[];
  width: number;
  radius?: number;
  segments: Array<{ points: Point[]; width: number; start: number; end: number }>;
}

export interface CompiledUnit {
  data: WritingUnit;
  bounds: UnitBounds;
  baseline?: number;
  xHeight?: number;
  strokes: CompiledMotorStroke[];
  plans: Array<{
    id: string;
    steps: Array<{ strokeIndex: number; direction: UnitDirection }>;
  }>;
  defaultPlanId: string;
}

export interface UnitLookup {
  id: string;
  variant?: string;
}

export interface WritingDataProvider {
  load(request: UnitLookup, options: { signal: AbortSignal }): Promise<WritingUnit>;
}

export interface UnitRequest extends UnitLookup {
  provider: WritingDataProvider;
}

export type UnitFeedbackReason =
  | 'correct'
  | 'wrong-shape'
  | 'wrong-direction'
  | 'wrong-order'
  | 'too-short'
  | 'outside-target';

export interface UnitStrokeFeedback {
  unitId: string;
  text: string;
  strokeId: string;
  strokeIndex: number;
  stepIndex: number;
  isCorrect: boolean;
  reason: UnitFeedbackReason;
  mistakesOnStroke: number;
  totalMistakes: number;
  strokesRemaining: number;
  activePlanIds: string[];
  drawnPoints: Point[];
}

export interface UnitQuizOptions {
  planId?: string;
  acceptAlternatePlans?: boolean;
  /** Visible reference and active-stroke guidance for tracing. Default: false. */
  guided?: boolean;
  /** Multiplier for geometric tolerance, bounded to 0.25..3. Default: 1. */
  leniency?: number;
  onCorrectStroke?: (feedback: UnitStrokeFeedback) => void;
  onMistake?: (feedback: UnitStrokeFeedback) => void;
  onComplete?: (summary: {
    unitId: string;
    text: string;
    totalMistakes: number;
    planIds: string[];
  }) => void;
}

/** Offline pack data. Observed or inferred forms must declare their preview status. */
export interface WritingDataPack {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  license: string;
  description?: string;
  status: 'technical-preview' | 'reviewed';
  provenance: 'authored' | 'recorded' | 'image-traced' | 'font-inferred' | 'mixed';
  source: { name: string; url: string; revision?: string };
  units: Record<string, WritingUnit>;
  /** Explicit source IDs or canonical equivalents; compatibility folding is never implicit. */
  aliases?: Record<string, string>;
}
