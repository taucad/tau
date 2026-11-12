import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

/* Built only so the bundle owner (`native-process-core`) can mirror these declarations into its `dist/libs/sandbox`. */
const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/shell.ts', 'src/shell/srt-supervisor.ts'],
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
