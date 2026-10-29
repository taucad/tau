import { definePlugin } from '@taucad/runtime/plugin';

import { atopileKernel } from '#atopile.kernel.js';

/** Canonical `@taucad/atopile` plugin factory. @public */
export const atopile = definePlugin({
  meta: {
    name: '@taucad/atopile',
  },

  kernels: {
    default: atopileKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
