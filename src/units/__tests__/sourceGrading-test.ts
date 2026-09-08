import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import compileUnit from '../compileUnit';
import { gradeStroke } from '../gradeStroke';
import { WritingDataPack } from '../types';
import { Point } from '../../typings/types';

const root = resolve(__dirname, '../../..');
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const json = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const lock = json('packs/sources/lock.json');
const source = (id: string): Record<string, string> => {
  const entry = lock.sources.find((s: any) => s.id === id);
  const bytes = readFileSync(resolve(root, 'packs/sources', entry.file));
  expect(hash(bytes)).toBe(entry.sha256);
  return JSON.parse(gunzipSync(bytes).toString()).files;
};
const pack = (id: string): { data: WritingDataPack; manifest: any } => {
  const manifest = json(`packs/generated/${id}.manifest.json`);
  const bytes = readFileSync(resolve(root, `packs/generated/${id}.json`));
  expect(hash(bytes)).toBe(manifest.sha256);
  return { data: JSON.parse(bytes.toString()), manifest };
};

// This test parser preserves each START/BREAK pen interval and original XYT samples.
const recordedStrokes = (raw: string) => {
  const strokes: number[][][] = [];
  for (const line of raw.trim().split(/\r?\n/)) {
    if (line === 'START' || line === 'BREAK') strokes.push([]);
    else {
      const point = line.split(',').map(Number);
      expect(point.length).toBe(3);
      expect(point.every(Number.isFinite)).toBe(true);
      strokes[strokes.length - 1].push(point);
    }
  }
  return strokes.filter((s) => s.length);
};

it('grades pinned KanjiVG あ/ぬ paths positively, rejects direction and spatial perturbations', () => {
  const files = source('kanjivg');
  const { data, manifest } = pack('japanese-kana');
  for (const [text, count] of [
    ['あ', 3],
    ['ぬ', 2],
  ] as Array<[string, number]>) {
    const asset = manifest.assets[text];
    expect(hash(files[asset.sourcePath])).toBe(asset.sourceSHA256);
    expect((files[asset.sourcePath].match(/<path\s/g) || []).length).toBe(count);
    const compiled = compileUnit(data.units[text]);
    expect(compiled.strokes.length).toBe(count);
    for (const stroke of compiled.strokes) {
      expect(gradeStroke(stroke, stroke.points, 'forward', 1)).toBe('correct');
      expect(gradeStroke(stroke, stroke.points.slice().reverse(), 'forward', 1)).toBe(
        'wrong-direction',
      );
      expect(
        gradeStroke(
          stroke,
          stroke.points.map((p) => ({ x: p.x + 1024, y: p.y })),
          'forward',
          1,
        ),
      ).toBe('outside-target');
      expect(gradeStroke(stroke, stroke.points.slice(0, 2), 'forward', 1)).toBe(
        'too-short',
      );
    }
  }
});

it('grades original Omniglot samples with pen lifts intact and catches a reversed recorded loop', () => {
  const files = source('omniglot-korean');
  const { data, manifest } = pack('korean-omniglot');
  for (const text of ['ㅏ', 'ㅇ']) {
    const asset = manifest.assets[text];
    const raw = files[asset.sourcePath];
    expect(hash(raw)).toBe(asset.sourceSHA256);
    const recorded = recordedStrokes(raw);
    const compiled = compileUnit(data.units[text]);
    expect(recorded.length).toBe(compiled.strokes.length);
    recorded.forEach((points, i) => {
      const canonical = points.map(([x, y]) => ({
        x: (x * 1024) / data.units[text].coordinates.em,
        y: (y * 1024) / data.units[text].coordinates.em,
      }));
      expect(gradeStroke(compiled.strokes[i], canonical, 'forward', 1)).toBe('correct');
    });
    if (text === 'ㅇ') {
      const loop = compiled.strokes[1];
      expect(
        Math.hypot(
          loop.points[0].x - loop.points[loop.points.length - 1].x,
          loop.points[0].y - loop.points[loop.points.length - 1].y,
        ),
      ).toBeLessThan(200);
      expect(gradeStroke(loop, loop.points.slice().reverse(), 'forward', 1)).toBe(
        'wrong-direction',
      );
      expect(gradeStroke(loop, loop.points.slice().reverse(), 'either', 1)).toBe(
        'correct',
      );
    }
  }
});

it('distinguishes direction on a genuinely closed loop even with identical endpoints', () => {
  // Synthetic topology regression, explicitly distinct from the recordings above.
  const points = Array.from({ length: 65 }, (_, i) => ({
    x: 512 + 300 * Math.cos((i * Math.PI) / 32),
    y: 512 + 300 * Math.sin((i * Math.PI) / 32),
  }));
  points[points.length - 1] = { ...points[0] };
  const stroke = { id: 'loop', kind: 'curve' as const, points, width: 30, segments: [] };
  expect(gradeStroke(stroke, points, 'forward', 1)).toBe('correct');
  expect(gradeStroke(stroke, points.slice().reverse(), 'forward', 1)).toBe(
    'wrong-direction',
  );
});

