/**
 * Preset configurations for zero-config kernel setup.
 */

import type { KernelPlugin, MiddlewarePlugin, BundlerPlugin } from '#plugins/plugin-types.js';
import { replicad, zoo, openscad, jscad, manifold, tau } from '#plugins/kernel-factories.js';
import {
  parameterCache,
  geometryCache,
  gltfCoordinateTransform,
  gltfEdgeDetection,
} from '#plugins/middleware-factories.js';
import { esbuild } from '#plugins/bundler-factories.js';

/**
 * Client options shape returned by preset functions.
 * Contains the full set of plugins required to configure a kernel client.
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
 */
export const presets = {
  /**
   * All built-in kernels, middleware, and bundlers.
   * Zero-config default for consumers who want everything.
   *
   * @returns Complete client options with all plugins
   *
   * @example
   * ```typescript
   * import { createKernelClient, presets } from '@taucad/kernels';
   * const client = createKernelClient(presets.all());
   * ```
   */
  all(): PresetOptions {
    return {
      kernels: [openscad(), zoo(), replicad(), manifold(), jscad(), tau()],
      middleware: [parameterCache(), geometryCache(), gltfCoordinateTransform(), gltfEdgeDetection()],
      bundlers: [esbuild()],
    };
  },
};
