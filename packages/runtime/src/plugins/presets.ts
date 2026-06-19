/**
 * Preset configurations for zero-config kernel setup.
 */

import { replicad, opencascade, zoo, jscad, manifold, tau } from '#plugins/kernel-factories.js';
import { parameterCache } from '#middleware/parameter-cache.middleware.js';
import { geometryCache } from '#middleware/geometry-cache.middleware.js';
import { gltfCoordinateTransform } from '#middleware/gltf-coordinate-transform.middleware.js';
import { gltfEdgeDetection } from '#middleware/gltf-edge-detection.middleware.js';
import { esbuild } from '#bundler/esbuild.bundler.js';
import { converterTranscoder } from '#transcoders/converter/converter.transcoder.js';
import { defineRuntime } from '#worker/runtime-definition.js';

/**
 * Runtime definition shape returned by preset functions.
 * Contains the full set of plugins required to configure a worker/host runtime.
 * @public
 */
export type PresetRuntime = ReturnType<typeof presets.all>;

/**
 * Preset configurations for common use cases.
 *
 * @public
 */
export const presets = {
  /**
   * All built-in kernels, middleware, and bundlers.
   * Zero-config default for consumers who want everything.
   *
   * @returns Complete runtime definition with all plugins
   *
   * @example <caption>Zero-config full setup</caption>
   * ```typescript
   * import { presets } from '@taucad/runtime/presets';
   * import { createRuntimeWorker } from '@taucad/runtime/worker';
   *
   * const worker = createRuntimeWorker({ runtime: presets.all() });
   * ```
   */
  // oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- intentional: rely on inference so per-kernel/per-transcoder phantom generics survive into `createRuntimeClient`. An explicit `PresetOptions` return type would widen `kernels`/`transcoders` to the erased `KernelPlugin[]`/`TranscoderPlugin[]` aliases and break `CollectFormatMap`/`MergeExportMap` typesafety on `client.export(...)`.
  all() {
    return defineRuntime({
      kernels: [zoo(), replicad(), opencascade(), manifold(), jscad(), tau()],
      middleware: [parameterCache(), geometryCache(), gltfCoordinateTransform(), gltfEdgeDetection()],
      bundlers: [esbuild()],
      transcoders: [converterTranscoder()],
    });
  },
};
