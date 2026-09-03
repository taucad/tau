import { definePlugin } from '@taucad/runtime/plugin';

import { build123dKernel } from '#build123d.kernel.js';

/** Canonical `@taucad/build123d` plugin factory. @public */
export const build123d = definePlugin({
  meta: {
    name: '@taucad/build123d',
  },

  kernels: {
    default: build123dKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
