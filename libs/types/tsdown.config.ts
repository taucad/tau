import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const externalDependencies = [/^(?:type-fest|zod)(\/|$)/];

const baseConfig: UserConfig = {
  entry: ['src/types/index.ts', 'src/constants/index.ts'],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  deps: {
    neverBundle: externalDependencies,
    dts: { neverBundle: externalDependencies },
  },
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
