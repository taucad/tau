import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Jsdom installs `localStorage` only where Node has none: Node 25+ turns its own accessor on, which hides
    // jsdom's, so the workers keep Node 24's default (docs/policy/react-testing-policy.md, Environment).
    execArgv: ['--no-experimental-webstorage'],
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
      reportsDirectory: '../../out/reports/coverage/libs/utils',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec}.ts'],
    },
  },
});
