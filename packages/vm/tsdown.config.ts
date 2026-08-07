import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/internal.ts', 'src/constants.ts'],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  copy: (options) => [
    {
      from: 'src/wasm',
      to: options.outDir,
    },
  ],
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
