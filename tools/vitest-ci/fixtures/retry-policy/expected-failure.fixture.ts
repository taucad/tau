import { describe, expect, it } from 'vitest';

// An `it.fails` row whose body fails every attempt: under the CI retry it runs twice and Vitest reports a pass with one
// retry, but it is a consistent expected failure, not a flake event.
describe('one expected failure', () => {
  it.fails('fails every attempt, as expected', () => {
    expect(1).toBe(2);
  });
});
