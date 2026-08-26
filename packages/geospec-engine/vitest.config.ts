import { configDefaults, defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/** Broad by construction: new executable source is covered unless it enters one of these audited non-production classes. */
export const engineCoverageSourcePolicy = {
  include: ['src/**/*.ts'],
  exclude: [
    'src/**/*.{test,spec,test-d}.ts',
    'src/**/__evidence-snapshots__/**',
    'src/**/__fixtures__/**',
    'src/**/testing/**',
    'src/**/types.ts',
    // Three-line process shim; every decision lives in cli.ts/node-host.ts.
    'src/cli/main.ts',
  ],
};

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./src/testing/vitest-setup.ts'],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/packages/geospec-engine',
      ...engineCoverageSourcePolicy,
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
