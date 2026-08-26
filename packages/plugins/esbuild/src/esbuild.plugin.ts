import { definePlugin } from '@taucad/runtime/plugin';
import { esbuildBundler } from '#esbuild.bundler.js';

/** Canonical `@taucad/esbuild` plugin factory. @public */
export const esbuild = definePlugin({
  meta: {
    name: '@taucad/esbuild',
  },

  bundlers: {
    default: esbuildBundler,
  },

  presets: {
    default: ['bundlers.default'],
  },
});
