import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    passWithNoTests: true,
    /*
     * The dist-smoke test spawns the built CLI against the real birdhouse
     * fixture; the cold path includes WASM init for the replicad kernel.
     * 60s gives plenty of headroom on slow CI runners while keeping the
     * default short for the rest of the suite.
     */
    testTimeout: 60_000,
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/packages/cli',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts', 'src/cli-dist.test.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
