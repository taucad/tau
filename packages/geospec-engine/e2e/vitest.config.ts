import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { runGeospecPreview } from '#e2e/browser-command.js';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    attachmentsDir: resolve(
      import.meta.dirname,
      '../../../out/test-results/vitest-browser/packages/geospec-engine/attachments',
    ),
    coverage: {
      reportsDirectory: '../../../out/reports/coverage/packages/geospec-engine-e2e',
    },
    include: ['browser-engine.spec.ts'],
    globalSetup: [resolve(import.meta.dirname, 'global-setup.ts')],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ actionTimeout: 120_000, launchOptions: { channel: 'chromium' } }),
      commands: { runGeospecPreview },
      screenshotFailures: true,
      trace: 'retain-on-failure',
      screenshotDirectory: resolve(
        import.meta.dirname,
        '../../../out/test-results/vitest-browser/packages/geospec-engine/screenshots',
      ),
      instances: [{ browser: 'chromium', name: 'chromium' }],
    },
  },
});
