import { describe, expect, it } from 'vitest';
import { getRetryDelay } from '#utils/backoff.utils.js';

describe('getRetryDelay', () => {
  describe('curve (no jitter)', () => {
    it('returns 500 ms for attempt 1', () => {
      expect(getRetryDelay(1, { random: () => 0 })).toBe(500);
    });

    it('returns 1000 ms for attempt 2', () => {
      expect(getRetryDelay(2, { random: () => 0 })).toBe(1000);
    });

    it('returns 2000 ms for attempt 3', () => {
      expect(getRetryDelay(3, { random: () => 0 })).toBe(2000);
    });

    it('returns 4000 ms for attempt 4', () => {
      expect(getRetryDelay(4, { random: () => 0 })).toBe(4000);
    });

    it('returns 8000 ms for attempt 5', () => {
      expect(getRetryDelay(5, { random: () => 0 })).toBe(8000);
    });

    it('returns 16000 ms for attempt 6', () => {
      expect(getRetryDelay(6, { random: () => 0 })).toBe(16_000);
    });

    it('caps at 32000 ms for attempt 7 (would be 32000 raw)', () => {
      expect(getRetryDelay(7, { random: () => 0 })).toBe(32_000);
    });

    it('still caps at 32000 ms for attempt 100', () => {
      expect(getRetryDelay(100, { random: () => 0 })).toBe(32_000);
    });
  });

  describe('jitter bounds', () => {
    it('never returns less than the un-jittered base', () => {
      for (let attempt = 1; attempt <= 10; attempt++) {
        const baseDelayForAttempt = getRetryDelay(attempt, { random: () => 0 });
        for (let trial = 0; trial < 50; trial++) {
          expect(getRetryDelay(attempt)).toBeGreaterThanOrEqual(baseDelayForAttempt);
        }
      }
    });

    it('never returns more than 1.25× the un-jittered base', () => {
      for (let attempt = 1; attempt <= 10; attempt++) {
        const baseDelayForAttempt = getRetryDelay(attempt, { random: () => 0 });
        const upperBound = baseDelayForAttempt * 1.25;
        for (let trial = 0; trial < 50; trial++) {
          expect(getRetryDelay(attempt)).toBeLessThanOrEqual(upperBound);
        }
      }
    });

    it('uses the supplied deterministic random source', () => {
      // With random()=0.5, jitter = 0.5 * 0.25 * 1000 = 125; total = 1125.
      expect(getRetryDelay(2, { random: () => 0.5 })).toBe(1125);
    });

    it('honours random() = just-under-1 (jitter approaches 25 %)', () => {
      const result = getRetryDelay(2, { random: () => 0.999999 });
      expect(result).toBeGreaterThan(1249);
      expect(result).toBeLessThan(1250);
    });
  });

  describe('attempt clamping', () => {
    it('clamps attempt 0 to attempt 1', () => {
      expect(getRetryDelay(0, { random: () => 0 })).toBe(500);
    });

    it('clamps negative attempts to attempt 1', () => {
      expect(getRetryDelay(-3, { random: () => 0 })).toBe(500);
    });

    it('floors fractional attempts', () => {
      expect(getRetryDelay(2.9, { random: () => 0 })).toBe(1000);
    });
  });

  describe('option overrides', () => {
    it('honours custom baseDelay', () => {
      expect(getRetryDelay(1, { random: () => 0, baseDelay: 100 })).toBe(100);
      expect(getRetryDelay(2, { random: () => 0, baseDelay: 100 })).toBe(200);
    });

    it('honours custom maxDelay', () => {
      expect(getRetryDelay(10, { random: () => 0, maxDelay: 1000 })).toBe(1000);
    });
  });
});
