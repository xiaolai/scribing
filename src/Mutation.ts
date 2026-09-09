import {
  cancelAnimationFrame,
  requestAnimationFrame,
  inflate,
  performanceNow,
  toError,
} from './utils';
import RenderState from './RenderState';
import { RecursivePartial } from './typings/types';

/**
 * Durations reach a mutation straight from user options, and several are computed by
 * dividing by a user-supplied speed: `strokeAnimationSpeed: 0` arrives as `Infinity`
 * and a negative speed arrives negative. Both produced a tween whose progress never
 * reached 1, so the animation stalled and its promise never settled. A duration that
 * cannot be run is treated as instant, which is the only outcome that still terminates.
 */
const normalizeDuration = (duration: number | undefined) =>
  typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : 0;

/** Used by `Mutation` & `Delay` */
export interface GenericMutation<
  TRenderStateClass extends GenericRenderStateClass = RenderState,
> {
  /** Allows mutations starting with the provided string to be cancelled */
  scope: string;
  /** Can be useful for checking whether the mutation is running */
  _runningPromise: Promise<void> | undefined;
  run(renderState: TRenderStateClass): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(renderState: TRenderStateClass): void;
}

class Delay implements GenericMutation {
  scope: string;
  _runningPromise: Promise<void> | undefined;
  /** The configured delay. Never rewritten, so every loop iteration waits the same. */
  _duration: number;
  /** What is left of the current run. `pause` spends this; `run` restores it. */
  _remaining: number;
  _startTime: number | null;
  _paused: boolean;
  _timeout!: ReturnType<typeof setTimeout>;
  _resolve: (() => void) | undefined;

  constructor(duration: number) {
    this._duration = normalizeDuration(duration);
    this._remaining = this._duration;
    this._startTime = null;
    this._paused = false;
    this.scope = `delay.${this._duration}`;
  }

  run() {
    // Restore the full delay. `pause` used to subtract the elapsed time from
    // `_duration` itself, and a looping chain reruns these same objects, so every
    // iteration after a pause was short by however long the pause had lasted.
    this._remaining = this._duration;
    this._paused = false;
    this._startTime = performanceNow();
    this._runningPromise = new Promise<void>((resolve) => {
      this._resolve = resolve;
      this._timeout = setTimeout(() => this.cancel(), this._remaining);
    });
    return this._runningPromise;
  }

  pause() {
    // Only a started, unfinished delay can be paused. RenderState pauses whichever
    // mutation a chain is sitting on, and that can be one that has already settled.
    if (this._paused || !this._resolve) return;
    // to pause, clear the timeout and record whatever time is remaining
    const elapsedDelay = performanceNow() - (this._startTime ?? performanceNow());
    this._remaining = Math.max(0, this._remaining - elapsedDelay);
    clearTimeout(this._timeout);
    this._paused = true;
  }

  resume() {
    if (!this._paused) return;
    this._startTime = performanceNow();
    this._timeout = setTimeout(() => this.cancel(), this._remaining);
    this._paused = false;
  }

  cancel() {
    clearTimeout(this._timeout!);
    this._paused = false;
    if (this._resolve) {
      this._resolve();
    }
    this._resolve = undefined;
  }
}

type GenericRenderStateClass<T = any> = {
  state: T;
  updateState(changes: RecursivePartial<T>): void;
};

export default class Mutation<
  TRenderStateClass extends GenericRenderStateClass,
  TRenderStateObj = TRenderStateClass['state'],
