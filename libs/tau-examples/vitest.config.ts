import { testReporters, testRetry } from '@taucad/vitest-ci';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: testReporters('default'),
    retry: testRetry(),
    // The viewer parity gate and its WASM pass need viewer references and a GPU, and the WASM pass needs a browser;
    // both run under vitest.viewer-parity.config.ts.
    exclude: [...configDefaults.exclude, '**/*.gate.test.ts', '**/*.browser.test.ts'],
  },
});
