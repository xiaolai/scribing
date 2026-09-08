import ta from 'hanzi-writer-data/他.json';
import parseCharData from '../parseCharData';

describe('parseCharData', () => {
  it('creates a Character object from character json', () => {
    const res = parseCharData('他', ta);
    expect(res.strokes).toHaveLength(5);
    expect(res.strokes[0].isInRadical).toBe(true);
    expect(res.strokes[1].isInRadical).toBe(true);
    expect(res.strokes[2].isInRadical).toBe(false);
    expect(res.strokes[3].isInRadical).toBe(false);
    expect(res.strokes[4].isInRadical).toBe(false);
  });
  it.each([
    null,
    {},
    { strokes: [], medians: [] },
    {
      strokes: [''],
      medians: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    },
    { strokes: ['M0 0L1 1'], medians: [] },
    { strokes: ['M0 0L1 1'], medians: [[]] },
    {
      strokes: ['M0 0L1 1'],
      medians: [
        [
          [0, 0],
          [NaN, 1],
        ],
      ],
    },
    {
      strokes: ['M0 0L1 1'],
      medians: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
      radStrokes: [1],
    },
  ])('rejects malformed data before constructing a character: %p', (data) => {
    expect(() => parseCharData('人', data as any)).toThrow('Invalid character data');
  });
});
