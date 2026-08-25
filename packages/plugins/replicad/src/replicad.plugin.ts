import { definePlugin } from '@taucad/runtime/plugin';
import { replicadKernel } from '#replicad.kernel.js';

/** Canonical `@taucad/replicad` plugin factory. @public */
export const replicad = definePlugin({
  meta: {
    name: '@taucad/replicad',
  },

  kernels: {
    default: replicadKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
