// Version the browser graph via an import map; canonical npm imports stay query-free.
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..'),
  check = process.argv.includes('--check');
const hash = (file) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(root, file)))
    .digest('hex')
    .slice(0, 12);
// The vendored HarfBuzz entry points are here too: provider.mjs imports index.mjs, which
// imports harfbuzz.js, and neither was versioned, so a vendor update could stay cached
// behind a fresh demo. harfbuzz.wasm cannot join them — it is resolved from
// `new URL('harfbuzz.wasm', import.meta.url)` at runtime rather than imported, and a
// relative URL drops the query of the module that resolves it. Every server in this
// repository therefore sends `Cache-Control: no-store`, which is what revalidates it.
const modules = [
  'animation.mjs',
  'progress.mjs',
  'skeleton.mjs',
  'path-geometry.mjs',
  'yield-work.mjs',
  'provider.mjs',
  'vendor/index.mjs',
  'vendor/harfbuzz.js',
];
const imports = Object.fromEntries(
  modules.map((name) => {
    const key = `../../extras/fonts/${name}`;
    return [key, `${key}?v=${hash(`extras/fonts/${name}`)}`];
  }),
);
const file = path.join(root, 'demo/multilingual/index.html'),
  before = fs.readFileSync(file, 'utf8');
const map = `<script id="font-runtime-imports" type="importmap">${JSON.stringify({ imports })}</script>`;
let after = before
  .replace(
    /src="fonts\.mjs(?:\?v=[a-f0-9]+)?"/,
    `src="fonts.mjs?v=${hash('demo/multilingual/fonts.mjs')}"`,
  )
  .replace(
    /src="\.\.\/\.\.\/dist\/scribing\.js(?:\?v=[a-f0-9]+)?"/,
    `src="../../dist/scribing.js?v=${hash('dist/scribing.js')}"`,
  );
after = after.includes('id="font-runtime-imports"')
  ? after.replace(
      /<script id="font-runtime-imports" type="importmap">[\s\S]*?<\/script>/,
      map,
    )
  : after.replace(
      '<script src="../../dist/scribing.js',
      map + '<script src="../../dist/scribing.js',
    );
if (after !== before) {
  if (check)
    throw Error(
      'Stale demo import map or script version; run node scripts/fonts/stamp-demo.cjs',
    );
  fs.writeFileSync(file, after);
}
