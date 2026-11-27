import { resolve } from 'node:path';
import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    environment: 'node',
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      // Anchored to this file: a cwd-relative path from the repo root fails TS5058 and reports "no errors".
      tsconfig: resolve(import.meta.dirname, 'tsconfig.spec.json'),
      ignoreSourceErrors: true,
    },
    reporters: testReporters('verbose'),
    retry: testRetry(),
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/libs/agent-tools',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts'],
    },
  },
});
