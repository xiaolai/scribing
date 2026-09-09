import Mutation, { GenericMutation } from './Mutation';
import * as characterActions from './characterActions';
import { noop, objRepeat, objRepeatCb } from './utils';
import Character from './models/Character';
import RenderState from './RenderState';
import { ColorObject, Point } from './typings/types';

/**
 * Delete one user stroke from the render state instead of blanking it.
 *
 * `updateState` merges, so writing null to `userStrokes.<id>` left the key behind. Both
 * renderers walk the whole map on every frame and every state copy carried it, so a
 * session kept paying for every stroke it had ever drawn. One mutation per id keeps the
 * `userStrokes.<id>` cancellation scope, which is what stops an in-flight fade from
 * writing the entry back after it is gone.
 */
class RemoveUserStroke implements GenericMutation {
  scope: string;
  _runningPromise: Promise<void> | undefined;
  _id: string | number;

  constructor(id: string | number) {
    this._id = id;
    this.scope = `userStrokes.${id}`;
  }

  run(renderState: RenderState) {
    renderState.removeUserStroke(this._id);
    return Promise.resolve();
  }

  /** Removal is unconditional, matching the `force: true` mutation it replaces. */
  cancel(renderState: RenderState) {
    renderState.removeUserStroke(this._id);
  }

  pause = noop;
  resume = noop;
}

export const startQuiz = (
  character: Character,
  fadeDuration: number,
  startStrokeNum: number,
): GenericMutation[] => {
  return [
    ...characterActions.hideCharacter('main', character, fadeDuration),
    new Mutation(
      'character.highlight',
      {
        opacity: 1,
        strokes: objRepeat({ opacity: 0 }, character.strokes.length),
      },
      { force: true },
    ),
    new Mutation(
      'character.main',
      {
        opacity: 1,
        strokes: objRepeatCb(character.strokes.length, (i) => ({
          opacity: i < startStrokeNum ? 1 : 0,
        })),
      },
      { force: true },
    ),
  ];
};

export const startUserStroke = (id: string | number, point: Point): GenericMutation[] => {
  return [
    new Mutation(
      `userStrokes.${id}`,
      {
        points: [point],
        opacity: 1,
      },
      { force: true },
    ),
  ];
};

export const updateUserStroke = (
  userStrokeId: string | number,
  points: Point[],
): GenericMutation[] => {
  return [new Mutation(`userStrokes.${userStrokeId}.points`, points, { force: true })];
};

export const hideUserStroke = (
  userStrokeId: string | number,
  duration: number,
): GenericMutation[] => {
  // The stroke is only faded out here, never removed. Removing a node mid-gesture stops
  // touchmove from firing on some mobile browsers, so a user quick enough to start the
  // next stroke would see it stop in mid air.
  // https://stackoverflow.com/questions/29384973/touchmove-event-stops-triggering-after-any-element-is-removed-from-dom
  return [new Mutation(`userStrokes.${userStrokeId}.opacity`, 0, { duration })];
};

export const removeAllUserStrokes = (userStrokeIds: Array<number>): GenericMutation[] => {
  return userStrokeIds?.map((userStrokeId) => new RemoveUserStroke(userStrokeId)) || [];
};

export const highlightCompleteChar = (
  character: Character,
  color: ColorObject | null,
  duration: number,
): GenericMutation[] => {
  return [
    new Mutation('options.highlightColor', color),
    ...characterActions.hideCharacter('highlight', character),
    ...characterActions.showCharacter('highlight', character, duration / 2),
    ...characterActions.hideCharacter('highlight', character, duration / 2),
  ];
};
