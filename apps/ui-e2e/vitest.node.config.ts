import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

/**
 * The Node-run suites of `ui-e2e`: `test`, the service worker and deploy-skew tiers, the daemon's serve build and the
 * observability rows, each run from the workspace root as `vitest run --config apps/ui-e2e/vitest.node.config.ts
 * --dir apps/ui-e2e <files> --environment=node`. Without a config of its own such a run finds none at the workspace
 * root and reports through Vitest's defaults, so it writes no outcome rows (FQ-1) and the flake ledger never sees it.
 * The browser suites keep `vitest.config.ts`.
 */
export default defineConfig({
  test: {
    reporters: testReporters('default'),
    retry: testRetry(),
  },
});
