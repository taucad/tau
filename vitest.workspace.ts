import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // UI Project Configuration
  {
    extends: './apps/ui/vite.config.ts',
    test: {
      name: 'ui',
      root: './apps/ui',
      environment: 'jsdom',
    },
  },
  // API Project Configuration
  {
    extends: './apps/api/vite.config.ts',
    test: {
      name: 'api',
      root: './apps/api',
      environment: 'node',
    },
  },
]);
