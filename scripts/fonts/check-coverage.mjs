#!/usr/bin/env node
/**
 * Per-file coverage floors for the optional font runtime that ships in the package.
 *
 * Node's own `--test-coverage-lines` compares an aggregate total, so a file can rot to
 * nothing while the overall number holds steady. This asserts a floor per file, and
 * asserts the file inventory too: if a shipped module stops being imported by any test
 * it disappears from the report entirely, which would otherwise read as success.
 *
 * Floors ratchet. Raise them when coverage rises; never lower one to make a build green.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Every shipped module, with the floor it must hold.
 *
 * path-geometry.mjs is absent deliberately: it is Babel's output for
 * src/fonts/pathGeometry.ts, which jest covers at 97%, and check-assets.mjs asserts the
 * two are byte-identical. Measuring it here would report the same code twice.
 */
const FLOORS = {
  'extras/fonts/animation.mjs': 36,
  'extras/fonts/capped-read.mjs': 100,
  'extras/fonts/progress.mjs': 85,
  'extras/fonts/provider.mjs': 97,
  'extras/fonts/skeleton.mjs': 62,
  'extras/fonts/yield-work.mjs': 84,
};

/**
 * The suites to measure, read from the `test-fonts` script rather than listed again.
 *
 * Two lists meant adding a suite in one place and not the other, and a suite missing
 * here still counted toward nothing while appearing to run.
 */
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const TESTS = pkg.scripts['test-fonts'].match(/\S+\.test\.mjs/g) ?? [];
assert(TESTS.length > 0, 'the test-fonts script lists no suites');

/**
 * Every shipped module must appear in FLOORS.
 *
 * FLOORS was the only inventory, so a module added to extras/fonts and imported by no
 * test was absent from both and passed without ever being measured. The directory read
 * is not recursive, which is what leaves vendor/ out.
 */
const shipped = readdirSync(join(root, 'extras/fonts'))
  .filter((f) => f.endsWith('.mjs') && f !== 'path-geometry.mjs')
  .map((f) => `extras/fonts/${f}`)
  .sort();
assert.deepEqual(
  shipped,
  Object.keys(FLOORS).sort(),
  'FLOORS must list exactly the shipped modules',
);

const scratch = mkdtempSync(join(tmpdir(), 'scribing-coverage-'));
const lcovPath = join(scratch, 'coverage.lcov');
try {
  try {
    execFileSync(
      process.execPath,
      [
        '--test',
        '--experimental-test-coverage',
        '--test-reporter=lcov',
        `--test-reporter-destination=${lcovPath}`,
        ...TESTS,
      ],
      { cwd: root, stdio: 'pipe' },
    );
  } catch (cause) {
    // The lcov reporter carries no assertion events, so a failing suite arrived here as
    // a bare non-zero exit with the reason captured in the pipe and thrown away.
    process.stderr.write(String(cause.stdout ?? ''));
    process.stderr.write(String(cause.stderr ?? ''));
    throw cause;
  }

  /**
   * Parse the line counters out of lcov: LF is lines found, LH is lines hit.
   *
   * Node's reporter emits LH *before* LF, the reverse of the conventional order, so
   * both are buffered and the ratio is taken at end_of_record rather than on sight of
   * one of them. Reading them in the documented order silently divides by the previous
   * record's denominator and reports plausible-looking nonsense.
   */
  const measured = new Map();
  let file = null;
  let hit = null;
  let found = null;
  for (const line of readFileSync(lcovPath, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      // Node reports platform-native relative paths, so Windows emits backslashes and
      // every forward-slash key below would miss.
      file = line.slice(3).trim().split('\\').join('/');
      hit = null;
      found = null;
    } else if (line.startsWith('LF:')) found = Number(line.slice(3));
    else if (line.startsWith('LH:')) hit = Number(line.slice(3));
    else if (line.startsWith('end_of_record') && file) {
      assert(
        Number.isFinite(hit) && Number.isFinite(found),
        `lcov record for ${file} is missing LF or LH`,
      );
      measured.set(file, found ? (hit / found) * 100 : 0);
      file = null;
    }
  }

  const failures = [];
  for (const [path, floor] of Object.entries(FLOORS)) {
    const percent = measured.get(path);
    if (percent === undefined) {
      failures.push(`${path}: absent from the coverage report; no test imports it`);
      continue;
    }
    if (percent + 1e-9 < floor) {
      failures.push(`${path}: ${percent.toFixed(2)}% line coverage, floor is ${floor}%`);
    }
  }

  assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`);
  const report = Object.keys(FLOORS)
    .map(
      (path) => `${path.replace('extras/fonts/', '')} ${measured.get(path).toFixed(1)}%`,
    )
    .join(', ');
  console.log(`Optional runtime coverage floors met: ${report}.`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
