import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/openrscad.kernel.ts'],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  // The engine is a published dependency, so it stays external and npm installs
  // it alongside this package. It used to be copied into `dist/vendor` because a
  // `file:` tarball cannot be declared as a dependency; that added 12 MB to every
  // publish of this package and a second copy of the wasm to every install.
  deps: { neverBundle: ['@taulabs/openrscad-engine'] },
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
