import { attemptReceiptSchema } from '@taucad/agent-host/wire';

/**
 * Automatic resume of a run that ended on something that passes by itself: a provider's rate limit, or a model
 * attempt the gateway had not finished settling.
 *
 * Rate limits are ported from Codex's stream retry (`codex-rs`, commit 8c07694): a
 * `rate_limit_exceeded` refusal is transient, so it is retried up to
 * `DEFAULT_STREAM_MAX_RETRIES` times; the wait is the server's advice when it
 * gave one and otherwise an exponential backoff from 200 ms, doubling, with 10%
 * jitter. The gateway normalises every provider's advice (its `Retry-After`, a
 * `RetryInfo` detail, a "try again in" sentence) into its own `Retry-After`, which
 * reaches this card as `retryAfterSeconds`. Quota and usage
 * refusals are terminal there, as every other refusal is here.
 *
 * A run the host ended `RUN_ABANDONED` around a `MODEL_ATTEMPT_PENDING` (RA-R1) resumes once the attempt route says
 * the gateway settled that attempt, asked from the page, and only within a fixed bound (charter D4, I5).
 */

/** The provider refusal code that resumes on its own after a wait. @public */
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

// ── Provider unavailable ──────────────────────────────────────────────────────────────────────────

/**
 * The provider refusal code that resumes once on its own (server agent plane regression review R6).
 *
 * The server agent plane's provider client retried a transient failure twice before the person saw it. The Pi gateway
 * transport retries none, because each retry is a billed attempt, so a brief provider 5xx paused the turn for a click.
 * One automatic resume restores the common case without hiding a real outage.
 *
 * @public
 */
export const autoResumableProviderUnavailableCode = 'PROVIDER_UNAVAILABLE';

/** Automatic resumes one run gets for a provider outage before the card waits for a click. @public */
export const maximumProviderUnavailableAutoResumes = 1;

/** The wait before that resume. Milliseconds. @public */
export const providerUnavailableRetryDelayMilliseconds = 2000;

/* Attempts of each run this page already resumed after a provider outage. */
const resumedUnavailableAttempts = new Map<string, Set<number>>();

/**
 * The retry number an automatic resume of this provider outage would be.
 *
 * @param runId - The failed run.
 * @param attempt - The run's failed attempt.
 * @returns The 1-based retry number, or `undefined` once the run's budget is spent or this attempt was resumed.
 * @public
 */
export const nextProviderUnavailableRetry = (runId: string, attempt: number): number | undefined => {
  const resumed = resumedUnavailableAttempts.get(runId);
  if (resumed?.has(attempt)) {
    return undefined;
  }
  const retry = (resumed?.size ?? 0) + 1;
  return retry > maximumProviderUnavailableAutoResumes ? undefined : retry;
};

/**
 * Records that this page resumed a provider outage automatically, spending the run's retry.
 *
 * @param runId - The failed run.
 * @param attempt - The run's failed attempt.
 * @public
 */
export const recordProviderUnavailableAutoResume = (runId: string, attempt: number): void => {
  const resumed = resumedUnavailableAttempts.get(runId) ?? new Set<number>();
  resumed.add(attempt);
  resumedUnavailableAttempts.set(runId, resumed);
};

// ── Model attempt pending ────────────────────────────────────────────────────────────────────────

/**
 * How long one run may wait on a pending attempt before its card waits for a click: the gateway settles an orphaned
 * attempt by its invocation deadline plus its recovery grace, 5 + 5 minutes by default. Milliseconds.
 *
 * @public
 */
export const modelPendingAutoResumeBoundMilliseconds = 10 * 60 * 1000;

/** The pause between two lookups of the attempt route. Milliseconds. @public */
export const modelPendingPollMilliseconds = 5000;

/** One lookup's own bound, the host transport's (`attemptLookupTimeout`); past it the answer is "not yet". */
const attemptLookupTimeoutMilliseconds = 10_000;

