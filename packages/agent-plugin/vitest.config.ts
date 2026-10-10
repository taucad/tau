import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The package folder is the plugin root that hosts load or copy: keep Vite's cache out of it.
  cacheDir: '../../node_modules/.vite/packages/agent-plugin',
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
      reportsDirectory: '../../out/reports/coverage/packages/agent-plugin',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});
