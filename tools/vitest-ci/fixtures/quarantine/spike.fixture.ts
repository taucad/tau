import process from 'node:process';

import { expect, it } from 'vitest';

// The blueprint's feasibility spike (D5): a pass, a retried pass, a quarantined failure and, with REAL=1, a failure
// no entry covers.
let attempts = 0;

it('passes first time', () => {
  expect(1).toBe(1);
});

it('flaky: passes on the retry', () => {
  attempts += 1;
  expect(attempts).toBeGreaterThan(1);
});

it('quarantined: always fails here', () => {
  expect(1).toBe(2);
});

it.runIf(process.env.REAL === '1')('real regression: always fails', () => {
  expect(1).toBe(2);
});
