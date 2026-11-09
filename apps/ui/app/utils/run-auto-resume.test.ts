import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canAutoResumeModelPending,
  lookUpModelAttempt,
  maximumRateLimitAutoResumes,
  nextProviderUnavailableRetry,
  providerUnavailableRetryDelayMilliseconds,
  recordProviderUnavailableAutoResume,
  modelPendingAutoResumeBoundMilliseconds,
  modelPendingResumeBy,
  nextRateLimitRetry,
  rateLimitBackoffMilliseconds,
  rateLimitRetryDelayMilliseconds,
  recordModelPendingAutoResume,
  recordRateLimitAutoResume,
  resetAutoResumes,
} from '#utils/run-auto-resume.js';

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
    resetAutoResumes();
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

describe('modelPendingResumeBy', () => {
  beforeEach(() => {
    resetAutoResumes();
  });

  it('should bound a run from when this page first saw it wait, across later looks', () => {
    expect(modelPendingResumeBy('run-1', 1000)).toBe(1000 + modelPendingAutoResumeBoundMilliseconds);
    expect(modelPendingResumeBy('run-1', 90_000)).toBe(1000 + modelPendingAutoResumeBoundMilliseconds);
    expect(modelPendingResumeBy('run-2', 90_000)).toBe(90_000 + modelPendingAutoResumeBoundMilliseconds);
  });
});

describe('canAutoResumeModelPending', () => {
  beforeEach(() => {
    resetAutoResumes();
  });

  it('should allow a resume only within the run bound', () => {
    expect(canAutoResumeModelPending('run-1', 1, 0)).toBe(true);
    expect(canAutoResumeModelPending('run-1', 1, modelPendingAutoResumeBoundMilliseconds - 1)).toBe(true);
    expect(canAutoResumeModelPending('run-1', 1, modelPendingAutoResumeBoundMilliseconds)).toBe(false);
  });

  it('should keep one bound for the whole run, so a later attempt does not restart it', () => {
    expect(canAutoResumeModelPending('run-1', 1, 0)).toBe(true);
    recordModelPendingAutoResume('run-1', 1);

    expect(canAutoResumeModelPending('run-1', 2, modelPendingAutoResumeBoundMilliseconds)).toBe(false);
  });

  it('should never resume the same failed attempt twice', () => {
    recordModelPendingAutoResume('run-1', 1);

    expect(canAutoResumeModelPending('run-1', 1, 0)).toBe(false);
    expect(canAutoResumeModelPending('run-1', 2, 0)).toBe(true);
  });
});

describe('lookUpModelAttempt', () => {
  const attemptId = 'run_1:1:5';
  const lookUp = async (fetch: typeof globalThis.fetch): Promise<'settled' | 'waiting'> =>
    lookUpModelAttempt({
      apiBaseUrl: 'https://api.example.test/',
      attemptId,
      signal: new AbortController().signal,
      fetch,
    });
  const answering =
    (body: unknown, init?: ResponseInit): typeof globalThis.fetch =>
    async () =>
      Response.json(body, init);

  it('should ask the gateway attempt route with the session cookie', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(answering({ state: 'unavailable' }));

    await lookUp(fetch);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/billing/attempts/gateway/run_1%3A1%3A5',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it.each([
    [
      'terminal',
      { state: 'terminal', operationId: 'op', receipt: { customerState: 'released', chargedCreditAtoms: '0' } },
    ],
    ['voided not_found', { state: 'not_found', voided: true }],
  ])('should read %s as settled', async (_name, body) => {
    await expect(lookUp(answering(body))).resolves.toBe('settled');
  });

  it.each([
    ['pending', { state: 'pending', operationId: 'op' }],
    ['unavailable', { state: 'unavailable' }],
    ['bare not_found', { state: 'not_found' }],
    ['an unreadable answer', { state: 'settling' }],
  ])('should read %s as waiting', async (_name, body) => {
    await expect(lookUp(answering(body))).resolves.toBe('waiting');
  });

  it('should read a refused or failed request as waiting', async () => {
    await expect(lookUp(answering({ code: 'UNAUTHENTICATED' }, { status: 401 }))).resolves.toBe('waiting');
    await expect(
      lookUp(async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).resolves.toBe('waiting');
  });
});

/* Regression review R6: the LangChain plane retried a transient provider failure twice; the Pi gateway retries none. */
describe('nextProviderUnavailableRetry', () => {
  beforeEach(() => {
    resetAutoResumes();
  });

  it('should allow one automatic resume per run, then wait for a click', () => {
    expect(nextProviderUnavailableRetry('run-1', 1)).toBe(1);
    recordProviderUnavailableAutoResume('run-1', 1);

    expect(nextProviderUnavailableRetry('run-1', 1)).toBeUndefined();
    expect(nextProviderUnavailableRetry('run-1', 2)).toBeUndefined();
    expect(nextProviderUnavailableRetry('run-2', 1)).toBe(1);
  });

  it('should wait a couple of seconds before resuming', () => {
    expect(providerUnavailableRetryDelayMilliseconds).toBe(2000);
  });
});
