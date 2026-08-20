import { z } from 'zod';
import { esbuild } from '@taucad/runtime/bundler';
import { jscad } from '@taucad/runtime/kernels/jscad';
import { manifold } from '@taucad/runtime/kernels/manifold';
import { opencascade } from '@taucad/runtime/kernels/opencascade';
import { replicad } from '@taucad/runtime/kernels/replicad';
import { tau } from '@taucad/runtime/kernels/tau';
import { zoo } from '@taucad/runtime/kernels/zoo';
import {
  geometryCache,
  gltfCoordinateTransform,
  gltfEdgeDetection,
  parameterCache,
  parameterFileResolver,
} from '@taucad/runtime/middleware';
import { converterTranscoder, imageTranscoder } from '@taucad/runtime/transcoder';
import { defineRuntime } from '@taucad/runtime/worker';
import { openrscad } from '@taucad/openrscad';
import { observability } from '@taucad/telemetry/middleware';

type UiRuntimeOptions = {
  readonly withSourceMapping?: boolean;
};

export const uiRuntimeConfigSchema = z.object({
  tauApiUrl: z.url(),
  tauWebSocketUrl: z.url(),
});

const createUiRuntime = (options: UiRuntimeOptions = {}) =>
  defineRuntime({
    configSchema: uiRuntimeConfigSchema,
    createRuntime(config) {
      return {
        kernels: [
          openrscad(),
          zoo({ baseUrl: `${config.tauWebSocketUrl}/v1/kernels/zoo` }),
          replicad({
            // 'auto' picks the pthread build only when the host is cross-origin
            // isolated; a pinned 'multi' fails kernel binding on plain-http LAN
            // origins where SharedArrayBuffer is unavailable.
            wasm: 'auto',
            withSourceMapping: options.withSourceMapping === true,
          }),
          opencascade(),
          manifold(),
          jscad(),
          tau(),
        ],
        middleware: [
          observability({ reportUrl: `${config.tauApiUrl}/v1/telemetry/ingest` }),
          parameterFileResolver(),
          parameterCache(),
          geometryCache(),
          gltfCoordinateTransform(),
          gltfEdgeDetection(),
        ],
        bundlers: [esbuild()],
        transcoders: [converterTranscoder(), imageTranscoder()],
      };
    },
  });

export const runtime = createUiRuntime();
export const debugRuntime = createUiRuntime({ withSourceMapping: true });
