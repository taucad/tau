import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  // `launch.ts` is what both hosts run (`node dist/launch.mjs`); `index.ts` is the tested resolver.
  entry: ['src/index.ts', 'src/launch.ts'],
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
