import { createEventObservableLogic } from 'xstate';
import type { AnyStateMachine, EventObject, NonReducibleUnknown, StateMachine, Subscribable, TypeSchema } from 'xstate';

// ---------------------------------------------------------------------------
// fromSafeAsync — async actors that never deliver after they are stopped
// ---------------------------------------------------------------------------

type SafeSubscriber<T> = {
  next: (value: T) => void;
  error: (error: unknown) => void;
  complete: () => void;
};

/**
 * Wraps an executor function in an Observable-compatible `Subscribable` with a
 * `closed` guard and `AbortController` teardown. On `unsubscribe()`, the guard
 * prevents any further emissions and the AbortController cancels in-flight work.
 *
 * Internal helper — not exported.
 */
function createSafeSubscribable<T>(
  executor: (subscriber: SafeSubscriber<T>, signal: AbortSignal) => void,
): Subscribable<T> {
  return {
    subscribe(observerOrFunction) {
      const observer = typeof observerOrFunction === 'function' ? { next: observerOrFunction } : observerOrFunction;
      let closed = false;
      const controller = new AbortController();

      const subscriber: SafeSubscriber<T> = {
        next: (value) => {
          if (!closed) {
            observer.next?.(value);
          }
        },
        error: (error) => {
          if (!closed) {
            closed = true;
            observer.error?.(error);
          }
        },
        complete: () => {
          if (!closed) {
            closed = true;
            observer.complete?.();
          }
        },
      };

      executor(subscriber, controller.signal);

      return {
        unsubscribe() {
          if (!closed) {
            closed = true;
            controller.abort();
          }
        },
      };
    },
  };
}

/**
 * The UI's async actor: one-shot work whose result reaches the parent as an event,
 * and never reaches it once the invocation has been stopped.
 *
 * ## Generic parameters — `fromSafeAsync<TReturn, TInput>`
 *
 * Specify both generic parameters explicitly to type `input` and the return value:
 *
 * ```typescript
 * type LoadedEvent = { type: 'loaded'; data: string };
 * type LoadInput = { url: string };
 *
 * const loadActor = fromSafeAsync<LoadedEvent, LoadInput>(async ({ input, signal }) => {
 *   const data = await fetchData(input.url, { signal }); // input: LoadInput
 *   return { type: 'loaded', data };                       // return: LoadedEvent
 * });
 * ```
 *
 * **Fire-and-forget** (void return, with input):
 * ```typescript
 * const writeActor = fromSafeAsync<void, { data: string }>(async ({ input }) => {
 *   await saveData(input.data);
 * });
 * ```
 *
 * **No input** (void return, no input):
 * ```typescript
 * const sideEffect = fromSafeAsync(async () => {
 *   await doWork();
 * });
 * ```
 *
 * ## How it works
 *
 * The returned event object is sent to the parent machine's `on:` handlers;
 * `onDone` fires as a pure lifecycle signal (no data). The work runs inside
 * event-observable logic (`createEventObservableLogic`) with three layers:
 *
 * 1. **`closed` guard** — silences emissions after unsubscribe (`next`/`error`/`complete`)
 * 2. **`AbortController` teardown** — aborts the signal on unsubscribe, cancelling in-flight work
 * 3. **Observable unsubscribe contract** — XState unsubscribes when the invoking state exits
 *    or the actor stops, so a stopped invocation's late result is never relayed
 *
 * ## Why an observable
 *
 * A Promise's `.then()` is irrevocable; a subscription can be severed. Under
 * XState v5 the React binding stopped and rehydrated actors in Strict Mode, and
 * a promise actor's late settlement could reach the rehydrated machine.
 * `@xstate/react` 7 no longer does that (a Strict Mode re-mount cancels its own
 * stop), but a stopped invocation must still never deliver — after a real
 * unmount, a state exit or a `reenter` — and the signal gives the work a way to
 * stop early.
 *
 * ## TypeScript limitations
 *
 * TypeScript does not support partial type argument inference (as of TS 6.0).
 * Specify both `TReturn` and `TInput` to type the input. For actors that need no
 * input, omit both generics and let inference handle the return type. A provided
 * override is typed by checking the actors map with
 * `satisfies Partial<MachineActors<typeof machine>>`.
 *
 * See `docs/policy/xstate-policy.md` and `docs/policy/typescript-policy.md`.
 */
