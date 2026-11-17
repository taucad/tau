import { createContext, createElement, useContext, useState, useSyncExternalStore } from 'react';
import {
  idleWaitTiming,
  indicatorDelayMilliseconds,
  indicatorMinimumMilliseconds,
  settledTiming,
  slowWaitMilliseconds,
  waitingTiming,
} from '#utils/wait-timing.js';
import type { ReactNode } from 'react';
import type { WaitIndicatorTiming } from '#utils/wait-timing.js';

/**
 * The clock a wait is measured on: `now()` returns milliseconds on the page's performance timeline, where 0 is the
 * navigation start. It is read when a wait starts or ends, never polled; the indicator's own CSS animation does the
 * waiting.
 *
 * `animationNow()`, when given, is the time on the same timeline that a CSS animation started now counts its delay
 * from. In a browser that is the document timeline's current time: it holds still through a task while
 * `performance.now()` runs on, so after a long task a delay measured from `now()` would end early by the task's length.
 * The indicator's delays are measured from it. Clocks without it (tests, hosts with their own clock) use `now()`. Both
 * must read the same timeline: a reveal's paint is read as the later of the two.
 *
 * @public
 */
export type WaitClock = Readonly<{ now: () => number; animationNow?: () => number }>;

/**
 * The document timeline's current time, or the performance clock where the page has no active timeline.
 *
 * @returns Milliseconds on the performance timeline.
 */
function documentTimelineNow(): number {
  if (typeof document === 'undefined' || !('timeline' in document)) {
    return performance.now();
  }
  const time = document.timeline.currentTime;
  return typeof time === 'number' ? time : performance.now();
}

const performanceClock: WaitClock = { now: () => performance.now(), animationNow: documentTimelineNow };

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

/**
 * The clock waits are measured on here: the nearest {@link WaitClockProvider}'s, or the performance timeline. For a
 * region that records when its own wait started (a gesture, a Retry) on the same clock its indicator reads.
 *
 * @returns The provider's clock, or one that reads `performance.now()`.
 * @public
 *
 * @example <caption>Record a Retry's time on the wait clock</caption>
 * ```typescript
 * import { useWaitClockSource } from '@taucad/ui/hooks/use-wait-clock';
 *
 * export const useRetryTime = (): (() => number) => {
 *   const clock = useWaitClockSource();
 *   return () => clock.now();
 * };
 * ```
 */
export function useWaitClockSource(): WaitClock {
  return useContext(waitClockContext);
}

const subscribeToNothing = (): (() => void) => () => undefined;
const isClient = (): boolean => true;
const isServer = (): boolean => false;

/**
 * One wait as the hook tracks it. `shownAt` is when its indicator became, or becomes, visible, measured from
 * `startedAt`: the delay, the activation time for a region that activates after the delay, or a negative time for a
 * wait that took over an indicator already showing. Once the reveal is seen (`isRevealSeen`), it is the frame the
 * reveal painted in, which a long task can make later than predicted. `isHoldPending` marks a hold that draws words no
 * frame drew while the wait ran; its first frame reports itself as the reveal.
 */
