import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/sync/index.ts'],
  sourcemap: false,
  clean: ['dist'],
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

export default defineConfig(packageConfig);
