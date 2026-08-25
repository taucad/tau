import { definePlugin } from '@taucad/runtime/plugin';
import { imageTranscoder } from '#image.transcoder.js';
import { svgTranscoder } from '#svg.transcoder.js';

/** Canonical `@taucad/image` plugin factory. @public */
export const image = definePlugin({
  meta: {
    name: '@taucad/image',
  },

  transcoders: {
    export: imageTranscoder,
    svg: svgTranscoder,
  },

  presets: {
    default: ['transcoders.export', 'transcoders.svg'],
  },
});
