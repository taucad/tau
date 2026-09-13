import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      exclude: ['src/native/**', 'src/wasm/**', '**/*.test-d.ts'],
      provider: 'v8',
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
    },
  },
});
