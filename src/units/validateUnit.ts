import { WritingUnit } from './types';

const fail = (path: string): never => {
  throw new Error(`Invalid writing unit: ${path}`);
};
const number = (value: unknown, path: string, positive = false): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > 1e9 ||
    (positive && value <= 0)
  )
    fail(path);
  return value as number;
};
const object = (value: unknown, keys: string[], path: string): Record<string, any> => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    [Object.prototype, null].indexOf(Object.getPrototypeOf(value)) < 0
  )
    fail(path);
  if (Object.getOwnPropertySymbols(value).length) fail(path);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (
      keys.indexOf(key) < 0 ||
      !Object.getOwnPropertyDescriptor(value, key)?.enumerable ||
      !Object.prototype.hasOwnProperty.call(
        Object.getOwnPropertyDescriptor(value, key),
        'value',
      )
    )
      fail(`${path}.${key}`);
  }
  return value as Record<string, any>;
};
const id = (value: unknown, path: string) => {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > 256 ||
    ['__proto__', 'prototype', 'constructor'].indexOf(value) >= 0
  )
    fail(path);
};
const array = (value: unknown, path: string, min: number, max: number): any[] => {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path);
  const list = value as any[];
  if (
    Object.getPrototypeOf(list) !== Array.prototype ||
    Object.getOwnPropertySymbols(list).length
  )
    fail(path);
  for (let i = 0; i < list.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(list, String(i));
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    )
      fail(`${path}[${i}]`);
  }
  if (
    Object.getOwnPropertyNames(list)
      .filter((key) => key !== 'length')
      .some((key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= list.length)
  )
    fail(path);
  return list;
};
const point = (value: unknown, path: string) => {
  array(value, path, 2, 2).forEach((n, i) => number(n, `${path}[${i}]`));
};
const points = (value: unknown, path: string) => {
  const list = array(value, path, 2, 4096);
  list.forEach((p, i) => point(p, `${path}[${i}]`));
  if (!list.some((p) => p[0] !== list[0][0] || p[1] !== list[0][1]))
    fail(`${path}: zero length`);
};

export default function validateUnit(input: unknown): asserts input is WritingUnit {
  const u = object(
    input,
    [
      'schemaVersion',
      'id',
      'text',
      'script',
      'style',
      'coordinates',
      'motorStrokes',
      'visualSegments',
      'plans',
      'defaultPlanId',
    ],
    'unit',
  );
  if (u.schemaVersion !== 2) fail('schemaVersion');
  id(u.id, 'id');
  if (typeof u.text !== 'string' || !u.text.length || u.text.length > 4096) fail('text');
  for (const key of ['script', 'style']) if (u[key] !== undefined) id(u[key], key);
  const c = object(
    u.coordinates,
    ['em', 'yAxis', 'bounds', 'baseline', 'xHeight', 'advance'],
    'coordinates',
  );
  const em = number(c.em, 'coordinates.em', true);
  if (em < 1e-6) fail('coordinates.em');
  if (c.yAxis !== 'up' && c.yAxis !== 'down') fail('coordinates.yAxis');
  array(c.bounds, 'coordinates.bounds', 4, 4).forEach((n, i) =>
    number(n, `coordinates.bounds[${i}]`),
  );
  if (c.bounds[2] <= 0 || c.bounds[3] <= 0) fail('coordinates.bounds');
  for (const key of ['baseline', 'xHeight', 'advance'])
    if (c[key] !== undefined) number(c[key], `coordinates.${key}`, key !== 'baseline');
  const ids = new Set<string>();
  array(u.motorStrokes, 'motorStrokes', 1, 64).forEach((value, i) => {
    const path = `motorStrokes[${i}]`;
    const s = object(value, ['id', 'kind', 'points', 'width', 'center', 'radius'], path);
    id(s.id, `${path}.id`);
    if (ids.has(s.id)) fail(`${path}.id duplicate`);
    ids.add(s.id);
    if (s.kind === 'curve') {
      if (s.center !== undefined || s.radius !== undefined) fail(path);
      points(s.points, `${path}.points`);
      number(s.width, `${path}.width`, true);
    } else if (s.kind === 'dot') {
      if (s.points !== undefined || s.width !== undefined) fail(path);
      point(s.center, `${path}.center`);
      number(s.radius, `${path}.radius`, true);
    } else fail(`${path}.kind`);
  });
  const segmentIds = new Set<string>();
  if (u.visualSegments !== undefined)
    array(u.visualSegments, 'visualSegments', 0, 256).forEach((value, i) => {
      const path = `visualSegments[${i}]`;
      const s = object(
        value,
        ['id', 'motorStrokeId', 'points', 'width', 'start', 'end'],
        path,
      );
      id(s.id, `${path}.id`);
      if (segmentIds.has(s.id) || !ids.has(s.motorStrokeId)) fail(path);
      segmentIds.add(s.id);
      points(s.points, `${path}.points`);
      number(s.width, `${path}.width`, true);
      number(s.start, `${path}.start`);
      number(s.end, `${path}.end`);
      if (s.start < 0 || s.end > 1 || s.start >= s.end) fail(path);
    });
  const planIds = new Set<string>();
  array(u.plans, 'plans', 1, 8).forEach((value, i) => {
    const path = `plans[${i}]`;
    const p = object(value, ['id', 'steps'], path);
    id(p.id, `${path}.id`);
    if (planIds.has(p.id)) fail(`${path}.id duplicate`);
    planIds.add(p.id);
    const used = new Set<string>();
    array(p.steps, `${path}.steps`, ids.size, ids.size).forEach((value, j) => {
      const s = object(value, ['strokeId', 'direction'], `${path}.steps[${j}]`);
      if (!ids.has(s.strokeId) || used.has(s.strokeId))
        fail(`${path}.steps[${j}].strokeId`);
      used.add(s.strokeId);
      if (
        s.direction !== undefined &&
        s.direction !== 'forward' &&
        s.direction !== 'either'
      )
        fail(`${path}.steps[${j}].direction`);
    });
  });
  if (!planIds.has(u.defaultPlanId)) fail('defaultPlanId');
}
