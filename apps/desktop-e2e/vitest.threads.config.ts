import { defineConfig } from 'vitest/config';
// oxlint-disable-next-line no-restricted-imports -- Compose the adjacent desktop harness configuration.
import desktopConfig from './vitest.config.js';

/** Offline packaged Threads navigation over durable fixture records; no API or model turn. */
export default defineConfig({
  ...desktopConfig,
  test: { ...desktopConfig.test, globalSetup: [], include: ['src/desktop-threads.spec.ts'] },
});
