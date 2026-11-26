import process from 'node:process';

import { OutcomeReporter } from '@taucad/vitest-ci/outcome-reporter';
import { QuarantineVerdict } from '@taucad/vitest-ci/quarantine-verdict';
import { defineConfig } from 'vitest/config';

// The spike's cases, run by `src/quarantine-verdict.test.ts` in a child Vitest. This directory stands for the project
// root; the test writes the quarantine file and passes its path, so the entry's dates follow the clock.
const recorder = new OutcomeReporter({ projectRoot: import.meta.dirname });

export default defineConfig({
  test: {
    root: import.meta.dirname,
    retry: 1,
    include: ['*.fixture.ts'],
    reporters: [
      'dot',
      recorder,
      new QuarantineVerdict(recorder, { quarantineFile: process.env.TAU_QUARANTINE_FIXTURE }),
    ],
  },
});
