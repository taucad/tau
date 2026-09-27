import { definePlugin } from '@taucad/runtime/plugin';

import { slicerTranscoder } from '#slicer.transcoder.js';

/** Canonical `@taucad/slicer` plugin factory. @public */
export const slicer = definePlugin({
  meta: {
    name: '@taucad/slicer',
  },

  transcoders: {
    default: slicerTranscoder,
  },

  presets: {
    default: ['transcoders.default'],
  },
});
