import { definePlugin } from '@taucad/runtime/plugin';
import { jscadKernel } from '#jscad.kernel.js';

/** Canonical `@taucad/jscad` plugin factory. @public */
export const jscad = definePlugin({
  meta: {
    name: '@taucad/jscad',
  },

  kernels: {
    default: jscadKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
