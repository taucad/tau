import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'example-electron',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'out-tsc/**'],
    environment: 'node',
    globals: false,
    typecheck: { enabled: false },
  },
});
