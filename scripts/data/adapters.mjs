import svgpath from 'svgpath';
import { SaxesParser } from 'saxes';

const MAX_TEXT = 32 * 1024 * 1024;
const finite = (x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e7;
const fail = (message) => {
  throw new Error(message);
};
const round = (x) => Math.round(x * 1e6) / 1e6;
export function point(p) {
  if (!Array.isArray(p) || p.length < 2 || !p.every(finite)) fail('Invalid finite point');
  return p;
}
export function parseJSON(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT) fail('JSON input limit');
  return JSON.parse(text);
}
export function parseXML(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT || /<!ENTITY\b/i.test(text))
    fail('XML input/entity limit');
  const parser = new SaxesParser({ xmlns: false });
  let root;
  const stack = [];
  let count = 0;
  parser.on('opentag', (tag) => {
    if (++count > 200000 || stack.length >= 64) fail('XML structure limit');
    const node = {
      name: tag.name.split(':').at(-1),
      attributes: tag.attributes,
      children: [],
      text: '',
    };
    if (stack.length) stack.at(-1).children.push(node);
    else root = node;
    stack.push(node);
  });
  parser.on('text', (chunk) => {
    if (stack.length) stack.at(-1).text += chunk;
  });
  parser.on('closetag', () => stack.pop());
  parser.on('error', (error) => {
    throw error;
  });
  parser.write(text).close();
  if (!root) fail('Missing XML root');
  return root;
}
export function descendants(node, name) {
  return [
    ...(node.name === name ? [node] : []),
    ...node.children.flatMap((c) => descendants(c, name)),
  ];
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function flattenCubic(a, b, c, d, tolerance, out, depth = 0) {
  const excess = distance(a, b) + distance(b, c) + distance(c, d) - distance(a, d);
  if (excess <= tolerance || depth >= 14) {
    if (out.length >= 4096) fail('SVG point limit');
    out.push(d);
    return;
  }
  const ab = mid(a, b),
    bc = mid(b, c),
    cd = mid(c, d),
    abc = mid(ab, bc),
    bcd = mid(bc, cd),
    m = mid(abc, bcd);
  flattenCubic(a, ab, abc, m, tolerance, out, depth + 1);
  flattenCubic(m, bcd, cd, d, tolerance, out, depth + 1);
}
export function svgPath(text, tolerance = 0.05) {
  if (
    typeof text !== 'string' ||
    text.length > 100000 ||
    !finite(tolerance) ||
    tolerance <= 0
  )
    fail('SVG path limit');
  const parsed = svgpath(text);
  if (parsed.err) fail(parsed.err);
  parsed.abs().unshort().unarc();
  const strokes = [];
  let current;
  let pos = [0, 0];
  let start;
  for (const segment of parsed.segments) {
    const [command, ...v] = segment;
    if (!v.every(finite)) fail('Invalid SVG number');
    if (command === 'M') {
      current = [[v[0], v[1]]];
      strokes.push(current);
      pos = current[0];
      start = pos;
    } else {
      if (!current) fail('Path must begin with M');
      if (command === 'L') current.push((pos = [v[0], v[1]]));
      else if (command === 'H') current.push((pos = [v[0], pos[1]]));
      else if (command === 'V') current.push((pos = [pos[0], v[0]]));
      else if (command === 'C') {
        const end = [v[4], v[5]];
        flattenCubic(pos, [v[0], v[1]], [v[2], v[3]], end, tolerance, current);
        pos = end;
      } else if (command === 'Q') {
        const q = [v[0], v[1]],
          end = [v[2], v[3]];
        flattenCubic(
          pos,
          pos.map((x, i) => x + (2 * (q[i] - x)) / 3),
          end.map((x, i) => x + (2 * (q[i] - x)) / 3),
          end,
          tolerance,
          current,
        );
        pos = end;
      } else if (command === 'Z') {
        if (distance(pos, start) > 0) current.push(start.slice());
        pos = start;
      } else fail(`Unsupported normalized SVG command ${command}`);
      if (current.length > 4096) fail('SVG point limit');
    }
    if (strokes.length > 64) fail('SVG stroke limit');
  }
  if (!strokes.length) fail('Empty SVG');
  return strokes;
}
export function parseSVG(text) {
  const root = parseXML(text),
    nodes = descendants(root, 'path');
  // KanjiVG motor IDs exclude stroke-number labels and any unrelated paths.
  const motor = nodes.filter((n) => /-s\d+$/.test(n.attributes.id || ''));
  const selected = new Set(motor.length ? motor : nodes);
  function rejectTransforms(node, transformed = false) {
    const active = transformed || Boolean(node.attributes.transform);
    if (selected.has(node) && active)
      fail('SVG transforms must be baked into paths before import');
    for (const child of node.children) rejectTransforms(child, active);
  }
  rejectTransforms(root);
  if (!selected.size) fail('No SVG paths');
  return [...selected].flatMap((n) => svgPath(n.attributes.d));
}
export function parseOmniglot(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT) fail('Observation input limit');
  const lines = text.trim().split(/\r?\n/);
  if (lines.shift() !== 'START') fail('Missing START');
  const strokes = [];
  let current = [];
  let points = 0;
  for (const line of lines) {
    if (line === 'BREAK') {
      if (current.length) strokes.push(current);
      current = [];
    } else {
      const parts = line.split(',');
      if (parts.length !== 3 || parts.some((x) => !x.trim())) fail('Invalid XYT row');
      current.push(point(parts.map(Number)));
      if (++points > 200000) fail('Observation point limit');
    }
  }
  if (current.length) strokes.push(current);
  if (!strokes.length || strokes.length > 256) fail('Observation stroke limit');
  return strokes;
}
function boundedStrokes(strokes) {
  if (
    !strokes.length ||
    strokes.length > 256 ||
    strokes.some((s) => !s.length) ||
    strokes.reduce((n, s) => n + s.length, 0) > 200000
  )
    fail('Raw observation limits');
  return strokes;
}
export function parseTomoe(text) {
  return descendants(parseXML(text), 'character').map((c) => ({
    text: descendants(c, 'utf8')[0]?.text || '',
    strokes: boundedStrokes(
      descendants(c, 'stroke').map((s) =>
        descendants(s, 'point').map((p) =>
          point([Number(p.attributes.x), Number(p.attributes.y)]),
        ),
      ),
    ),
  }));
}
export function parseInkML(text) {
  const root = parseXML(text);
  const channels = descendants(root, 'channel').map((c) => c.attributes.name);
  if (channels.length && (channels[0] !== 'X' || channels[1] !== 'Y'))
    fail('InkML requires leading X Y channels');
  const strokes = descendants(root, 'trace').map((t) =>
    t.text
      .trim()
      .split(',')
      .map((p) => {
        const row = p.trim().split(/\s+/);
        if (
          row.length < 2 ||
          row.length > 8 ||
          row.some((v) => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v))
        )
          fail('Unsupported InkML trace encoding');
        return point(row.map(Number));
      }),
  );
  return boundedStrokes(strokes);
}
export function parseUnipen(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT) fail('UNIPEN input limit');
  let current;
  const strokes = [];
  let coords = false;
  for (const line of text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    if (line.startsWith('.COORD')) {
      if (!/^\.COORD\s+X\s+Y(?:\s|$)/.test(line)) fail('UNIPEN requires X Y');
      coords = true;
    } else if (line === '.PEN_DOWN') {
      if (current) fail('Nested PEN_DOWN');
      current = [];
    } else if (line === '.PEN_UP') {
      if (!current?.length) fail('Empty PEN_UP');
      strokes.push(current);
      current = undefined;
    } else if (!line.startsWith('.')) {
      if (!current || !coords) fail('Point outside pen stroke');
      current.push(point(line.split(/\s+/).map(Number)));
    }
  }
  if (current || !strokes.length) fail('Incomplete UNIPEN');
  return boundedStrokes(strokes);
}
export function parseGlyphLiteral(text) {
  if (typeof text !== 'string' || text.length > 100000) fail('Glyph literal limit');
  // A full-file whitelist, never eval/import the downloaded TypeScript.
  const clean = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^import type[^;]*;/gm, '')
    .trim();
  const match =
    /^export const \w+(?:\s*:\s*\w+)?\s*=\s*\{\s*width:\s*([\d.]+),\s*variants:\s*\[([\s\S]*?)\],?\s*\};?$/.exec(
      clean,
    );
  if (!match) fail('Unexpected glyph literal syntax');
  const body = match[2];
  const strings = body.match(/"(?:[^"\\]|\\.)*"/g) || [];
  if (body.replace(/"(?:[^"\\]|\\.)*"/g, '').replace(/[\s,]/g, ''))
    fail('Executable glyph expression');
  const width = Number(match[1]);
  if (!finite(width) || width <= 0 || !strings.length) fail('Invalid glyph metrics');
  return { width, variants: strings.map((s) => JSON.parse(s)) };
}
export function makeUnit(id, text, strokes, coordinates, options = {}) {
  if (!strokes.length || strokes.length > 64) fail('Unit stroke limit');
  const width = options.width || coordinates.em / 30;
  const motorStrokes = strokes.map((raw, i) => {
    const points = raw
      .map((p) => point(p).slice(0, 2))
      .filter((p, j, a) => !j || distance(p, a[j - 1]) > 0)
      .map((p) => p.map(round));
    if (options.dots?.includes(i))
      return {
        id: `s${i + 1}`,
        kind: 'dot',
        center: points[0],
        radius: options.radius || width / 2,
      };
    if (points.length < 2 || !points.some((p) => distance(p, points[0]) > 1e-8))
      fail('Degenerate curve; explicit dot required');
    if (points.length > 4096) fail('Unit point limit');
    return { id: `s${i + 1}`, kind: 'curve', points, width };
  });
  return {
    schemaVersion: 2,
    id,
    text,
    script: options.script || 'Zyyy',
    style: options.style || 'source-preview',
    coordinates,
    motorStrokes,
    plans: [
      {
        id: 'source-order',
        steps: motorStrokes.map((s) => ({ strokeId: s.id })),
      },
    ],
    defaultPlanId: 'source-order',
  };
}
export function letterpathsUnit(data) {
  if (!data?.glyph?.char || !Array.isArray(data.strokes))
    fail('Invalid letterpaths JSON');
  const strokes = [];
  const dots = [];
  for (const s of data.strokes) {
    if (s.kind === 'mark') {
      if (!s.mark || !finite(s.mark.size) || s.mark.size <= 0)
        fail('Invalid explicit mark');
      dots.push(strokes.length);
      strokes.push([[s.mark.x, s.mark.y]]);
    } else {
      const curves = s.curves;
      if (!curves?.length) fail('Empty letterpaths curves');
      let end;
      let path = '';
      for (const c of curves) {
        const p = ['p0', 'p1', 'p2', 'p3'].map((k) => point([c[k]?.x, c[k]?.y]));
        if (end && distance(end, p[0]) > 0.001) fail('Discontinuous motor stroke');
        path += `${end ? '' : 'M' + p[0].join(' ')} C${p.slice(1).flat().join(' ')}`;
        end = p[3];
      }
      strokes.push(svgPath(path, 0.4)[0]);
    }
  }
  const coordinates = {
    em: 1000,
    yAxis: 'down',
    bounds: [0, 0, 1200, 1200],
    baseline: data.guides.baseline,
    xHeight: data.guides.baseline - data.guides.xHeight,
  };
  const unit = makeUnit(data.glyph.char, data.glyph.char, strokes, coordinates, {
    width: 20,
    dots,
    script: 'Latn',
    style: 'letterpaths-print',
  });
  // Upstream markToCurve interprets mark.size using radius=size/2; preserve that explicit size.
  data.strokes.forEach((s, i) => {
    if (s.kind === 'mark') unit.motorStrokes[i].radius = s.mark.size / 2;
  });
  return unit;
}
