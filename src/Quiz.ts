import strokeMatches, { StrokeMatchResultMeta } from './strokeMatches';
import UserStroke from './models/UserStroke';
import Positioner from './Positioner';
import { counter, colorStringToVals, fixIndex } from './utils';
import * as quizActions from './quizActions';
import * as geometry from './geometry';
import * as characterActions from './characterActions';
import Character from './models/Character';
import Stroke from './models/Stroke';
import { ParsedScribingOptions, Point, StrokeData } from './typings/types';
import RenderState from './RenderState';
import { GenericMutation } from './Mutation';

const getDrawnPath = (userStroke: UserStroke) => ({
  pathString: geometry.getPathString(userStroke.externalPoints),
  points: userStroke.points.map((point) => geometry.round(point)),
});

export default class Quiz {
  _character: Character;
  _renderState: RenderState;
  _isActive: boolean;
  _generation = 0;
  _positioner: Positioner;

  /** Set on startQuiz */
  _options: ParsedScribingOptions | undefined;
  _currentStrokeIndex = 0;
  _mistakesOnStroke = 0;
  _totalMistakes = 0;
  _userStroke: UserStroke | undefined;
  /** Ids still present in the render state, oldest first. */
  _userStrokesIds: Array<number> | undefined;
  /** An exception from a caller's callback, rethrown once the quiz is consistent. */
  _callbackError: { value: unknown } | undefined;

  constructor(character: Character, renderState: RenderState, positioner: Positioner) {
    this._character = character;
    this._renderState = renderState;
    this._isActive = false;
    this._positioner = positioner;
  }

  startQuiz(options: ParsedScribingOptions) {
    this._generation++;
    this._userStroke = undefined;
    this._retireUserStrokes(undefined);
    this._userStrokesIds = [];

    this._isActive = true;
    this._options = options;
    // Clamp into range and to an integer. fixIndex only rewrites negatives by adding
    // the length, so -99 on a two-stroke character produced -97, and a NaN or
    // fractional option produced an index that never matches a stroke. Either way the
    // quiz then graded against strokes[undefined] and crashed on the first attempt.
    const lastIndex = this._character.strokes.length - 1;
    const requested = fixIndex(
      options.quizStartStrokeNum,
      this._character.strokes.length,
    );
    this._currentStrokeIndex = Number.isFinite(requested)
      ? Math.min(Math.max(0, Math.floor(requested)), lastIndex)
      : 0;
    this._mistakesOnStroke = 0;
    this._totalMistakes = 0;

    return this._renderState.run(
      quizActions.startQuiz(
        this._character,
        options.strokeFadeDuration,
        this._currentStrokeIndex,
      ),
    );
  }

  startUserStroke(externalPoint: Point) {
    if (!this._isActive) {
      return null;
    }
    if (this._userStroke) {
      return this.endUserStroke();
    }
    const point = this._positioner.convertExternalPoint(externalPoint);
    const strokeId = counter();
    this._userStroke = new UserStroke(strokeId, point, externalPoint);
    this._userStrokesIds?.push(strokeId);
    return this._renderState.run(quizActions.startUserStroke(strokeId, point));
  }

  continueUserStroke(externalPoint: Point) {
    if (!this._isActive || !this._userStroke) {
      return Promise.resolve();
    }
    const point = this._positioner.convertExternalPoint(externalPoint);
    // Nothing moved far enough to change the gesture, so there is nothing to copy and
    // nothing to re-render.
    if (!this._userStroke.appendPoint(point, externalPoint)) return Promise.resolve();
    const nextPoints = this._userStroke.points.slice(0);
    return this._renderState.run(
      quizActions.updateUserStroke(this._userStroke.id, nextPoints),
    );
  }

  setPositioner(positioner: Positioner) {
    // Points already converted by the previous positioner cannot be compared with ones
    // converted by the new one, so a gesture that spans a resize is discarded rather
    // than graded against a mixture of two coordinate spaces.
    this.cancelUserStroke();
    this._positioner = positioner;
  }

  endUserStroke() {
    this._endUserStroke();
    this._flushCallbackError();
  }

  _endUserStroke() {
    if (!this._isActive || !this._userStroke) return;
    const generation = this._generation;
    const userStroke = this._userStroke;
    // Close the gesture before anything that can throw. A feedback callback that threw
    // used to leave it open, so the same stroke could be submitted a second time.
    this._userStroke = undefined;

    this._renderState.run(
      quizActions.hideUserStroke(
        userStroke.id,
        this._options!.drawingFadeDuration ?? 300,
      ),
    );
    // The gesture before this one has finished fading and is safe to drop.
    this._retireUserStrokes(userStroke.id);

    // skip single-point strokes
    if (userStroke.points.length === 1) {
      return;
    }

    const { acceptBackwardsStrokes, markStrokeCorrectAfterMisses } = this._options!;

    const currentStroke = this._getCurrentStroke();
    const { isMatch, meta } = strokeMatches(
      userStroke,
      this._character,
      this._currentStrokeIndex,
      {
        isOutlineVisible: this._renderState.state.character.outline.opacity > 0,
        leniency: this._options!.leniency,
        averageDistanceThreshold: this._options!.averageDistanceThreshold,
      },
    );

    // if markStrokeCorrectAfterMisses is passed, just force the stroke to count as correct after n tries
    const isForceAccepted =
      markStrokeCorrectAfterMisses &&
      this._mistakesOnStroke + 1 >= markStrokeCorrectAfterMisses;

    const isAccepted =
      isMatch || isForceAccepted || (meta.isStrokeBackwards && acceptBackwardsStrokes);

    if (isAccepted) {
      this._handleSuccess(meta, userStroke);
      return;
    }

    this._handleFailure(meta, userStroke);
    if (generation !== this._generation || !this._isActive) return;

    const { showHintAfterMisses, highlightColor, strokeHighlightSpeed } = this._options!;

    if (showHintAfterMisses !== false && this._mistakesOnStroke >= showHintAfterMisses) {
      this._renderState.run(
        characterActions.highlightStroke(
          currentStroke,
          colorStringToVals(highlightColor),
          strokeHighlightSpeed,
        ),
      );
    }
  }

