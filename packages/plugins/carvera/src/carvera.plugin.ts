import { definePlugin } from '@taucad/runtime/plugin';

import { carveraMachine } from '#carvera.machine.js';

/** Canonical `@taucad/carvera` plugin factory. @public */
export const carvera = definePlugin({
  meta: {
    name: '@taucad/carvera',
  },

  machines: {
    default: carveraMachine,
  },

  presets: {
    default: ['machines.default'],
  },
});
