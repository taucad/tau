import { definePlugin } from '@taucad/runtime/plugin';
import { zooKernel } from '#zoo.kernel.js';

/** Canonical `@taucad/zoo` plugin factory. @public */
export const zoo = definePlugin({
  meta: {
    name: '@taucad/zoo',
  },

  kernels: {
    default: zooKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
