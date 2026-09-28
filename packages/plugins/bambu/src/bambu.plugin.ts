import { definePlugin } from '@taucad/runtime/plugin';

import { bambuMachine } from '#bambu.machine.js';

/** Canonical `@taucad/bambu` plugin factory. @public */
export const bambu = definePlugin({
  meta: {
    name: '@taucad/bambu',
  },

  machines: {
    default: bambuMachine,
  },

  presets: {
    default: ['machines.default'],
  },
});
