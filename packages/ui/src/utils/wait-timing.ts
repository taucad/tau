/**
 * The one timing ladder for loading waits (loading states UX blueprint, "One timing ladder"; UI Policy § 6). Every
 * loading surface reads these constants; nothing on a load path defines its own delay or minimum.
 *
 * Times are milliseconds on the page's performance timeline, where 0 is the navigation start. A wait's clock starts at
 * the navigation for a document load and at the gesture for anything later. It is one clock per wait, never per
 * mount: a region that mounts 900 ms into a wait shows its indicator 100 ms later.
 */

/**
 * A click or key press produces a visible change within this time.
 *
 * @public
 */
export const acknowledgeMilliseconds = 100;

/**
 * No wait indicator appears before this much of the wait has passed.
 *
 * @public
 */
export const indicatorDelayMilliseconds = 1000;

/**
 * A shown indicator stays at least this long. It holds the indicator only: content that arrives inside the minimum
 * renders at once, and the indicator finishes its time in its own slot.
 *
 * @public
 */
export const indicatorMinimumMilliseconds = 500;

/**
 * At this point the indicator's words say the wait is long and Retry appears beside it.
 *
 * @public
 */
export const slowWaitMilliseconds = 10_000;

/**
 * The indicator's opacity entrance. Reduced motion collapses it; loaded content has no entrance at all.
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
 * @param elapsed - Time since the wait started.
 * @param settledAt - When the wait ended, measured from the same start; omit while it is still running.
 * @returns `hidden` before the delay, and after a settled wait's indicator has served its minimum; `shown` from the
 *   delay; `slow` from the slow mark.
 * @public
 *
 * @example <caption>Content at 1,100 ms keeps the indicator up to 1,500 ms</caption>
 * ```typescript
 * import { waitPhaseAt } from '@taucad/ui/utils/wait-timing';
 *
 * export const phases = [waitPhaseAt(1200, 1100), waitPhaseAt(1500, 1100)]; // ['shown', 'hidden']
 * ```
 */
export function waitPhaseAt(elapsed: number, settledAt?: number): WaitPhase {
  if (settledAt !== undefined && elapsed >= settledAt) {
    const holdsUntil = indicatorDelayMilliseconds + indicatorMinimumMilliseconds;
    return settledAt >= indicatorDelayMilliseconds && elapsed < holdsUntil ? 'shown' : 'hidden';
  }
  if (elapsed < indicatorDelayMilliseconds) {
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
 * - `holding`: the wait ended while the indicator was showing; the words stay until `hideDelay`.
 *
 * A delay is a CSS `<time>`, and may be negative: an indicator mounted 1,200 ms into a wait has a reveal delay of
 * -200ms, so it is already showing.
 *
 * @public
 */
export type WaitIndicatorTiming =
  | Readonly<{ state: 'idle' }>
  | Readonly<{ state: 'waiting'; revealDelay: string; slowDelay: string }>
  | Readonly<{ state: 'holding'; hideDelay: string }>;

const idleTiming: WaitIndicatorTiming = { state: 'idle' };

/**
 * The timing of a running wait.
 *
 * @param startedAt - When the wait started, on the performance timeline.
 * @param now - The current time on the same timeline; omit before hydration, where the page has no script clock and
 *   the delays are taken from navigation start through the `--wait-offset` variable (the elapsed time, negated, that
 *   the pre-paint script writes on the root element; `0ms` when it is absent).
 * @returns Reveal and slow delays measured from now, or from navigation start before hydration.
 * @public
 */
export function waitingTiming(startedAt: number, now?: number): WaitIndicatorTiming {
  const revealAt = startedAt + indicatorDelayMilliseconds;
  const slowAt = startedAt + slowWaitMilliseconds;
  if (now === undefined) {
    return {
      state: 'waiting',
      revealDelay: `calc(${revealAt}ms + var(--wait-offset, 0ms))`,
      slowDelay: `calc(${slowAt}ms + var(--wait-offset, 0ms))`,
    };
  }
  return { state: 'waiting', revealDelay: `${revealAt - now}ms`, slowDelay: `${slowAt - now}ms` };
}

/**
 * The timing once a wait ends `settledAt` milliseconds after it started.
 *
 * @param settledAt - Time from the wait's start to its end.
 * @returns `holding` while a shown indicator still owes part of its minimum, otherwise `idle`.
 * @public
 */
export function settledTiming(settledAt: number): WaitIndicatorTiming {
  const holdsUntil = indicatorDelayMilliseconds + indicatorMinimumMilliseconds;
  if (waitPhaseAt(settledAt, settledAt) === 'hidden') {
    return idleTiming;
  }
  return { state: 'holding', hideDelay: `${holdsUntil - settledAt}ms` };
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
