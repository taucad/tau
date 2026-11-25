import { describe, expect, it } from 'vitest';

let attempts = 0;

describe('outcomes', () => {
  it('passes first time', () => {
    expect(1).toBe(1);
  });

  it('passes on the retry', () => {
    attempts += 1;
    expect(attempts).toBeGreaterThan(1);
  });

  it('fails every attempt', () => {
    expect(1).toBe(2);
  });

  it.skip('is skipped', () => {
    expect(1).toBe(1);
  });
});
