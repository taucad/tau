import { definePlugin } from '@taucad/runtime/plugin';

import { cadmpegKernel } from '#cadmpeg.kernel.js';
import { cadmpegTranscoder } from '#cadmpeg.transcoder.js';

/** Canonical `@taucad/cadmpeg` plugin factory. @public */
export const cadmpeg = definePlugin({
  meta: {
    name: '@taucad/cadmpeg',
  },

  kernels: {
    import: cadmpegKernel,
  },

  transcoders: {
    export: cadmpegTranscoder,
  },

  presets: {
    // The writers of cadmpeg 0.6.12 refuse every STEP model Tau produces (see the
    // transcoder), so export is opt-in until an upstream release writes them.
    default: ['kernels.import'],
    import: ['kernels.import'],
    export: ['transcoders.export'],
    all: ['kernels.import', 'transcoders.export'],
  },
});
