import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Git-server E2E (charter W18).
 *
 * Plain Node vitest with a global setup that owns the API on `:4014`: the specs
 * drive stock `git` and `git-lfs` as child processes and assert on real
 * Postgres and real MinIO, so everything runs in one place and nothing is
 * parallel — one API, one exclusive port, one `git` child budget.
 */
export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [{ find: /^#git\/(.*)\.js$/u, replacement: `${resolve(import.meta.dirname, 'src/git')}/$1.ts` }],
  },
  test: {
    include: ['src/git/**/*.spec.ts'],
    environment: 'node',
    globalSetup: [resolve(import.meta.dirname, 'src/git/global-setup.ts')],
    testTimeout: 600_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
