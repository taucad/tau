import { definePlugin } from '@taucad/runtime/plugin';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
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
