import compileUnit from '../compileUnit';
import validateUnit from '../validateUnit';
import { gradeStroke } from '../gradeStroke';
import { WritingUnit } from '../types';

export const fixture = (): WritingUnit => ({
  schemaVersion: 2,
  id: 'i',
  text: 'i',
  coordinates: { em: 100, yAxis: 'down', bounds: [0, 0, 100, 100], baseline: 90 },
  motorStrokes: [
    {
      id: 'stem',
      kind: 'curve',
      points: [
        [50, 30],
        [50, 90],
      ],
      width: 5,
    },
    { id: 'dot', kind: 'dot', center: [50, 15], radius: 3 },
  ],
  plans: [{ id: 'normal', steps: [{ strokeId: 'stem' }, { strokeId: 'dot' }] }],
  defaultPlanId: 'normal',
});

test('canonical conversion clones source and preserves a true dot', () => {
  const data = fixture();
  const unit = compileUnit(data);
  expect(unit.bounds).toEqual([0, -1024, 1024, 1024]);
  expect(unit.baseline).toBeCloseTo(-921.6);
  expect(unit.strokes[1].points).toHaveLength(1);
  data.motorStrokes[0].id = 'changed';
  expect(unit.data.motorStrokes[0].id).toBe('stem');
});

test.each([
  (u: any) => {
    u.coordinates.em = 0;
  },
  (u: any) => {
    u.coordinates.xHeight = -1;
  },
  (u: any) => {
    u.motorStrokes[0].points[0][0] = NaN;
  },
  (u: any) => {
    u.motorStrokes[0].points = [
      [0, 0],
      [0, 0],
    ];
  },
  (u: any) => {
    u.plans[0].steps[1].strokeId = 'stem';
  },
  (u: any) => {
    u.extra = 'unknown';
  },
  (u: any) => {
    u.motorStrokes[0].id = '__proto__';
  },
])('rejects malformed units', (change) => {
  const data = fixture();
  change(data);
  expect(() => validateUnit(data)).toThrow();
});

test('curve grading distinguishes direction, location, shape and short strokes', () => {
  const stroke = compileUnit(fixture()).strokes[0];
  expect(gradeStroke(stroke, stroke.points, 'forward', 1)).toBe('correct');
  expect(gradeStroke(stroke, [...stroke.points].reverse(), 'forward', 1)).toBe(
    'wrong-direction',
  );
  expect(gradeStroke(stroke, [...stroke.points].reverse(), 'either', 1)).toBe('correct');
  expect(gradeStroke(stroke, [{ x: 0, y: 0 }], 'forward', 1)).toBe('too-short');
  expect(
    gradeStroke(
      stroke,
      stroke.points.map((p) => ({ x: p.x + 500, y: p.y })),
      'forward',
      1,
    ),
  ).toBe('outside-target');
});

test('dots accept taps but reject large wandering gestures', () => {
  const stroke = compileUnit(fixture()).strokes[1];
  expect(gradeStroke(stroke, stroke.points, 'forward', 1)).toBe('correct');
  expect(gradeStroke(stroke, [...stroke.points, { x: 900, y: 900 }], 'forward', 1)).toBe(
    'outside-target',
  );
});

test('rejects sparse arrays and accessors without invoking them', () => {
  const sparse = fixture();
  sparse.motorStrokes = new Array(2);
  expect(() => validateUnit(sparse)).toThrow();
  const getter = jest.fn(() => 'i');
  const accessor = fixture();
  Object.defineProperty(accessor, 'id', { get: getter, enumerable: true });
  expect(() => validateUnit(accessor)).toThrow();
  expect(getter).not.toHaveBeenCalled();
});

test('rejects unbounded reference arrays and incomplete or excessive plans', () => {
  const oversized = fixture();
  const stroke = oversized.motorStrokes[0];
  if (stroke.kind === 'curve')
    stroke.points = Array.from({ length: 4097 }, (_, i) => [i, i]);
  expect(() => compileUnit(oversized)).toThrow();
  const plans = fixture();
  plans.plans = Array.from({ length: 9 }, (_, i) => ({
    ...plans.plans[0],
    id: String(i),
  }));
  expect(() => compileUnit(plans)).toThrow();
  const incomplete = fixture();
  incomplete.plans[0].steps.pop();
  expect(() => compileUnit(incomplete)).toThrow();
});

