/**
 * Shared XState test utilities.
 *
 * These mirror the effect lifecycle of `@xstate/react` 7's `useActorRef`
 * (`useActorLifecycle`) so unit tests can reproduce what React does to an
 * actor without rendering. The binding no longer stops and rehydrates an actor
 * across a Strict Mode double-mount: the effect cleanup queues the stop in a
 * microtask and the re-run cancels it, so the actor never stops. A real
 * unmount lets the stop run, and a later mount replaces the stopped actor
 * with a fresh one because a stopped actor cannot be restarted.
 *
 * @see https://github.com/statelyai/xstate/blob/main/packages/xstate-react/src/useActorRef.ts
 */
import type { Actor, AnyActorLogic } from 'xstate';

type PendingStop = { cancel(): void };

/** The effect cleanup: stop the actor at the next microtask unless a re-mount cancels it first. */
const scheduleStop = (actor: Actor<AnyActorLogic>): PendingStop => {
  let canceled = false;
  queueMicrotask(() => {
    if (!canceled) {
      actor.stop();
    }
  });
  return {
    cancel() {
      canceled = true;
    },
  };
};

/**
 * React Strict Mode's synchronous unmount/re-mount of one actor's effect.
 *
 * The cleanup's stop is cancelled by the effect re-running before the
 * microtask, so the actor keeps running in the state it was in.
 */
export function strictModeRemount(actor: Actor<AnyActorLogic>): void {
  const pending = scheduleStop(actor);
  pending.cancel();
  actor.start();
}

/**
 * A real unmount followed by a later mount of the same component.
 *
 * The stop runs; the next mount finds the actor stopped and replaces it,
 * which is the actor the caller must use from then on.
 */
export async function unmountAndRemount<TLogic extends AnyActorLogic>(
  actor: Actor<TLogic>,
  createReplacement: () => Actor<TLogic>,
): Promise<Actor<TLogic>> {
  scheduleStop(actor);
  await Promise.resolve();
  const replacement = createReplacement();
  replacement.start();
  return replacement;
}

/** What a fake actor's `subscribe` receives: `@xstate/react` 7 passes an observer, older callers a function. */
export type SnapshotListener<TSnapshot> =
  | ((snapshot: TSnapshot) => void)
  | Readonly<{ next?: (snapshot: TSnapshot) => void }>;

/**
 * Normalises a fake actor's subscriber to a callback, as `Actor.subscribe` does.
 *
 * @param listener - The function or observer handed to `subscribe`.
 * @returns A callback that delivers one snapshot.
 */
export const toSnapshotCallback =
  <TSnapshot>(listener: SnapshotListener<TSnapshot>): ((snapshot: TSnapshot) => void) =>
  (snapshot) => {
    if (typeof listener === 'function') {
      listener(snapshot);
    } else {
      listener.next?.(snapshot);
    }
  };
