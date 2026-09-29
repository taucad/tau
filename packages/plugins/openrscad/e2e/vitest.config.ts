import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { runOpenrscadUsdzParity } from '#e2e/browser-command.js';

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
      provider: playwright({ actionTimeout: 300_000, launchOptions: { channel: 'chromium' } }),
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
