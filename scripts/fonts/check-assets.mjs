#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motorGroupFor } from '../../extras/fonts/animation.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const json = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const lock = await json('fonts/assets.lock.json');
const catalog = await json('fonts/catalog.json');
const derived = await json('fonts/catalog.lock.json');
// The lock listed the files to verify, so deleting an entry from it removed that file
// from this check and the gate stayed green. The required set is named here instead.
assert.deepEqual(
  derived.files.map((entry) => entry.file).sort(),
  [
    'fonts/catalog.json',
    'fonts/script-ranges.json',
    'scripts/fonts/build-catalog.py',
    'scripts/fonts/requirements.txt',
    'scripts/fonts/scripts.json',
  ],
  'fonts/catalog.lock.json must cover exactly the catalog inputs and outputs',
);
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
for (const entry of vendor.files) {
  const vendored = await readFile(resolve(root, 'extras/fonts/vendor', entry.file));
  assert.equal(
    createHash('sha256').update(vendored).digest('hex'),
    entry.sha256,
    `Vendor drift: ${entry.file}`,
  );
  assert.equal(vendored.byteLength, entry.sizeBytes, `Vendor size drift: ${entry.file}`);
  // Hashing against this manifest only proves the copy matches itself, and the manifest
  // is edited by hand alongside it, so bumping the version without re-copying left both
  // consistent and stale. packagePath is recorded for this comparison; the HarfBuzz
  // COPYING file has no counterpart in the npm package and carries none.
  if (entry.packagePath) {
    const upstream = await readFile(
      resolve(root, 'node_modules/harfbuzzjs', entry.packagePath),
    );
    assert(
      vendored.equals(upstream),
      `Vendored ${entry.file} differs from harfbuzzjs/${entry.packagePath}`,
    );
  }
}
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
// Every published total, not only the byte count. The rest were copied from the catalog
// and trusted, so a stale count survived here and reached the demo, which shows the
// source-pack figure.
const statuses = {};
for (const coverage of catalog.sourceCoverage)
  statuses[coverage.status] = (statuses[coverage.status] ?? 0) + 1;
assert.deepEqual(
  catalog.totals,
  {
    fonts: catalog.fonts.length,
    scriptEntries: catalog.scripts.length,
    fontBytes: catalog.fonts.reduce((total, f) => total + f.sizeBytes, 0),
    sourcePacks: manifests.length,
    sourceCoverageStatuses: statuses,
  },
  'catalog totals disagree with the catalog',
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
  }
}

/**
 * Stroke-order availability, asserted against the motor index rather than the catalog.
 *
 * The group selection is imported from extras/fonts/animation.mjs rather than repeated,
 * so the catalog is compared against the loader's actual policy. A copy could only ever
 * agree with itself: changing the policy in the runtime alone left this file and the
 * catalog consistent and the gate green, while the loader no longer looked up the text
 * the catalog advertised stroke order for, which is exactly the overstatement this field
 * exists to prevent. Normative order exists for four groups and no others;
 * see dev-docs/research/20260911-normative-stroke-order.md.
 */
const motorUnits = new Map(motor.groups.map((g) => [g.id, g.unitCount]));
for (const script of catalog.scripts) {
  const group = motorGroupFor(script);
  assert.equal(script.strokeOrder, group ? 'normative' : 'none', `${script.id} order`);
  assert(script.strokeOrderNote?.length > 0, `${script.id} note`);
  if (group) {
    assert.equal(script.strokeOrderGroup, group, `${script.id} group`);
    assert.equal(
      script.strokeOrderUnitCount,
      motorUnits.get(group),
      `${script.id} unit count`,
    );
  } else {
    assert(!('strokeOrderGroup' in script), `${script.id} claims a group it cannot use`);
    assert(!('strokeOrderUnitCount' in script), `${script.id} claims a unit count`);
  }
}
assert.equal(
  catalog.scripts.filter((s) => s.strokeOrder === 'normative').length,
  7,
  'Normative stroke order covers seven script entries across four motor groups',
);

// The catalog and motor generators write bytes that are hashed into the lock files and
// compared here, so locale-dependent text IO would make those hashes platform-specific.
// Python's default encoding follows the locale and its default newline translates on
// Windows, and the failure is invisible on a machine that happens to be UTF-8 and LF.
for (const generator of [
  'scripts/fonts/build-catalog.py',
  'scripts/fonts/build-motors.py',
]) {
  const source = await readFile(resolve(root, generator), 'utf8');
  const unqualified = source
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(
      ([, line]) => /\b(read_text|write_text)\(/.test(line) && !/encoding\s*=/.test(line),
    );
  assert.deepEqual(
    unqualified,
    [],
    `${generator} reads or writes text without an explicit encoding: ` +
      unqualified.map(([n]) => `line ${n}`).join(', '),
  );
}

// Every static server in this repository must refuse caching. harfbuzz.wasm is resolved
// at runtime from its loader's URL, so no import-map version can reach it, and these
// gates rebuild dist/ and the demo between runs: a cached response would let them assert
// against superseded bytes and pass. Three of seven servers were missing the header.
const servers = (await readdir(resolve(root, 'scripts'), { recursive: true }))
  .filter((f) => f.endsWith('.cjs'))
  .map((f) => `scripts/${f}`);
const uncached = [];
for (const server of servers) {
  const source = await readFile(resolve(root, server), 'utf8');
  if (source.includes('createServer') && !source.includes('no-store'))
    uncached.push(server);
}
assert.deepEqual(
  uncached,
  [],
  `static servers without Cache-Control: no-store: ${uncached}`,
);

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
for (const [source, target] of require('./build-geometry.cjs').DERIVED) {
  const expected =
    require('@babel/core').transformFileSync(resolve(root, source), {
      configFile: false,
      babelrc: false,
      presets: [require.resolve('@babel/preset-typescript')],
    }).code + '\n';
  assert.equal(
    await readFile(resolve(root, target), 'utf8'),
    expected,
    `Derived optional module drift in ${target}; run node scripts/fonts/build-geometry.cjs`,
  );
}
console.log(
  `Optional motor inventories verified: ${motor.groups.map((g) => `${g.id} ${g.unitCount}`).join(', ')}; ${motor.groups.reduce((n, g) => n + g.sizeBytes, 0)} bytes.`,
);

const { execFileSync } = await import('node:child_process');
execFileSync(
  process.execPath,
  [resolve(root, 'scripts/fonts/stamp-demo.cjs'), '--check'],
  { stdio: 'pipe' },
);
