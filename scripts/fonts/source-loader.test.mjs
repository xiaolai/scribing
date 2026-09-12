import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  createMotorSourceLoader,
  MotorSourceError,
} from '../../extras/fonts/animation.mjs';
const record = JSON.parse(
  await readFile(new URL('../../fonts/motor/english.json', import.meta.url), 'utf8'),
).units.A;
const encode = (data) =>
  new TextEncoder().encode(typeof data === 'string' ? data : JSON.stringify(data));
function fixture(data = { schemaVersion: 1, units: { A: record } }) {
  const bytes = encode(data);
  return {
    bytes,
    index: {
      schemaVersion: 1,
      groups: [
        {
          id: 'english',
          file: 'fonts/motor/english.json',
          unitCount: 1,
          sizeBytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      ],
    },
  };
}
const input = { text: 'A', script: 'Latn', language: 'en' };
const error = (code) => (e) =>
  e instanceof MotorSourceError && e.recoverable === true && e.code === code;
test('verified absence differs from source transport failure', async () => {
  const f = fixture();
  let calls = 0;
  const loader = createMotorSourceLoader({
    baseUrl: 'http://localhost/',
    fetch: async (url) => {
      calls++;
      return new Response(
        url.pathname.endsWith('index.json') ? JSON.stringify(f.index) : f.bytes,
      );
    },
  });
  assert.equal(await loader({ text: 'Ω', script: 'Grek', language: 'el' }), null);
  assert.equal(calls, 0);
  assert.equal(await loader({ ...input, text: 'é' }), null);
  assert.equal(calls, 2);
  assert.deepEqual(await loader(input), record);
});
for (const [name, code, indexBody, groupBody] of [
  ['index JSON', 'JSON', '{', null],
  ['index schema', 'SCHEMA', {}, null],
  ['group JSON', 'JSON', null, '{'],
  ['group schema', 'SCHEMA', null, { schemaVersion: 1, units: {} }],
  ['unit schema', 'SCHEMA', null, { schemaVersion: 1, units: { A: null } }],
])
  test(name + ' errors are typed and recoverable', async () => {
    const f = fixture(groupBody ?? undefined);
    const loader = createMotorSourceLoader({
      baseUrl: 'http://localhost/',
      fetch: async (url) =>
        new Response(
          url.pathname.endsWith('index.json')
            ? JSON.stringify(indexBody ?? f.index)
            : f.bytes,
        ),
    });
    if (name === 'index JSON') {
      const broken = createMotorSourceLoader({
        baseUrl: 'http://localhost/',
        fetch: async () => new Response('{'),
      });
      await assert.rejects(broken(input), error(code));
    } else await assert.rejects(loader(input), error(code));
  });
test('HTTP/offline errors retry the same loader after recovery', async () => {
  const f = fixture();
  let mode = 'offline';
  const loader = createMotorSourceLoader({
    baseUrl: 'http://localhost/',
    fetch: async (url) => {
      if (mode === 'offline') throw Error('offline');
      if (mode === '404') return new Response('', { status: 404 });
      return new Response(
        url.pathname.endsWith('index.json') ? JSON.stringify(f.index) : f.bytes,
      );
    },
  });
  await assert.rejects(loader(input), error('NETWORK'));
  mode = '404';
  await assert.rejects(loader(input), error('HTTP'));
  mode = 'ok';
  assert.deepEqual(await loader(input), record);
});
test('integrity and crypto errors never become absence', async () => {
  const f = fixture();
  f.index.groups[0].sha256 = '0'.repeat(64);
  const fetch = async (url) =>
    new Response(url.pathname.endsWith('index.json') ? JSON.stringify(f.index) : f.bytes);
  await assert.rejects(
    createMotorSourceLoader({ baseUrl: 'http://localhost/', fetch })(input),
    error('INTEGRITY'),
  );
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest() {
            throw Error('unavailable');
          },
        },
      },
    });
    await assert.rejects(
      createMotorSourceLoader({ baseUrl: 'http://localhost/', fetch })(input),
      error('CRYPTO'),
    );
  } finally {
    Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});
test('aborted source requests preserve AbortError', async () => {
  let release;
  const gate = new Promise((r) => (release = r)),
    f = fixture(),
    controller = new AbortController();
  const loader = createMotorSourceLoader({
    baseUrl: 'http://localhost/',
    fetch: async () => {
      await gate;
      return new Response(JSON.stringify(f.index));
    },
  });
  const pending = loader(input, { signal: controller.signal });
  controller.abort();
  release();
  await assert.rejects(pending, (e) => e.name === 'AbortError');
});

for (const kind of ['duplicate', 'omitted'])
  test('invalid ' + kind + ' source plan steps are schema failures', async () => {
    const value = JSON.parse(JSON.stringify(record)),
      plan = value.unit.plans.find((p) => p.id === value.unit.defaultPlanId);
    if (kind === 'duplicate') plan.steps[1] = { ...plan.steps[0] };
    else plan.steps.pop();
    const f = fixture({ schemaVersion: 1, units: { A: value } }),
      loader = createMotorSourceLoader({
        baseUrl: 'http://localhost/',
        fetch: async (url) =>
          new Response(
            url.pathname.endsWith('index.json') ? JSON.stringify(f.index) : f.bytes,
          ),
      });
    await assert.rejects(loader(input), error('SCHEMA'));
  });

test('a record handed out cannot alter what the next caller receives', async () => {
  // Records came straight from the parsed cache, so a caller that modified one changed
  // the next caller's copy with no fetch and no integrity check in between.
  const f = fixture();
  const loader = createMotorSourceLoader({
    baseUrl: 'http://localhost/',
    fetch: async (url) =>
      new Response(
        url.pathname.endsWith('index.json') ? JSON.stringify(f.index) : f.bytes,
      ),
  });
  const first = await loader(input);
  const before = first.unit.motorStrokes[0].points.length;
  assert.throws(() => {
    first.unit.motorStrokes[0].points.push([0, 0]);
  }, TypeError);
  const second = await loader(input);
  assert.equal(second.unit.motorStrokes[0].points.length, before);
});
