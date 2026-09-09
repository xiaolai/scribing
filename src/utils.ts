import { ColorObject, RecursivePartial } from './typings/types';

// hacky way to get around rollup not properly setting `global` to `window` in browser
const globalObj = typeof window === 'undefined' ? globalThis : window;

export const performanceNow =
  (globalObj.performance && (() => globalObj.performance.now())) || (() => Date.now());
export const requestAnimationFrame =
  globalObj.requestAnimationFrame?.bind(globalObj) ||
  ((callback) => setTimeout(() => callback(performanceNow()), 1000 / 60));
export const cancelAnimationFrame =
  globalObj.cancelAnimationFrame?.bind(globalObj) || clearTimeout;

/**
 * Normalize a caught value to an Error without discarding an existing one.
 * Identity is preserved for real Errors, so callers can still compare by reference.
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  try {
    return new Error(String(value));
  } catch {
    // String() throws on an object with a null prototype or a hostile toString, and
    // this runs on the rejection path: throwing here would replace a rejection the
    // caller can handle with a crash they cannot.
    return new Error('Unknown error');
  }
}

export function arrLast<TValue>(arr: Array<TValue>) {
  return arr[arr.length - 1];
}

export const fixIndex = (index: number, length: number) => {
  // helper to handle negative indexes in array indices
  if (index < 0) {
    return length + index;
  }
  return index;
};

export const selectIndex = <T>(arr: Array<T>, index: number) => {
  // helper to select item from array at index, supporting negative indexes
  return arr[fixIndex(index, arr.length)];
};

export function copyAndMergeDeep<T>(base: T, override: RecursivePartial<T> | undefined) {
  const output = { ...base };
  for (const key in override) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (baseVal === overrideVal) {
      continue;
    }
    if (
      baseVal &&
      overrideVal &&
      typeof baseVal === 'object' &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal)
    ) {
      output[key] = copyAndMergeDeep(baseVal, overrideVal);
    } else {
      // @ts-ignore
      output[key] = overrideVal;
    }
  }
  return output;
}

/** basically a simplified version of lodash.get, selects a key out of an object like 'a.b' from {a: {b: 7}} */
export function inflate(scope: string, obj: any): any {
  const parts = scope.split('.');
  const final: any = {};
  let current = final;
  for (let i = 0; i < parts.length; i++) {
    const cap = i === parts.length - 1 ? obj : {};
    current[parts[i]] = cap;
    current = cap;
  }
  return final;
}

let count = 0;

export function counter() {
  count++;
  return count;
}

export function average(arr: number[]) {
  const sum = arr.reduce((acc, val) => val + acc, 0);
  return sum / arr.length;
}

export function timeout(duration = 0) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

export function colorStringToVals(colorString: string): ColorObject {
  const normalizedColor = colorString.toUpperCase().trim();
  // based on https://stackoverflow.com/a/21648508
  if (/^#([A-F0-9]{3}){1,2}$/.test(normalizedColor)) {
    let hexParts = normalizedColor.substring(1).split('');
    if (hexParts.length === 3) {
      hexParts = [
        hexParts[0],
        hexParts[0],
        hexParts[1],
        hexParts[1],
        hexParts[2],
        hexParts[2],
      ];
    }
    const hexStr = `${hexParts.join('')}`;
    return {
      r: parseInt(hexStr.slice(0, 2), 16),
      g: parseInt(hexStr.slice(2, 4), 16),
      b: parseInt(hexStr.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgbMatch = normalizedColor.match(
    /^RGBA?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\)$/,
  );
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] === undefined ? 1 : parseFloat(rgbMatch[4]),
    };
  }
  throw new Error(`Invalid color: ${colorString}`);
}

export const trim = (string: string) => string.replace(/^\s+/, '').replace(/\s+$/, '');

// return a new array-like object with int keys where each key is item
// ex: objRepeat({x: 8}, 3) === {0: {x: 8}, 1: {x: 8}, 2: {x: 8}}
export function objRepeat<T>(item: T, times: number) {
  const obj: Record<number, T> = {};
  for (let i = 0; i < times; i++) {
    obj[i] = item;
  }
  return obj;
}

// similar to objRepeat, but takes in a callback which is called for each index in the object
export function objRepeatCb<T>(times: number, cb: (i: number) => T) {
  const obj: Record<number, T> = {};
  for (let i = 0; i < times; i++) {
    obj[i] = cb(i);
  }
  return obj;
}

export const noop = () => {};

/**
 * `Math.min`/`Math.max` over an array without spreading it into the argument list.
 *
 * `Math.min(...points)` throws RangeError once the array passes roughly 125,000
 * entries, and several callers here take point counts straight from validated input
 * whose ceiling is 1,000,000. NaN propagates exactly as the spread form does, because
 * callers rely on it to detect invalid geometry.
 */
export const minOf = (values: ArrayLike<number>) => {
  let best = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (Number.isNaN(value)) return NaN;
    if (value < best) best = value;
  }
  return best;
};

export const maxOf = (values: ArrayLike<number>) => {
  let best = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (Number.isNaN(value)) return NaN;
    if (value > best) best = value;
  }
  return best;
};
