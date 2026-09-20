import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['packages/geospec-engine-native/bench/vitest-consumer.vitest.test.mjs'],
    maxWorkers: 1,
    minWorkers: 1,
    pool: 'forks',
    testTimeout: 30_000,
  },
});
