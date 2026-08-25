import { definePlugin } from '@taucad/runtime/plugin';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import { openrscadNativeKernel } from '#openrscad-native.kernel.js';

/** Canonical `@taucad/openrscad-native` plugin factory. @public */
export const openrscadNative = definePlugin({
  meta: {
    name: '@taucad/openrscad-native',
  },

  kernels: {
    default: openrscadNativeKernel,
  },

  presets: {
    default: ['kernels.default'],
  },
});
