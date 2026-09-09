import { readPlainArray, readPlainObject, readUint16Array } from '../plainStructure';

const fail = (detail: string): never => {
  throw new Error(`rejected: ${detail}`);
};

describe('readPlainObject', () => {
  it('returns a copy of the own data properties', () => {
    const source = { a: 1, b: 2 };
    const result = readPlainObject(source, fail, { keys: ['a', 'b'] });

    expect(result).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(source);
  });

  it('does not follow the prototype chain', () => {
    const source = Object.assign(Object.create({ inherited: 'nope' }), { a: 1 });
    expect(() => readPlainObject(source, fail, { keys: ['a'] })).toThrow('rejected');
  });

  it('accepts a null-prototype object', () => {
    const source = Object.assign(Object.create(null), { a: 1 });
    expect(readPlainObject(source, fail, { keys: ['a'] })).toEqual({ a: 1 });
  });

  it.each([
    ['an array', [1, 2, 3]],
    ['null', null],
    ['a string', 'text'],
    ['a number', 7],
    ['a function', () => undefined],
  ])('rejects %s as a container', (_label, value) => {
    expect(() => readPlainObject(value, fail, { keys: [] })).toThrow('rejected');
  });

  it('rejects a symbol-keyed property', () => {
    const source: Record<string | symbol, unknown> = { a: 1 };
    source[Symbol('hidden')] = 2;
    expect(() => readPlainObject(source, fail, { keys: ['a'] })).toThrow('rejected');
  });

  it('rejects a getter rather than invoking it twice', () => {
    let reads = 0;
    const source = {};
    Object.defineProperty(source, 'a', {
      enumerable: true,
      get() {
        reads += 1;
        return reads;
      },
    });
    expect(() => readPlainObject(source, fail, { keys: ['a'] })).toThrow('rejected');
    // The value must never be read: a getter can return something different each call,
    // which is how validated state and used state come apart.
    expect(reads).toBe(0);
  });

  it('rejects a non-enumerable property', () => {
    const source = {};
    Object.defineProperty(source, 'a', { enumerable: false, value: 1 });
    expect(() => readPlainObject(source, fail, { keys: ['a'] })).toThrow('rejected');
  });

  it('rejects a key outside the allowlist', () => {
    expect(() => readPlainObject({ a: 1, b: 2 }, fail, { keys: ['a'] })).toThrow(
      'rejected: b',
    );
  });

  it('accepts any key when no allowlist is given', () => {
    expect(readPlainObject({ anything: 1, else: 2 }, fail)).toEqual({
      anything: 1,
      else: 2,
    });
  });

  it('rejects a forbidden key even without an allowlist', () => {
    expect(() =>
      readPlainObject({ toJSON: () => 1 }, fail, { forbid: ['toJSON'] }),
    ).toThrow('rejected: toJSON');
  });

  it('requires every non-optional key', () => {
    expect(() => readPlainObject({ a: 1 }, fail, { keys: ['a', 'b'] })).toThrow(
      'rejected: b',
    );
    expect(
      readPlainObject({ a: 1 }, fail, { keys: ['a', 'b'], optional: ['b'] }),
    ).toEqual({ a: 1 });
  });

  it('reports the path a caller asked for', () => {
    expect(() => readPlainObject({ a: 1 }, fail, { keys: [], detail: 'unit' })).toThrow(
      'rejected: unit.a',
    );
  });

  it('copies a literal __proto__ key as data instead of reparenting the result', () => {
    // JSON.parse produces a real own "__proto__" data property. Copying it with
    // `result[key] = value` would run the Object.prototype setter and hand the
    // result a caller-controlled prototype; defineProperty stores it as data.
    const source = JSON.parse('{"__proto__": {"polluted": true}}');
    const result = readPlainObject(source, fail, { keys: ['__proto__'] });

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not let a literal __proto__ key escape an allowlist', () => {
    const source = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
    expect(() => readPlainObject(source, fail, { keys: ['a'] })).toThrow(
      'rejected: __proto__',
    );
  });
});

