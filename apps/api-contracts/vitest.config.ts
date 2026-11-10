import { defineConfig } from 'vitest/config';

/**
 * Contract tests between an API table and the workspace packages it mirrors. They need no PostgreSQL or object
 * store, so they run in the affected test shards whenever either side changes, not in the API lane.
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-contracts',
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
  },
});
