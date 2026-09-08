import { terser } from 'rollup-plugin-terser';
import ts from '@wessberg/rollup-plugin-ts';
import resolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import pkg from './package.json';
import license from 'rollup-plugin-license';
import filesize from 'rollup-plugin-filesize';
import { readFileSync } from 'fs';

const extensions = ['.js', '.ts'];

export default [
  {
    input: 'src/Scribing.ts',
    output: [
      {
        file: pkg.main,
        format: 'cjs',
        sourcemap: true,
        exports: 'auto',
      },
      {
        file: 'dist/scribing.min.js',
        format: 'iife',
        name: 'Scribing',
        sourcemap: true,
        plugins: [terser({ numWorkers: 1 })],
        exports: 'default',
      },
      {
        file: 'dist/scribing.js',
        format: 'iife',
        name: 'Scribing',
        exports: 'default',
      },
      {
        file: pkg.module,
        format: 'es',
        sourcemap: true,
        exports: 'default',
      },
    ],
    plugins: [
      filesize(),
      ts({
        transpiler: 'babel',
        tsconfig: 'tsconfig.build.json',
      }),
      resolve({ extensions }),
      babel({
        exclude: 'node_modules/**',
        extensions,
        babelHelpers: 'bundled',
      }),
      license({
        banner: `Scribing v<%= pkg.version %> | https://github.com/xiaolai/scribing\n\n${readFileSync('LICENSE', 'utf8')}`,
      }),
    ],
  },
];
