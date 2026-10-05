import { defineRuntime } from '@taucad/runtime/worker';
import { openrscad } from '@taucad/openrscad';
import { assimp } from '@taucad/assimp';
import { brep } from '@taucad/brep';
import { esbuild } from '@taucad/esbuild';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import { geometryCache, gltfEdgeDetection, parameterFileResolver, parameterUnits } from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { picovoxel } from '@taucad/picovoxel';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';
import { tscircuit } from '@taucad/tscircuit';
import { slicer } from '@taucad/slicer';
import { zoo } from '@taucad/zoo';
import { zooCloseErrors } from '#cloud/zoo-close-errors.js';
import { observabilityMiddleware } from '#runtime/observability/observability.middleware.js';
import { uiRuntimeConfigSchema } from '#runtime/ui-runtime.schema.js';
import type { UiRuntimeConfig } from '#runtime/ui-runtime.schema.js';

type UiRuntimeOptions = {
  readonly withSourceMapping?: boolean;
};

const createUiRuntimeOptions = (config: UiRuntimeConfig, options: UiRuntimeOptions = {}) => ({
  plugins: [
    esbuild(),
    opencascade(),
    openrscad(),
    jscad(),
    manifold(),
    // Default wasm 'auto': the pthread build for fast viewer renders only when the worker is
    // cross-origin isolated; exact exports always run on the serial build.
    picovoxel(),
    gltf(),
    brep(),
    rhino(),
    image(),
    slicer(),
    assimp({ preset: 'all' }),
    replicad({
      kernels: {
        default: {
          // This app selects the maintained density-capable single build. The existing
          // custom override hashes the delivered WASM and glue bytes, independent of URL.
          wasm: {
            wasmUrl: new URL(
              '/assets/engines/replicad/density-single-v1/replicad_single.wasm',
              globalThis.location.href,
            ).href,
            wasmBindingsUrl: new URL(
              '/assets/engines/replicad/density-single-v1/replicad_single.mjs',
              globalThis.location.href,
            ).href,
          },
          withSourceMapping: options.withSourceMapping === true,
        },
      },
    }),
    zoo({
      kernels: {
        default: {
          baseUrl: `${config.tauWebSocketUrl}/v1/kernels/zoo`,
          // Billing copy lives behind the cloud boundary so self-host builds never ship it.
          closeErrors: zooCloseErrors,
        },
      },
    }),
    tscircuit(),
  ],
  middleware: [
    observabilityMiddleware({
      reportUrl: `${config.tauApiUrl}/v1/telemetry/ingest`,
    }),
    parameterFileResolver(),
    parameterUnits(),
    geometryCache(),
    gltfEdgeDetection(),
  ],
});

const createUiRuntime = (options: UiRuntimeOptions = {}) =>
  defineRuntime({
    configSchema: uiRuntimeConfigSchema,
    createRuntime: (config) => createUiRuntimeOptions(config, options),
  });

export const runtime = createUiRuntime();
export const debugRuntime = createUiRuntime({ withSourceMapping: true });
