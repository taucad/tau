import { defineConfig } from 'vitest/config';
// oxlint-disable-next-line no-restricted-imports -- Compose the adjacent desktop harness configuration.
import desktopConfig from './vitest.config.js';

/** Real local record recovery needs the built desktop, without an account or API server. */
export default defineConfig({
  ...desktopConfig,
  test: { ...desktopConfig.test, globalSetup: [], include: ['src/desktop-record-recovery.spec.ts'] },
});
