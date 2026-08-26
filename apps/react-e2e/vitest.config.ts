/* eslint-disable @typescript-eslint/naming-convention -- E2E is the established project acronym. */
import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import {
  reactCaptureTargetDiagnostics,
  reactClickTarget,
  reactCloseTarget,
  reactEditExternalElectronWorkspace,
  reactFillTarget,
  reactGetTargetSession,
  reactNavigateTarget,
  reactOpenTarget,
  reactReadTarget,
} from './browser-command.ts';
import { reactE2ETargets } from './support/targets.ts';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    attachmentsDir: resolve(import.meta.dirname, '../../out/test-results/vitest-browser/apps/react-e2e/attachments'),
    coverage: {
      reportsDirectory: '../../out/reports/coverage/apps/react-e2e',
    },
    include: ['specs/**/*.spec.ts'],
    globalSetup: [resolve(import.meta.dirname, 'global-setup.ts')],
    setupFiles: [resolve(import.meta.dirname, 'support/test-lifecycle.ts')],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    retry: process.env['CI'] ? 2 : 0,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      // Artifact requirement: child-context and Electron trace attachments must survive target teardown.
      api: { allowWrite: true },
      provider: playwright({ actionTimeout: 120_000 }),
      commands: {
        reactCaptureTargetDiagnostics,
        reactClickTarget,
        reactCloseTarget,
        reactEditExternalElectronWorkspace,
        reactFillTarget,
        reactGetTargetSession,
        reactNavigateTarget,
        reactOpenTarget,
        reactReadTarget,
      },
      screenshotFailures: false,
      screenshotDirectory: resolve(
        import.meta.dirname,
        '../../out/test-results/vitest-browser/apps/react-e2e/screenshots',
      ),
      instances: reactE2ETargets.map(
        (target) =>
          ({
            browser: 'chromium',
            name: target.id,
            include: [target.spec],
            provide: {
              reactE2ETarget: { baseURL: target.baseURL, id: target.id, metadata: target.metadata },
            },
          }) as const,
      ),
    },
  },
});
