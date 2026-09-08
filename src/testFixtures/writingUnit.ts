import { WritingUnit, WritingDataPack } from '../units/types';

export const makeUnit = (id = 'i'): WritingUnit => ({
  schemaVersion: 2,
  id,
  text: id,
  coordinates: { em: 1000, yAxis: 'up', bounds: [0, -200, 1000, 1000], baseline: 0 },
  motorStrokes: [
    {
      id: 'stem',
      kind: 'curve',
      points: [
        [500, 500],
        [500, 0],
      ],
      width: 45,
    },
    { id: 'dot', kind: 'dot', center: [500, 700], radius: 22 },
  ],
  plans: [{ id: 'recommended', steps: [{ strokeId: 'stem' }, { strokeId: 'dot' }] }],
  defaultPlanId: 'recommended',
});

export const makePack = (): WritingDataPack => ({
  schemaVersion: 1,
  id: 'test-print',
  name: 'Test print',
  version: '1.0.0',
  license: 'MIT',
  status: 'technical-preview',
  provenance: 'authored',
  source: { name: 'Test fixture', url: 'https://example.com/test' },
  units: { i: makeUnit(), é: makeUnit('é'), 'i@alternate': makeUnit('alternate') },
  aliases: { alias: 'i' },
});
