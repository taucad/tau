import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const baseConfig: Options = {
  entry: [
    'src/index.ts',
    'src/types/index.ts',
    'src/plugins/kernel-plugin-entry.ts',
    'src/plugins/kernels-entry.ts',
    'src/plugins/middleware-entry.ts',
    'src/plugins/bundler-entry.ts',
    'src/plugins/transcoder-factories.ts',
    'src/runner/index.ts',
    'src/transport/index.ts',
    'src/transport/in-process.ts',
    'src/transport/web.ts',
    'src/transport/node.ts',
    'src/host/index.ts',
    'src/node.ts',
    'src/filesystem/index.ts',
    'src/filesystem/from-node-fs.ts',
    'src/filesystem/from-browser-fs.ts',
    'src/testing/index.ts',
    'src/framework/kernel-runtime-worker.ts',
    'src/worker/web.ts',
    'src/worker/node.ts',
    'src/worker-internals.ts',
    'src/transport-internals.ts',
    'src/kernels/replicad/replicad.kernel.ts',
    'src/kernels/jscad/jscad.kernel.ts',
    'src/kernels/manifold/manifold.kernel.ts',
    'src/kernels/opencascade/opencascade.kernel.ts',
    'src/kernels/zoo/zoo.kernel.ts',
    'src/kernels/zoo/engine-connection.ts',
    'src/kernels/tau/tau.kernel.ts',
    'src/bundler/esbuild.bundler.ts',
    'src/middleware/runtime-middleware.ts',
    'src/middleware/parameter-cache.middleware.ts',
    'src/middleware/geometry-cache.middleware.ts',
    'src/middleware/gltf-coordinate-transform.middleware.ts',
    'src/middleware/gltf-edge-detection.middleware.ts',
    'src/cross-origin-isolation/index.ts',
    'src/cross-origin-isolation/express.ts',
    'src/react-router/index.ts',
    'src/vite/index.ts',
    'src/rolldown/index.ts',
    'src/utils/package-info.ts',
  ],
  sourcemap: false,
  clean: true,
  dts: true,
  minify: true,
  copy: (options) => [
    {
      from: 'src/kernels/replicad/fonts',
      to: `${options.outDir}/kernels/replicad/fonts`,
    },
    {
      from: 'src/kernels/replicad/wasm',
      to: `${options.outDir}/kernels/replicad/wasm`,
    },
    {
      from: 'src/kernels/zoo/wasm',
      to: `${options.outDir}/kernels/zoo/wasm`,
    },
    {
      from: 'src/kernels/manifold/wasm',
      to: `${options.outDir}/kernels/manifold/wasm`,
    },
    {
      from: 'src/kernels/opencascade/wasm',
      to: `${options.outDir}/kernels/opencascade/wasm`,
    },
  ],
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

/**
 * Worker entries (`src/worker/*.ts`) bootstrap with top-level `await
 * webWorkerHost(...).open()` / `await nodeWorkerHost(...).open()` —
 * Rolldown rejects TLA in `cjs` output. Workers are an ESM-only
 * topology by construction (browser `Worker({ type: 'module' })` and
 * `node:worker_threads` both load these files as ES modules), so the
 * cjs build deliberately omits them.
 */
const baseEntries = baseConfig.entry as string[];
const cjsConfig: Options = {
  ...baseConfig,
  entry: baseEntries.filter((entryPath) => !entryPath.startsWith('src/worker/')),
  format: 'cjs',
  outDir: 'dist/cjs',
  dts: false,
};

const esmConfig: Options = {
  ...baseConfig,
  format: 'esm',
  outDir: 'dist/esm',
};

export default defineConfig([esmConfig, cjsConfig]);
