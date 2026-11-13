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
  /** Starts the wait again now, as a Retry does. Call it from the Retry's handler. */
  restart: () => void;
}>;

type TrackedStart = Readonly<{ active: boolean; waits: number; startedAt: number; isGesture: boolean }>;

const subscribeToNothing = (): (() => void) => () => undefined;
const isClient = (): boolean => true;
const isServer = (): boolean => false;

/**
 * Where a wait that starts now begins, and whether a person started it.
 *
 * - On the server and in the hydration pass the region is in the document the route opened with: navigation (0).
 * - `navigator.userActivation.isActive` holds for a few seconds after a click or key press, so a wait that starts
 *   with it was started by that gesture: now, and its own announcement group.
 * - With no input since navigation (`hasBeenActive` false) the route is still opening on its own, as when the layout
 *   restores its panes; a region's first wait then belongs to the open: navigation (0). A later wait in the same mount
 *   starts now, so it never reveals early.
 * - Otherwise (an agent opened it, a reconnect, or a browser without user activation): now, not announced.
 *
 * @param input - The wait clock, whether the page runs script yet, and whether this is the region's first wait.
 * @returns The wait's start and whether a gesture started it.
 */
function startNow(input: { clock: WaitClock; isOnClient: boolean; isFirstWait: boolean }): {
  startedAt: number;
  isGesture: boolean;
} {
  if (!input.isOnClient) {
    return { startedAt: 0, isGesture: false };
  }
  const { navigator } = globalThis;
  const activation = 'userActivation' in navigator ? navigator.userActivation : undefined;
  if (activation?.isActive) {
    return { startedAt: input.clock.now(), isGesture: true };
  }
  if (activation !== undefined && !activation.hasBeenActive && input.isFirstWait) {
    return { startedAt: 0, isGesture: false };
  }
  return { startedAt: input.clock.now(), isGesture: false };
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
    waits: active ? 1 : 0,
    ...startNow({ clock, isOnClient, isFirstWait: true }),
  }));
  let current = tracked;
  if (tracked.active !== active) {
    current = active
      ? { active, waits: tracked.waits + 1, ...startNow({ clock, isOnClient, isFirstWait: tracked.waits === 0 }) }
      : { ...tracked, active };
    setTracked(current);
  }
  return {
    startedAt: current.startedAt,
    isGesture: current.isGesture,
    restart: () => {
      const startedAt = clock.now();
      setTracked((previous) => ({ ...previous, startedAt }));
    },
  };
}
