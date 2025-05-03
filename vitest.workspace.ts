import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      include: ['**/*/vite.config.ts', '**/*/vitest.config.ts'],
    },
  },
]);
