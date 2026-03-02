import { replicad, zoo, openscad, jscad, manifold, tau } from '@taucad/kernels/kernels';
import { parameterCache, geometryCache, gltfCoordinateTransform, gltfEdgeDetection } from '@taucad/kernels/middleware';
import { esbuild } from '@taucad/kernels/bundler';
import type { KernelClientOptions } from '@taucad/kernels';
import { ENV } from '#environment.config.js';

/**
 * Default kernel options optimized for fast previews.
 *
 * Kernel array order defines selection priority -- the first kernel that
 * can handle a file wins.
 */
export const defaultKernelOptions: KernelClientOptions = {
  kernels: [
    openscad(),
    zoo({ baseUrl: `${ENV.TAU_WEBSOCKET_URL}/v1/kernels/zoo` }),
    replicad({ withBrepEdges: true }),
    manifold(),
    jscad(),
    tau(),
  ],
  middleware: [parameterCache(), geometryCache(), gltfCoordinateTransform(), gltfEdgeDetection()],
  bundlers: [esbuild()],
};

/**
 * Debug kernel options for the editor.
 *
 * Identical to default but enables `withSourceMapping: true` on replicad
 * for enriched error stack traces with library source map resolution.
 * Adds ~50ms to init — only use where rich error feedback matters.
 */
export const debugKernelOptions: KernelClientOptions = {
  ...defaultKernelOptions,
  kernels: defaultKernelOptions.kernels.map((kernel) =>
    kernel.id === 'replicad'
      ? replicad({ wasm: 'single-exceptions', withBrepEdges: true, withSourceMapping: true })
      : kernel,
  ),
};
