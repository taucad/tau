/*
 * A seeded polluter for `flake-repro.test.ts`: `victim` passes in declaration order and fails whenever a shuffle
 * runs `polluter` before it, because `polluter` leaves module state behind. The other tests are neutral. The
 * `.fixture.ts` name keeps it out of every suite's default include.
 */
import { describe, expect, it } from 'vitest';

let polluted = false;

describe('order', () => {
  it('victim', () => {
    expect(polluted).toBe(false);
  });

  it('neutral a', () => {
    expect(1).toBe(1);
  });

  it('neutral b', () => {
    expect(2).toBe(2);
  });

  it('polluter', () => {
    polluted = true;
    expect(polluted).toBe(true);
  });

  it('neutral c', () => {
    expect(3).toBe(3);
  });

  it('neutral d', () => {
    expect(4).toBe(4);
  });
});
