import { definePlugin } from '@taucad/runtime/plugin';
import { manifoldKernel } from '#manifold.kernel.js';

/** Canonical `@taucad/manifold` plugin factory. @public */
export const manifold = definePlugin({
  meta: {
    name: '@taucad/manifold',
  },

  kernels: {
    default: manifoldKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
