import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  // Both engines stay external: the wasm one because this package's public
  // types name it (through `@taucad/openrscad`'s backend type), the native one
  // because it carries the addon and npm installs it alongside.
  deps: { neverBundle: ['@taulabs/openrscad-engine', '@taulabs/openrscad-engine-native'] },
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
