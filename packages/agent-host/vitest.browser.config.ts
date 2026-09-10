import { playwright } from '@vitest/browser-playwright';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig } from 'vitest/config';
import type { BrowserProviderOption } from 'vitest/node';

export default defineConfig({
  plugins: [nxViteTsPaths()],
  server: { host: '127.0.0.1' },
  test: {
    include: ['src/**/*.browser.test.ts'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      /* Two resolved `vitest` peer variants (differing `@types/node` keys) give
       * `playwright()` a structurally identical but nominally foreign type; the
       * ui worker config carries the same bridge. */
      provider: playwright({ launchOptions: { channel: 'chromium' } }) as unknown as BrowserProviderOption,
      instances: [{ browser: 'chromium' }],
    },
  },
});
