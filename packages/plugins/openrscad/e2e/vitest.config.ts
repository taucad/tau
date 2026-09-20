import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import type { BrowserProviderOption } from 'vitest/node';
import { runOpenrscadUsdzParity } from '#e2e/browser-command.js';

/**
 * `@vitest/browser-playwright` is built against the `vitest` copy pnpm installs
 * for its own peer context, so its provider option is structurally identical to
 * but nominally distinct from this project's. The cast is the same one
 * `apps/ui-e2e/vitest.config.ts` uses for the same duplicate-copy reason.
 *
 * @param options - Playwright provider options, forwarded verbatim.
 * @returns The provider option typed against this project's `vitest` copy.
 */
const playwrightProvider = (options?: Parameters<typeof playwright>[0]): BrowserProviderOption =>
  playwright(options) as unknown as BrowserProviderOption;

export default defineConfig({
  root: import.meta.dirname,
  test: {
    attachmentsDir: resolve(
      import.meta.dirname,
      '../../../../out/test-results/vitest-browser/packages/plugins/openrscad/attachments',
    ),
    coverage: {
      reportsDirectory: '../../../../out/reports/coverage/packages/plugins/openrscad-e2e',
    },
    include: ['browser-usdz.spec.ts'],
    globalSetup: [resolve(import.meta.dirname, 'global-setup.ts')],
    testTimeout: 600_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwrightProvider({ actionTimeout: 300_000, launchOptions: { channel: 'chromium' } }),
      commands: { runOpenrscadUsdzParity },
      screenshotFailures: true,
      trace: 'retain-on-failure',
      screenshotDirectory: resolve(
        import.meta.dirname,
        '../../../../out/test-results/vitest-browser/packages/plugins/openrscad/screenshots',
      ),
      instances: [{ browser: 'chromium', name: 'chromium' }],
    },
  },
});
