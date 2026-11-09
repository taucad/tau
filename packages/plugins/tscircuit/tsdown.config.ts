import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  // Ships the KiCad pack's footprints and GLBs beside `kicad-pack.js`, which loads them by URL.
  copy: ({ outDir }) => [{ from: 'src/assets', to: outDir }],
  deps: { neverBundle: [/^#engine\//u] },
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
