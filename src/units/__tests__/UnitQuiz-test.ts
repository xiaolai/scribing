import UnitQuiz from '../UnitQuiz';
import compileUnit from '../compileUnit';
import Character from '../../models/Character';
import Stroke from '../../models/Stroke';
import Positioner from '../../Positioner';
import RenderState from '../../RenderState';
import { ParsedScribingOptions, Point } from '../../typings/types';
import { WritingUnit } from '../types';

const data = (): WritingUnit => ({
  schemaVersion: 2,
  id: 'two',
  text: 'i',
  coordinates: { em: 1024, yAxis: 'up', bounds: [0, 0, 1024, 1024] },
  motorStrokes: [
    {
      id: 'stem',
      kind: 'curve',
      points: [
        [200, 800],
        [200, 200],
      ],
      width: 40,
    },
    { id: 'dot', kind: 'dot', center: [200, 950], radius: 20 },
    {
      id: 'cross',
      kind: 'curve',
      points: [
        [600, 500],
        [900, 500],
      ],
      width: 40,
    },
  ],
  plans: [
    {
      id: 'a',
      steps: [{ strokeId: 'stem' }, { strokeId: 'dot' }, { strokeId: 'cross' }],
    },
    {
      id: 'b',
      steps: [{ strokeId: 'dot' }, { strokeId: 'cross' }, { strokeId: 'stem' }],
    },
  ],
  defaultPlanId: 'a',
});
const setup = () => {
  const unit = compileUnit(data());
  const character = new Character(
    'i',
    unit.strokes.map((s, i) => new Stroke('', s.points, i)),
  );
  character.unit = unit;
  const run = jest.fn(() => Promise.resolve());
  const quiz = new UnitQuiz(
    character,
    { run } as unknown as RenderState,
    { convertExternalPoint: (p: Point) => p } as Positioner,
  );
  const options = { drawingFadeDuration: 0 } as ParsedScribingOptions;
  const draw = (index: number) => {
    const points = unit.strokes[index].points;
    quiz.startUserStroke(points[0]);
    points.slice(1).forEach((p) => quiz.continueUserStroke(p));
    quiz.endUserStroke();
  };
  return { quiz, run, options, draw };
};

test('complete alternatives cannot be mixed into an unapproved order', () => {
  const { quiz, options, draw } = setup();
  const onMistake = jest.fn();
  const onComplete = jest.fn();
  quiz.startQuiz(options, { acceptAlternatePlans: true, onMistake, onComplete });
  draw(1);
  expect(quiz._plans.map((p) => p.id)).toEqual(['b']);
  draw(0);
  expect(onMistake.mock.calls[0][0].reason).toBe('wrong-order');
  expect(quiz._step).toBe(1);
  draw(2);
  draw(0);
  expect(onComplete).toHaveBeenCalledWith({
    unitId: 'two',
    text: 'i',
    totalMistakes: 1,
    planIds: ['b'],
  });
});

test('cancel and callback restart do not advance the new session', () => {
  const { quiz, options, draw, run } = setup();
  quiz.startQuiz(options, {
    onCorrectStroke: () => {
      quiz.cancel();
      quiz.startQuiz(options);
    },
  });
  draw(0);
  expect(quiz._step).toBe(0);
  quiz.startUserStroke({ x: 200, y: 800 });
  quiz.cancel();
  const calls = run.mock.calls.length;
  quiz.endUserStroke();
  expect(run).toHaveBeenCalledTimes(calls);
});

test('completion cancellation schedules no work after callback', () => {
  const { quiz, options, draw, run } = setup();
  let calls = 0;
  quiz.startQuiz(options, {
    onComplete: () => {
      quiz.cancel();
      calls = run.mock.calls.length;
    },
  });
  draw(0);
  draw(1);
  draw(2);
  expect(run).toHaveBeenCalledTimes(calls);
});

