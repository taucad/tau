import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

const packageConfig: UserConfig = {
  // The bin and the pool worker's thread entry are entries too: a worker loads a URL, so its module must exist as a
  // real file beside the runner that spawns it.
  entry: [
    'src/index.ts',
    'src/cli/index.ts',
    'src/cli/main.ts',
    'src/config/index.ts',
    'src/config/node/index.ts',
    'src/assertion-client/index.ts',
    'src/vitest/index.ts',
    'src/engine/index.ts',
    'src/mesh/index.ts',
    'src/model/index.ts',
    'src/model/node/index.ts',
    'src/runner/index.ts',
    'src/runner/native/index.ts',
    'src/runner/node/index.ts',
    'src/runner/node/pool-worker-entry.ts',
    'src/runner/worker/index.ts',
  ],
  sourcemap: false,
  clean: ['dist'],
  dts: true,
  minify: true,
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
  format: 'esm',
  outDir: 'dist',
  external: ['@taucad/runtime', '@taucad/runtime/types', '@taucad/esbuild/vm', '@gltf-transform/core', 'vitest'],
};

export default defineConfig(packageConfig);
