import { useState, useSyncExternalStore } from 'react';
import { useWaitClockSource } from '@taucad/ui/hooks/use-wait-clock';
import type { WaitClock } from '@taucad/ui/hooks/use-wait-clock';

/**
 * When a region's current wait started, for `WaitIndicator`'s `startedAt` and `live`.
 *
 * @public
 */
export type WaitStart = Readonly<{
  /** The wait's start on the wait clock's timeline. Milliseconds. */
  startedAt: number;
  /**
   * Whether a person's gesture started the wait, so it is its own announcement group and its indicator may be live.
   * A wait that is part of the route open, or that nobody asked for, is seen but not announced.
   */
  isGesture: boolean;
  /**
   * Starts the wait again now, as a Retry does, and marks it a gesture's: a Retry is pressed, so the new wait is its own
   * announcement group even when the first one (a restored pane) was not. Call it from the Retry's handler.
   */
  restart: () => void;
}>;

type TrackedStart = Readonly<{ active: boolean; startedAt: number; isGesture: boolean }>;

const subscribeToNothing = (): (() => void) => () => undefined;
const isClient = (): boolean => true;
const isServer = (): boolean => false;

/**
 * Where a wait that starts now begins, and whether a person started it.
 *
 * - On the server and in the hydration pass the region is in the document the route opened with, whose clock starts
 *   at navigation (0).
 * - Every other wait starts now, however the page got there, so its indicator never reveals early.
 * - `navigator.userActivation.isActive` holds for a few seconds after a click or key press, so a wait that starts
 *   with it was started by that gesture and is its own announcement group. A wait nobody asked for (a restored or
 *   agent-opened pane, a reconnect, a browser without user activation) is seen but not announced.
 *
 * @param input - The wait clock, and whether the page runs script yet.
 * @returns The wait's start and whether a gesture started it.
 */
function startNow(input: { clock: WaitClock; isOnClient: boolean }): { startedAt: number; isGesture: boolean } {
  if (!input.isOnClient) {
    return { startedAt: 0, isGesture: false };
  }
  const { navigator } = globalThis;
  const activation = 'userActivation' in navigator ? navigator.userActivation : undefined;
  return { startedAt: input.clock.now(), isGesture: activation?.isActive ?? false };
}

/**
 * Track when a region's wait starts: a new start each time `active` turns on, read from the injected wait clock in
 * render with React's "information from previous renders" pattern (no effect, no timer), so a later wait in the same
 * mount (a branch switch, a reconnect) is timed from its own start and does not reveal its indicator at once.
 *
 * @param active - Whether the region is waiting now.
 * @returns The current wait's start, whether a gesture started it, and a restart for Retry.
 * @public
 */
export function useWaitStart(active: boolean): WaitStart {
  const clock = useWaitClockSource();
  const isOnClient = useSyncExternalStore(subscribeToNothing, isClient, isServer);
  const [tracked, setTracked] = useState<TrackedStart>(() => ({
    active,
    ...startNow({ clock, isOnClient }),
  }));
  let current = tracked;
  if (tracked.active !== active) {
    current = active ? { active, ...startNow({ clock, isOnClient }) } : { ...tracked, active };
    setTracked(current);
  }
  return {
    startedAt: current.startedAt,
    isGesture: current.isGesture,
    restart: () => {
      const startedAt = clock.now();
      setTracked((previous) => ({ ...previous, startedAt, isGesture: true }));
    },
  };
}
