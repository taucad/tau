import { defineConfig, type Options } from 'tsdown';

const config: Options = {
  entry: ['src/index.ts'],
  clean: true,
  dts: true,
  format: 'esm',
  minify: true,
  outDir: 'dist',
  sourcemap: false,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig(config);
