import { definePlugin } from '@taucad/runtime/plugin';
import { displaySimplification } from '#display-simplification.middleware.js';
import { geometryCache } from '#geometry-cache.middleware.js';
import { gltfEdgeDetection } from '#gltf-edge-detection.middleware.js';
import { parameterCache } from '#parameter-cache.middleware.js';
import { parameterFileResolver } from '#parameter-file-resolver.middleware.js';
import { parameterUnits } from '#parameter-units.middleware.js';

/** Canonical `@taucad/middleware` plugin factory. @public */
export const middleware = definePlugin({
  meta: {
    name: '@taucad/middleware',
  },

  middleware: {
    parameterFileResolver,
    parameterCache,
    parameterUnits,
    geometryCache,
    gltfEdgeDetection,
    displaySimplification,
  },

  presets: {
    default: [
      'middleware.parameterFileResolver',
      'middleware.parameterUnits',
      'middleware.geometryCache',
      'middleware.gltfEdgeDetection',
      // After edge detection, so it sits nearer the kernel and fallback edges see the smaller mesh.
      'middleware.displaySimplification',
    ],
    cache: ['middleware.geometryCache'],
    units: ['middleware.parameterUnits'],
  },
});
