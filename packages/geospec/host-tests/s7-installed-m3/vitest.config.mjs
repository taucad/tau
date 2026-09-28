import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const cacheDirectory = process.env.GEOSPEC_S7_CACHE;
if (cacheDirectory === undefined || cacheDirectory.length === 0) {
  throw new TypeError('GEOSPEC_S7_CACHE is required.');
}

export default defineConfig({
  cacheDir: cacheDirectory,
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    fileParallelism: true,
    include: ['*.fixture.mjs'],
    isolate: true,
    maxWorkers: 2,
    pool: 'forks',
  },
});
