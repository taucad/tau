import { definePlugin } from '@taucad/runtime/plugin';

import { heifTranscoder } from '#heif.transcoder.js';

/** Canonical `@taucad/heif` plugin factory. @public */
export const heif = definePlugin({
  meta: {
    name: '@taucad/heif',
  },

  transcoders: {
    default: heifTranscoder,
  },

  presets: {
    default: ['transcoders.default'],
  },
});
