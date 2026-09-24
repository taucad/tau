import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const externalDependencies = [/^(?:@taucad\/(?:runtime|units)|@gltf-transform\/core|fflate|manifold-3d|zod)(?:\/|$)/u];

const baseConfig: UserConfig = {
  entry: ['src/index.ts', 'src/toolpath.ts', 'src/container.ts'],
  sourcemap: false,
  clean: true,
  dts: true,
  deps: {
    neverBundle: externalDependencies,
    dts: { neverBundle: externalDependencies },
  },
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const packageConfig: UserConfig = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist',
};

export default defineConfig(packageConfig);
