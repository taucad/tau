import { OutcomeReporter } from '@taucad/vitest-ci/outcome-reporter';
import { defineConfig } from 'vitest/config';

// The spike's cases, run by `src/outcome-reporter.test.ts` in a child Vitest: a pass, a retried pass, a failure, a skip and a
// module that throws on import.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    retry: 1,
    include: ['*.fixture.ts'],
    reporters: ['dot', new OutcomeReporter()],
  },
});
