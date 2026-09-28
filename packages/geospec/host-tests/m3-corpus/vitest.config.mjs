import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: process.env.GEOSPEC_VITEST_CACHE,
  test: {
    fileParallelism: false,
    include: ['m3-corpus/installed.vitest.test.mjs'],
    maxWorkers: 1,
    minWorkers: 1,
    pool: 'forks',
    testTimeout: 60_000,
  },
});
