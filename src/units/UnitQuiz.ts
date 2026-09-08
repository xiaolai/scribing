import Character from '../models/Character';
import UserStroke from '../models/UserStroke';
import Positioner from '../Positioner';
import RenderState from '../RenderState';
import Mutation from '../Mutation';
import { ParsedScribingOptions, Point } from '../typings/types';
import { counter } from '../utils';
import * as quizActions from '../quizActions';
import * as characterActions from '../characterActions';
import { CompiledUnit, UnitQuizOptions, UnitStrokeFeedback } from './types';
import { gradeStroke } from './gradeStroke';

export default class UnitQuiz {
  _character: Character;
  _renderState: RenderState;
  _positioner: Positioner;
  _unit: CompiledUnit;
  _isActive = false;
  _generation = 0;
  _step = 0;
  _mistakes = 0;
  _total = 0;
  _plans: CompiledUnit['plans'] = [];
  _options: UnitQuizOptions = {};
  _renderOptions!: ParsedScribingOptions;
  _userStroke?: UserStroke;
  _ids: number[] = [];

  constructor(character: Character, renderState: RenderState, positioner: Positioner) {
    if (!character.unit) throw new Error('UnitQuiz requires a compiled writing unit');
    this._character = character;
    this._renderState = renderState;
    this._positioner = positioner;
    this._unit = character.unit;
  }

  startQuiz(renderOptions: ParsedScribingOptions, options: UnitQuizOptions = {}) {
    const selected = this._unit.plans.find(
      (p) => p.id === (options.planId || this._unit.defaultPlanId),
    );
    if (!selected) throw new Error('Unknown unit plan');
    if (
      options.leniency !== undefined &&
      (!Number.isFinite(options.leniency) ||
        options.leniency < 0.25 ||
        options.leniency > 3)
    )
      throw new Error('Unit leniency must be between 0.25 and 3');
    const cleanup = this._reset();
    this._options = { ...options };
    this._renderOptions = renderOptions;
    this._plans = options.acceptAlternatePlans
      ? [selected, ...this._unit.plans.filter((p) => p !== selected)]
      : [selected];
    this._step = 0;
    this._mistakes = 0;
    this._total = 0;
    this._isActive = true;
    return this._renderState.run([
      ...cleanup,
      ...quizActions.startQuiz(this._character, 0, 0),
      new Mutation('character.outline.opacity', options.guided ? 1 : 0, { force: true }),
      ...this._guidance(),
    ]);
  }

  _guidance() {
    const strokes: Record<number, { opacity: number; displayPortion: number }> = {};
    this._unit.strokes.forEach((_, i) => {
      strokes[i] = { opacity: 0, displayPortion: 1 };
    });
    if (this._options.guided && this._isActive) {
      strokes[this._plans[0].steps[this._step].strokeIndex].opacity = 1;
    }
    return [
      new Mutation('character.highlight', { opacity: 1, strokes }, { force: true }),
    ];
  }

  startUserStroke(external: Point) {
    if (!this._isActive) return null;
    if (this._userStroke) return this.endUserStroke();
    const point = this._positioner.convertExternalPoint(external);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    // Retain only a small number of hidden gestures for touch-device DOM continuity.
    if (this._ids.length >= 16)
      this._renderState.run(quizActions.removeAllUserStrokes(this._ids.splice(0, 8)));
    const id = counter();
    this._ids.push(id);
    this._userStroke = new UserStroke(id, point, external);
    return this._renderState.run(quizActions.startUserStroke(id, point));
  }

  continueUserStroke(external: Point) {
    if (!this._isActive || !this._userStroke) return Promise.resolve();
    const point = this._positioner.convertExternalPoint(external);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return Promise.resolve();
    const stroke = this._userStroke;
    if (stroke.points.length >= 512) {
      stroke.points = stroke.points.filter((_, i) => i === 0 || i % 2 === 1);
      stroke.externalPoints = stroke.externalPoints.filter(
        (_, i) => i === 0 || i % 2 === 1,
      );
    }
    stroke.appendPoint(point, external);
    return this._renderState.run(
      quizActions.updateUserStroke(stroke.id, stroke.points.slice()),
    );
  }

  endUserStroke() {
    if (!this._isActive || !this._userStroke) return;
    const generation = this._generation;
    const gesture = this._userStroke;
    this._userStroke = undefined;
    this._renderState.run(
      quizActions.hideUserStroke(
        gesture.id,
        this._renderOptions.drawingFadeDuration || 0,
      ),
    );
    const leniency = this._options.leniency || 1;
    const matches = this._plans.filter((p) => {
      const s = p.steps[this._step];
      return (
        gradeStroke(
          this._unit.strokes[s.strokeIndex],
          gesture.points,
          s.direction,
          leniency,
        ) === 'correct'
      );
    });
    const plan = matches[0] || this._plans[0];
    const index = plan.steps[this._step].strokeIndex;
    const target = this._unit.strokes[index];
    const correct = matches.length > 0;
    let reason = gradeStroke(
      target,
      gesture.points,
      plan.steps[this._step].direction,
      leniency,
    );
    if (
      !correct &&
      this._plans.some((p) =>
        p.steps
          .slice(this._step + 1)
          .some(
            (s) =>
              gradeStroke(
                this._unit.strokes[s.strokeIndex],
                gesture.points,
                s.direction,
                leniency,
              ) === 'correct',
          ),
      )
    )
      reason = 'wrong-order';
    if (correct) this._plans = matches;
    else {
      this._mistakes++;
      this._total++;
    }
    const feedback: UnitStrokeFeedback = {
      unitId: this._unit.data.id,
      text: this._unit.data.text,
      strokeId: target.id,
      strokeIndex: index,
      stepIndex: this._step,
      isCorrect: correct,
      reason,
      mistakesOnStroke: this._mistakes,
      totalMistakes: this._total,
      strokesRemaining: this._unit.strokes.length - this._step - (correct ? 1 : 0),
      activePlanIds: this._plans.map((p) => p.id),
      drawnPoints: gesture.points.map((p) => ({ ...p })),
    };
    if (!correct) {
      this._options.onMistake?.(feedback);
      return;
    }
    // Commit state and rendering before invoking user code, which can throw or restart.
    this._step++;
    this._mistakes = 0;
    const complete = this._step === this._unit.strokes.length;
    if (complete) this._isActive = false;
    this._renderState.run([
      ...characterActions.showStroke('main', index, 0),
      ...this._guidance(),
    ]);
    this._options.onCorrectStroke?.(feedback);
    if (complete && generation === this._generation)
      this._options.onComplete?.({
        unitId: this._unit.data.id,
        text: this._unit.data.text,
        totalMistakes: this._total,
        planIds: this._plans.map((p) => p.id),
      });
  }

  cancelUserStroke() {
    if (!this._userStroke) return;
    const id = this._userStroke.id;
    this._userStroke = undefined;
    this._renderState.run(quizActions.hideUserStroke(id, 0));
  }
  setPositioner(positioner: Positioner) {
    this.cancelUserStroke();
    this._positioner = positioner;
  }
  _reset() {
    this._generation++;
    this._isActive = false;
    this._userStroke = undefined;
    const cleanup = quizActions.removeAllUserStrokes(this._ids);
    this._ids = [];
    return cleanup;
  }
  cancel() {
    const cleanup = this._reset();
    if (this._renderOptions)
      cleanup.push(
        new Mutation('character.highlight.opacity', 0, { force: true }),
        new Mutation(
          'character.outline.opacity',
          this._renderOptions.showOutline ? 1 : 0,
          { force: true },
        ),
      );
    this._renderState.run(cleanup);
  }
}
