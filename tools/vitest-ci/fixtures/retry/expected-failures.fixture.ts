import { describe, expect, it } from 'vitest';

// `it.fails` rows. Vitest inverts an expected failure only after its retry loop, so under `retry: 1` the first row runs
// twice and reaches the reporters as a pass with one retry; the second passes its first attempt and is flipped to a
// failure. Neither is a flake event.
describe('expected failures', () => {
  it.fails('fails every attempt, as expected', () => {
    expect(1).toBe(2);
  });

  it.fails('passes unexpectedly', () => {
    expect(1).toBe(1);
  });
});
