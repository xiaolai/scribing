import Scribing from '../../Scribing';
import createDataProvider from '../provider';
import { makePack, makeUnit } from '../../testFixtures/writingUnit';

const create = () => {
  document.body.innerHTML = '<div id="audit"></div>';
  return new Scribing('audit', { width: 300, height: 300, strokeFadeDuration: 0 });
};

test('cancellation invalidates a queued quiz', async () => {
  const writer = create();
  try {
    await writer.setUnit(makeUnit());
    const pending = writer.quizUnit();
    writer.cancelQuiz();
    await pending;
    expect(writer._unitQuiz).toBeUndefined();
  } finally {
    writer.destroy();
  }
});

test('provider rejects serialization hooks before executing them', () => {
  const pack = makePack();
  const hook = jest.fn(() => makeUnit('replaced'));
  Object.defineProperty(pack.units.i, 'toJSON', { value: hook });
  expect(() => createDataProvider(pack)).toThrow();
  expect(hook).not.toHaveBeenCalled();
});

test('provider selections are immutable after setUnit', async () => {
  const writer = create();
  const provider = createDataProvider(makePack());
  const request = { provider, id: 'i' };
  try {
    const pending = writer.setUnit(request);
    request.id = 'é';
    await pending;
    expect((await writer.getUnitData()).id).toBe('i');
  } finally {
    writer.destroy();
  }
});

test('direct writing units are snapshotted before asynchronous mounting', async () => {
  const writer = create();
  try {
    const input = makeUnit();
    const pending = writer.setUnit(input);
    input.text = 'changed';
    input.motorStrokes.length = 0;
    await pending;
    expect((await writer.getUnitData()).text).toBe('i');
  } finally {
    writer.destroy();
  }
});

test('provider rejects container getters before reading their values', () => {
  const pack = makePack();
  const getter = jest.fn();
  Object.defineProperty(pack.units, 'i', { enumerable: true, get: getter });
  expect(() => createDataProvider(pack)).toThrow();
  expect(getter).not.toHaveBeenCalled();
  const source = makePack();
  Object.defineProperty(source.source, 'url', { enumerable: true, get: getter });
  expect(() => createDataProvider(source)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});

test('animation forwards the chosen unit plan through the public API', async () => {
  const writer = create();
  try {
    const unit = makeUnit();
    unit.plans.push({
      id: 'dot-first',
      steps: [{ strokeId: 'dot' }, { strokeId: 'stem' }],
    });
    await writer.setUnit(unit);
    const run = jest
      .spyOn(writer._renderState!, 'run')
      .mockResolvedValue({ canceled: false });
    await writer.animateCharacter({ planId: 'dot-first' });
    const actions = run.mock.calls[run.mock.calls.length - 1][0];
    const reveal = actions.filter((action) => /displayPortion$/.test(action.scope));
    expect(reveal.map((action) => action.scope)).toEqual([
      'character.main.strokes.1.displayPortion',
      'character.main.strokes.0.displayPortion',
    ]);
    await expect(writer.animateCharacter({ planId: 'missing' })).rejects.toThrow(/plan/i);
    run.mockRestore();
  } finally {
    writer.destroy();
  }
});
