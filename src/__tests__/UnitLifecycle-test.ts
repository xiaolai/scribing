import Scribing from '../Scribing';
import { makePack, makeUnit } from '../testFixtures/writingUnit';
import { WritingDataProvider, WritingUnit } from '../units/types';
import yi from 'hanzi-writer-data/一.json';
import { resolvePromises } from '../testUtils';

const create = (extra = {}) => {
  document.body.innerHTML = '<div id="unit-target"></div>';
  return new Scribing('unit-target', {
    width: 300,
    height: 300,
    strokeFadeDuration: 0,
    ...extra,
  });
};

const deferredProvider = () => {
  let resolve!: (unit: WritingUnit) => void;
  let signal!: AbortSignal;
  const provider: WritingDataProvider = {
    load: jest.fn((_request, options) => {
      signal = options.signal;
      return new Promise<WritingUnit>((res) => {
        resolve = res;
      });
    }),
  };
  return {
    provider,
    resolve: (unit: WritingUnit) => resolve(unit),
    signal: () => signal,
  };
};

describe('multilingual Scribing lifecycle', () => {
  it('mounts a direct unit and returns a defensive data copy', async () => {
    const writer = create();
    const unit = makeUnit();
    await writer.setUnit(unit);
    unit.id = 'external mutation';
    const data = await writer.getUnitData();
    expect(data.id).toBe('i');
    data.id = 'returned mutation';
    expect((await writer.getUnitData()).id).toBe('i');
    expect(writer._character?.strokes.length).toBe(2);
    expect(document.querySelector('#unit-target svg')).not.toBeNull();
    writer.destroy();
  });

  it('settles and aborts a superseded provider even when it ignores the signal', async () => {
    const writer = create();
    const pending = deferredProvider();
    const old = writer.setUnit({ id: 'old', provider: pending.provider });
    const canceled = expect(old).rejects.toThrow(/cancel|abort|supersed/i);
    await resolvePromises();
    await writer.setUnit(makeUnit('new'));
    await canceled;
    expect(pending.signal().aborted).toBe(true);
    pending.resolve(makeUnit('old'));
    await resolvePromises();
    expect((await writer.getUnitData()).id).toBe('new');
    writer.destroy();
  });

  it('cancels provider I/O when switching to a legacy character', async () => {
    const writer = create({ charDataLoader: () => yi });
    const pending = deferredProvider();
    const old = writer.setUnit({ id: 'old', provider: pending.provider });
    const canceled = expect(old).rejects.toThrow(/cancel|abort|supersed/i);
    await resolvePromises();
    await writer.setCharacter('一');
    await canceled;
    pending.resolve(makeUnit('old'));
    await resolvePromises();
    expect((await writer.getCharacterData()).symbol).toBe('一');
    await expect(writer.getUnitData()).rejects.toThrow(/setUnit|unit/i);
    writer.destroy();
  });

  it('preserves a new unit promise when a synchronous legacy loader reenters', async () => {
    const pending = deferredProvider();
    let selected!: Promise<void>;
    const writer = create({
      charDataLoader: () => {
        selected = writer.setUnit({ id: 'new', provider: pending.provider });
        return yi;
      },
    });
    await writer.setCharacter('一');
    const reading = writer.getUnitData();
    await resolvePromises();
    pending.resolve(makeUnit('new'));
    await selected;
    expect((await reading).id).toBe('new');
    writer.destroy();
  });

  it('cancels a legacy load when a unit is selected', async () => {
    let load!: (data: typeof yi) => void;
    const writer = create({
      charDataLoader: (_text: string, onLoad: typeof load) => {
        load = onLoad;
      },
    });
    const old = writer.setCharacter('一');
    await writer.setUnit(makeUnit());
    await old;
    load(yi);
    await resolvePromises();
    expect((await writer.getUnitData()).id).toBe('i');
    writer.destroy();
  });

  it('recovers into unit mode after a legacy loader failure', async () => {
    const writer = create({
      charDataLoader: () => Promise.reject(new Error('old failure')),
    });
    await expect(writer.setCharacter('missing')).rejects.toThrow('old failure');
    await writer.setUnit(makeUnit());
    await writer.hideCharacter({ duration: 0 });
    expect((await writer.getUnitData()).id).toBe('i');
    writer.destroy();
  });

  it('reports invalid unit input and permits a later valid load', async () => {
    const writer = create();
    await writer.setUnit(makeUnit());
    await expect(writer.setUnit({ ...makeUnit(), motorStrokes: [] })).rejects.toThrow();
    expect(writer._character).toBeUndefined();
    await expect(writer.getUnitData()).rejects.toThrow();
    await writer.setUnit(makeUnit('recovered'));
    expect((await writer.getUnitData()).id).toBe('recovered');
    writer.destroy();
  });

  it('leaves unit mode when an abort handler reenters setCharacter', async () => {
    const writer = create({ charDataLoader: () => yi });
    const provider: WritingDataProvider = {
      load: (_request, { signal }) => {
        signal.addEventListener('abort', () => {
          void writer.setCharacter('一');
        });
        return new Promise(() => undefined);
      },
    };
    const old = writer.setUnit({ id: 'old', provider });
    const canceled = expect(old).rejects.toThrow();
    await resolvePromises();
    await expect(writer.setUnit(makeUnit('interrupted'))).rejects.toThrow(
      /cancel|abort|supersed/i,
    );
    await canceled;
    await resolvePromises();
    expect((await writer.getCharacterData()).symbol).toBe('一');
    writer.destroy();
  });

  it('rejects legacy-only APIs while a unit is active', async () => {
    const writer = create();
    await writer.setUnit(makeUnit());
    await expect(writer.getCharacterData()).rejects.toThrow(/getUnitData/);
    expect(() => writer.quiz()).toThrow(/quizUnit/);
    await writer.quizUnit({ guided: true });
    writer.cancelQuiz();
    writer.destroy();
  });

  it('updates unit bounds and alignment during an active session', async () => {
    const writer = create();
    await writer.setUnit(makeUnit());
    await writer.quizUnit();
    writer.updateDimensions({ width: 450, height: 240 });
    expect(writer._positioner?.width).toBe(450);
    expect(writer._positioner?.height).toBe(240);
    expect(Number.isFinite(writer._positioner!.scale)).toBe(true);
    writer.destroy();
  });

  it('rejects unusable unit dimensions without corrupting existing dimensions', async () => {
    const writer = create();
    await writer.setUnit(makeUnit());
    expect(() => writer.updateDimensions({ width: 0 })).toThrow(
      /dimension|width|positive/i,
    );
    expect(writer._positioner?.width).toBe(300);
    writer.destroy();
  });

  it('settles canceled loading and releases owned DOM on destroy', async () => {
    const writer = create();
    const pending = deferredProvider();
    const old = writer.setUnit({ id: 'pending', provider: pending.provider });
    const canceled = expect(old).rejects.toThrow(/cancel|abort|destroy/i);
    await resolvePromises();
    writer.destroy();
    await canceled;
    expect(pending.signal().aborted).toBe(true);
    expect(document.querySelector('#unit-target svg')).toBeNull();
    pending.resolve(makeUnit());
    await resolvePromises();
    expect(writer._character).toBeUndefined();
    await expect(writer.setUnit(makeUnit())).rejects.toThrow(/destroyed/);
  });

  it('loads an offline pack using the public provider helper', async () => {
    const writer = create();
    await writer.setUnit({
      id: 'e\u0301',
      provider: Scribing.createDataProvider(makePack()),
    });
    expect((await writer.getUnitData()).text).toBe('é');
    writer.destroy();
  });
});
