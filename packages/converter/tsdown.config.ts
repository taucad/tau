import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const baseConfig: Options = {
  entry: ['src/index.ts', 'src/constants/index.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
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
