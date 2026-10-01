import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const externalDependencies = [/^(?:@taucad\/(?:cache-core|filesystem|runtime|units)|basic-ftp|mqtt|zod)(?:\/|$)/u];

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/bambu.plate.ts', 'src/bambu.settings.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  deps: {
    neverBundle: externalDependencies,
    dts: { neverBundle: externalDependencies },
  },
  minify: true,
  copy: ({ outDir }) => [{ from: 'src/assets', to: outDir }],
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
