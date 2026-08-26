import { definePlugin } from '@taucad/runtime/plugin';
import { brepKernel } from '#brep.kernel.js';

/** Canonical `@taucad/brep` plugin factory. @public */
export const brep = definePlugin({
  meta: {
    name: '@taucad/brep',
  },

  kernels: {
    default: brepKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
