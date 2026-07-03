import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const baseConfig: Options = {
  entry: ['src/index.ts', 'src/openscad.kernel.ts'],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  copy: (options) => [
    {
      from: 'src/fonts',
      to: `${options.outDir}/fonts`,
    },
    {
      from: 'src/wasm',
      to: `${options.outDir}/wasm`,
    },
  ],
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: Options = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
