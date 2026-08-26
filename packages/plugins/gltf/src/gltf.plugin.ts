import { definePlugin } from '@taucad/runtime/plugin';
import { gltfKernel } from '#gltf.kernel.js';

import { gltfTranscoder } from '#gltf.transcoder.js';

/** Canonical `@taucad/gltf` plugin factory. @public */
export const gltf = definePlugin({
  meta: {
    name: '@taucad/gltf',
  },

  kernels: {
    default: gltfKernel,
  },

  transcoders: {
    default: gltfTranscoder,
  },

  presets: {
    default: ['kernels.default', 'transcoders.default'],
  },
});
