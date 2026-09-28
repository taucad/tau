import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reportsDirectory: '../../out/reports/coverage/apps/runtime-e2e',
    },
    environment: 'node',
    maxWorkers: 4,
    // Fixture render + geospec suites are heavy (cold OCCT wasm); give them room.
    testTimeout: 300_000,
    hookTimeout: 120_000,
    reporters: ['verbose'],
  },
});
