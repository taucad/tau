import { definePlugin } from '@taucad/runtime/plugin';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
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
