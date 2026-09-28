import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `node --test` runs `tests/ci/**` and `tests/extract-candidate-packages.test.mjs`.
    include: ['src/**/*.test.ts', 'tests/packaging.test.mjs', '*.test.ts'],
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
