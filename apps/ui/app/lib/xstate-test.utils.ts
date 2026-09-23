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
import { vi } from 'vitest';
import type { Mock } from 'vitest';
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
export async function unmountAndRemount<Logic extends AnyActorLogic>(
  actor: Actor<Logic>,
  createReplacement: () => Actor<Logic>,
): Promise<Actor<Logic>> {
  scheduleStop(actor);
  await Promise.resolve();
  const replacement = createReplacement();
  replacement.start();
  return replacement;
}

/** What a fake actor's `subscribe` receives: `@xstate/react` 7 passes an observer, older callers a function. */
export type SnapshotListener<SnapshotValue> =
  | ((snapshot: SnapshotValue) => void)
  | Readonly<{ next?: (snapshot: SnapshotValue) => void }>;

/**
 * Normalises a fake actor's subscriber to a callback, as `Actor.subscribe` does.
 *
 * @param listener - The function or observer handed to `subscribe`.
 * @returns A callback that delivers one snapshot.
 */
export const toSnapshotCallback =
  <SnapshotValue>(listener: SnapshotListener<SnapshotValue>): ((snapshot: SnapshotValue) => void) =>
  (snapshot) => {
    if (typeof listener === 'function') {
      listener(snapshot);
    } else {
      listener.next?.(snapshot);
    }
  };

/**
 * Spies on an actor's `send`, calling through unless an implementation replaces it.
 *
 * XState v6 exposes `send` as a bound prototype getter, so a method spy cannot
 * replace it; this shadows the getter on the one instance, which is all a test holds.
 *
 * @param actor - The actor whose sends are observed.
 * @param implementation - Replaces the actor's own `send` when given.
 * @returns The spy every `actor.send` now reaches.
 */
export const spyOnSend = <SendFunction extends (event: never) => void>(
  actor: { readonly send: SendFunction },
  implementation?: SendFunction,
): Mock<SendFunction> => {
  const spy = vi.fn(implementation ?? actor.send);
  Object.defineProperty(actor, 'send', { configurable: true, get: () => spy });
  return spy;
};
