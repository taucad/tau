import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    /* Lets a suite collect garbage after each test, so a FileHandle a test or the code under it leaves unclosed fails
     * there (`node-event-log.test.ts`) instead of at a random later moment: Node 26 makes that an uncaught error. */
    execArgv: ['--expose-gc'],
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.browser.test.ts'],
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/packages/agent-host',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});
