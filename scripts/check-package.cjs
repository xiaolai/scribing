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
    const packed = JSON.parse(
      execFileSync('npm', ['pack', root, '--json', '--ignore-scripts'], {
        cwd: temp,
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_config_cache: path.join(temp, 'cache'),
          NO_UPDATE_NOTIFIER: '1',
        },
      }),
    )[0];
    const consumerModules = path.join(temp, 'node_modules');
    fs.mkdirSync(consumerModules);
    execFileSync('tar', [
      '-xzf',
      path.join(temp, packed.filename),
      '-C',
      consumerModules,
    ]);
    const packageRoot = path.join(consumerModules, 'scribing');
    fs.renameSync(path.join(consumerModules, 'package'), packageRoot);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    );
    const files = new Set(packed.files.map((file) => file.path));
    for (const name of [
      pkg.main,
      pkg.module,
      pkg.types,
      'dist/scribing.js',
      'dist/scribing.min.js',
      'LICENSE',
      'COPYING.md',
      'CITATION.cff',
    ]) {
      assert(files.has(name), `Missing packaged file: ${name}`);
    }
    assert(
      !packed.files.some((file) =>
        /(^src\/|\.test\.|^node_modules\/|^packs\/|^scripts\/)/.test(file.path),
      ),
      'Development files leaked into package',
    );
    for (const name of [
      pkg.main,
      pkg.module,
      'dist/scribing.js',
      'dist/scribing.min.js',
    ]) {
      const code = fs.readFileSync(path.join(packageRoot, name), 'utf8');
      assert(
        code.includes('Copyright (c) 2014 David Chanin'),
        `${name} lost upstream attribution`,
      );
      assert(
        code.includes('Permission is hereby granted, free of charge'),
        `${name} lost the MIT permission notice`,
      );
    }
    const unit = {
      schemaVersion: 2,
      id: 'i',
      text: 'i',
      coordinates: { em: 1000, yAxis: 'up', bounds: [0, 0, 1000, 1000] },
      motorStrokes: [{ id: 'dot', kind: 'dot', center: [500, 700], radius: 25 }],
      plans: [{ id: 'default', steps: [{ strokeId: 'dot' }] }],
      defaultPlanId: 'default',
    };
    const pack = {
      schemaVersion: 1,
      id: 'offline',
      name: 'Offline',
      version: '1',
      license: 'MIT',
      status: 'technical-preview',
      provenance: 'authored',
      source: { name: 'Fixture', url: 'https://example.test/fixture' },
      units: { i: unit },
    };
    const commonjs = require(packageRoot);
    assert.strictEqual(
      typeof commonjs.create,
      'function',
      'CommonJS default constructor is unavailable',
    );
    assert.strictEqual(typeof commonjs.createFontWriter, 'function');
    for (const name of [pkg.main, pkg.module, 'dist/scribing.js'])
      assert(
        !fs.readFileSync(path.join(packageRoot, name), 'utf8').includes('createHarfBuzz'),
        'HarfBuzz leaked into core',
      );
    for (const name of [
      'extras/fonts/animation.mjs',
      'extras/fonts/progress.mjs',
      'extras/fonts/skeleton.mjs',
      'extras/fonts/yield-work.mjs',
      'extras/fonts/path-geometry.mjs',
      'extras/fonts/provider.mjs',
      'extras/fonts/vendor/index.mjs',
      'extras/fonts/vendor/harfbuzz.js',
      'extras/fonts/vendor/harfbuzz.wasm',
      'extras/fonts/vendor/HARFBUZZJS-LICENSE.txt',
      'extras/fonts/vendor/HARFBUZZ-COPYING.txt',
      'extras/fonts/vendor/package.json',
    ])
      assert(files.has(name), `Missing optional provider file ${name}`);
    assert(
      !packed.files.some((file) => file.path.startsWith('fonts/assets/')),
      'Full font binaries leaked into core package',
    );
    const animationModule = await import(
      pathToFileURL(path.join(packageRoot, 'extras/fonts/animation.mjs')).href
    );
    assert.equal(typeof animationModule.prepareFontAnimation, 'function');
    assert.equal(typeof animationModule.createMotorSourceLoader, 'function');
    const bundleEntry = path.join(temp, 'animation-consumer.mjs');
    fs.writeFileSync(
      bundleEntry,
      "export {createMotorSourceLoader,prepareFontAnimation,MotorSourceError} from 'scribing/extras/fonts/animation.mjs';\n",
    );
    const bundle = await require('rollup').rollup({
      input: bundleEntry,
      plugins: [require('@rollup/plugin-node-resolve').nodeResolve()],
    });
    const bundleOutput = path.join(temp, 'animation-bundle.mjs');
    await bundle.write({ file: bundleOutput, format: 'esm' });
    await bundle.close();
    const bundled = await import(pathToFileURL(bundleOutput).href);
    assert.equal(typeof bundled.prepareFontAnimation, 'function');
    assert.equal(typeof bundled.MotorSourceError, 'function');
    const { createFontProvider } = await import(
      pathToFileURL(path.join(packageRoot, 'extras/fonts/provider.mjs')).href
    );
    const fontCatalog = JSON.parse(
      fs.readFileSync(path.join(root, 'fonts/catalog.json'), 'utf8'),
    );
    const scriptRanges = JSON.parse(
      fs.readFileSync(path.join(root, 'fonts/script-ranges.json'), 'utf8'),
    );
    const fp = createFontProvider({
      catalog: fontCatalog,
      scriptRanges,
      baseUrl: pathToFileURL(root + path.sep),
      fetch: async (url) => {
        const bytes = fs.readFileSync(require('url').fileURLToPath(url));
        return {
          ok: true,
          headers: new Headers(),
          arrayBuffer: async () =>
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
        };
      },
    });
    const shaped = await fp.shape({
      text: 'ag',
      scriptId: 'english',
      fontId: 'NotoSans',
    });
    assert(shaped.glyphs.every((g) => g.id && g.path));
    fp.destroy();
    assert.deepStrictEqual(
      await commonjs
        .createDataProvider(pack)
        .load({ id: 'i' }, { signal: new AbortController().signal }),
      unit,
    );
    // The module field is intended for bundlers. Copy to .mjs to exercise its ESM syntax in Node.
    const esmPath = path.join(temp, 'scribing.mjs');
    fs.copyFileSync(path.join(packageRoot, pkg.module), esmPath);
    const esm = await import(pathToFileURL(esmPath).href);
    assert.strictEqual(
      typeof esm.default.create,
      'function',
      'ESM default constructor is unavailable',
    );
    assert.deepStrictEqual(
      await esm.default
        .createDataProvider(pack)
        .load({ id: 'i' }, { signal: new AbortController().signal }),
      unit,
    );
    for (const name of ['dist/scribing.js', 'dist/scribing.min.js']) {
      const context = { setTimeout, clearTimeout };
      context.window = context;
      vm.runInNewContext(fs.readFileSync(path.join(packageRoot, name), 'utf8'), context);
      assert.strictEqual(
        typeof context.Scribing.create,
        'function',
        `${name} does not expose Scribing`,
      );
      assert(context.Scribing.getScalingTransform(100, 100).scale > 0);
      assert.strictEqual(typeof context.Scribing.createDataProvider, 'function');
      assert.strictEqual(typeof context.Scribing.prototype.setUnit, 'function');
      assert.strictEqual(typeof context.Scribing.prototype.quizUnit, 'function');
    }
    fs.writeFileSync(
      path.join(temp, 'consumer.ts'),
      `
import Scribing, { ScribingOptions, CharacterJson, WritingUnit, WritingDataPack, UnitStrokeFeedback, FontShape, FontWriter, FontComparison, FontAnimation } from 'scribing';
const options: Partial<ScribingOptions> = { renderer: 'svg', showCharacter: false };
const writer: Scribing = Scribing.create('target', '我', options);
const data: Promise<CharacterJson | void> = Scribing.loadCharacterData('我');
const unit: WritingUnit = ${JSON.stringify(unit)};
const pack: WritingDataPack = ${JSON.stringify(pack)};
const pending: Promise<void> = writer.setUnit({ id: 'i', provider: Scribing.createDataProvider(pack) });
const selected: Promise<WritingUnit> = writer.getUnitData();
writer.quizUnit({ guided: true, onMistake: (event: UnitStrokeFeedback) => console.log(event.reason) });
const fontWriter: FontWriter = Scribing.createFontWriter('font', {width:300,height:300,renderer:'svg'});
declare const shape: FontShape;
const fontPending: Promise<void> = fontWriter.setShape(shape);
const comparison: FontComparison = fontWriter.check();
const canonical: FontShape = fontWriter.getShape();
declare const animation: FontAnimation;
const animationPending: Promise<void> = fontWriter.setAnimation(animation);
const playback: Promise<void> = fontWriter.animate({speed:2,loop:false});
void canonical; void animationPending; void playback;
void fontPending; void comparison;
void writer; void data; void unit; void pending; void selected;
`,
    );
    execFileSync(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--target',
        'es2015',
        '--moduleResolution',
        'node',
        '--types',
        'scribing',
        path.join(temp, 'consumer.ts'),
      ],
      { cwd: temp, stdio: 'pipe' },
    );
    console.log(
      `Package smoke passed: ${packed.filename}; CJS/ESM offline providers, browser globals, licenses, data exclusion, and old/new TypeScript consumers.`,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.stdout ? error.stdout.toString() : error);
  process.exitCode = 1;
});
