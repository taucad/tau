import { beforeEach, describe, expect, it } from 'vitest';
import {
  maximumRateLimitAutoResumes,
  nextRateLimitRetry,
  rateLimitBackoffMilliseconds,
  rateLimitRetryDelayMilliseconds,
  recordRateLimitAutoResume,
  resetRateLimitAutoResumes,
  retryDelayFromMessage,
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

describe('retryDelayFromMessage', () => {
  it.each([
    ['Rate limit reached. Please try again in 11.054s.', 11_054],
    ['try again in 35 seconds', 35_000],
    ['Try Again In 1 second', 1000],
    ['Please try again in 250ms', 250],
  ])('should read %j', (message, expected) => {
    expect(retryDelayFromMessage(message)).toBe(expected);
  });

  it('should read nothing from a sentence without a wait', () => {
    expect(retryDelayFromMessage('The model provider is rate limiting this request.')).toBeUndefined();
    expect(retryDelayFromMessage(undefined)).toBeUndefined();
  });
});

describe('rateLimitRetryDelayMilliseconds', () => {
  it('should prefer Retry-After over the sentence and the sentence over backoff', () => {
    const message = 'Please try again in 2s';

    expect(
      rateLimitRetryDelayMilliseconds({
        retryAfterSeconds: 30,
        message,
        retry: 1,
      }),
    ).toBe(30_000);
    expect(rateLimitRetryDelayMilliseconds({ message, retry: 1 })).toBe(2000);
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