test('guided mode exposes reference and advances next-stroke highlight', () => {
  const { quiz, options, draw, run } = setup();
  quiz.startQuiz(options, { guided: true });
  const start = run.mock.calls[run.mock.calls.length - 1] as any[];
  expect(
    start[0].find((m: any) => m.scope === 'character.outline.opacity')._valuesOrCallable,
  ).toBe(1);
  draw(0);
  const last = (run.mock.calls[run.mock.calls.length - 1] as any[])[0];
  expect(last[last.length - 1]._valuesOrCallable.strokes[1].opacity).toBe(1);
});

test('pointer buffers stay bounded and touch cancellation never grades', () => {
  const { quiz, options } = setup();
  const onMistake = jest.fn();
  quiz.startQuiz(options, { onMistake });
  quiz.startUserStroke({ x: 200, y: 800 });
  for (let i = 0; i < 2000; i++) quiz.continueUserStroke({ x: 200, y: 800 - i / 4 });
  expect(quiz._userStroke!.points.length).toBeLessThanOrEqual(512);
  quiz.cancelUserStroke();
  quiz.endUserStroke();
  expect(onMistake).not.toHaveBeenCalled();
});

test('cancel clears guided highlight and restores outline without touching accepted main strokes', () => {
  const { quiz, options, draw, run } = setup();
  quiz.startQuiz({ ...options, showOutline: false }, { guided: true });
  draw(0);
  quiz.cancel();
  const mutations = (run.mock.calls[run.mock.calls.length - 1] as any[])[0];
  expect(mutations.some((m: any) => m.scope.startsWith('character.main'))).toBe(false);
  expect(
    mutations.find((m: any) => m.scope === 'character.outline.opacity')._valuesOrCallable,
  ).toBe(0);
  expect(
    mutations.find((m: any) => m.scope === 'character.highlight.opacity')
      ._valuesOrCallable,
  ).toBe(0);
});

test('restarting guided mode does not briefly restore the old outline state', () => {
  const { quiz, options, run } = setup();
  quiz.startQuiz({ ...options, showOutline: false }, { guided: true });
  run.mockClear();
  quiz.startQuiz(options, { guided: true });
  const mutations = run.mock.calls.reduce(
    (all: any[], call) => all.concat((call as any[])[0]),
    [],
  );
  expect(
    mutations
      .filter((m: any) => m.scope === 'character.outline.opacity')
      .map((m: any) => m._valuesOrCallable),
  ).toEqual([1]);
});

test('positioner replacement discards an in-progress gesture', () => {
  const { quiz, options } = setup();
  const onMistake = jest.fn();
  const onCorrectStroke = jest.fn();
  quiz.startQuiz(options, { onMistake, onCorrectStroke });
  quiz.startUserStroke({ x: 200, y: 800 });
  quiz.setPositioner({
    convertExternalPoint: (p: Point) => ({ x: p.x * 2, y: p.y * 2 }),
  } as Positioner);
  quiz.continueUserStroke({ x: 100, y: 100 });
  quiz.endUserStroke();
  expect(onMistake).not.toHaveBeenCalled();
  expect(onCorrectStroke).not.toHaveBeenCalled();
  expect(quiz._step).toBe(0);
});

test('throwing success callbacks propagate after committing progress and cannot strand a session', () => {
  const { quiz, options, draw } = setup();
  quiz.startQuiz(options, {
    onCorrectStroke: () => {
      throw new Error('callback');
    },
  });
  expect(() => draw(0)).toThrow('callback');
  expect(quiz._step).toBe(1);
  expect(quiz._userStroke).toBeUndefined();
  expect(() => draw(1)).toThrow('callback');
  expect(quiz._step).toBe(2);
  expect(() => draw(2)).toThrow('callback');
  expect(quiz._isActive).toBe(false);
});

test('throwing mistake callbacks preserve mistake accounting and permit retry', () => {
  const { quiz, options, draw } = setup();
  quiz.startQuiz(options, {
    onMistake: () => {
      throw new Error('mistake callback');
    },
  });
  expect(() => draw(1)).toThrow('mistake callback');
  expect(quiz._total).toBe(1);
  expect(quiz._userStroke).toBeUndefined();
  draw(0);
  expect(quiz._step).toBe(1);
});
