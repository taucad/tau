import { defineRuntime } from '@taucad/runtime/worker';
import { openrscad } from '@taucad/openrscad';
import { assimp } from '@taucad/assimp';
import { brep } from '@taucad/brep';
import { esbuild } from '@taucad/esbuild';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import {
  geometryCache,
  gltfEdgeDetection,
  parameterCache,
  parameterFileResolver,
  parameterUnits,
} from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';
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
    gltf(),
    brep(),
    rhino(),
    image(),
    assimp({ preset: 'all' }),
    replicad({
      kernels: {
        default: {
          // 'auto' picks the pthread build only when the host is cross-origin
          // isolated; a pinned 'multi' fails kernel binding on plain-http LAN
          // origins where SharedArrayBuffer is unavailable.
          wasm: 'auto',
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
  ],
  middleware: [
    observabilityMiddleware({
      reportUrl: `${config.tauApiUrl}/v1/telemetry/ingest`,
    }),
    parameterFileResolver(),
    parameterCache(),
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