type TrackedWait = Readonly<{
  active: boolean;
  startedAt: number;
  shownAt: number;
  isRevealSeen: boolean;
  isHoldPending: boolean;
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
  /**
   * Call when the indicator's reveal animation starts (its `animationstart`), which is the frame its words first show
   * in, so the minimum is served from that frame. A long task can paint the reveal later than the delay; a minimum
   * counted from the delay would then end early. Call it synchronously with the event (`flushSync`), so a wait that
   * settles in the next task already counts from it.
   */
  revealed: () => void;
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
  /* Every delay this hook writes is a CSS animation delay, so it is measured from the time that animation counts from. */
  const readNow = (): number => (clock.animationNow === undefined ? clock.now() : clock.animationNow());
  const [tracked, setTracked] = useState<TrackedWait>(() => {
    const now = hasClientClock ? readNow() : undefined;
    return {
      active,
      startedAt,
      shownAt: shownAtFor(startedAt, now),
      isRevealSeen: false,
      isHoldPending: false,
      wait: 0,
      timing: active ? waitingTiming(now === undefined ? { startedAt } : { startedAt, now }) : idleWaitTiming(),
    };
  });

  const revealed = (): void => {
    /* The event runs in the frame the reveal starts in, just before it paints. After a long task that frame can
       carry a time from before the task, so the timeline reads early there; the performance clock reads the paint. */
    const revealedAt = Math.max(readNow(), clock.now());
    setTracked((previous) =>
      (previous.active || previous.isHoldPending) && !previous.isRevealSeen
        ? {
            ...previous,
            isRevealSeen: true,
            isHoldPending: false,
            shownAt: Math.max(previous.shownAt, revealedAt - previous.startedAt),
          }
        : previous,
    );
  };

  // While no wait runs, `startedAt` means nothing: a consumer that moves it after the wait ends must not cut a hold.
  if (tracked.active === active && (!active || Object.is(tracked.startedAt, startedAt))) {
    return { timing: tracked.timing, wait: tracked.wait, revealed };
  }

  // A wait started or ended: read the clock once, as React's "information from previous renders" pattern.
  const now = readNow();
  let next: TrackedWait;
  if (active) {
    // A new wait that replaces an indicator still owing its minimum keeps it on screen until that minimum is served.
    const isShowing = owesMinimum(tracked, now);
    next = {
      active,
      startedAt,
      shownAt: isShowing ? tracked.startedAt + tracked.shownAt - startedAt : shownAtFor(startedAt, now),
      /* A wait that takes over a showing indicator keeps its reveal only if a frame drew it: its new element's
         entrance is not a reveal. If none had, the first frame that draws the words still starts the minimum. */
      isRevealSeen: isShowing && tracked.isRevealSeen,
      isHoldPending: false,
      wait: tracked.wait + 1,
      timing: waitingTiming({ startedAt, now, isShowing }),
    };
  } else {
    const elapsed = now - tracked.startedAt;
    /* Where frames report the reveal, a reveal due but not reported has not been drawn. A visible page draws it in the
       hold's next frame, which serves the minimum from then, but only while that minimum is still owed; a hidden page,
       or one past the minimum, never shows the words. The timeline holds still through the task, and the words paint
       after it, no earlier than the performance clock. A reveal that ran before hydration was drawn but not reported;
       it holds from now too, past its minimum at most. */
    const isUnreported = reportsReveals(clock) && !tracked.isRevealSeen && elapsed >= tracked.shownAt;
    const paintElapsed = Math.max(elapsed, clock.now() - tracked.startedAt);
    const isUndrawn = isUnreported && isVisible() && paintElapsed < tracked.shownAt + indicatorMinimumMilliseconds;
    const shownAt = isUndrawn ? paintElapsed : tracked.shownAt;
    next = {
      ...tracked,
      active,
      shownAt,
      /* The hold draws the words; its first frame reports itself through `revealed`, and moves `shownAt` to it. */
      isHoldPending: isUndrawn,
      /* A seen reveal is on screen, even where the timeline still reads before the paint the reveal recorded. */
      timing:
        isUnreported && !isUndrawn
          ? idleWaitTiming()
          : heldWords(
              settledTiming({
                settledAt: Math.max(elapsed, tracked.isRevealSeen || isUndrawn ? shownAt : Number.NEGATIVE_INFINITY),
                shownAt,
              }),
              elapsed,
            ),
    };
  }
  setTracked(next);
  return { timing: next.timing, wait: next.wait, revealed };
}

/**
 * Whether the frames that draw a reveal report it to `revealed`: on the page's own clock, where the document runs
 * animations. Injected clocks and documents without a timeline (jsdom) see no frames, and keep the predicted reveal.
 *
 * @param clock - The clock the wait is measured on.
 * @returns True when an unreported reveal has not been drawn.
 */
function reportsReveals(clock: WaitClock): boolean {
  return clock === performanceClock && typeof document !== 'undefined' && 'timeline' in document;
}

/**
 * Whether the page draws frames now. A hidden page draws none until it shows again.
 *
 * @returns True when the document is visible.
 */
function isVisible(): boolean {
  return document.visibilityState === 'visible';
}

/**
 * A hold's words: the slow words only if the wait ended after the slow mark on the timeline that swapped them, not
 * after a reveal the performance clock read later.
 *
 * @param timing - The settled timing.
 * @param settledAt - When the wait ended on the timeline, measured from its start. Milliseconds.
 * @returns The timing, with the slow words decided by `settledAt`.
 */
function heldWords(timing: WaitIndicatorTiming, settledAt: number): WaitIndicatorTiming {
  return timing.state === 'holding' ? { ...timing, isSlow: settledAt >= slowWaitMilliseconds } : timing;
}

/**
 * When an indicator activated at `now` becomes visible, measured from its wait's start.
 *
 * @param startedAt - The wait's start on the performance timeline. Milliseconds.
 * @param now - The activation time on the same timeline, or undefined before hydration. Milliseconds.
 * @returns The delay, or the activation time for a region that activates after it. Milliseconds.
 */
function shownAtFor(startedAt: number, now: number | undefined): number {
  return now === undefined ? indicatorDelayMilliseconds : Math.max(indicatorDelayMilliseconds, now - startedAt);
}

/**
 * Whether the tracked indicator is on screen at `now` and has not yet served its minimum. A seen reveal is on screen
 * even where `now` still reads before the paint it recorded.
 *
 * @param tracked - The wait as tracked so far.
 * @param now - The current time on the performance timeline. Milliseconds.
 * @returns True while hiding it would cut its minimum short.
 */
function owesMinimum(tracked: TrackedWait, now: number): boolean {
  const elapsed = now - tracked.startedAt;
  return (
    tracked.timing.state !== 'idle' &&
    (tracked.isRevealSeen || tracked.isHoldPending || elapsed >= tracked.shownAt) &&
    elapsed < tracked.shownAt + indicatorMinimumMilliseconds
  );
}
