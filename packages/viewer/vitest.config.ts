import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Required by @testing-library/jest-dom, which uses `expect` implicitly.
    globals: true,
    environment: 'jsdom',
    // *.browser.test.ts(x) suites need real WebGL/WebGPU and run under their own browser configs.
    exclude: [...configDefaults.exclude, '**/*.browser.test.ts', '**/*.browser.test.tsx'],
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
      reportsDirectory: '../../out/reports/coverage/packages/viewer',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.{ts,tsx}'],
    },
  },
});
