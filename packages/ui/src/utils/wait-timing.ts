/**
 * The one timing ladder for loading waits (loading states UX blueprint, "One timing ladder"; UI Policy § 6). Every
 * loading surface reads these constants; nothing on a load path defines its own delay or minimum.
 *
 * Times are milliseconds on the page's performance timeline, where 0 is the navigation start. A wait's clock starts at
 * the navigation for a document load and at the gesture for anything later. It is one clock per wait, never per
 * mount: a region that mounts 900 ms into a wait shows its indicator 100 ms later.
 */

/**
 * A click or key press produces a visible change within this time. Milliseconds.
 *
 * @public
 */
export const acknowledgeMilliseconds = 100;

/**
 * No wait indicator appears before this much of the wait has passed. Milliseconds.
 *
 * @public
 */
export const indicatorDelayMilliseconds = 1000;

/**
 * A shown indicator stays at least this long. It holds the indicator only: content that arrives inside the minimum
 * renders at once, and the indicator finishes its time in its own slot. Counted from when the indicator became
 * visible, which is later than the delay for a region that mounts partway through a wait. Milliseconds.
 *
 * @public
 */
export const indicatorMinimumMilliseconds = 500;

/**
 * At this point the indicator's words say the wait is long and Retry appears beside it. Milliseconds.
 *
 * @public
 */
export const slowWaitMilliseconds = 10_000;

/**
 * The indicator's opacity entrance. Reduced motion collapses it; loaded content has no entrance at all. Milliseconds.
 *
 * @public
 */
export const indicatorEntranceMilliseconds = 150;

/**
 * What a wait indicator shows at one moment: nothing, its words, or its slow words with Retry.
 *
 * @public
 */
export type WaitPhase = 'hidden' | 'shown' | 'slow';

/**
 * The phase of a wait indicator `elapsed` milliseconds after its wait started.
 *
 * @param elapsed - Time since the wait started. Milliseconds.
 * @param settledAt - When the wait ended, measured from the same start; omit while it is still running. Milliseconds.
 * @param shownAt - When the indicator became visible, measured from the same start: the delay, later for a region
 *   that mounted after it, or earlier (even negative) for a wait that took over an indicator already showing. Defaults
 *   to the delay. Milliseconds.
 * @returns `hidden` before the indicator shows, and after a settled wait's indicator has served its minimum; `shown`
 *   from when it shows; `slow` from the slow mark, which a hold that starts after the mark keeps.
 * @public
 *
 * @example <caption>Content at 1,100 ms keeps the indicator up to 1,500 ms</caption>
 * ```typescript
 * import { waitPhaseAt } from '@taucad/ui/utils/wait-timing';
 *
 * export const phases = [waitPhaseAt(1200, 1100), waitPhaseAt(1500, 1100)]; // ['shown', 'hidden']
 * ```
 */
export function waitPhaseAt(
  elapsed: number,
  settledAt?: number,
  shownAt: number = indicatorDelayMilliseconds,
): WaitPhase {
  if (settledAt !== undefined && elapsed >= settledAt) {
    const isHeld = settledAt >= shownAt && elapsed < shownAt + indicatorMinimumMilliseconds;
    if (!isHeld) {
      return 'hidden';
    }
    return settledAt >= slowWaitMilliseconds ? 'slow' : 'shown';
  }
  if (elapsed < Math.min(indicatorDelayMilliseconds, shownAt)) {
    return 'hidden';
  }
  return elapsed < slowWaitMilliseconds ? 'shown' : 'slow';
}

/**
 * How a wait indicator is drawn, as CSS delays measured from the moment the timing is applied. A CSS animation, not a
 * script timer, reveals the words, swaps in the slow words and ends a hold, so the same element works before hydration
 * and nothing on the page runs a timer for it.
 *
 * - `idle`: no wait, or a wait that ended before its indicator showed or after it served its minimum. The slot is empty.
 * - `waiting`: the wait is running. The words reveal after `revealDelay` and the slow words after `slowDelay`.
 * - `holding`: the wait ended while the indicator was showing; the words stay until `hideDelay`. `isSlow` keeps the
 *   slow words for a hold that starts after the slow mark.
 *
 * A delay is a CSS `<time>`, and may be negative: an indicator mounted 1,200 ms into a wait has a reveal delay of
 * -200ms, so it is already showing.
 *
 * @public
 */
export type WaitIndicatorTiming =
  | Readonly<{ state: 'idle' }>
  | Readonly<{ state: 'waiting'; revealDelay: string; slowDelay: string; entrance: string }>
  | Readonly<{ state: 'holding'; hideDelay: string; isSlow: boolean }>;

const idleTiming: WaitIndicatorTiming = { state: 'idle' };

/**
 * The timing of a running wait.
 *
 * @param startedAt - When the wait started, on the performance timeline. Milliseconds.
 * @param now - The current time on the same timeline, in milliseconds; omit before hydration, where the page has no script clock and
 *   the delays are taken from navigation start through the `--wait-offset` variable (the elapsed time, negated, that
 *   the pre-paint script writes on the root element; `0ms` when it is absent).
 * @param isShowing - The wait takes over an indicator that is showing and still owes its minimum (a Retry, or a wait
 *   that starts again during a hold), so it starts revealed, with no entrance.
 * @returns Reveal and slow delays measured from now, or from navigation start before hydration.
 * @public
 */
export function waitingTiming(startedAt: number, now?: number, isShowing = false): WaitIndicatorTiming {
  const revealAt = startedAt + indicatorDelayMilliseconds;
  const slowAt = startedAt + slowWaitMilliseconds;
  const entrance = `${indicatorEntranceMilliseconds}ms`;
  if (now === undefined) {
    return {
      state: 'waiting',
      revealDelay: `calc(${revealAt}ms + var(--wait-offset, 0ms))`,
      slowDelay: `calc(${slowAt}ms + var(--wait-offset, 0ms))`,
      entrance,
    };
  }
  const revealDelay = isShowing ? -indicatorEntranceMilliseconds : revealAt - now;
  return { state: 'waiting', revealDelay: `${revealDelay}ms`, slowDelay: `${slowAt - now}ms`, entrance };
}

/**
 * The timing once a wait ends `settledAt` milliseconds after it started.
 *
 * @param settledAt - Time from the wait's start to its end. Milliseconds.
 * @param shownAt - When the indicator became visible, measured from the same start. Defaults to the delay.
 *   Milliseconds.
 * @returns `holding` while a shown indicator still owes part of its minimum, with the slow words when it settled after
 *   the slow mark; otherwise `idle`.
 * @public
 */
export function settledTiming(settledAt: number, shownAt: number = indicatorDelayMilliseconds): WaitIndicatorTiming {
  if (waitPhaseAt(settledAt, settledAt, shownAt) === 'hidden') {
    return idleTiming;
  }
  const holdsUntil = shownAt + indicatorMinimumMilliseconds;
  return {
    state: 'holding',
    hideDelay: `${holdsUntil - settledAt}ms`,
    isSlow: settledAt >= slowWaitMilliseconds,
  };
}

/**
 * The timing of no wait.
 *
 * @returns A timing whose slot is empty.
 * @public
 */
export function idleWaitTiming(): WaitIndicatorTiming {
  return idleTiming;
}
