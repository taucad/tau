import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/generator.ts', 'src/template.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

/** The published `tau-python-kernel` command: the generator scripts, bundled into one file beside the library. */
const binConfig: UserConfig = {
  entry: { 'tau-python-kernel': 'scripts/tau-python-kernel.mts' },
  sourcemap: false,
  clean: false,
  dts: false,
  minify: true,
  platform: 'node',
  tsconfig: 'tsconfig.spec.json',
  format: 'esm',
  outDir: 'dist/bin',
};

export default defineConfig([packageConfig, binConfig]);
