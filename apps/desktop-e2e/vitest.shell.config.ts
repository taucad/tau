import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
// oxlint-disable-next-line no-restricted-imports -- Compose the adjacent production Electron harness.
import desktopConfig from './vitest.config.js';

/** Offline keyboard qualification uses the real desktop services and shell provider. */
export default defineConfig({
  ...desktopConfig,
  test: {
    ...desktopConfig.test,
    globalSetup: [],
    include: ['src/desktop-shell.spec.ts'],
    reporters: ['default', 'json'],
    outputFile: resolve(import.meta.dirname, '../../out/test-results/desktop-shell/results.json'),
  },
});