describe('readPlainArray', () => {
  it('returns a copy of the indexed values', () => {
    const source = [1, 2, 3];
    const result = readPlainArray(source, fail, { max: 3 });
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(source);
  });

  it('enforces both bounds', () => {
    expect(() => readPlainArray([1], fail, { min: 2, max: 4 })).toThrow('rejected');
    expect(() => readPlainArray([1, 2, 3], fail, { max: 2 })).toThrow('rejected');
  });

  it('rejects a sparse array', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(() => readPlainArray([1, , 3], fail, { max: 3 })).toThrow('rejected');
  });

  it('rejects an extra named property', () => {
    const source: unknown[] & Record<string, unknown> = [1, 2] as never;
    source.smuggled = 3;
    expect(() => readPlainArray(source, fail, { max: 2 })).toThrow('rejected');
  });

  it('rejects an array subclass', () => {
    class Sneaky extends Array {}
    expect(() => readPlainArray(Sneaky.from([1, 2]), fail, { max: 2 })).toThrow(
      'rejected',
    );
  });

  it('rejects an array-like object', () => {
    expect(() => readPlainArray({ 0: 'a', length: 1 }, fail, { max: 1 })).toThrow(
      'rejected',
    );
  });

  it('rejects a Proxy that reports a different length than it enumerates', () => {
    const target = [1, 2];
    const source = new Proxy(target, {
      getOwnPropertyDescriptor(t, key) {
        if (key === 'length') return { value: 1, writable: true, configurable: false };
        return Reflect.getOwnPropertyDescriptor(t, key);
      },
    });
    expect(() => readPlainArray(source, fail, { max: 4 })).toThrow('rejected');
  });
});

describe('readUint16Array', () => {
  it('returns a copy of the exact length requested', () => {
    const source = Uint16Array.from([1, 2, 3]);
    const result = readUint16Array(source, 3, fail);

    expect(Array.from(result)).toEqual([1, 2, 3]);
    expect(result).not.toBe(source);

    source[0] = 9;
    expect(result[0]).toBe(1);
  });

  it('rejects a mismatched length', () => {
    expect(() => readUint16Array(Uint16Array.from([1, 2]), 3, fail)).toThrow('rejected');
  });

  it.each([
    ['a plain array', [1, 2]],
    ['another typed array', Uint8Array.from([1, 2])],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(() => readUint16Array(value, 2, fail)).toThrow('rejected');
  });

  it('rejects a subclass whose length getter is shadowed', () => {
    class Sneaky extends Uint16Array {
      override get length() {
        return 2;
      }
    }
    expect(() => readUint16Array(new Sneaky(5), 2, fail)).toThrow('rejected');
  });
});

describe('hostile shapes that used to slip past', () => {
  const fail = ((detail: string) => {
    throw new Error(`invalid:${detail}`);
  }) as (detail: string) => never;

  it('rejects a key a proxy lists but refuses to describe', () => {
    // ownKeys may report a key that getOwnPropertyDescriptor then denies. Reading
    // through the missing descriptor threw a TypeError out of the validator instead of
    // producing the rejection the caller asked for.
    const source = new Proxy(
      { a: 1 },
      {
        ownKeys: () => ['a', 'ghost'],
        getOwnPropertyDescriptor: (target, key) =>
          Object.getOwnPropertyDescriptor(target, key),
        getPrototypeOf: () => Object.prototype,
      },
    );

    expect(() => readPlainObject(source, fail)).toThrow('invalid:ghost');
  });

  it('rejects a Float64Array reparented onto Uint16Array.prototype', () => {
    // instanceof and the prototype check both pass for a reparented instance, and
    // copying it into a Uint16Array truncated every value without a word.
    const floats = new Float64Array([1.5, 2.5, 3.5]);
    Object.setPrototypeOf(floats, Uint16Array.prototype);

    expect(() => readUint16Array(floats, 3, fail)).toThrow('invalid:');
  });

  it('still accepts a real Uint16Array of the expected length', () => {
    const values = new Uint16Array([1, 2, 3]);
    expect(Array.from(readUint16Array(values, 3, fail))).toEqual([1, 2, 3]);
  });
});
