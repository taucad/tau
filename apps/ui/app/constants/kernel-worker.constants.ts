import { replicad, zoo, openscad, jscad, tscircuit, tau } from '@taucad/kernels/kernels';
import { parameterCache, geometryCache, gltfCoordinateTransform, gltfEdgeDetection } from '@taucad/kernels/middleware';
import { esbuild } from '@taucad/kernels/bundler';
import type { KernelClientOptions } from '@taucad/kernels';
import { ENV } from '#environment.config.js';

/**
 * Default kernel options optimized for fast previews.
 *
 * Replicad runs with `withExceptions: false` for faster execution.
 * Use `debugKernelOptions` in the editor for detailed error feedback.
 *
 * Kernel array order defines selection priority -- the first kernel that
 * can handle a file wins.
 */
export const defaultKernelOptions: KernelClientOptions = {
  kernels: [
    openscad(),
    zoo({ baseUrl: `${ENV.TAU_WEBSOCKET_URL}/v1/kernels/zoo` }),
    replicad({ withExceptions: false }),
    jscad(),
    tscircuit(),
    tau(),
  ],
  middleware: [parameterCache(), geometryCache(), gltfCoordinateTransform(), gltfEdgeDetection()],
  bundlers: [esbuild()],
};

/**
 * Debug kernel options for the editor.
 *
 * Identical to default but enables `withExceptions: true` and
 * `withBrepEdges: true` on replicad for detailed OpenCASCADE error
 * messages and visible BRep edge lines during interactive editing.
 * Slower than the default -- only use where rich error feedback matters.
 */
export const debugKernelOptions: KernelClientOptions = {
  ...defaultKernelOptions,
  kernels: defaultKernelOptions.kernels.map((kernel) =>
    kernel.id === 'replicad' ? replicad({ withExceptions: true, withBrepEdges: true }) : kernel,
  ),
};
