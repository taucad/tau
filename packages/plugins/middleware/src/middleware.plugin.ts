import { definePlugin } from '@taucad/runtime/plugin';
import { geometryCache } from '#geometry-cache.middleware.js';
import { gltfCoordinateTransform } from '#gltf-coordinate-transform.middleware.js';
import { gltfEdgeDetection } from '#gltf-edge-detection.middleware.js';
import { parameterCache } from '#parameter-cache.middleware.js';
import { parameterFileResolver } from '#parameter-file-resolver.middleware.js';

/** Canonical `@taucad/middleware` plugin factory. @public */
export const middleware = definePlugin({
  meta: {
    name: '@taucad/middleware',
  },

  middleware: {
    parameterFileResolver,
    parameterCache,
    geometryCache,
    gltfCoordinateTransform,
    gltfEdgeDetection,
  },

  presets: {
    default: [
      'middleware.parameterFileResolver',
      'middleware.parameterCache',
      'middleware.geometryCache',
      'middleware.gltfCoordinateTransform',
      'middleware.gltfEdgeDetection',
    ],
    cache: ['middleware.parameterCache', 'middleware.geometryCache'],
  },
});
