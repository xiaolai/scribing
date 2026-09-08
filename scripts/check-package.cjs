// Verify the actual npm tarball without publishing or downloading dependencies.
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

async function main() {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'scribing-package-'));
  try {
    const packed = JSON.parse(execFileSync('npm', [
      'pack', root, '--json', '--ignore-scripts',
    ], { cwd: temp, encoding: 'utf8', env: { ...process.env, npm_config_cache: path.join(temp, 'cache'), NO_UPDATE_NOTIFIER: '1' } }))[0];
    const consumerModules = path.join(temp, 'node_modules');
    fs.mkdirSync(consumerModules);
    execFileSync('tar', ['-xzf', path.join(temp, packed.filename), '-C', consumerModules]);
    const packageRoot = path.join(consumerModules, 'scribing');
    fs.renameSync(path.join(consumerModules, 'package'), packageRoot);
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    const files = new Set(packed.files.map((file) => file.path));
    for (const name of [pkg.main, pkg.module, pkg.types, 'dist/scribing.js', 'dist/scribing.min.js', 'LICENSE', 'COPYING.md', 'CITATION.cff']) {
      assert(files.has(name), `Missing packaged file: ${name}`);
    }
    assert(!packed.files.some((file) => /(^src\/|\.test\.|^node_modules\/)/.test(file.path)), 'Development files leaked into package');
    for (const name of [pkg.main, pkg.module, 'dist/scribing.js', 'dist/scribing.min.js']) {
      const code = fs.readFileSync(path.join(packageRoot, name), 'utf8');
      assert(code.includes('Copyright (c) 2014 David Chanin'), `${name} lost upstream attribution`);
      assert(code.includes('Permission is hereby granted, free of charge'), `${name} lost the MIT permission notice`);
    }
    const commonjs = require(packageRoot);
    assert.strictEqual(typeof commonjs.create, 'function', 'CommonJS default constructor is unavailable');
    // The module field is intended for bundlers. Copy to .mjs to exercise its ESM syntax in Node.
    const esmPath = path.join(temp, 'scribing.mjs');
    fs.copyFileSync(path.join(packageRoot, pkg.module), esmPath);
    const esm = await import(pathToFileURL(esmPath).href);
    assert.strictEqual(typeof esm.default.create, 'function', 'ESM default constructor is unavailable');
    for (const name of ['dist/scribing.js', 'dist/scribing.min.js']) {
      const context = { setTimeout, clearTimeout };
      context.window = context;
      vm.runInNewContext(fs.readFileSync(path.join(packageRoot, name), 'utf8'), context);
      assert.strictEqual(typeof context.Scribing.create, 'function', `${name} does not expose Scribing`);
      assert(context.Scribing.getScalingTransform(100, 100).scale > 0);
    }
    fs.writeFileSync(path.join(temp, 'consumer.ts'), `
import Scribing, { ScribingOptions, CharacterJson } from 'scribing';
const options: Partial<ScribingOptions> = { renderer: 'svg', showCharacter: false };
const writer: Scribing = Scribing.create('target', '我', options);
const data: Promise<CharacterJson | void> = Scribing.loadCharacterData('我');
void writer; void data;
`);
    execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'es2015', '--moduleResolution', 'node', '--types', 'scribing', path.join(temp, 'consumer.ts')], { cwd: temp, stdio: 'pipe' });
    console.log(`Package smoke passed: ${packed.filename}; CJS, ESM, browser globals, license, and TypeScript consumer.`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.stdout ? error.stdout.toString() : error);
  process.exitCode = 1;
});
