import { definePlugin } from '@taucad/runtime/plugin';

import { grblMachine } from '#grbl.machine.js';

/** Canonical `@taucad/grbl` plugin factory. @public */
export const grbl = definePlugin({
  meta: {
    name: '@taucad/grbl',
  },

  machines: {
    default: grblMachine,
  },

  presets: {
    default: ['machines.default'],
  },
});
