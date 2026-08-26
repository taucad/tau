import process from 'node:process';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
// oxlint-disable-next-line no-restricted-imports -- Vitest config bootstraps this server-side command before test aliases exist.
import { uiBrowserCommands } from './src/support/browser-command.ts';

const isCi = Boolean(process.env['CI']);

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      {
        find: /^#support\/(.*)\.js$/u,
        replacement: `${resolve(import.meta.dirname, 'src/support')}/$1.ts`,
      },
    ],
  },
  test: {
    attachmentsDir: resolve(import.meta.dirname, '../../out/test-results/vitest-browser/apps/ui-e2e/attachments'),
    coverage: {
      reportsDirectory: '../../out/reports/coverage/apps/ui-e2e',
    },
    include: ['src/**/*.spec.ts'],
    exclude: ['src/global-setup-preflight.spec.ts'],
    globalSetup: [resolve(import.meta.dirname, 'global-setup.ts')],
    setupFiles: [resolve(import.meta.dirname, 'src/support/test-lifecycle.ts')],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    retry: isCi ? 2 : 0,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      // Artifact requirement: browser-side evidence writes and child-context trace attachments need Vitest write access.
      api: { allowWrite: true },
      provider: playwright({ actionTimeout: 10_000 }),
      commands: uiBrowserCommands,
      screenshotFailures: false,
      screenshotDirectory: resolve(
        import.meta.dirname,
        '../../out/test-results/vitest-browser/apps/ui-e2e/screenshots',
      ),
      instances: [
        {
          browser: 'chromium',
          name: 'chromium',
          exclude: ['src/headless-chat-image-capture.no-webgpu.spec.ts'],
          provider: playwright({ actionTimeout: 10_000, launchOptions: { args: ['--enable-unsafe-webgpu'] } }),
        },
        {
          browser: 'webkit',
          name: 'webkit-smoke',
          include: [
            'src/preview.spec.ts',
            'src/birdhouse-preview.spec.ts',
            'src/project-creation-location-unsupported.spec.ts',
            'src/headless-chat-image-capture.no-webgpu.spec.ts',
          ],
        },
      ],
    },
  },
});
