/**
 * Structural checks for untrusted caller-supplied data.
 *
 * Every reader here inspects own property *descriptors* before reading any value, so a
 * getter, a Proxy trap, a shadowed `length`, a symbol key or an exotic prototype cannot
 * substitute unvalidated data between the check and the use. Readers return a shallow
 * copy, so a later mutation of the caller's object cannot reach validated state.
 *
 * This is the single implementation. It previously existed as four near-identical copies
 * (font shape, font animation, writing unit, data provider); a bypass fixed in one of
 * them would have left the other three open.
 */

/** Throws. `detail` identifies the offending path for callers that report one. */
export type FailFn = (detail: string) => never;

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

/** Container check shared by object and record readers. */
function assertPlainContainer(value: unknown, fail: FailFn, detail: string) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    [Object.prototype, null].indexOf(Object.getPrototypeOf(value)) < 0 ||
    Object.getOwnPropertySymbols(value).length
  ) {
    fail(detail);
  }
}

export interface PlainObjectOptions {
  /** Allowlist of permitted keys. Omit to accept any key, as for a dictionary. */
  keys?: readonly string[];
  /** Keys within `keys` that may be absent. Ignored when `keys` is omitted. */
  optional?: readonly string[];
  /** Keys that are never permitted, whatever `keys` says. */
  forbid?: readonly string[];
  /** Path reported to `fail` for the container itself. Defaults to the empty string. */
  detail?: string;
  /** Build the path reported for an offending key. Defaults to `detail.key`. */
  keyDetail?: (key: string) => string;
}

/**
 * Read a plain object's own enumerable data properties into a fresh record.
 *
 * @returns a shallow copy containing only the validated own values.
 */
export function readPlainObject(
  value: unknown,
  fail: FailFn,
  options: PlainObjectOptions = {},
): Record<string, unknown> {
  const { keys, optional = [], forbid = [], detail = '' } = options;
  const keyDetail =
    options.keyDetail ?? ((key: string) => (detail ? `${detail}.${key}` : key));

  assertPlainContainer(value, fail, detail);
  const source = value as object;
  const result: Record<string, unknown> = {};

  for (const key of Object.getOwnPropertyNames(source)) {
    if (forbid.indexOf(key) >= 0 || (keys && keys.indexOf(key) < 0)) fail(keyDetail(key));
    const descriptor = Object.getOwnPropertyDescriptor(source, key)!;
    // An accessor or a non-enumerable property can return a different value on the
    // second read, so reject it rather than reading it at all.
    if (!descriptor.enumerable || !hasOwn(descriptor, 'value')) fail(keyDetail(key));
    // defineProperty, not assignment. `result[key] = …` with key "__proto__" runs the
    // Object.prototype setter and replaces the prototype of `result` with a
    // caller-controlled object instead of creating an own property.
    Object.defineProperty(result, key, {
      value: descriptor.value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  if (keys) {
    for (const key of keys) {
      if (optional.indexOf(key) < 0 && !hasOwn(result, key)) fail(keyDetail(key));
    }
  }
  return result;
}

export interface PlainArrayOptions {
  /** Inclusive lower bound on length. Defaults to 0. */
  min?: number;
  /** Inclusive upper bound on length. Required, so no reader is unbounded. */
  max: number;
  /** Path reported to `fail`. Defaults to the empty string. */
  detail?: string;
}

/**
 * Read a genuine dense array's own indexed data properties into a fresh array.
 *
 * `length` is read from its own descriptor rather than from the property, and the own
 * property count must be exactly the indices plus `length`, so neither a shadowed
 * `length` nor an extra named key can smuggle a value past the per-index checks.
 */
export function readPlainArray(
  value: unknown,
  fail: FailFn,
  options: PlainArrayOptions,
): unknown[] {
  const { min = 0, max, detail = '' } = options;

  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length
  ) {
    fail(detail);
  }
  const source = value as unknown[];
  const length = Object.getOwnPropertyDescriptor(source, 'length')!.value;
  if (
    !Number.isInteger(length) ||
    length < min ||
    length > max ||
    Object.getOwnPropertyNames(source).length !== length + 1
  ) {
    fail(detail);
  }

  const result: unknown[] = [];
  for (let i = 0; i < length; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(source, String(i));
    if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, 'value')) {
      fail(detail ? `${detail}[${i}]` : `[${i}]`);
    }
    result.push(descriptor!.value);
  }
  return result;
}

/** Length getter from `%TypedArray%.prototype`, immune to an own `length` on the instance. */
const typedArrayLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint16Array.prototype),
  'length',
)!.get!;

/**
 * Read an exact-length `Uint16Array` into a fresh copy.
 *
 * Rejects subclasses, instances carrying extra own properties, and any instance whose
 * real length differs from the expected one.
 */
export function readUint16Array(
  value: unknown,
  length: number,
  fail: FailFn,
  detail = '',
): Uint16Array {
  if (
    !(value instanceof Uint16Array) ||
    Object.getPrototypeOf(value) !== Uint16Array.prototype ||
    typedArrayLength.call(value) !== length ||
    Object.getOwnPropertySymbols(value).length ||
    Object.getOwnPropertyNames(value).length !== length
  ) {
    fail(detail);
  }
  return new Uint16Array(value as Uint16Array);
}
