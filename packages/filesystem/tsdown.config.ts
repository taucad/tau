import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const baseConfig: Options = {
  entry: ['src/index.ts', 'src/backend/index.ts', 'src/bundled-types-mount.ts', 'src/providers/index.ts'],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: Options = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
