import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/** The race suite owns its two API children; the shared global setup must not run. */
export default defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  resolve: { alias: [{ find: /^#git\/(.*)\.js$/u, replacement: `${import.meta.dirname}/$1.ts` }] },
  test: {
    include: ['src/git/project-deletion-race.spec.ts'],
    environment: 'node',
    globalSetup: [resolve(import.meta.dirname, 'storage-global-setup.ts')],
    testTimeout: 120_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    maxWorkers: 2,
    pool: 'forks',
  },
});
