import createDataProvider from '../provider';
import { makePack } from '../../testFixtures/writingUnit';

const load = (
  provider: ReturnType<typeof createDataProvider>,
  id: string,
  variant?: string,
) => provider.load({ id, variant }, { signal: new AbortController().signal });

it('normalizes NFC, resolves declared aliases and requires explicit variants', async () => {
  const provider = createDataProvider(makePack());
  expect((await load(provider, 'e\u0301')).text).toBe('é');
  expect((await load(provider, 'alias')).id).toBe('i');
  expect((await load(provider, 'i', 'alternate')).id).toBe('alternate');
  await expect(load(provider, 'i', 'missing')).rejects.toThrow(/unavailable/);
  await expect(load(provider, 'constructor')).rejects.toThrow(/unavailable/);
});

it('snapshots caller data and never exposes cached mutable units', async () => {
  const pack = makePack();
  const provider = createDataProvider(pack);
  pack.units.i.id = 'changed';
  const unit = await load(provider, 'i');
  unit.id = 'also changed';
  expect((await load(provider, 'i')).id).toBe('i');
});

it('rejects ambiguity, invalid aliases, invalid content and aborted requests', async () => {
  const pack = makePack();
  pack.units['e\u0301'] = pack.units.é;
  expect(() => createDataProvider(pack)).toThrow(/colliding/);
  const invalid = makePack();
  invalid.aliases = { missing: 'absent' };
  expect(() => createDataProvider(invalid)).toThrow(/alias/);
  const malformed = makePack();
  malformed.units.i.motorStrokes = [];
  expect(() => createDataProvider(malformed)).toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    createDataProvider(makePack()).load({ id: 'i' }, { signal: controller.signal }),
  ).rejects.toThrow(/abort/);
});
