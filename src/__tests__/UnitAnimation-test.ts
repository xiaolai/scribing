import { animateCharacter, animateCharacterLoop } from '../characterActions';
import compileUnit from '../units/compileUnit';
import Character from '../models/Character';
import Stroke from '../models/Stroke';
import { makeUnit } from '../testFixtures/writingUnit';
import { GenericMutation } from '../Mutation';

const unitCharacter = () => {
  const data = makeUnit();
  data.plans = [
    { id: 'dot-first', steps: [{ strokeId: 'dot' }, { strokeId: 'stem' }] },
    { id: 'stem-first', steps: [{ strokeId: 'stem' }, { strokeId: 'dot' }] },
  ];
  data.defaultPlanId = 'dot-first';
  const unit = compileUnit(data);
  const character = new Character(
    data.text,
    unit.strokes.map((s, i) => new Stroke('', s.points, i)),
  );
  character.unit = unit;
  return character;
};
const reveals = (mutations: GenericMutation[]) =>
  mutations
    .filter((m) => /\.strokes\.\d+\.displayPortion$/.test(m.scope))
    .map((m) => m.scope);
const order = (indices: number[]) =>
  indices.map((i) => `character.main.strokes.${i}.displayPortion`);

it('animates the default unit plan while retaining original motor render indices', () => {
  expect(reveals(animateCharacter('main', unitCharacter(), 0, 1, 50))).toEqual(
    order([1, 0]),
  );
});

it('animates an explicitly selected complete unit plan', () => {
  expect(
    reveals(animateCharacter('main', unitCharacter(), 0, 1, 50, 'stem-first')),
  ).toEqual(order([0, 1]));
});

it('rejects unknown plans before creating any executable action chain', () => {
  expect(() => animateCharacter('main', unitCharacter(), 0, 1, 50, 'absent')).toThrow(
    /plan/i,
  );
  expect(() =>
    animateCharacterLoop('main', unitCharacter(), 0, 1, 50, 100, 'absent'),
  ).toThrow(/plan/i);
});

it('loops the default or explicit plan and preserves the loop delay', () => {
  const defaultLoop = animateCharacterLoop('main', unitCharacter(), 0, 1, 50, 100);
  expect(reveals(defaultLoop)).toEqual(order([1, 0]));
  expect(defaultLoop[defaultLoop.length - 1].scope).toBe('delay.100');
  expect(
    reveals(animateCharacterLoop('main', unitCharacter(), 0, 1, 50, 100, 'stem-first')),
  ).toEqual(order([0, 1]));
});

it('preserves legacy array order without a plan and rejects unsupported plan selection', () => {
  const character = unitCharacter();
  character.unit = undefined;
  expect(reveals(animateCharacter('main', character, 0, 1, 50))).toEqual(order([0, 1]));
  expect(reveals(animateCharacterLoop('main', character, 0, 1, 50, 100))).toEqual(
    order([0, 1]),
  );
  expect(() => animateCharacter('main', character, 0, 1, 50, 'dot-first')).toThrow(
    /plan/i,
  );
});
