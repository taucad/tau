import { definePlugin } from '@taucad/runtime/plugin';

import { tscircuitKernel } from '#tscircuit.kernel.js';

/** Canonical `@taucad/tscircuit` plugin factory. @public */
export const tscircuit = definePlugin({
  meta: {
    name: '@taucad/tscircuit',
  },

  kernels: {
    default: tscircuitKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
