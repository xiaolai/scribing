import * as utils from '../utils';

describe('utils', () => {
  describe('copyAndMergeDeep', () => {
    it('should nested merge properties of both objects', () => {
      const base = {
        a: {
          b: 1,
          c: 2,
        },
      };
      const override = {
        a: {
          c: 7,
          d: 14,
        },
        q: 9,
      };
      expect(utils.copyAndMergeDeep(base, override)).toEqual({
        a: {
          b: 1,
          c: 7,
          d: 14,
        },
        q: 9,
      });
    });
  });

  describe('colorStringToVals', () => {
    it('parses hex strings into rgba numbers', () => {
      expect(utils.colorStringToVals('#DDCA1B')).toEqual({ r: 221, g: 202, b: 27, a: 1 });
    });
    it('works with shortened hex numbers too', () => {
      expect(utils.colorStringToVals('#DC0')).toEqual({ r: 221, g: 204, b: 0, a: 1 });
    });
    it('works with rgb format', () => {
      expect(utils.colorStringToVals('rgb(10,99,193)')).toEqual({
        r: 10,
        g: 99,
        b: 193,
        a: 1,
      });
      expect(utils.colorStringToVals('rgb(10 ,  99 ,  193)')).toEqual({
        r: 10,
        g: 99,
        b: 193,
        a: 1,
      });
    });
    it('works with rgba format', () => {
      expect(utils.colorStringToVals('rgba(10,99,193, 0.3)')).toEqual({
        r: 10,
        g: 99,
        b: 193,
        a: 0.3,
      });
      expect(utils.colorStringToVals('rgba(10 ,  99 ,  193, 0.1)')).toEqual({
        r: 10,
        g: 99,
        b: 193,
        a: 0.1,
      });
    });
    it('ignores capitalization and leading / trailing spaces', () => {
      expect(utils.colorStringToVals('#dc0  ')).toEqual({ r: 221, g: 204, b: 0, a: 1 });
      expect(utils.colorStringToVals(' #dDCa1b')).toEqual({
        r: 221,
        g: 202,
        b: 27,
        a: 1,
      });
      expect(utils.colorStringToVals('  RgBa(10 ,  99 ,  193, 0.1) ')).toEqual({
        r: 10,
        g: 99,
        b: 193,
        a: 0.1,
      });
      expect(utils.colorStringToVals('RGB(10,99,193)')).toEqual({
        r: 10,
        g: 99,
        b: 193,
        a: 1,
      });
    });
    it('errors on invalid colors', () => {
      expect(() => utils.colorStringToVals('#DC00')).toThrow();
      expect(() => utils.colorStringToVals('#DCQ')).toThrow();
      expect(() => utils.colorStringToVals('RBB(10,10,10)')).toThrow();
    });
  });

  describe('inflate', () => {
    it('inflates the scope into a full object and attaches the obj', () => {
      expect(utils.inflate('bob.jim.joe', { x: 8 })).toEqual({
        bob: {
          jim: {
            joe: {
              x: 8,
            },
          },
        },
      });
    });
  });

  describe('toError', () => {
    it('preserves an Error by reference', () => {
      const original = new Error('boom');
      expect(utils.toError(original)).toBe(original);
    });

    it('does not throw while normalising a value String() rejects', () => {
      // This runs on the rejection path. Throwing here would turn a rejection the
      // caller can handle into a crash they cannot.
      const hostile = Object.create(null);
      expect(() => String(hostile)).toThrow(TypeError);
      expect(utils.toError(hostile)).toBeInstanceOf(Error);
      expect(utils.toError(hostile).message).toBe('Unknown error');
    });

    it('still stringifies ordinary values', () => {
      expect(utils.toError('nope').message).toBe('nope');
      expect(utils.toError(42).message).toBe('42');
    });
  });

  describe('minOf / maxOf', () => {
    // Math.min(...array) throws RangeError past roughly 125,000 arguments, and point
    // arrays here are validated up to 1,000,000 entries. These must agree with the
    // spread form on everything it can actually handle, and survive what it cannot.
    it('matches Math.min and Math.max on ordinary input', () => {
      const values = [3, -1, 7, 0, 2.5];
      expect(utils.minOf(values)).toBe(Math.min(...values));
      expect(utils.maxOf(values)).toBe(Math.max(...values));
    });

    it('propagates NaN the way the spread form does', () => {
      const values = [1, NaN, 3];
      expect(utils.minOf(values)).toBeNaN();
      expect(utils.maxOf(values)).toBeNaN();
      expect(Math.min(...values)).toBeNaN();
    });

    it('returns the identity element for an empty array, as Math does', () => {
      expect(utils.minOf([])).toBe(Infinity);
      expect(utils.maxOf([])).toBe(-Infinity);
    });

    it('handles an array size that makes the spread form throw', () => {
      const big = new Array(200_000).fill(5);
      big[123_456] = -2;
      expect(() => Math.min(...big)).toThrow(RangeError);
      expect(utils.minOf(big)).toBe(-2);
      expect(utils.maxOf(big)).toBe(5);
    });
  });
});
