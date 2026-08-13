import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const packageConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/brep/index.ts',
    'src/engine/index.ts',
    'src/inspection/index.ts',
    'src/mesh/index.ts',
    'src/model/index.ts',
    'src/proofs/index.ts',
    'src/runner/index.ts',
    'src/runner/node/index.ts',
    'src/runner/web/index.ts',
    'src/runner/worker/index.ts',
    'src/selector/index.ts',
    'src/step/index.ts',
  ],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  format: 'esm',
  outDir: 'dist',
  // Type-only peers: they are devDependencies (the substrate compiles against
  // their types and never calls them), so rolldown would otherwise try to
  // bundle their declarations instead of importing them.
  external: ['@taucad/runtime', '@taucad/runtime/types', '@gltf-transform/core'],
};

export default defineConfig(packageConfig);
