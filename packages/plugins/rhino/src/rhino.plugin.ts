import { definePlugin } from '@taucad/runtime/plugin';
import { rhinoKernel } from '#rhino.kernel.js';

/** Canonical `@taucad/rhino` plugin factory. @public */
export const rhino = definePlugin({
  meta: {
    name: '@taucad/rhino',
  },

  kernels: {
    default: rhinoKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
