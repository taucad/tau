import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

/* Built only so the bundle owner (`host`) can mirror these declarations into its `dist/libs/shell-service`. */
const baseConfig: UserConfig = {
  entry: ['src/index.ts'],
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

export default defineConfig(packageConfig);
