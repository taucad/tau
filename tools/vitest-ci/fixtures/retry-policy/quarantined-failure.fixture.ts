import { expect, it } from 'vitest';

// A test that fails every attempt: the `quarantine.json` the test writes beside it names it, so it does not gate.
it('quarantined: always fails here', () => {
  expect(1).toBe(2);
});