// oxlint-disable-next-line typescript/explicit-module-boundary-types -- allowing type inference for the function return type
export function fromSafeAsync<
  // eslint-disable-next-line @typescript-eslint/naming-convention -- following XState convention for generic type parameters
  const TReturn extends EventObject | void = void,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- following XState convention for generic type parameters
  TInput extends NonReducibleUnknown = NonReducibleUnknown,
>(work: (args: { input: TInput; signal: AbortSignal }) => Promise<TReturn>) {
  return createEventObservableLogic<TReturn & EventObject, TInput>(({ input }) =>
    createSafeSubscribable<TReturn & EventObject>((subscriber, signal) => {
      // async-iife: bootstrap — Observable executor cannot be async; bridge work() into subscriber
      void (async (): Promise<void> => {
        try {
          const result = await work({ input, signal });
          if (result !== undefined) {
            // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- safe: void case excluded by undefined check
            subscriber.next(result as TReturn & EventObject);
          }
          subscriber.complete();
        } catch (error) {
          if (!signal.aborted) {
            subscriber.error(error);
          }
        }
      })();
    }),
  );
}

// ---------------------------------------------------------------------------
// Machine schema helpers
// ---------------------------------------------------------------------------

/** An event's payload; distributes so an event whose payload is itself a union keeps every member. */
type EventPayload<TEvent> = TEvent extends unknown ? Omit<TEvent, 'type'> : never;

/** The `schemas.events` or `schemas.emitted` map for a union of `{ type }` events. */
export type EventSchemaMap<TEvent extends { readonly type: string }> = {
  [K in TEvent['type']]: TypeSchema<EventPayload<Extract<TEvent, { readonly type: K }>>>;
};

/**
 * Declares a machine's events (or emitted events) from its exported union, for type inference only.
 *
 * The union stays the single source of truth; XState reads schema values at runtime only when a
 * `validator` is configured or the machine is serialized, and Tau does neither.
 *
 * @returns An empty object typed as the schema map.
 */
export const eventSchemas = <TEvent extends { readonly type: string }>(): EventSchemaMap<TEvent> =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- type-only schema map, never validated.
  ({}) as EventSchemaMap<TEvent>;

/**
 * The actor source map a machine was set up with, as `machine.provide({ actors })` accepts it.
 *
 * `Parameters<typeof machine.provide>[0]['actors']` resolves to `undefined` slots, so composition roots
 * read the map from the machine type instead.
 */
/* oxlint-disable typescript/no-explicit-any -- positional inference over StateMachine's parameters. */
export type MachineActors<TMachine extends AnyStateMachine> =
  TMachine extends StateMachine<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer TActorMap,
    any,
    any,
    any,
    any
  >
    ? { [K in keyof TActorMap]: TActorMap[K] }
    : never;
/* oxlint-enable typescript/no-explicit-any */

const runtimeString = (ref: Subscribable<unknown>, field: 'id' | 'sessionId'): string => {
  const value: unknown = Reflect.get(ref, field);
  if (typeof value !== 'string') {
    throw new TypeError(`Expected an actor reference with a ${field}`);
  }
  return value;
};

/**
 * The id an actor was spawned or invoked under.
 *
 * XState v6 moved `id` and `sessionId` from `ActorRef` to the runtime half of
 * an actor (`ActorRuntime`), so `ActorRefFrom<…>`, `AnyActorRef` and the
 * `self` a state-level transition receives no longer declare them, though
 * every running actor carries both.
 *
 * @param ref - A spawned, invoked or self actor reference.
 * @returns The actor's id relative to its parent.
 */
export const actorIdOf = (ref: Subscribable<unknown>): string => runtimeString(ref, 'id');

/**
 * The globally unique id of one actor instance: a replacement actor under the
 * same id gets a new one, which is what makes it a render key.
 *
 * @param ref - A spawned, invoked or created actor reference.
 * @returns The actor's session id.
 */
export const actorSessionIdOf = (ref: Subscribable<unknown>): string => runtimeString(ref, 'sessionId');
