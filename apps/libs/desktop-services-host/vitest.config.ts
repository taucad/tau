import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors apps/desktop/vitest.config.ts: the desktop build's constants for a self-host build.
  define: {
    tauCloudBuildEnabled: 'false',
    tauDesktopHostBuild: '""',
  },
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
      reportsDirectory: '../../../out/reports/coverage/apps/libs/desktop-services-host',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts'],
    },
  },
});
