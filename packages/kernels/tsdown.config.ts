import { defineConfig } from 'tsdown';
import type { Options } from 'tsdown';

const baseConfig: Options = {
  entry: [
    'src/index.ts',
    'src/framework/kernel-runtime-worker.ts',
    'src/middleware/kernel-middleware.ts',
    'src/kernels/replicad/replicad.kernel.ts',
    'src/kernels/jscad/jscad.kernel.ts',
    'src/kernels/manifold/manifold.kernel.ts',
    'src/kernels/openscad/openscad.kernel.ts',
    'src/kernels/zoo/zoo.kernel.ts',
    'src/kernels/zoo/engine-connection.ts',
    'src/kernels/tau/tau.kernel.ts',
    'src/bundler/esbuild.bundler.ts',
    'src/middleware/parameter-cache.middleware.ts',
    'src/middleware/geometry-cache.middleware.ts',
    'src/middleware/gltf-coordinate-transform.middleware.ts',
    'src/middleware/gltf-edge-detection.middleware.ts',
    'src/testing/index.ts',
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
      from: 'src/kernels/openscad/fonts',
      to: `${options.outDir}/kernels/openscad/fonts`,
    },
    {
      from: 'src/bundler/wasm',
      to: `${options.outDir}/bundler/wasm`,
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
  ],
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

const cjsConfig: Options = {
  ...baseConfig,
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
