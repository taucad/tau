import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The viewer parity gate needs viewer references and a GPU; it runs under vitest.viewer-parity.config.ts.
    exclude: [...configDefaults.exclude, '**/*.gate.test.ts'],
  },
});
