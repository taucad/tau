/**
 * Automatic resume of a run the model provider rate limited.
 *
 * Ported from Codex's stream retry (`codex-rs`, commit 8c07694): a
 * `rate_limit_exceeded` refusal is transient, so it is retried up to
 * `DEFAULT_STREAM_MAX_RETRIES` times; the wait is the server's advice when it
 * gave one and otherwise an exponential backoff from 200 ms, doubling, with 10%
 * jitter. The gateway normalises every provider's advice (its `Retry-After`, a
 * `RetryInfo` detail, a "try again in" sentence) into its own `Retry-After`, which
 * reaches this card as `retryAfterSeconds`. Quota and usage
 * refusals are terminal there, as every other code is here: only
 * `RATE_LIMITED` resumes on its own.
 */

/** The one refusal code that resumes on its own. @public */
export const autoResumableRateLimitCode = 'RATE_LIMITED';

/** Automatic resumes one run gets before the card waits for a click (Codex `DEFAULT_STREAM_MAX_RETRIES`). @public */
export const maximumRateLimitAutoResumes = 5;

const initialBackoffMilliseconds = 200;
const backoffFactor = 2;

/**
 * The exponential backoff for one retry: 200 ms, doubling per retry, within ±10% jitter.
 *
 * @param retry - The 1-based retry number; 0 and 1 both wait the initial delay.
 * @param random - A source in [0, 1), injected for deterministic tests.
 * @returns The wait in milliseconds.
 * @public
 */
export const rateLimitBackoffMilliseconds = (retry: number, random: () => number = Math.random): number => {
  const base = initialBackoffMilliseconds * backoffFactor ** Math.max(retry - 1, 0);
  return Math.floor(base * (0.9 + 0.2 * random()));
};

/**
 * How long to wait before one automatic resume: the server's advice first, then backoff.
 *
 * @param input - The gateway's `Retry-After` estimate and the 1-based retry number.
 * @returns The wait in milliseconds.
 * @public
 */
export const rateLimitRetryDelayMilliseconds = (input: {
  readonly retryAfterSeconds?: number;
  readonly retry: number;
}): number =>
  input.retryAfterSeconds === undefined ? rateLimitBackoffMilliseconds(input.retry) : input.retryAfterSeconds * 1000;

/* Attempts of each run already resumed automatically by this page. Keyed by attempt so
 * a card that remounts for the same failure cannot resume it twice. */
const resumedAttempts = new Map<string, Set<number>>();

/**
 * The retry number an automatic resume of this failed attempt would be.
 *
 * @param runId - The failed run.
 * @param attempt - The run's failed attempt.
 * @returns The 1-based retry number, or `undefined` once the budget is spent or this attempt was already resumed.
 * @public
 */
export const nextRateLimitRetry = (runId: string, attempt: number): number | undefined => {
  const resumed = resumedAttempts.get(runId);
  if (resumed?.has(attempt)) {
    return undefined;
  }
  const retry = (resumed?.size ?? 0) + 1;
  return retry > maximumRateLimitAutoResumes ? undefined : retry;
};

/**
 * Records that this page resumed a failed attempt automatically, spending one retry.
 *
 * @param runId - The failed run.
 * @param attempt - The run's failed attempt.
 * @public
 */
export const recordRateLimitAutoResume = (runId: string, attempt: number): void => {
  const resumed = resumedAttempts.get(runId) ?? new Set<number>();
  resumed.add(attempt);
  resumedAttempts.set(runId, resumed);
};

/**
 * Forgets every recorded automatic resume, for test isolation.
 *
 * @internal
 */
export const resetRateLimitAutoResumes = (): void => {
  resumedAttempts.clear();
};
