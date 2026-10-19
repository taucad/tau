import { beforeEach, describe, expect, it } from 'vitest';
import {
  maximumRateLimitAutoResumes,
  nextRateLimitRetry,
  rateLimitBackoffMilliseconds,
  rateLimitRetryDelayMilliseconds,
  recordRateLimitAutoResume,
  resetRateLimitAutoResumes,
} from '#utils/rate-limit-auto-resume.js';

describe('rateLimitBackoffMilliseconds', () => {
  it('should start at 200 ms and double per retry, as Codex does', () => {
    const noJitter = (): number => 0.5;

    expect([0, 1, 2, 3, 4, 5].map((retry) => rateLimitBackoffMilliseconds(retry, noJitter))).toEqual([
      200, 200, 400, 800, 1600, 3200,
    ]);
  });

  it('should keep jitter within 10% of the base', () => {
    expect(rateLimitBackoffMilliseconds(3, () => 0)).toBe(720);
    expect(rateLimitBackoffMilliseconds(3, () => 0.99)).toBe(878);
  });
});

describe('rateLimitRetryDelayMilliseconds', () => {
  it('should take the gateway Retry-After and otherwise back off', () => {
    expect(rateLimitRetryDelayMilliseconds({ retryAfterSeconds: 30, retry: 1 })).toBe(30_000);
    expect(rateLimitRetryDelayMilliseconds({ retry: 4 })).toBeGreaterThanOrEqual(1440);
    expect(rateLimitRetryDelayMilliseconds({ retry: 4 })).toBeLessThan(1760);
  });
});

describe('nextRateLimitRetry', () => {
  beforeEach(() => {
    resetRateLimitAutoResumes();
  });

  it('should number retries per run and stop after the budget', () => {
    for (let attempt = 1; attempt <= maximumRateLimitAutoResumes; attempt += 1) {
      expect(nextRateLimitRetry('run-1', attempt)).toBe(attempt);
      recordRateLimitAutoResume('run-1', attempt);
    }

    expect(nextRateLimitRetry('run-1', maximumRateLimitAutoResumes + 1)).toBeUndefined();
    expect(nextRateLimitRetry('run-2', 1)).toBe(1);
  });

  it('should never resume the same failed attempt twice', () => {
    recordRateLimitAutoResume('run-1', 1);

    expect(nextRateLimitRetry('run-1', 1)).toBeUndefined();
    expect(nextRateLimitRetry('run-1', 2)).toBe(2);
  });
});
