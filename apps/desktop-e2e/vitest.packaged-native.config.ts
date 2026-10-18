import { defineConfig } from 'vitest/config';
// oxlint-disable-next-line no-restricted-imports -- Compose the adjacent desktop harness configuration.
import desktopConfig from './vitest.config.js';

/** Launch the completed macOS package and probe its native payload without API services. */
export default defineConfig({
  ...desktopConfig,
  test: {
    ...desktopConfig.test,
    globalSetup: [],
    include: ['src/desktop-native-payload.spec.ts'],
  },
});