> implements GenericMutation<TRenderStateClass> {
  static Delay = Delay;

  scope: string;
  _runningPromise: Promise<void> | undefined;
  _valuesOrCallable: any;
  _duration: number;
  _force: boolean | undefined;
  _pausedDuration: number;
  _startPauseTime: number | null;

  // Only set on .run()
  _startTime: number | undefined;
  _startState: RecursivePartial<TRenderStateObj> | undefined;
  _renderState: TRenderStateClass | undefined;
  _frameHandle: number | undefined;
  _values: RecursivePartial<TRenderStateObj> | undefined;
  _resolve: ((_val?: any) => void) | undefined;
  _reject: ((error: Error) => void) | undefined;

  /**
   *
   * @param scope a string representation of what fields this mutation affects from the state. This is used to cancel conflicting mutations
   * @param valuesOrCallable a thunk containing the value to set, or a callback which will return those values
   */
  constructor(
    scope: string,
    valuesOrCallable: any,
    options: {
      duration?: number;
      /** Updates render state regardless if cancelled */
      force?: boolean;
    } = {},
  ) {
    this.scope = scope;
    this._valuesOrCallable = valuesOrCallable;
    this._duration = normalizeDuration(options.duration);
    this._force = options.force;
    this._pausedDuration = 0;
    this._startPauseTime = null;
  }

  run(renderState: TRenderStateClass): Promise<void> {
    if (!this._values) this._inflateValues(renderState);
    if (this._duration === 0) renderState.updateState(this._values!);
    if (this._duration === 0 || isAlreadyAtEnd(renderState.state, this._values)) {
      this._runningPromise = undefined;
      return Promise.resolve();
    }
    // A looping chain reruns these same objects. Pause bookkeeping left over from the
    // previous pass was subtracted from this one, so progress started negative and the
    // animation took the accumulated pause time longer to finish.
    this._pausedDuration = 0;
    this._startPauseTime = null;
    this._renderState = renderState;
    this._startState = renderState.state;
    this._startTime = performanceNow();
    // Install the settlers before the first frame can run, so a synchronous animation
    // frame implementation cannot tick against a mutation that has nothing to settle.
    this._runningPromise = new Promise<void>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this._frameHandle = requestAnimationFrame(this._tick);
    return this._runningPromise;
  }

  private _inflateValues(renderState: TRenderStateClass) {
    let values = this._valuesOrCallable;
    if (typeof this._valuesOrCallable === 'function') {
      values = this._valuesOrCallable(renderState.state);
    }
    this._values = inflate(this.scope, values);
  }

  pause() {
    // See Delay.pause: a chain can be sitting on a mutation that already finished, and
    // banking a pause against it made its next run start with negative progress.
    if (this._startPauseTime !== null || this._resolve === undefined) {
      return;
    }
    // `0` is a legitimate animation-frame handle, so this has to test for undefined.
    if (this._frameHandle !== undefined) {
      cancelAnimationFrame(this._frameHandle);
    }
    this._frameHandle = undefined;
    this._startPauseTime = performanceNow();
  }

  resume() {
    if (this._startPauseTime === null) {
      return;
    }
    this._pausedDuration += performanceNow() - this._startPauseTime;
    this._startPauseTime = null;
    this._frameHandle = requestAnimationFrame(this._tick);
  }

  private _tick = (timing: number) => {
    if (this._startPauseTime !== null) {
      return;
    }
    try {
      this._advance(timing);
    } catch (error) {
      // `updateState` runs the renderer. A renderer exception used to escape into the
      // animation-frame callback, where nothing settled this mutation: the chain stayed
      // active forever and every promise waiting on it hung.
      this._fail(toError(error));
    }
  };

  private _advance(timing: number) {
    const progress = Math.min(
      1,
      (timing - this._startTime! - this._pausedDuration) / this._duration,
    );

    if (progress === 1) {
      this._renderState!.updateState(this._values!);
      this._frameHandle = undefined;
      this.cancel(this._renderState!);
    } else {
      const easedProgress = ease(progress);
      const stateChanges = getPartialValues(
        this._startState as TRenderStateObj,
        this._values!,
        easedProgress,
      );

      this._renderState!.updateState(stateChanges);
      this._frameHandle = requestAnimationFrame(this._tick);
    }
  }

  private _fail(error: Error) {
    const reject = this._reject;
    this._frameHandle = undefined;
    this._startPauseTime = null;
    this._resolve = undefined;
    this._reject = undefined;
    reject?.(error);
  }

  cancel(renderState: TRenderStateClass) {
    this._resolve?.();
    this._resolve = undefined;
    this._reject = undefined;
    this._startPauseTime = null;

    // Only cancel a frame this mutation actually scheduled. The old `|| -1` sentinel
    // handed a non-existent id to the host, which fake timers report as clearing a
    // native timer they do not own.
    if (this._frameHandle !== undefined) cancelAnimationFrame(this._frameHandle);
    this._frameHandle = undefined;

    if (this._force) {
      if (!this._values) this._inflateValues(renderState);
      renderState.updateState(this._values!);
    }
  }
}

function getPartialValues<T>(
  startValues: T | undefined,
  endValues: RecursivePartial<T> | undefined,
  progress: number,
) {
  const target: RecursivePartial<T> = {};

  for (const key in endValues) {
    const endValue = endValues[key];
    const startValue = startValues?.[key];
    // Interpolate any numeric leaf, sign included. This previously also required
    // `endValue >= 0`, so a negative target fell through to the recursion branch,
    // where `for (const key in <number>)` yields nothing and the tween produced an
    // empty object instead of a number. isAlreadyAtEnd below carried the identical
    // test; both are fixed, because one was never the whole defect.
    if (typeof endValue === 'number') {
      // A numeric target with no numeric start has nothing to interpolate from, so it
      // snaps. This is how `radicalColor` comes back from null: the recursion branch
      // walked `for (const key in <number>)`, produced `{}`, and wrote an object into
      // every colour channel.
      target[key] =
        typeof startValue === 'number'
          ? progress * (endValue - startValue) + startValue
          : endValue;
    } else {
      target[key] = getPartialValues(startValue, endValue, progress);
    }
  }
  return target;
}

function isAlreadyAtEnd<T>(
  startValues: T | undefined,
  endValues: RecursivePartial<T> | undefined,
) {
  for (const key in endValues) {
    const endValue = endValues[key];
    const startValue = startValues?.[key];
    // Numeric leaves compare directly; anything else is a nested object to recurse into.
    // This previously tested `endValue >= 0`, which sent negative numbers down the
    // recursion branch, where `for (const key in <number>)` yields nothing and the
    // mutation was silently reported as already complete.
    if (typeof endValue === 'number') {
      if (endValue !== startValue) {
        return false;
      }
    } else if (!isAlreadyAtEnd(startValue, endValue)) {
      return false;
    }
  }
  return true;
}

// from https://github.com/maxwellito/vivus
const ease = (x: number) => -Math.cos(x * Math.PI) / 2 + 0.5;
