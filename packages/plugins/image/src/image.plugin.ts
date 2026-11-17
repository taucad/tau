import { definePlugin } from '@taucad/runtime/plugin';
import { renderTranscoder } from '#image.transcoder.js';
import { rasterTranscoder } from '#raster/raster.transcoder.js';
import { svgTranscoder } from '#svg.transcoder.js';

/** Canonical `@taucad/image` plugin factory. @public */
export const image = definePlugin({
  meta: {
    name: '@taucad/image',
  },

  transcoders: {
    render: renderTranscoder,
    svg: svgTranscoder,
    raster: rasterTranscoder,
  },

  presets: {
    default: ['transcoders.render', 'transcoders.svg', 'transcoders.raster'],
  },
});
