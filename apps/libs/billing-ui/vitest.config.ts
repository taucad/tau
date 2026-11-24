import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Jsdom installs `localStorage` only where Node has none: Node 25+ turns its own accessor on, which hides
    // jsdom's, so the workers keep Node 24's default (docs/policy/react-testing-policy.md, Environment).
    execArgv: ['--no-experimental-webstorage'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../out/reports/coverage/apps/libs/billing-ui',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});
