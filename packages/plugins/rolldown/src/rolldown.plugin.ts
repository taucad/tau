import { definePlugin } from '@taucad/runtime/plugin';

import { rolldownBundler } from '#rolldown.bundler.js';

/** Canonical `@taucad/rolldown` plugin factory. @public */
export const rolldown = definePlugin({
  meta: {
    name: '@taucad/rolldown',
  },

  bundlers: {
    default: rolldownBundler,
  },

  presets: {
    default: ['bundlers.default'],
  },
});
