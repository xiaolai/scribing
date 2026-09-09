import test from 'node:test';
import assert from 'node:assert/strict';
import {
  svgPath,
  parseSVG,
  parseXML,
  parseOmniglot,
  parseTomoe,
  parseInkML,
  parseUnipen,
  parseGlyphLiteral,
  letterpathsUnit,
  makeUnit,
} from '../adapters.mjs';

test('SVG retains pen lifts, closure and backtracking; supports relative shorthand and arcs', () => {
  const p = svgPath('M0 0 L10 0 L0 0 M20 20 q10 -10 20 0 t20 0 z');
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], [
    [0, 0],
    [10, 0],
    [0, 0],
  ]);
  assert.deepEqual(p[1].at(-1), [20, 20]);
  assert.ok(svgPath('M0 0 a10 10 0 0 1 20 0')[0].length > 3);
  assert.throws(() => svgPath('M0 0 L1 nope'));
  assert.throws(() => svgPath('M0 0 L1e999 0'));
});
test('SVG does not silently discard inherited transforms', () => {
  assert.throws(
    () =>
      parseSVG('<svg><g transform="translate(10 20)"><path d="M0 0 L1 1"/></g></svg>'),
    /transforms/,
  );
});
test('XML rejects entities and bounds nesting; never fetches external DTD', () => {
  assert.throws(() => parseXML('<!DOCTYPE x [<!ENTITY a "boom">]><x>&a;</x>'));
  assert.throws(() => parseXML('<x>'.repeat(100) + '</x>'.repeat(100)));
  assert.equal(parseXML('<!DOCTYPE x SYSTEM "https://invalid.example/"><x/>').name, 'x');
});
test('Omniglot preserves repeated points/time/lifts and rejects malformed observations', () => {
  assert.deepEqual(parseOmniglot('START\n1,2,0\n1,2,2\nBREAK\n4,5,3\n'), [
    [
      [1, 2, 0],
      [1, 2, 2],
    ],
    [[4, 5, 3]],
  ]);
  for (const text of ['1,2,3', 'START\nNaN,2,3', 'START\n1,2,3,4', 'START\nBREAK'])
    assert.throws(() => parseOmniglot(text));
});
test('Tomoe, InkML and UNIPEN preserve independent real-format stroke boundaries', () => {
  assert.deepEqual(
    parseTomoe(
      '<dictionary><character><utf8>一</utf8><strokes><stroke><point x="0" y="1"/><point x="2" y="3"/></stroke></strokes></character></dictionary>',
    )[0],
    {
      text: '一',
      strokes: [
        [
          [0, 1],
          [2, 3],
        ],
      ],
    },
  );
  assert.deepEqual(
    parseInkML(
      '<ink xmlns="http://www.w3.org/2003/InkML"><traceFormat><channel name="X"/><channel name="Y"/><channel name="T"/></traceFormat><trace id="1">1 2 0, 3 4 10</trace></ink>',
    ),
    [
      [
        [1, 2, 0],
        [3, 4, 10],
      ],
    ],
  );
  assert.deepEqual(
    parseUnipen('.VERSION 1.0\n.COORD X Y T\n.PEN_DOWN\n1 2 0\n3 4 10\n.PEN_UP\n'),
    [
      [
        [1, 2, 0],
        [3, 4, 10],
      ],
    ],
  );
  assert.throws(() => parseInkML('<ink><trace>1 2, bad</trace></ink>'));
});
test('upstream TypeScript literals are parsed without evaluation', () => {
  assert.deepEqual(
    parseGlyphLiteral(
      'import type { X } from "x"; export const a: X = { width: 8, variants: ["M0 0 L1 1",], };',
    ),
    { width: 8, variants: ['M0 0 L1 1'] },
  );
  assert.throws(() =>
    parseGlyphLiteral('export const a = {width: run(), variants: []};'),
  );
});
test('explicit letterpaths mark is a dot; tiny curves remain curves', () => {
  const u = letterpathsUnit({
    glyph: { char: 'i', style: 'print' },
    guides: { baseline: 900, xHeight: 300 },
    strokes: [
      {
        kind: 'stroke',
        curves: [
          {
            p0: { x: 0, y: 0 },
            p1: { x: 0, y: 1 },
            p2: { x: 1, y: 1 },
            p3: { x: 1, y: 0 },
          },
        ],
      },
      { kind: 'mark', mark: { x: 5, y: 6, size: 18 } },
    ],
  });
  assert.equal(u.motorStrokes[0].kind, 'curve');
  assert.equal(u.motorStrokes[1].kind, 'dot');
  assert.throws(() =>
    makeUnit(
      'x',
      'x',
      [
        [
          [1, 1],
          [1, 1],
        ],
      ],
      { em: 100, yAxis: 'up', bounds: [0, 0, 100, 100] },
    ),
  );
});
