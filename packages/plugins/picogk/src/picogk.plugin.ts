import { definePlugin } from '@taucad/runtime/plugin';

import { picogkKernel } from '#picogk.kernel.js';

/** Canonical `@taucad/picogk` plugin factory. @public */
export const picogk = definePlugin({
  meta: {
    name: '@taucad/picogk',
  },

  kernels: {
    default: picogkKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
