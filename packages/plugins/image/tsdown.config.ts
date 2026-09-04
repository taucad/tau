import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/nanoraster-camera.ts', 'src/label.ts', 'src/svg.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  copy: ({ outDir }) => [{ from: 'src/fonts', to: outDir }],
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
