import { z } from 'zod';
import { defineRuntime } from '@taucad/runtime/worker';
import { openrscad } from '@taucad/openrscad';
import { assimp } from '@taucad/assimp';
import { brep } from '@taucad/brep';
import { esbuild } from '@taucad/esbuild';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import { geometryCache, gltfEdgeDetection, parameterCache, parameterFileResolver } from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';
import { zoo } from '@taucad/zoo';
import { observabilityMiddleware } from '#runtime/observability/observability.middleware.js';

type UiRuntimeOptions = {
  readonly withSourceMapping?: boolean;
};

export const uiRuntimeConfigSchema = z.object({
  tauApiUrl: z.url(),
  tauWebSocketUrl: z.url(),
});

type UiRuntimeConfig = z.output<typeof uiRuntimeConfigSchema>;

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
          // Must match apps/api billing.constants.ts `zooCloseCodes`.
          /* eslint-disable @typescript-eslint/naming-convention -- WebSocket close-code keys are numeric protocol values. */
          closeErrors: {
            4401: 'Sign in to Tau to use the Zoo kernel.',
            4402: "You're out of Tau credits — add credits in Plans & Billing to keep modeling with Zoo.",
            4403: 'The Zoo kernel requires a Tau Pro subscription. Upgrade in Plans & Billing to continue.',
          },
          /* eslint-enable @typescript-eslint/naming-convention -- End numeric WebSocket close-code keys. */
        },
      },
    }),
  ],
  middleware: [
    observabilityMiddleware({ reportUrl: `${config.tauApiUrl}/v1/telemetry/ingest` }),
    parameterFileResolver(),
    parameterCache(),
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
