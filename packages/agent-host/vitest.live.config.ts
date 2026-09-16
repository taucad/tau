import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.test.ts'],
    reporters: ['verbose'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
