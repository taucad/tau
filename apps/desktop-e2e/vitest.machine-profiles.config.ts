import { defineConfig } from 'vitest/config';
// oxlint-disable-next-line no-restricted-imports -- Compose the adjacent desktop harness configuration.
import desktopConfig from './vitest.config.js';

/** Offline preferences use the production Electron bundle without an account or API server. */
export default defineConfig({
  ...desktopConfig,
  test: {
    ...desktopConfig.test,
    globalSetup: [],
    include: ['src/desktop-machine-profiles.spec.ts', 'src/desktop-print-failure.spec.ts'],
  },
});
