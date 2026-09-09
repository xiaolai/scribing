#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const json = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const lock = await json('fonts/assets.lock.json');
const catalog = await json('fonts/catalog.json');
const derived = await json('fonts/catalog.lock.json');
for (const entry of derived.files)
  assert.equal(
    createHash('sha256')
      .update(await readFile(resolve(root, entry.file)))
      .digest('hex'),
    entry.sha256,
    `Derived catalog drift: ${entry.file}`,
  );
const vendor = await json('extras/fonts/vendor/manifest.json');
// The vendored HarfBuzz runtime is a copy, not a resolved dependency, so bumping
// harfbuzzjs in package.json does not touch extras/fonts/vendor. Without this check
// the stale bytes and the stale manifest stay mutually consistent and the drift is
// invisible: every hash below would still match.
{
  const installed = JSON.parse(
    await readFile(resolve(root, 'node_modules/harfbuzzjs/package.json'), 'utf8'),
  ).version;
  assert.equal(
    vendor.version,
    installed,
    `Vendored HarfBuzz is ${vendor.version} but harfbuzzjs resolves to ${installed}. ` +
      're-vendor extras/fonts/vendor and update its manifest, or pin the dependency back.',
  );
}
for (const entry of vendor.files)
  assert.equal(
    createHash('sha256')
      .update(await readFile(resolve(root, 'extras/fonts/vendor', entry.file)))
      .digest('hex'),
    entry.sha256,
    `Vendor drift: ${entry.file}`,
  );
assert.equal(catalog.schemaVersion, 1);
const fontById = new Map(catalog.fonts.map((f) => [f.id, f]));
const scriptsById = new Map(catalog.scripts.map((s) => [s.id, s]));
assert.equal(fontById.size, catalog.fonts.length);
assert.equal(scriptsById.size, catalog.scripts.length);
const contains = (ranges, cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
for (const entry of [...lock.fonts, ...lock.notices, ...lock.unicode]) {
  const path = resolve(root, entry.file);
  assert(path.startsWith(resolve(root, 'fonts') + '/'));
  const bytes = await readFile(path);
  assert.equal(bytes.length, entry.sizeBytes, entry.file);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    entry.sha256,
    entry.file,
  );
}
for (const entry of lock.fonts) {
  assert.match(entry.source.revision, /^[a-f0-9]{40}$/);
  assert(entry.source.url.includes('/' + entry.source.revision + '/'));
  const font = fontById.get(entry.id);
  for (const key of Object.keys(entry))
    if (!['family', 'name', 'style'].includes(key))
      assert.deepEqual(font[key], entry[key], `${entry.id}.${key}`);
  assert.equal(font.license, 'OFL-1.1');
  assert(lock.notices.some((n) => n.file === font.notice));
}
for (const script of catalog.scripts) {
  assert(script.fontIds.length > 0, script.id);
  assert(script.inventory.length > 0 && script.inventory.length <= 160, script.id);
  assert(['ltr', 'rtl', 'ttb'].includes(script.direction));
  for (const fontId of script.fontIds) {
    const font = fontById.get(fontId);
    assert(font, fontId);
    for (const text of [...script.inventory, ...script.examples.map((e) => e.text)]) {
      for (const char of text)
        assert(
          contains(font.coverageRanges, char.codePointAt(0)),
          `${script.id}: ${fontId} lacks ${char}`,
        );
    }
  }
}
const manifests = (await readdir(resolve(root, 'packs/generated')))
  .filter((p) => p.endsWith('.manifest.json'))
  .sort();
assert.deepEqual(
  catalog.sourceCoverage.map((c) => c.packId).sort(),
  manifests.map((p) => p.replace('.manifest.json', '')).sort(),
);
for (const coverage of catalog.sourceCoverage) {
  assert(
    ['verified-text', 'replacement-inventory', 'unmapped'].includes(coverage.status),
  );
  if (coverage.status !== 'verified-text') {
    assert(!coverage.unitMappings);
    continue;
  }
  const pack = await json(`packs/generated/${coverage.packId}.json`);
  assert.deepEqual(
    coverage.unitMappings,
    Object.entries(pack.units).map(([unitId, u]) => ({ unitId, text: u.text })),
  );
  const fonts = scriptsById.get(coverage.scriptId).fontIds.map((id) => fontById.get(id));
  const unsupported = [
    ...new Set(
      coverage.unitMappings
        .map((m) => m.text)
        .filter((text) =>
          [...text].some((c) =>
            fonts.some((f) => !contains(f.coverageRanges, c.codePointAt(0))),
          ),
        ),
    ),
  ].sort();
  assert.deepEqual(coverage.unsupportedTexts, unsupported, coverage.packId);
}
assert.equal(
  catalog.totals.fontBytes,
  catalog.fonts.reduce((total, f) => total + f.sizeBytes, 0),
);
console.log(
  `Offline font assets verified: ${catalog.fonts.length} fonts; ${catalog.scripts.length} script entries; ${manifests.length} source packs; ${catalog.totals.fontBytes} bytes.`,
);
// Motor inventories are opt-in data; verify every source mapping and derived median offline.
const motor = await json('fonts/motor/index.json');
for (const entry of [...motor.groups, ...motor.notices]) {
  const bytes = await readFile(resolve(root, entry.file));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    entry.sha256,
    entry.file,
  );
  if (entry.sizeBytes) assert.equal(bytes.length, entry.sizeBytes);
}
for (const group of motor.groups) {
  const units = (await json(group.file)).units;
  assert.equal(Object.keys(units).length, group.unitCount);
  assert.equal(
    group.unitCount,
    { english: 52, korean: 40, japanese: 6636, chinese: 9574 }[group.id],
  );
  if (group.sources) {
    const expected = {};
    for (const source of group.sources) {
      const bytes = await readFile(resolve(root, source.file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
      const pack = JSON.parse(bytes);
      assert.deepEqual(source.source, pack.source);
      assert.equal(source.license, pack.license);
      for (const [unitId, unit] of Object.entries(pack.units))
        if (unit.text && !expected[unit.text])
          expected[unit.text] = { packId: source.packId, unitId, unit };
    }
    assert.deepEqual(units, expected, group.id);
  } else {
    assert.equal(
      (await json('node_modules/hanzi-writer-data/package.json')).version,
      '2.0.1',
    );
    for (const [text, medians] of Object.entries(units))
      assert.deepEqual(
        medians,
        (await json(`node_modules/hanzi-writer-data/${text}.json`)).medians,
        text,
      );
    assert.equal(group.unitCount, 9574);
  }
}
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const expectedGeometry =
  require('@babel/core').transformFileSync(resolve(root, 'src/fonts/pathGeometry.ts'), {
    configFile: false,
    babelrc: false,
    presets: [require.resolve('@babel/preset-typescript')],
  }).code + '\n';
assert.equal(
  await readFile(resolve(root, 'extras/fonts/path-geometry.mjs'), 'utf8'),
  expectedGeometry,
  'Optional geometry module drift; run node scripts/fonts/build-geometry.cjs',
);
console.log(
  `Optional motor inventories verified: ${motor.groups.map((g) => `${g.id} ${g.unitCount}`).join(', ')}; ${motor.groups.reduce((n, g) => n + g.sizeBytes, 0)} bytes.`,
);

const { execFileSync } = await import('node:child_process');
execFileSync(
  process.execPath,
  [resolve(root, 'scripts/fonts/stamp-demo.cjs'), '--check'],
  { stdio: 'pipe' },
);