  cancelUserStroke() {
    if (!this._userStroke) return;
    const { id } = this._userStroke;
    this._userStroke = undefined;
    this._renderState.run(quizActions.hideUserStroke(id, 0));
    this._retireUserStrokes(id);
  }

  cancel() {
    this._generation++;
    this._isActive = false;
    this._userStroke = undefined;
    this._retireUserStrokes(undefined);
  }

  _getStrokeData({
    isCorrect,
    meta,
    userStroke,
  }: {
    isCorrect: boolean;
    meta: StrokeMatchResultMeta;
    userStroke: UserStroke;
  }): StrokeData {
    return {
      character: this._character.symbol,
      strokeNum: this._currentStrokeIndex,
      mistakesOnStroke: this._mistakesOnStroke,
      totalMistakes: this._totalMistakes,
      strokesRemaining:
        this._character.strokes.length - this._currentStrokeIndex - (isCorrect ? 1 : 0),
      drawnPath: getDrawnPath(userStroke),
      isBackwards: meta.isStrokeBackwards,
    };
  }

  nextStroke() {
    this._nextStroke();
    this._flushCallbackError();
  }

  _nextStroke() {
    if (!this._isActive || !this._options) return;
    // A gesture in progress belongs to the stroke being left behind. Skipping used to
    // keep it, and it was then graded against the stroke the quiz had moved on to.
    this.cancelUserStroke();
    const generation = this._generation;

    const { strokes, symbol } = this._character;

    const {
      onComplete,
      highlightOnComplete,
      strokeFadeDuration,
      highlightCompleteColor,
      highlightColor,
      strokeHighlightDuration,
    } = this._options;

    let animation: GenericMutation[] = characterActions.showStroke(
      'main',
      this._currentStrokeIndex,
      strokeFadeDuration,
    );

    this._mistakesOnStroke = 0;
    this._currentStrokeIndex += 1;

    const isComplete = this._currentStrokeIndex === strokes.length;

    if (isComplete) {
      this._isActive = false;
      this._notify(onComplete, {
        character: symbol,
        totalMistakes: this._totalMistakes,
      });
      if (highlightOnComplete) {
        animation = animation.concat(
          quizActions.highlightCompleteChar(
            this._character,
            colorStringToVals(highlightCompleteColor || highlightColor),
            (strokeHighlightDuration || 0) * 2,
          ),
        );
      }
    }

    if (generation === this._generation) this._renderState.run(animation);
  }

  _handleSuccess(meta: StrokeMatchResultMeta, userStroke: UserStroke) {
    if (!this._options) return;

    const generation = this._generation;
    const { onCorrectStroke } = this._options;

    this._notify(
      onCorrectStroke,
      this._getStrokeData({ isCorrect: true, meta, userStroke }),
    );

    if (generation === this._generation) this._nextStroke();
  }

  _handleFailure(meta: StrokeMatchResultMeta, userStroke: UserStroke) {
    this._mistakesOnStroke += 1;
    this._totalMistakes += 1;
    this._notify(
      this._options!.onMistake,
      this._getStrokeData({ isCorrect: false, meta, userStroke }),
    );
  }

  /**
   * Run a caller's feedback callback without letting it stall the quiz.
   *
   * These callbacks are notifications. An exception used to abandon the rest of
   * endUserStroke: the gesture stayed open, and after onCorrectStroke the quiz never
   * advanced, so the same stroke could be submitted again and again. The error is kept
   * and rethrown once the quiz is consistent, so it still reaches the caller.
   */
  _notify<T>(callback: ((arg: T) => void) | undefined, arg: T) {
    if (!callback) return;
    try {
      callback(arg);
    } catch (error) {
      this._callbackError ??= { value: error };
    }
  }

  _flushCallbackError() {
    const pending = this._callbackError;
    this._callbackError = undefined;
    if (pending) throw pending.value;
  }

  /**
   * Drop every finished gesture except the one that just ended.
   *
   * Removing the node for the gesture in progress stops touchmove from firing on some
   * mobile browsers, so the most recent stroke is left faded rather than removed. The
   * ones before it are safe, and keeping them held a point array and a rendered node
   * per attempt for the whole quiz.
   */
  _retireUserStrokes(keepId: number | undefined) {
    const ids = this._userStrokesIds;
    if (!ids || ids.length === 0) return;
    const stale = ids.filter((id) => id !== keepId);
    if (stale.length === 0) return;
    this._userStrokesIds = ids.filter((id) => id === keepId);
    this._renderState.run(quizActions.removeAllUserStrokes(stale));
  }

  _getCurrentStroke(): Stroke {
    return this._character.strokes[this._currentStrokeIndex];
  }
}
