import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  // oxlint-disable-next-line typescript/no-explicit-any -- vite type mismatch from pnpm duplicate @types/node resolutions
  plugins: [nxViteTsPaths() as any],
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
