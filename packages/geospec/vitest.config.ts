import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/** Broad by construction: only type-only and test-support source is excluded. */
export const substrateCoverageSourcePolicy = {
  include: ['src/**/*.ts'],
  exclude: [
    'src/**/*.{test,spec,test-d}.ts',
    'src/**/__evidence-snapshots__/**',
    'src/**/__fixtures__/**',
    'src/**/*.test-support.ts',
    'src/**/types.ts',
    'src/**/runner-types.ts',
    'src/runner/pool/pool-messages.ts',
  ],
};

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../coverage/packages/geospec',
      ...substrateCoverageSourcePolicy,
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
