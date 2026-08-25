import { definePlugin } from '@taucad/runtime/plugin';
import { opencascadeKernel } from '#opencascade.kernel.js';

/** Canonical `@taucad/opencascade` plugin factory. @public */
export const opencascade = definePlugin({
  meta: {
    name: '@taucad/opencascade',
  },

  kernels: {
    default: opencascadeKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
