import { createContext, createElement, useContext, useState, useSyncExternalStore } from 'react';
import { idleWaitTiming, indicatorDelayMilliseconds, settledTiming, waitingTiming } from '#utils/wait-timing.js';
import type { ReactNode } from 'react';
import type { WaitIndicatorTiming } from '#utils/wait-timing.js';

/**
 * The clock a wait is measured on: `now()` returns milliseconds on the page's performance timeline, where 0 is the
 * navigation start. It is read when a wait starts or ends, never polled; the indicator's own CSS animation does the
 * waiting.
 *
 * @public
 */
export type WaitClock = Readonly<{ now: () => number }>;

const performanceClock: WaitClock = { now: () => performance.now() };

const waitClockContext = createContext<WaitClock>(performanceClock);

/**
 * Replace the clock that waits below are measured on. Applications leave the performance timeline in place; tests and
 * hosts with their own clock provide one.
 *
 * @param properties - The clock and the subtree that reads it.
 * @returns The scoped clock.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- React provider exported with its hook in this non-JSX module.
export const WaitClockProvider = (properties: {
  readonly clock: WaitClock;
  readonly children?: ReactNode;
}): React.JSX.Element => createElement(waitClockContext.Provider, { value: properties.clock }, properties.children);

const subscribeToNothing = (): (() => void) => () => undefined;
const isClient = (): boolean => true;
const isServer = (): boolean => false;

/**
 * One wait as the hook tracks it. `shownAt` is when its indicator became, or becomes, visible, measured from
 * `startedAt`: the delay, or the activation time for a region that activates after the delay.
 */
type TrackedWait = Readonly<{
  active: boolean;
  startedAt: number;
  shownAt: number;
  wait: number;
  timing: WaitIndicatorTiming;
}>;

/**
 * What {@link useWaitClock} returns.
 *
 * @public
 */
export type WaitClockState = Readonly<{
  /** The indicator's CSS timing. */
  timing: WaitIndicatorTiming;
  /**
   * Counts the waits this hook has started. Key the animated element on it, so a new wait (a Retry that moves
   * `startedAt`, or a wait that starts again) restarts the animation instead of resuming the old one.
   */
  wait: number;
}>;

/**
 * Options for {@link useWaitClock}.
 *
 * @public
 */
export type UseWaitClockOptions = Readonly<{
  /** Whether the wait is running: from its start until its content (or its failure) arrives. */
  active: boolean;
  /**
   * When the wait started, on the performance timeline: `0` (the default) for a wait that started with the document,
   * the gesture's time for a later one. A region that mounts partway through a wait passes the wait's start, not its
   * own mount time. Milliseconds.
   */
  startedAt?: number;
}>;

/**
 * Time one wait on the timing ladder: the indicator reveals 1,000 ms after the wait started, turns slow at 10,000 ms,
 * and once shown stays at least 500 ms. The result is CSS delays for the indicator's animation, read from the clock
 * only when the wait starts or ends, so no timer runs and the server render and hydration agree: before hydration the
 * delays come from navigation start through `--wait-offset`.
 *
 * @param options - Whether the wait is running and when it started.
 * @returns The indicator's timing and a count of waits to key its animated element on.
 * @public
 *
 * @example <caption>A wait started by a gesture</caption>
 * ```typescript
 * import { useWaitClock } from '@taucad/ui/hooks/use-wait-clock';
 *
 * export const useHistoryWait = (loading: boolean, openedAt: number) =>
 *   useWaitClock({ active: loading, startedAt: openedAt });
 * ```
 */
export function useWaitClock({ active, startedAt = 0 }: UseWaitClockOptions): WaitClockState {
  const clock = useContext(waitClockContext);
  // The server render and the hydration pass read `false`: the page has no script clock there.
  const hasClientClock = useSyncExternalStore(subscribeToNothing, isClient, isServer);
  const [tracked, setTracked] = useState<TrackedWait>(() => {
    const now = hasClientClock ? clock.now() : undefined;
    return {
      active,
      startedAt,
      shownAt: shownAtFor(startedAt, now),
      wait: 0,
      timing: active ? waitingTiming(startedAt, now) : idleWaitTiming(),
    };
  });

  if (tracked.active === active && Object.is(tracked.startedAt, startedAt)) {
    return { timing: tracked.timing, wait: tracked.wait };
  }

  // A wait started or ended: read the clock once, as React's "information from previous renders" pattern.
  const now = clock.now();
  const next: TrackedWait = active
    ? {
        active,
        startedAt,
        shownAt: shownAtFor(startedAt, now),
        wait: tracked.wait + 1,
        timing: waitingTiming(startedAt, now),
      }
    : {
        ...tracked,
        active,
        startedAt,
        timing: tracked.active ? settledTiming(now - tracked.startedAt, tracked.shownAt) : idleWaitTiming(),
      };
  setTracked(next);
  return { timing: next.timing, wait: next.wait };
}

/** When an indicator activated at `now` becomes visible, measured from the wait's start. */
function shownAtFor(startedAt: number, now: number | undefined): number {
  return now === undefined ? indicatorDelayMilliseconds : Math.max(indicatorDelayMilliseconds, now - startedAt);
}
