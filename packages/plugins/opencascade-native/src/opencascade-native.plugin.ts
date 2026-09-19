import { definePlugin } from '@taucad/runtime/plugin';
import { opencascadeNativeKernel } from '#opencascade-native.kernel.js';

/** Canonical `@taucad/opencascade-native` plugin factory. @public */
export const opencascadeNative = definePlugin({
  meta: {
    name: '@taucad/opencascade-native',
  },

  kernels: {
    default: opencascadeNativeKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
