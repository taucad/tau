import { configDefaults, defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

/** Broad by construction: only type-only and test-support source is excluded. */
export const substrateCoverageSourcePolicy = {
  include: ['src/**/*.ts'],
  exclude: [
    'src/**/*.{test,spec,test-d}.ts',
    'src/**/__evidence-snapshots__/**',
    'src/**/__fixtures__/**',
    'src/**/*.test-support.ts',
    'src/**/runner-types.ts',
    'src/runner/pool/pool-messages.ts',
  ],
};

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    // Source checks and externally installed campaigns remain required test dependencies.
    exclude: [
      ...configDefaults.exclude,
      'host-tests/m3-corpus/corpus.test.mjs',
      'host-tests/m3-corpus/profile-v3.test.mjs',
      'host-tests/m3-corpus/independent-bindings.test.mjs',
      'host-tests/m3-corpus/installed.vitest.test.mjs',
      'host-tests/f1-public-a1/f1-public.vitest.test.mjs',
    ],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/packages/geospec',
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
