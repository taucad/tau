import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const externalDependencies = [
  /^(?:@taucad\/(?:runtime|units)|@gltf-transform\/core|fflate|manifold-3d|zod)(?:\/|$)/u,
  // Resolved by the consumer's `node`/`default` condition at run time, so browsers never load the Node engine.
  /^#bambu-studio\/engine\.js$/u,
];

const baseConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/toolpath.ts',
    'src/container.ts',
    'src/print-intent.ts',
    'src/bambu-studio/engine.ts',
    'src/bambu-studio/engine.stub.ts',
  ],
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
