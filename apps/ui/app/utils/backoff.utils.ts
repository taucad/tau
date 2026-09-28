/**
 * Exponential backoff with jitter, mirroring Claude Code's
 * `withRetry.getRetryDelay` curve so transient transport failures back off
 * the same way our peer products do.
 *
 * @public
 */

/** Milliseconds. */
const baseDelay = 500;

/** Milliseconds. Caps the exponential growth so a long retry chain doesn't sit idle for minutes. */
const defaultMaxDelay = 32_000;

const jitterRatio = 0.25;

export type GetRetryDelayOptions = {
  /**
   * Override the base delay (attempt 1 floor before jitter). Milliseconds.
   * Defaults to 500 to match Claude Code's
   * [`BASE_DELAY_MS`](https://github.com/anthropics/claude-code).
   */
  baseDelay?: number;
  /**
   * Override the per-attempt cap. Milliseconds. Defaults to 32 000.
   */
  maxDelay?: number;
  /**
   * Deterministic random source for tests. Must return a number in the
   * half-open interval `[0, 1)`, matching `Math.random()`'s contract.
   */
  random?: () => number;
};

/**
 * Returns the delay (milliseconds) to wait before the `attempt`-th retry.
 *
 * Curve:
 * - Attempt `n` ≥ 1: `min(baseDelay × 2^(n - 1), maxDelay)` plus 0–25 % uniform jitter.
 * - Attempts `< 1` are clamped to 1 (defensive — callers pass a 1-based
 *   attempt counter).
 *
 * The returned delay is **always** at least the un-jittered base for that
 * attempt, and at most `1.25 × min(baseDelay × 2^(n - 1), maxDelay)`.
 *
 * @public
 *
 * @example <caption>Computing the first three retry delays</caption>
 * ```typescript
 * import { getRetryDelay } from '#utils/backoff.utils.js';
 *
 * const a1 = getRetryDelay(1); // ~500–625 ms
 * const a2 = getRetryDelay(2); // ~1000–1250 ms
 * const a3 = getRetryDelay(3); // ~2000–2500 ms
 * ```
 */
export function getRetryDelay(attempt: number, options: GetRetryDelayOptions = {}): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const base = options.baseDelay ?? baseDelay;
  const max = options.maxDelay ?? defaultMaxDelay;
  const random = options.random ?? Math.random;

  const exponential = Math.min(base * 2 ** (safeAttempt - 1), max);
  const jitter = random() * jitterRatio * exponential;
  return exponential + jitter;
}
