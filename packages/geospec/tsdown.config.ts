import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const packageConfig: UserConfig = {
  entry: [
    'src/index.ts',
    'src/config/index.ts',
    'src/config/node/index.ts',
    'src/assertion-client/index.ts',
    'src/vitest/index.ts',
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
  external: [
    '@taucad/project-core',
    '@taucad/runtime',
    '@taucad/runtime/types',
    '@taucad/esbuild/vm',
    '@gltf-transform/core',
    'vitest',
  ],
};

export default defineConfig(packageConfig);
