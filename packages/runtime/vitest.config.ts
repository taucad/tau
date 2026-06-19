import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  // oxlint-disable-next-line typescript/no-explicit-any -- vite type mismatch from pnpm duplicate @types/node resolutions
  plugins: [nxViteTsPaths() as any],
  test: {
    environment: 'node',
    maxWorkers: 4,
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    setupFiles: ['vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/packages/runtime',
      include: ['src/**/*'],
      exclude: [
        'src/**/*.{test,spec,test-d}.ts',
        // Exclude WASM and fonts
        'src/**/{wasm,fonts,sourcemaps}/**/*',
        // Exclude benchmarks
        'src/benchmarks/**/*',
        // Exclude all kernels, for now we are focussing on framework coverage.
        'src/kernels/**/*',
      ],
      thresholds: {
        statements: 80, // AGENTS: never lower this, only increase.
        branches: 70, // AGENTS: never lower this, only increase.
        functions: 80, // AGENTS: never lower this, only increase.
        lines: 80, // AGENTS: never lower this, only increase.
      },
    },
  },
});
