import { replicad, opencascade, zoo, openscad, jscad, manifold, tau, buerli } from '@taucad/runtime/kernels';
import { parameterCache, geometryCache, gltfCoordinateTransform, gltfEdgeDetection } from '@taucad/runtime/middleware';
import { esbuild } from '@taucad/runtime/bundler';
import { createRuntimeClientOptions } from '@taucad/runtime';
import { observability } from '@taucad/telemetry/middleware';
import { parameterFileResolver } from '#middleware/parameter-file-resolver.factory.js';
import { ENV } from '#environment.config.js';

/**
 * Default kernel options optimized for fast previews.
 *
 * Kernel array order defines selection priority -- the first kernel that
 * can handle a file wins.
 */
export const defaultKernelOptions = createRuntimeClientOptions({
  tessellation: {
    preview: { linearTolerance: 0.1, angularTolerance: 30 },
  },
  sharedMemory: {
    geometry: { bytes: 100 * 1024 * 1024, maxEntries: 20, eviction: 'lru' },
  },
  kernels: [
    openscad(),
    zoo({ baseUrl: `${ENV.TAU_WEBSOCKET_URL}/v1/kernels/zoo` }),
    replicad({ withBrepEdges: true }),
    opencascade(),
    manifold(),
    jscad(),
    buerli({ classcadKey: ENV.CLASSCAD_WASM_KEY ?? '' }),
    tau(),
  ],
  middleware: [
    observability({ reportUrl: `${ENV.TAU_API_URL}/v1/telemetry/ingest` }),
    parameterFileResolver(),
    parameterCache(),
    geometryCache(),
    gltfCoordinateTransform(),
    gltfEdgeDetection(),
  ],
  bundlers: [esbuild()],
});

/**
 * Debug kernel options for the editor.
 *
 * Identical to default but enables `withSourceMapping: true` on replicad
 * for enriched error stack traces with library source map resolution.
 * Adds ~50ms to init — only use where rich error feedback matters.
 */
export const debugKernelOptions = createRuntimeClientOptions(defaultKernelOptions, {
  kernels: [
    replicad({
      withBrepEdges: true,
      withSourceMapping: true,
    }),
  ],
});
