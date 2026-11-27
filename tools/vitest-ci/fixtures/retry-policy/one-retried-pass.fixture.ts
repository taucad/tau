import { describe, expect, it } from 'vitest';

// One test that fails its first attempt and passes its retry: a flake event.
let attempts = 0;

describe('one retried pass', () => {
  it('passes first time', () => {
    expect(1).toBe(1);
  });

  it('passes on the retry', () => {
    attempts += 1;
    expect(attempts).toBeGreaterThan(1);
  });
});