/* When this page first saw each run wait on a pending attempt. The bound runs from there for the whole run, so neither
 * a remount nor a resume that waits again restarts it. */
const pendingSince = new Map<string, number>();
/* Failed attempts (`runId:attempt`) this page already resumed after their model attempt settled. */
const resumedPendingAttempts = new Set<string>();

/**
 * When this page stops waiting for a run's pending attempt to settle.
 *
 * The bound is fixed until the attempt route states its own settlement time (`settlesBy`); that time then replaces the
 * fixed bound here, and only here.
 *
 * @param runId - The run that waits.
 * @param now - The current time, in epoch milliseconds.
 * @returns The epoch milliseconds past which the run is no longer resumed automatically.
 * @public
 */
export const modelPendingResumeBy = (runId: string, now: number): number => {
  const since = pendingSince.get(runId) ?? now;
  pendingSince.set(runId, since);
  return since + modelPendingAutoResumeBoundMilliseconds;
};

/**
 * Whether this failed attempt may still resume on its own: within the run's bound and not resumed already.
 *
 * @param runId - The failed run.
 * @param attempt - The run's failed attempt.
 * @param now - The current time, in epoch milliseconds.
 * @returns `true` while an automatic resume is still allowed.
 * @public
 */
export const canAutoResumeModelPending = (runId: string, attempt: number, now: number): boolean =>
  !resumedPendingAttempts.has(`${runId}:${String(attempt)}`) && now < modelPendingResumeBy(runId, now);

/**
 * Records that this page resumed a failed attempt after its model attempt settled.
 *
 * @param runId - The failed run.
 * @param attempt - The run's failed attempt.
 * @public
 */
export const recordModelPendingAutoResume = (runId: string, attempt: number): void => {
  resumedPendingAttempts.add(`${runId}:${String(attempt)}`);
};

/**
 * Asks the attempt route (`GET v1/billing/attempts/gateway/:attemptKey`) whether the gateway is done with one attempt,
 * as the browser host's own lookup does, with the page's session cookie.
 *
 * `settled` is every answer a Resume can proceed past: `terminal`, or a `not_found` the gateway voided. Anything else
 * (`pending`, `unavailable`, an answer this build cannot read, a refused or failed request, a lookup past its own bound)
 * is `waiting`; the caller's bound decides when to stop asking.
 *
 * @param input - The API origin, the attempt key, the caller's cancellation and an optional `fetch`.
 * @returns Whether the attempt settled.
 * @public
 */
export const lookUpModelAttempt = async ({
  apiBaseUrl,
  attemptId,
  signal,
  fetch = globalThis.fetch.bind(globalThis),
}: {
  readonly apiBaseUrl: string;
  readonly attemptId: string;
  readonly signal: AbortSignal;
  readonly fetch?: typeof globalThis.fetch;
}): Promise<'settled' | 'waiting'> => {
  const bound = new AbortController();
  const timer = globalThis.setTimeout(() => {
    bound.abort();
  }, attemptLookupTimeoutMilliseconds);
  try {
    const response = await fetch(
      `${apiBaseUrl.replace(/\/+$/u, '')}/v1/billing/attempts/gateway/${encodeURIComponent(attemptId)}`,
      { credentials: 'include', signal: AbortSignal.any([signal, bound.signal]) },
    );
    if (!response.ok) {
      return 'waiting';
    }
    const answer = attemptReceiptSchema.safeParse(await response.json());
    if (!answer.success) {
      return 'waiting';
    }
    return answer.data.state === 'terminal' || (answer.data.state === 'not_found' && answer.data.voided === true)
      ? 'settled'
      : 'waiting';
  } catch {
    return 'waiting';
  } finally {
    globalThis.clearTimeout(timer);
  }
};

/**
 * Forgets every recorded automatic resume and pending clock, for test isolation.
 *
 * @internal
 */
export const resetAutoResumes = (): void => {
  resumedAttempts.clear();
  resumedUnavailableAttempts.clear();
  pendingSince.clear();
  resumedPendingAttempts.clear();
};