test('visual segments resolve ownership and scale reveal geometry', () => {
  const data = fixture();
  data.visualSegments = [
    {
      id: 'piece',
      motorStrokeId: 'stem',
      points: [
        [50, 30],
        [50, 90],
      ],
      width: 4,
      start: 0.2,
      end: 0.8,
    },
  ];
  const compiled = compileUnit(data);
  expect(compiled.strokes[0].segments[0].width).toBeCloseTo(40.96);
  expect(compiled.strokes[0].segments[0].start).toBe(0.2);
  data.visualSegments[0].end = 0.1;
  expect(() => compileUnit(data)).toThrow();
});

test('curve grading rejects a bowed stroke with matching endpoints', () => {
  const stroke = compileUnit(fixture()).strokes[0];
  const [a, b] = stroke.points;
  expect(
    gradeStroke(
      stroke,
      [
        a,
        { x: a.x + 135, y: a.y + (b.y - a.y) / 3 },
        { x: a.x + 135, y: a.y + (2 * (b.y - a.y)) / 3 },
        b,
      ],
      'forward',
      1,
    ),
  ).toBe('wrong-shape');
});

test('bounds are origin and size, including nonzero origins and y-down conversion', () => {
  const data = fixture();
  data.coordinates.bounds = [20, -30, 50, 80];
  const down = compileUnit(data);
  expect(down.bounds).toEqual([204.8, -512, 512, 819.2]);
  data.coordinates.yAxis = 'up';
  expect(compileUnit(data).bounds).toEqual([204.8, -307.2, 512, 819.2]);
});

test('rejects hidden serialization hooks, hidden getters and symbols without executing them', () => {
  const hook = jest.fn();
  for (const location of ['unit', 'array', 'point']) {
    const value = fixture();
    let target: any = value;
    if (location === 'array') target = value.motorStrokes;
    if (location === 'point') target = (value.motorStrokes[0] as any).points[0];
    Object.defineProperty(target, 'toJSON', { value: hook });
    expect(() => compileUnit(value)).toThrow();
  }
  const getter = fixture();
  Object.defineProperty(getter.coordinates, 'baseline', { get: hook });
  expect(() => compileUnit(getter)).toThrow();
  const symbol = fixture();
  Object.defineProperty(symbol, Symbol('hidden'), { value: 'x' });
  expect(() => compileUnit(symbol)).toThrow();
  expect(hook).not.toHaveBeenCalled();
});

test('compilation bounds dense geometry while preserving endpoints and a sharp corner', () => {
  const value = fixture();
  value.coordinates.em = 1024;
  const dense = Array.from({ length: 2049 }, (_, i): [number, number] =>
    i <= 1024 ? [i / 2, 0] : [512, (i - 1024) / 2],
  );
  value.motorStrokes[0] = { id: 'stem', kind: 'curve', width: 5, points: dense };
  value.visualSegments = [
    { id: 'piece', motorStrokeId: 'stem', points: dense, width: 5, start: 0, end: 1 },
  ];
  const compiled = compileUnit(value);
  for (const points of [
    compiled.strokes[0].points,
    compiled.strokes[0].segments[0].points,
  ]) {
    expect(points.length).toBeLessThanOrEqual(512);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 512, y: -512 });
    expect(points).toContainEqual({ x: 512, y: 0 });
  }
  expect(compiled.data.motorStrokes[0]).toEqual(value.motorStrokes[0]);
});

test('rejects geometry that cannot fit the compiled bound within two canonical units', () => {
  const value = fixture();
  value.coordinates.em = 1024;
  value.motorStrokes[0] = {
    id: 'stem',
    kind: 'curve',
    width: 5,
    points: Array.from({ length: 1024 }, (_, i) => [i * 4, (i % 2) * 100]),
  };
  expect(() => compileUnit(value)).toThrow(/512|tolerance/);
});

test('dense collinear pen reversals survive simplification', () => {
  const value = fixture();
  value.coordinates.em = 1024;
  const points: [number, number][] = [];
  for (let x = 0; x <= 300; x++) points.push([x, 0]);
  for (let x = 299; x >= 100; x--) points.push([x, 0]);
  for (let x = 101; x <= 500; x++) points.push([x, 0]);
  value.motorStrokes[0] = { id: 'stem', kind: 'curve', width: 5, points };
  expect(compileUnit(value).strokes[0].points).toEqual([
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 100, y: 0 },
    { x: 500, y: 0 },
  ]);
});
