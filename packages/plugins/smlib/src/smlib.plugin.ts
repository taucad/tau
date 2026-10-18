import { definePlugin } from '@taucad/runtime/plugin';
import { smlibKernel } from '#smlib.kernel.js';

/** Canonical `@taucad/smlib` plugin factory. @public */
export const smlib = definePlugin({
  meta: {
    name: '@taucad/smlib',
  },

  kernels: {
    default: smlibKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
