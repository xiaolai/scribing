// Maintenance-only derived copies; core never imports the optional animation module.
// Each is byte-compared against its TypeScript source by scripts/fonts/check-assets.mjs,
// which is what stops the two runtimes drifting apart. yield-work.mjs used to be a hand
// copy with no such gate.
const path = require('node:path'),
  fs = require('node:fs'),
  babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');
const DERIVED = [
  ['src/fonts/pathGeometry.ts', 'extras/fonts/path-geometry.mjs'],
  ['src/fonts/yieldWork.ts', 'extras/fonts/yield-work.mjs'],
];
// Only when run directly. check-assets.mjs requires this file for DERIVED, and writing
// on import would have had the gate regenerate the very files it then compares, so it
// could never have failed.
if (require.main === module)
  for (const [source, target] of DERIVED) {
    fs.writeFileSync(
      path.join(root, target),
      babel.transformFileSync(path.join(root, source), {
        configFile: false,
        babelrc: false,
        presets: [require.resolve('@babel/preset-typescript')],
      }).code + '\n',
    );
  }
module.exports = { DERIVED };
