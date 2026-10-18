import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/native.ts'],
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
  // The package's own tau-plugin.json stays a runtime import of the published file, not a bundled copy.
  deps: { neverBundle: [/^@taucad\/picogk\/tau-plugin\.json$/u] },
};

export default defineConfig(packageConfig);
