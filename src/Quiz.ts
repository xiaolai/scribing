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
  _userStrokesIds: Array<number> | undefined;

  constructor(character: Character, renderState: RenderState, positioner: Positioner) {
    this._character = character;
    this._renderState = renderState;
    this._isActive = false;
    this._positioner = positioner;
  }

  startQuiz(options: ParsedScribingOptions) {
    this._generation++;
    this._userStroke = undefined;
    if (this._userStrokesIds) {
      this._renderState.run(quizActions.removeAllUserStrokes(this._userStrokesIds));
    }
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
    this._userStroke.appendPoint(point, externalPoint);
    const nextPoints = this._userStroke.points.slice(0);
    return this._renderState.run(
      quizActions.updateUserStroke(this._userStroke.id, nextPoints),
    );
  }

  setPositioner(positioner: Positioner) {
    this._positioner = positioner;
  }

  endUserStroke() {
    if (!this._isActive || !this._userStroke) return;
    const generation = this._generation;
    const userStroke = this._userStroke;

    this._renderState.run(
      quizActions.hideUserStroke(
        this._userStroke.id,
        this._options!.drawingFadeDuration ?? 300,
      ),
    );

    // skip single-point strokes
    if (this._userStroke.points.length === 1) {
      this._userStroke = undefined;
      return;
    }

    const { acceptBackwardsStrokes, markStrokeCorrectAfterMisses } = this._options!;

    const currentStroke = this._getCurrentStroke();
    const { isMatch, meta } = strokeMatches(
      this._userStroke,
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
      this._handleSuccess(meta);
    } else {
      this._handleFailure(meta);
      if (generation !== this._generation || !this._isActive) return;

      const { showHintAfterMisses, highlightColor, strokeHighlightSpeed } =
        this._options!;

      if (
        showHintAfterMisses !== false &&
        this._mistakesOnStroke >= showHintAfterMisses
      ) {
        this._renderState.run(
          characterActions.highlightStroke(
            currentStroke,
            colorStringToVals(highlightColor),
            strokeHighlightSpeed,
          ),
        );
      }
    }

    if (generation === this._generation && this._userStroke === userStroke) {
      this._userStroke = undefined;
    }
  }

  cancelUserStroke() {
    if (!this._userStroke) return;
    const { id } = this._userStroke;
    this._userStroke = undefined;
    this._renderState.run(quizActions.hideUserStroke(id, 0));
  }

  cancel() {
    this._generation++;
    this._isActive = false;
    this._userStroke = undefined;
    if (this._userStrokesIds) {
      this._renderState.run(quizActions.removeAllUserStrokes(this._userStrokesIds));
    }
  }

  _getStrokeData({
    isCorrect,
    meta,
  }: {
    isCorrect: boolean;
    meta: StrokeMatchResultMeta;
  }): StrokeData {
    return {
      character: this._character.symbol,
      strokeNum: this._currentStrokeIndex,
      mistakesOnStroke: this._mistakesOnStroke,
      totalMistakes: this._totalMistakes,
      strokesRemaining:
        this._character.strokes.length - this._currentStrokeIndex - (isCorrect ? 1 : 0),
      drawnPath: getDrawnPath(this._userStroke!),
      isBackwards: meta.isStrokeBackwards,
    };
  }

  nextStroke() {
    if (!this._isActive || !this._options) return;
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
      onComplete?.({
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

  _handleSuccess(meta: StrokeMatchResultMeta) {
    if (!this._options) return;

    const generation = this._generation;
    const { onCorrectStroke } = this._options;

    onCorrectStroke?.({
      ...this._getStrokeData({ isCorrect: true, meta }),
    });

    if (generation === this._generation) this.nextStroke();
  }

  _handleFailure(meta: StrokeMatchResultMeta) {
    this._mistakesOnStroke += 1;
    this._totalMistakes += 1;
    this._options!.onMistake?.(this._getStrokeData({ isCorrect: false, meta }));
  }

  _getCurrentStroke(): Stroke {
    return this._character.strokes[this._currentStrokeIndex];
  }
}
