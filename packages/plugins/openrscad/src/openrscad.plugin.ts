import { definePlugin } from '@taucad/runtime/plugin';
import { openrscadKernel } from '#openrscad.kernel.js';

/** Canonical `@taucad/openrscad` plugin factory. @public */
export const openrscad = definePlugin({
  meta: {
    name: '@taucad/openrscad',
  },
  kernels: { default: openrscadKernel },
  presets: { default: ['kernels.default'] },
});
