import { definePlugin } from '@taucad/runtime/plugin';

import { picovoxelKernel } from '#picovoxel.kernel.js';

/** Canonical `@taucad/picovoxel` plugin factory. @public */
export const picovoxel = definePlugin({
  meta: {
    name: '@taucad/picovoxel',
  },

  kernels: {
    default: picovoxelKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
