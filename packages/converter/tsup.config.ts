import { defineConfig } from 'tsup';
import type { Options } from 'tsup';

const baseConfig: Options = {
  entry: ['src/index.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  publicDir: 'src/assets',
  tsconfig: 'tsconfig.build.json',
};

export const cjsConfig: Options = {
  ...baseConfig,
  format: 'cjs',
  outDir: 'dist/cjs',
};

export const esmConfig: Options = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist/esm',
};

export default defineConfig([cjsConfig, esmConfig]);
