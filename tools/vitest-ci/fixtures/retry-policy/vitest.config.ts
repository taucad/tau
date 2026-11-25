import process from 'node:process';

import { testReporters, testRetry } from '@taucad/vitest-ci';
import { defineConfig } from 'vitest/config';

// The FQ-4 acceptance task, run by `src/retry-policy.test.ts` in a child Vitest: the test copies these fixtures into a
// temporary git repository (`TAU_RETRY_FIXTURE_ROOT`), so the change under test is a real diff from `NX_BASE`. The
// fixtures import nothing (`globals`), because the temporary directory cannot resolve workspace packages.
export default defineConfig({
  test: {
    root: process.env['TAU_RETRY_FIXTURE_ROOT'] ?? import.meta.dirname,
    globals: true,
    include: ['*.fixture.ts'],
    reporters: testReporters('dot'),
    retry: testRetry(),
  },
});
