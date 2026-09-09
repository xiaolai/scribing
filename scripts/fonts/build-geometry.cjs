// Maintenance-only derived copy; core never imports the optional animation module.
const path = require('node:path'),
  fs = require('node:fs'),
  babel = require('@babel/core');
const root = path.resolve(__dirname, '../..');
fs.writeFileSync(
  path.join(root, 'extras/fonts/path-geometry.mjs'),
  babel.transformFileSync(path.join(root, 'src/fonts/pathGeometry.ts'), {
    configFile: false,
    babelrc: false,
    presets: [require.resolve('@babel/preset-typescript')],
  }).code + '\n',
);
