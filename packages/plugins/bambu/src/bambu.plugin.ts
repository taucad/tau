import { definePlugin } from '@taucad/runtime/plugin';

import { bambuA1MiniMachine, bambuMachine } from '#bambu.machine.js';

/** Canonical `@taucad/bambu` plugin factory. @public */
export const bambu = definePlugin({
  meta: {
    name: '@taucad/bambu',
  },

  machines: {
    default: bambuMachine,
    a1Mini: bambuA1MiniMachine,
  },

  presets: {
    default: ['machines.default'],
    a1Mini: ['machines.a1Mini'],
  },
});
