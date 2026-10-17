import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/libs/chat',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts'],
    },
    projects: [
      { extends: true, test: { name: 'chat' } },
      {
        // A published bundle builds these schemas with the Zod its consumer resolves, which may be newer than the
        // workspace's: the provider wire contract must hold under both.
        extends: true,
        test: {
          name: 'chat (newest zod)',
          include: ['src/schemas/provider-tool-schema-compat.test.ts'],
          typecheck: { enabled: false },
        },
        resolve: { alias: [{ find: /^zod$/u, replacement: fileURLToPath(import.meta.resolve('zod-latest')) }] },
      },
    ],
  },
});