it('measures other recordings of one source class without labeling them accepted teaching variants', () => {
  const files = source('omniglot-korean');
  const { data, manifest } = pack('korean-omniglot');
  const asset = manifest.assets['ㅏ'];
  const target = compileUnit(data.units['ㅏ']);
  const targetPoints = ([] as Point[]).concat(...target.strokes.map((s) => s.points));
  const bounds = (points: Point[]) => [
    Math.min(...points.map((p) => p.x)),
    Math.min(...points.map((p) => p.y)),
    Math.max(...points.map((p) => p.x)),
    Math.max(...points.map((p) => p.y)),
  ];
  const [tx0, ty0, tx1, ty1] = bounds(targetPoints);
  const recordings: Array<{ path: string; aligned: Point[][] }> = [];
  let differentPenLiftCount = 0;
  Object.keys(files)
    .filter(
      (path) => path.includes(`/${asset.sourceClass}/`) && path !== asset.sourcePath,
    )
    .sort()
    .forEach((path) => {
      const strokes = recordedStrokes(files[path]);
      if (strokes.length !== target.strokes.length) {
        differentPenLiftCount++;
        return;
      }
      const points = ([] as number[][]).concat(...strokes).map(([x, y]) => ({ x, y }));
      const [x0, y0, x1, y1] = bounds(points);
      // Diagnostic registration only: uniform em scaling + center translation.
      // Preserve stroke order, relative placement and original point direction.
      const scale = 1024 / Math.max(x1 - x0, y1 - y0, 1);
      recordings.push({
        path,
        aligned: strokes.map((stroke) =>
          stroke.map(([x, y]) => ({
            x: (x - (x0 + x1) / 2) * scale + (tx0 + tx1) / 2,
            y: (y - (y0 + y1) / 2) * scale + (ty0 + ty1) / 2,
          })),
        ),
      });
    });
  expect(recordings.length + differentPenLiftCount).toBe(19);
  const reports = [1, 1.5, 2]
    .map((leniency) =>
      (['forward', 'either'] as const).map((direction) => {
        const reasons: Array<Record<string, number>> = [{}, {}];
        const outcomes = recordings.map((recording) => ({
          path: recording.path,
          reasons: recording.aligned.map((stroke, i) => {
            const reason = gradeStroke(target.strokes[i], stroke, direction, leniency);
            reasons[i][reason] = (reasons[i][reason] || 0) + 1;
            return reason;
          }),
        }));
        return {
          leniency,
          direction,
          comparedRecordings: recordings.length,
          differentPenLiftCount,
          acceptedStrokes: outcomes.reduce(
            (n, row) => n + row.reasons.filter((reason) => reason === 'correct').length,
            0,
          ),
          acceptedWholeRecordings: outcomes.filter((row) =>
            row.reasons.every((reason) => reason === 'correct'),
          ).length,
          reasonsByStroke: reasons,
          outcomes,
        };
      }),
    )
    .reduce((all, group) => all.concat(group), []);
  // Visually inspected audit examples: similar whole-unit layout, same pen lifts/order.
  // These are positive geometry fixtures at an explicitly chosen tolerance, not certified forms.
  for (const suffix of ['0643_01.txt', '0643_07.txt']) {
    const recording = recordings.find((row) => row.path.endsWith(suffix))!;
    recording.aligned.forEach((stroke, i) => {
      expect(gradeStroke(target.strokes[i], stroke, 'forward', 1.5)).toBe('correct');
      expect(
        gradeStroke(
          target.strokes[i],
          stroke.map((p) => ({ x: p.x + 1024, y: p.y })),
          'forward',
          1.5,
        ),
      ).toBe('outside-target');
    });
    expect(
      gradeStroke(
        target.strokes[0],
        recording.aligned[0].slice().reverse(),
        'forward',
        1.5,
      ),
    ).toBe('wrong-direction');
  }
  console.log(
    'Omniglot character01 diagnostic',
    JSON.stringify(reports.map((report) => ({ ...report, outcomes: undefined }))),
  );
  // Optional explicit evidence output for the audit, never a committed human-accuracy claim.
  if (process.env.SCRIBING_GRADING_EVIDENCE)
    writeFileSync(
      process.env.SCRIBING_GRADING_EVIDENCE,
      JSON.stringify(
        {
          source: manifest.source,
          selected: asset,
          target: target.strokes.map((stroke) => stroke.points),
          recordings,
          reports,
        },
        null,
        2,
      ),
    );
});
