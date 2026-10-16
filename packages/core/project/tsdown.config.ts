import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/revision-id.ts',
    'src/share-artifact.ts',
    'src/share-direct.ts',
    'src/share-error.ts',
    'src/share-locator.ts',
    'src/share-snapshot.ts',
  ],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  external: ['zod', 'jose', 'jszip'],
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
