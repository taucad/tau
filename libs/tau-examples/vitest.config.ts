import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The viewer parity gate and its WASM pass need viewer references and a GPU, and the WASM pass needs a browser;
    // both run under vitest.viewer-parity.config.ts.
    exclude: [...configDefaults.exclude, '**/*.gate.test.ts', '**/*.browser.test.ts'],
  },
});
