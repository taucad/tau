import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import { useWaitClockSource } from '@taucad/ui/hooks/use-wait-clock';
import { slowWaitMilliseconds } from '@taucad/ui/utils/wait-timing';
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

/**
 * The project open the regions under a workspace frame wait in (Progressive Loading Policy rules 16 and 17): when it
 * started on the wait clock, and whether the workspace has been revealed yet.
 *
 * @public
 */
export type OpenWait = Readonly<{
  /** The open's start on the wait clock: navigation start for the document's own open, the click for a later one. */
  startedAt: number;
  /** Whether the live workspace has replaced the frame's lanes. */
  isRevealed: boolean;
}>;

/**
 * The open the regions below wait in. The workspace frame provides it; the live layouts mark it revealed. Absent
 * outside a project route.
 *
 * @public
 */
export const openWaitContext = createContext<OpenWait | undefined>(undefined);

/**
 * Whether a wait that starts now belongs to the project open: before the workspace is revealed always, and after it
 * until the open's slow mark (10 s from its start). A person's click that opened the project still counts as active for a
 * few seconds (`navigator.userActivation`), so a gesture cannot tell a pane the open restored from one a person
 * opened; the open's own slow mark bounds the group instead, as it bounds every other part of the open's wait.
 *
 * @param open - The open, if any.
 * @param start - The wait's own start.
 * @returns `true` when the wait counts on the open's clock.
 */
export const isInOpen = (open: OpenWait | undefined, start: Pick<WaitStart, 'startedAt'>): boolean =>
  open !== undefined && (!open.isRevealed || start.startedAt - open.startedAt < slowWaitMilliseconds);

/**
 * When a region's wait started, counted on the project open's clock when the wait is the open's own: the region's
 * first wait, running as it mounts, while the workspace is still being revealed or before the open's slow mark. A region
 * that takes over another's bars (a lane of the frame, a pane's chunk) then draws them at once rather than 300 ms
 * later, so one wait has one clock however many mounts draw it. Every later wait, and a first wait that starts after
 * the open's slow mark (a pane opened later), counts from its own start, as {@link useWaitStart} does.
 *
 * @param active - Whether the region is waiting now.
 * @returns The current wait's start, whether a gesture started it, and a restart for Retry.
 * @public
 */
export function useOpenWaitStart(active: boolean): WaitStart {
  const open = useContext(openWaitContext);
  const own = useWaitStart(active);
  const [isOpenWait, setIsOpenWait] = useState(() => active && isInOpen(open, own));
  if (isOpenWait && !active) {
    setIsOpenWait(false);
  }
  if (!isOpenWait || open === undefined) {
    return own;
  }
  return {
    startedAt: Math.min(open.startedAt, own.startedAt),
    isGesture: false,
    restart: () => {
      setIsOpenWait(false);
      own.restart();
    },
  };
}
