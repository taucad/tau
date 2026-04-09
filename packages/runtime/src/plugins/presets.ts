/**
 * Preset configurations for zero-config kernel setup.
 */

import type { KernelPlugin, MiddlewarePlugin, BundlerPlugin } from '#plugins/plugin-types.js';
import { replicad, opencascade, zoo, openscad, jscad, manifold, tau, buerli } from '#plugins/kernel-factories.js';
import {
  parameterCache,
  geometryCache,
  gltfCoordinateTransform,
  gltfEdgeDetection,
} from '#plugins/middleware-factories.js';
import { esbuild } from '#plugins/bundler-factories.js';

/**
 * Client options shape returned by preset functions.
 * Contains the full set of plugins required to configure a runtime client.
 * @public
 */
export type PresetOptions = {
  /** Kernel plugins that handle specific CAD file formats and languages */
  kernels: KernelPlugin[];
  /** Middleware plugins that intercept and transform kernel operations */
  middleware: MiddlewarePlugin[];
  /** Bundler plugins that handle code bundling and execution */
  bundlers: BundlerPlugin[];
};

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
   * @returns Complete client options with all plugins
   *
   * @example <caption>Zero-config full setup</caption>
   * ```typescript
   * import { createRuntimeClient, presets } from '@taucad/runtime';
   *
   * const client = createRuntimeClient(presets.all());
   * ```
   */
  all(): PresetOptions {
    return {
      kernels: [openscad(), zoo(), replicad(), opencascade(), manifold(), jscad(), buerli(), tau()],
      middleware: [parameterCache(), geometryCache(), gltfCoordinateTransform(), gltfEdgeDetection()],
      bundlers: [esbuild()],
    };
  },
};
