import { definePlugin } from '@taucad/runtime/plugin';

import { smlibpyKernel } from '#smlibpy.kernel.js';

/** Canonical `@taucad/smlibpy` plugin factory. @public */
export const smlibpy = definePlugin({
  meta: {
    name: '@taucad/smlibpy',
  },

  kernels: {
    default: smlibpyKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
