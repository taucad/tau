import { playwright } from '@vitest/browser-playwright';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    include: ['src/rolldown-capability.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ actionTimeout: 120_000, launchOptions: { channel: 'chromium' } }),
      instances: [{ browser: 'chromium', name: 'rolldown-nonisolated' }],
    },
  },
});
