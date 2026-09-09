import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import license from 'rollup-plugin-license';
import dts from 'rollup-plugin-dts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const banner = `Scribing v${pkg.version} | https://github.com/xiaolai/scribing\n\n${readFileSync(
  'LICENSE',
  'utf8',
)}`;

const extensions = ['.js', '.ts'];

/**
 * Report raw and gzipped output size. Replaces rollup-plugin-filesize, which pulled a
 * full npm registry client (pacote, node-gyp, tar) in to print the same two numbers.
 */
const reportSize = () => ({
  name: 'report-size',
  generateBundle(options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type !== 'chunk') continue;
      const bytes = Buffer.from(file.code, 'utf8');
      const kib = (n) => `${(n / 1024).toFixed(2)} KiB`;
      this.info(
        `${options.file ?? file.fileName}: ${kib(bytes.length)} raw, ${kib(
          gzipSync(bytes, { level: 9 }).length,
        )} gzipped`,
      );
    }
  },
});

export default [
  {
    input: 'src/Scribing.ts',
    output: [
      { file: pkg.main, format: 'cjs', sourcemap: true, exports: 'auto' },
      { file: pkg.module, format: 'es', sourcemap: true, exports: 'default' },
      { file: 'dist/scribing.js', format: 'iife', name: 'Scribing', exports: 'default' },
      {
        file: 'dist/scribing.min.js',
        format: 'iife',
        name: 'Scribing',
        sourcemap: true,
        exports: 'default',
        plugins: [
          terser({
            maxWorkers: 1,
            // Terser drops every comment unless told otherwise, which would strip the
            // upstream MIT notice that rollup-plugin-license prepends. The tarball
            // check asserts that notice is present in the minified bundle.
            format: { comments: /Copyright|Permission is hereby granted/ },
          }),
        ],
      },
    ],
    plugins: [
      resolve({ extensions }),
      babel({
        extensions,
        exclude: 'node_modules/**',
        babelHelpers: 'bundled',
      }),
      license({ banner }),
      reportSize(),
    ],
  },
  {
    input: 'src/Scribing.ts',
    output: { file: pkg.types, format: 'es' },
    plugins: [dts({ tsconfig: 'tsconfig.build.json' })],
  },
];
