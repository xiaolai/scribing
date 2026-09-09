#!/usr/bin/env node
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { gzipSync as javascriptGzip } from 'fflate';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { authoredUnit } from './authored.mjs';
import {
  parseJSON,
  parseSVG,
  parseOmniglot,
  parseGlyphLiteral,
  letterpathsUnit,
  makeUnit,
  svgPath,
} from './adapters.mjs';

/** Pure-JavaScript compression avoids host zlib and OS-dependent output bytes. */
export const deterministicGzip = (input) =>
  javascriptGzip(typeof input === 'string' ? Buffer.from(input, 'utf8') : input, {
    level: 9,
    mtime: 0,
  });
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export const encode = (data) => JSON.stringify(data) + '\n';
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const gradeOne =
  '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六';
export async function loadSource(sourceDir, lock) {
  const bytes = await readFile(path.join(sourceDir, lock.file));
  if (sha256(bytes) !== lock.sha256) throw Error(`Source hash mismatch: ${lock.id}`);
  const notice = await readFile(path.join(sourceDir, lock.licenseFile));
  if (sha256(notice) !== lock.licenseSHA256)
    throw Error(`Notice hash mismatch: ${lock.id}`);
  const data = JSON.parse(gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }));
  if (Object.keys(data.files).length !== lock.inputCount)
    throw Error(`Source inventory mismatch: ${lock.id}`);
  return { ...data, notice: notice.toString() };
}
function pack(id, source, units, provenance, description) {
  return {
    schemaVersion: 1,
    id,
    name: id,
    version: '1.0.0-preview.1',
    license: source.license,
    status: 'technical-preview',
    provenance,
    description,
    source: { name: source.name, url: source.url, revision: source.revision },
    units,
  };
}
function asset(sourcePath, sourceText, extra = {}) {
  return { sourcePath, sourceSHA256: sha256(sourceText), ...extra };
}
function boundsOf(strokes, padding = 0) {
  const points = strokes.flat();
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return [
    minX - padding,
    minY - padding,
    Math.max(maxX, minX + 1) + padding,
    Math.max(maxY, minY + 1) + padding,
  ];
}
function sampleMotor(points, count = 32) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] +
        Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
    );
  const total = lengths.at(-1);
  if (!total) return Array.from({ length: count }, () => points[0].slice(0, 2));
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    const target = (total * i) / (count - 1);
    while (segment < points.length - 1 && lengths[segment] < target) segment++;
    const ratio =
      (target - lengths[segment - 1]) / (lengths[segment] - lengths[segment - 1] || 1);
    return [0, 1].map(
      (axis) =>
        points[segment - 1][axis] +
        ratio * (points[segment][axis] - points[segment - 1][axis]),
    );
  });
}
export function chooseObservation(candidates) {
  if (!candidates.length || candidates.length > 20)
    throw Error('Observation selection requires 1..20 candidates');
  // Sorted copy under the original name, so every read below still sees the ordering
  // that makes representative selection deterministic. This used to rebind the
  // parameter itself; renaming the parameter avoids that without moving any read.
  const samples = candidates
    .slice()
    .sort((a, b) =>
      a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0,
    );
  const counts = new Map();
  for (const s of samples)
    counts.set(s.strokes.length, (counts.get(s.strokes.length) || 0) + 1);
  const modal = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const normalized = samples.map((s) => {
    const b = boundsOf(s.strokes),
      em = Math.max(b[2] - b[0], b[3] - b[1]);
    const center = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    return s.strokes
      .map((st) =>
        sampleMotor(st).map((p) => p.map((v, axis) => (v - center[axis]) / em)),
      )
      .flat();
  });
  const ranked = samples
    .map((s, i) => {
      const peers = samples
        .map((p, j) => (p.strokes.length === s.strokes.length ? j : -1))
        .filter((j) => j >= 0 && j !== i);
      let sum = 0;
      for (const j of peers)
        for (let k = 0; k < normalized[i].length; k++)
          sum += Math.hypot(
            normalized[i][k][0] - normalized[j][k][0],
            normalized[i][k][1] - normalized[j][k][1],
          );
      return {
        ...s,
        score: peers.length ? sum / (peers.length * normalized[i].length) : 0,
        strokeCountDistance: Math.abs(s.strokes.length - modal),
        stationaryFragments: s.strokes.filter(
          (st) => new Set(st.map((p) => p.slice(0, 2).join(','))).size < 2,
        ).length,
      };
    })
    .sort(
      (a, b) =>
        a.strokeCountDistance - b.strokeCountDistance ||
        a.stationaryFragments - b.stationaryFragments ||
        a.score - b.score ||
        (a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0),
    );
  return { ranked, modalStrokeCount: modal };
}
function observationUnit(id, text, sample) {
  const b = boundsOf(sample.strokes),
    em = Math.max(b[2] - b[0], b[3] - b[1], 1);
  const bb = boundsOf(sample.strokes, em * 0.1);
  const coordinates = {
    em,
    yAxis: 'up',
    bounds: [bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]],
  };
  const dots = [];
  sample.strokes.forEach((s, i) => {
    if (new Set(s.map((p) => p.slice(0, 2).join(','))).size === 1) dots.push(i);
  });
  return makeUnit(id, text, sample.strokes, coordinates, {
    dots,
    width: em / 24,
    script: 'Zyyy',
    style: 'omniglot-recorded',
  });
}
export async function build({
  sourceDir = path.join(defaultRoot, 'packs/sources'),
  authoredDir = path.join(defaultRoot, 'packs/authored'),
  outDir = path.join(defaultRoot, 'packs/generated'),
  raw = true,
} = {}) {
  const lock = parseJSON(await readFile(path.join(sourceDir, 'lock.json'), 'utf8'));
  const mappingBytes = await readFile(path.join(sourceDir, lock.mapping.file));
  if (sha256(mappingBytes) !== lock.mapping.sha256)
    throw Error('Korean mapping hash mismatch');
  const mapping = JSON.parse(mappingBytes);
  const jamo = mapping.entries.map((e) => e.character).join('');
  if (
    mapping.entries.length !== 40 ||
    new Set(mapping.entries.map((e) => e.sourceClass)).size !== 40
  )
    throw Error('Invalid Korean mapping');
  let previousCatalog;
  try {
    previousCatalog = JSON.parse(
      await readFile(path.join(outDir, 'catalog.json'), 'utf8'),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(outDir, { recursive: true });
  const catalog = {
    schemaVersion: 1,
    transformation: 'scribing-centerline-import-v2',
    rawCompression: 'fflate@0.8.2 gzip level9 mtime0',
    sourceSnapshots: lock.sources.map(
      ({ id, sha256: digest, licenseSHA256, source }) => ({
        id,
        sha256: digest,
        licenseSHA256,
        source,
      }),
    ),
    mapping: lock.mapping,
    authoredSources: [],
    packs: [],
    rawObservations: [],
    quarantine: [],
  };
  async function emit(
    p,
    assets,
    notice,
    presentation,
    transformation = catalog.transformation,
  ) {
    const file = p.id + '.json',
      bytes = encode(p);
    await writeFile(path.join(outDir, file), bytes);
    const noticeFile = p.id + '.NOTICE.txt';
    await writeFile(path.join(outDir, noticeFile), notice);
    const manifest = {
      schemaVersion: 1,
      packId: p.id,
      status: p.status,
      provenance: p.provenance,
      source: p.source,
      license: p.license,
      unitCount: Object.keys(p.units).length,
      characterCount: new Set(Object.values(p.units).map((u) => u.text)).size,
      sha256: sha256(bytes),
      noticeSHA256: sha256(notice),
      transformation,
      assets,
    };
    await writeFile(path.join(outDir, p.id + '.manifest.json'), encode(manifest));
    catalog.packs.push({
      id: p.id,
      name: p.name,
      presentation:
        presentation ||
        (p.provenance === 'recorded'
          ? 'recorded'
          : p.source.name === 'KanjiVG'
            ? 'vector'
            : 'source'),
      file,
      manifest: p.id + '.manifest.json',
      notice: noticeFile,
      unitCount: manifest.unitCount,
      characterCount: manifest.characterCount,
      sha256: manifest.sha256,
    });
  }
  const authoredLicense = await readFile(path.join(authoredDir, 'LICENSE'), 'utf8');
  for (const id of ['english-textbook', 'korean-textbook']) {
    const file = id + '.source.json';
    const bytes = await readFile(path.join(authoredDir, file));
    const model = parseJSON(bytes.toString());
    if (model.id !== id || model.license !== 'MIT' || model.provenance !== 'authored')
      throw Error('Invalid authored pack identity: ' + id);
    const sourceHash = sha256(bytes);
    catalog.authoredSources.push({
      file,
      sha256: sourceHash,
      licenseFile: 'LICENSE',
      licenseSHA256: sha256(authoredLicense),
    });
    const source = {
      name: 'Scribing original textbook models',
      url: 'https://github.com/xiaolai/scribing/tree/master/packs/authored',
      revision: 'sha256:' + sourceHash,
      license: 'MIT',
    };
    const units = {},
      assets = {};
    for (const [character, entry] of Object.entries(model.units)) {
      units[character] = authoredUnit(model, character, entry);
      assets[character] = {
        sourcePath: 'packs/authored/' + file,
        sourceSHA256: sourceHash,
        modelSHA256: sha256(encode(entry)),
        formationNotes:
          entry.notes ||
          'Defined print practice model; not a universal stroke convention.',
        references: model.references,
      };
    }
    const p = pack(id, source, units, 'authored', model.description);
    p.name = model.name;
    const notice =
      model.name +
      '\nOriginal Scribing geometry. Teaching references inform formation choices; no source artwork or font outlines are included.\n\n' +
      model.references
        .map(
          (reference) => reference.title + '\n' + reference.url + '\n' + reference.note,
        )
        .join('\n\n') +
      '\n\n' +
      authoredLicense;
    await emit(p, assets, notice, 'textbook', 'scribing-authored-centerline-v1');
  }
  for (const item of lock.sources) {
    const { source, files, notice } = await loadSource(sourceDir, item);
    if (item.id === 'letterpaths') {
      const units = {},
        assets = {};
      for (const [name, text] of Object.entries(files)) {
        const data = parseJSON(text);
        const u = letterpathsUnit(data);
        units[u.id] = u;
        assets[u.id] = asset(name, text, {
          sourcePhases: data.strokes.map((s) => s.phase),
          sourceName: data.glyph.name,
        });
      }
      await emit(
        pack(
          'english-letterpaths-print',
          source,
          units,
          'mixed',
          '52 print letters. Source-labelled traced lowercase and template uppercase; explicit source marks are dots. Teaching style remains a technical preview.',
        ),
        assets,
        notice,
      );
    } else if (item.id === 'glyphed') {
      const index = files['src/glyphs/glyphs.ts'];
      const imports = {};
      for (const match of index.matchAll(/import \{ (\w+) \} from "\.\/([^"\n]+)\.js";/g))
        imports[match[1]] = 'src/glyphs/' + match[2] + '.ts';
      const lines = index.slice(index.indexOf('export const glyphs'));
      const units = {},
        assets = {},
        aliases = {};
      for (const line of lines.split('\n')) {
        const match = /^\s*("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z]):\s*(\w+),?\s*$/.exec(
          line,
        );
        if (!match) continue;
        const char =
          match[1][0] === '"'
            ? JSON.parse(match[1])
            : match[1][0] === "'"
              ? match[1].slice(1, -1)
              : match[1];
        if (char === ' ') continue;
        const filename = imports[match[2]];
        if (!filename) throw Error('Missing glyph import');
        const text = files[filename];
        const data = parseGlyphLiteral(text);
        for (let variant = 0; variant < data.variants.length; variant++) {
          const id = variant ? char + '@' + variant : char;
          const strokes = svgPath(data.variants[variant]);
          const dotMap = {
            i: [1],
            j: [1],
            '.': [0],
            '!': [1],
            '?': [1],
            ':': [0, 1],
          };
          const dots = dotMap[char] || [];
          const u = makeUnit(
            id,
            char,
            strokes,
            {
              em: 24,
              yAxis: 'down',
              bounds: [-2, -2, Math.max(data.width + 2, 24) + 2, 30],
              baseline: 20,
              xHeight: 11,
              advance: data.width,
            },
            {
              width: 1,
              dots,
              radius: 0.6,
              script: 'Latn',
              style: 'glyphed-' + variant,
            },
          );
          units[id] = u;
          assets[id] = asset(filename, text, {
            variant,
            dotOverrides: dots,
            metricStatus:
              'Baseline20 and xHeight11 (baseline20 minus y9) inferred from source paths; bounds preserve a common vertical frame',
          });
          if (!variant) aliases[char + '@0'] = char;
        }
      }
      const p = pack(
        'english-glyphed',
        source,
        units,
        'authored',
        '83 drawable characters, 3 source variants each. Explicit per-character dot overrides; no random renderer jitter.',
      );
      p.aliases = aliases;
      await emit(p, assets, notice);
    } else if (item.id === 'kanjivg') {
      const groups = new Map([
        ['japanese-kana', []],
        ['japanese-grade-1', []],
      ]);
      for (const [name, text] of Object.entries(files)) {
        const code = parseInt(path.basename(name, '.svg'), 16),
          char = String.fromCodePoint(code);
        const group =
          code < 128
            ? 'kanjivg-latin'
            : [0x3001, 0x3002, 0x3005, 0x3006, 0xff01].includes(code)
              ? 'japanese-symbols'
              : code >= 0x3040 && code <= 0x30ff
                ? 'japanese-kana'
                : gradeOne.includes(char)
                  ? 'japanese-grade-1'
                  : 'japanese-kanji-' + Math.floor(code / 256).toString(16);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push([name, text, char]);
      }
      for (const [id, entries] of groups) {
        const units = {},
          assets = {};
        for (const [name, text, char] of entries) {
          const strokes = parseSVG(text);
          units[char] = makeUnit(
            char,
            char,
            strokes,
            { em: 109, yAxis: 'down', bounds: [0, 0, 109, 109] },
            {
              width: 3,
              script:
                id === 'kanjivg-latin'
                  ? /^[A-Za-z]$/.test(char)
                    ? 'Latn'
                    : 'Zyyy'
                  : id === 'japanese-symbols'
                    ? 'Zyyy'
                    : 'Jpan',
              style: 'kanjivg',
            },
          );
          assets[char] = asset(name, text);
        }
        await emit(
          pack(
            id,
            source,
            units,
            'authored',
            'KanjiVG ordered centerlines; source CC-BY-SA-3.0 applies to this transformed optional pack.',
          ),
          assets,
          notice,
        );
      }
    } else if (item.id.startsWith('omniglot-')) {
      const classes = new Map();
      const rawRecords = [];
      for (const [name, text] of Object.entries(files)) {
        try {
          const strokes = parseOmniglot(text);
          const cls = name.split('/')[2];
          const sample = { sourcePath: name, strokes };
          if (!classes.has(cls)) classes.set(cls, []);
          classes.get(cls).push(sample);
          rawRecords.push({
            sourcePath: name,
            sourceSHA256: sha256(text),
            strokesXYT: strokes,
          });
        } catch (error) {
          catalog.quarantine.push({
            source: item.id,
            path: name,
            reason: error.message,
          });
        }
      }
      const units = {},
        assets = {},
        korean = source.alphabet === 'Korean';
      for (const [cls, samples] of classes) {
        const { ranked, modalStrokeCount } = chooseObservation(samples);
        const id = korean ? jamo[Number(cls.slice(-2)) - 1] : item.id + ':' + cls;
        let selected;
        for (const sample of ranked) {
          try {
            units[id] = observationUnit(id, korean ? id : cls, sample);
            selected = sample;
            break;
          } catch {
            /* Try the next observed sample; failures remain reported if no candidate fits. */
          }
        }
        if (!selected) {
          catalog.quarantine.push({
            source: item.id,
            class: cls,
            reason: 'No observation satisfies runtime stroke/point limits',
          });
          continue;
        }
        assets[id] = asset(selected.sourcePath, files[selected.sourcePath], {
          sourceClass: cls,
          selection:
            'modal stroke count; stationary-fragment penalty; whole-glyph uniform-em centered medoid, 32 arc-length points per motor and mean corresponding-point distance over same-count peers; source-path tie-break',
          modalStrokeCount,
          selectionScore: selected.score,
          stationaryFragments: selected.stationaryFragments,
          strokeCountDistance: selected.strokeCountDistance,
          ...(korean
            ? {
                mapping:
                  'visually-derived; inspected3samples/class; independently reviewed by two agents; no native certification',
              }
            : { mapping: 'unmapped source class' }),
        });
      }
      const p = pack(
        korean ? 'korean-omniglot' : item.id,
        source,
        units,
        'recorded',
        'Selected real crowd-recorded examples. Technical preview of observed formation, not certified native teaching order.',
      );
      if (korean)
        p.aliases = Object.fromEntries(
          [...classes.keys()].map((cls) => [cls, jamo[Number(cls.slice(-2)) - 1]]),
        );
      await emit(p, assets, notice);
      if (raw) {
        const file = item.id + '.observations.json.gz';
        const bytes = deterministicGzip(
          encode({
            schemaVersion: 1,
            source,
            status: 'raw-observations',
            coordinates: { x: 'right', y: 'up', time: 'milliseconds' },
            observations: rawRecords,
          }),
        );
        await writeFile(path.join(outDir, file), bytes);
        catalog.rawObservations.push({
          file,
          sampleCount: rawRecords.length,
          sha256: sha256(bytes),
        });
      }
    }
  }
  const artifacts = (c) => [
    ...(c?.packs || []).flatMap((p) => [p.file, p.manifest, p.notice]),
    ...(c?.rawObservations || []).map((r) => r.file),
  ];
  const currentFiles = new Set(artifacts(catalog));
  for (const file of artifacts(previousCatalog)) {
    if (
      !/^[a-z0-9-]+\.(?:json|manifest\.json|NOTICE\.txt|observations\.json\.gz)$/.test(
        file,
      )
    )
      throw Error('Unsafe previous output filename');
    if (!currentFiles.has(file))
      await unlink(path.join(outDir, file)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
  }
  await writeFile(path.join(outDir, 'catalog.json'), encode(catalog));
  return catalog;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source-dir') options.sourceDir = path.resolve(args[++i]);
    else if (args[i] === '--authored-dir') options.authoredDir = path.resolve(args[++i]);
    else if (args[i] === '--out') options.outDir = path.resolve(args[++i]);
    else if (args[i] === '--no-raw') options.raw = false;
    else
      throw Error(
        'Usage: node scripts/data/build.mjs [--source-dir DIR] [--authored-dir DIR] [--out DIR] [--no-raw]',
      );
  }
  const result = await build(options);
  console.log(
    JSON.stringify({
      packs: result.packs.length,
      units: result.packs.reduce((n, p) => n + p.unitCount, 0),
      rawSamples: result.rawObservations.reduce((n, p) => n + p.sampleCount, 0),
      quarantined: result.quarantine.length,
    }),
  );
}
