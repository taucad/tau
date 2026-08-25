import { definePlugin } from '@taucad/runtime/plugin';
import { assimpKernel } from '#assimp.kernel.js';

import { assimpTranscoder } from '#assimp.transcoder.js';

/** Canonical `@taucad/assimp` plugin factory. @public */
export const assimp = definePlugin({
  meta: {
    name: '@taucad/assimp',
  },

  kernels: {
    import: assimpKernel,
  },

  transcoders: {
    export: assimpTranscoder,
  },

  presets: {
    default: ['transcoders.export'],
    export: ['transcoders.export'],
    import: ['kernels.import'],
    all: ['kernels.import', 'transcoders.export'],
  },
});
