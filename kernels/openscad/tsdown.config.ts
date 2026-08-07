import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/openscad.kernel.ts'],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  copy: (options) => [
    {
      from: 'src/fonts',
      to: options.outDir,
    },
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
