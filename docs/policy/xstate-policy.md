---
title: 'XState Policy'
description: 'State machine design, actor lifecycle, and React integration using XState v6. setup() schemas, transition functions, enqueue effects, invoke/spawn, useActorRef, cleanup patterns.'
status: active
created: '2026-03-04'
updated: '2026-09-23'
related:
  - docs/research/xstate-patterns.md
  - docs/research/xstate-v6-migration-blueprint.md
  - docs/policy/typescript-policy.md
  - docs/research/typescript-overloads.md
---

# XState Policy

Internal reference for state machine design in Tau. Standard patterns for machine definition, actor lifecycle, and React integration using XState v6 (`xstate` `6.0.0-alpha.59`, `@xstate/react` `7.0.0-alpha.3`, pinned in the pnpm catalog).

## Rationale

XState provides structured state management with automatic actor lifecycle and cleanup. v6 replaces named action objects with **transition functions**: a transition computes its target and a context patch from `(args, enq)`, and every side effect goes through the `enq` queue. Consistent use of that shape keeps transitions pure and ordered, keeps async work in invoked actors, and keeps UI components simple and testable.

## Machine Definition

Keep each machine in its owning `.machine.ts` file, with its context, event, input and emitted types declared before the machine. Export the machine. Consumers that only send and select take `ActorRefFrom<typeof machine>`; owners that start or stop an actor hold `Actor<typeof machine>` (K-11 — `ActorRef` has no `start`, `stop`, `id` or `sessionId`).

### Use `setup({ schemas })` for all machine definitions

Declare types through `schemas`. `types<T>()` is a type-only schema for context, input, output, tags and children; events and emitted events are a map from event type to payload schema, built from the event union with `eventSchemas<TUnion>()` (`#lib/xstate.lib.js` in the UI, `machine-schemas.ts` in each package):

```typescript
import { setup, types } from 'xstate';
import { eventSchemas } from '#lib/xstate.lib.js';

export const myMachine = setup({
  schemas: {
    context: types<MyContext>(),
    events: eventSchemas<MyEvent>(),
    emitted: eventSchemas<MyEmitted>(),
    input: types<MyInput>(),
  },
  actors: myActors,
  delays: { debounce: 500 },
}).createMachine({
  id: 'my-machine',
  context: ({ input }) => ({
    /* ... */
  }),
  initial: 'idle',
  states: {
    /* ... */
  },
});
```

`eventSchemas` omits `type` distributively, so an event whose payload is itself a union keeps every member (T19). Invoked children read through selectors are declared in `schemas.children` — v6 no longer infers them from invoke ids (T15). Tags are `schemas.tags: types<Tag>()` and a state's `tags` is always an array (K-15).

### Name composed machine types

v6 machine types carry their full config and their children's types, so a published machine that composes other machines overflows declaration emit (TS7056). `nx typecheck` runs with `--declaration false` and does not see it; the package `build` does. Every publishable machine exports a named interface that declarations reference by name (K-17):

```typescript
const checkoutMachineDefinition = setup({
  /* ... */
}).createMachine({
  /* ... */
});

type CheckoutMachineDefinition = typeof checkoutMachineDefinition;

/** @public */
export interface CheckoutMachine extends CheckoutMachineDefinition {}

/** @public */
export const checkoutMachine: CheckoutMachine = checkoutMachineDefinition;
```

### Machine naming

- **Machine ID**: `kebab-case` (e.g., `'file-manager'`, `'kernel'`, `'project'`)
- **States**: Nouns or adjectives (`idle`, `loading`, `ready`, `error`, `rendering`, `exporting`)
- **Events**: `camelCase` verbs (e.g., `createGeometry`, `loadProject`, `setParameters`)
- **Helpers**: `camelCase` verb phrases for patch/effect helpers (`destroyKernel`, `recordFailure`); predicates read as questions (`isRootChanged`, `hasValidRepo`)

Emitted events describe completed outcomes (`fileCreated`, `buildCompleted`). Active state names describe ongoing work; stable states name their outcome. Existing application actors use `Actor` for one-shot work and `Listener` for callbacks; preserve a domain's established driver naming where it conveys the actual role.

---

## Transitions

### Static transitions and context mappers

A transition that only moves and patches is a static object. `context` is a patch or a mapper returning a patch; unspecified fields keep their values:

```typescript
on: {
  reset: { target: 'idle', context: { error: undefined } },
  setName: { context: ({ event }) => ({ name: event.name }) },
}
```

Static `context` mappers may be evaluated more than once per event (S14): they must be pure. Anything with an effect is a transition function.

### Transition functions

A transition function returns `{ target?, context?, reenter? }` when it handles the event, `{}` when it handles it with no change, and `undefined` when it does not — which lets the event fall through to an ancestor, exactly as a failing guard did:

```typescript
on: {
  requestTurn: ({ context, event }, enq) => {
    if (context.turn !== undefined) {
      return undefined; // not handled here; the parent's handler runs
    }
    enq.emit({ type: 'statusChanged', chatId: context.chatId });
    return { target: '.queued.admitting', reenter: true, context: { pendingGesture: event.gesture } };
  },
}
```

- **Guards are branches.** Inline the predicate. Keep a named guard in `setup({ guards })` only when a host or test `.provide()`s it (K-16), and call it as `guards.name(…)` from the transition.
- **Compose patches in order.** v5 actions ran left to right and each `assign` saw the previous one's result; a transition function computes the same thing explicitly: `const next = { ...context, ...patchA }` before deriving `patchB` from `next`.
- **Pre-exit context.** A transition function reads the context from before any exit it causes; exit patches apply before the transition patch (S12). Do not repeat in a transition what the source state's (or root's) `exit` already does — a root-level `reenter` re-runs the root `exit`.
- **Parallel regions.** Every region's transition for one event reads the pre-event context (S15), so a sibling region's patch never changes another region's decision.
- **Matching another region.** Use `matchesState(value, args.value)` where v5 used `stateIn`.

### The `enq` queue

Everything that is not the returned target or patch goes through `enq`, in the order it must happen:

| v5                                 | v6                                                      |
| ---------------------------------- | ------------------------------------------------------- |
| `emit(…)`                          | `enq.emit(event)`                                       |
| `sendTo(ref, …)` / `sendParent(…)` | `enq.sendTo(ref, event)` (pass the parent ref by input) |
| `raise(…)`                         | `enq.raise(event)`                                      |
| `spawnChild` / `spawn` in `assign` | `const ref = enq.spawn('src', { id, input })`           |
| `stopChild(ref)`                   | `enq.stop(ref)`                                         |
| `log`, custom action body          | `enq(() => { /* effect */ })`                           |

`enq(fn)` effects run after the transition is taken; capture the values they need from `context` first. Never perform an effect directly in a transition body or a context mapper — it would run on evaluation, not on the transition.

`entry` and `exit` take the same `(args, enq)` shape and may return `{ context }`. Helper functions that take `enq` type it as `EnqueueObject<TEvent, TEmitted, SystemRegistry, typeof actors>` so `enq.spawn` knows the actor map.

### Never mutate context directly

Context changes only through returned patches. Direct mutation bypasses snapshots, devtools and `@xstate/react` change detection. For nested updates use Immer's `produce` on the field being replaced and return it as the patch.

### Use states, not boolean flags

Model distinct operational modes as states rather than boolean context flags:

```typescript
// INCORRECT: boolean flags in context
context: { isLoading: false, hasError: false, data: null }

// CORRECT: discrete states
states: {
  idle: {},
  loading: {
    invoke: { src: 'fetchData', onDone: { target: 'success' }, onError: { target: 'error' } },
  },
  success: {},
  error: {},
}
```

Write targets as `{ target: 'x' }`. String shorthand still runs but no longer typechecks in `onDone`, `onError`, `after` and `on` under `setup()`.

### No fire-and-forget async in transitions

Transitions are synchronous. Async work belongs in invoked actors (see [Async Operations](#async-operations)); an `enq(() => …)` effect that starts async work must not write back into the machine except by sending it an event.

---

## Actors

### When to use each actor type

| Actor                                      | Lifecycle                        | Cancellation            | Use case                                          |
| ------------------------------------------ | -------------------------------- | ----------------------- | ------------------------------------------------- |
| `invoke` with `fromSafeAsync`              | State-scoped (auto-stop on exit) | `AbortSignal`           | One-shot async in the UI                          |
| `invoke` with `createAsyncLogic({ run })`  | State-scoped (auto-stop on exit) | `AbortSignal`           | One-shot async in packages and hosts              |
| `invoke` with `createCallbackLogic`        | State-scoped (auto-stop on exit) | Cleanup function return | Long-running processes (event listeners, polling) |
| `invoke` with `createEventObservableLogic` | State-scoped (auto-stop on exit) | Unsubscribe             | Streaming data sources                            |
| `enq.spawn` / context-factory `spawn`      | Parent-scoped; explicit removal  | `enq.stop` for removal  | Dynamic actors needing a context reference        |

### Prefer `invoke` over `spawn` when possible

`invoke` provides automatic lifecycle management — the actor starts when the state is entered and stops when it is exited. Prefer it unless the actor must persist across states.

When a dynamic child must exist at parent startup, spawn it in the context factory. The factory's `spawn` takes **logic**, not a source name: use `spawn(actors.name, { id, input })` so `.provide({ actors })` overrides still apply (K-13). v6 starts invoked children after the parent's entry effects (S13).

When a transition must reset the current state's timer or debounce, use `reenter: true` so exit and entry actually run.

### Stop spawned actors when removing or replacing them

Stopping a parent cascades to its children. Stop a spawned child explicitly when removing or replacing it while the parent lives, and clear its ref in the same transition:

```typescript
destroyView: ({ context, event }, enq) => {
  const view = context.views.get(event.viewId);
  if (!view) {
    return {};
  }
  enq.stop(view);
  const views = new Map(context.views);
  views.delete(event.viewId);
  return { context: { views } };
},
```

### Always handle `onError` for invoked async actors

```typescript
invoke: {
  src: 'fetchData',
  onDone: { target: 'success', context: ({ event }) => ({ data: event.output }) },
  onError: ({ event }) => ({ target: 'error', context: { error: toError(event.error) } }),
}
```

The only exception is callback logic, which does not emit `onDone`/`onError`.

### Actor identity

`id` and `sessionId` live on the runtime half of an actor. Read them from a ref with `actorIdOf(ref)` / `actorSessionIdOf(ref)` (`#lib/xstate.lib.js`), including the `self` a state-level transition receives (typed `AnyActorRef`, K-14).

---

## Async Operations

### Use `fromSafeAsync` in the UI

`fromSafeAsync` (from `#lib/xstate.lib.js`) is the UI's standard async actor creator. It wraps the work in event-observable logic with a `closed` guard and `AbortController` teardown: an invocation that has been stopped never delivers its result, and its signal aborts. The returned value is delivered to the parent as an **event** (it must carry a `type`).

#### Generic parameters — `fromSafeAsync<TReturn, TInput>`

Specify both generics to type the input and return value:

```typescript
import { fromSafeAsync } from '#lib/xstate.lib.js';

type LoadedEvent = { type: 'dataLoaded'; data: Data };
type LoadInput = { id: string };

// Data-returning actor — specify both TReturn and TInput
const loadActor = fromSafeAsync<LoadedEvent, LoadInput>(async ({ input, signal }) => {
  const data = await fetchData(input.id, { signal });
  return { type: 'dataLoaded', data };
});

// Fire-and-forget actor — void return with input
const saveActor = fromSafeAsync<void, { data: Data }>(async ({ input }) => {
  await saveData(input.data);
});

// No input, no return — omit generics entirely
const sideEffect = fromSafeAsync(async () => {
  await doWork();
});
```

> **Why explicit generics?** TypeScript does not support partial type argument inference (as of TS 6.0). You must specify both `TReturn` and `TInput` when you need typed input.

**Key rules**:

1. **Do not use `as const`** on individual literal values — contextual typing preserves literal types (see `docs/policy/typescript-policy.md` Rule 6).
2. **Always use generic parameters** on placeholder actors — never inline `_: { input: ...; signal: ... }` parameter annotations or `: Promise<T>` return annotations.
3. **Never use `as never`** on `fromSafeAsync(...)` results in `provide()` calls. Fix the placeholder's generics instead.
4. **Placeholder actors must use generics for their return type** since throw-only bodies infer `Promise<never>`.

### Type provided actors against the machine

v6 `provide()` infers its argument rather than typing it from the machine (K-12), so an inline logic loses its slot's input and output types. Check the provided map against the machine's own actor map:

```typescript
import type { MachineActors } from '#lib/xstate.lib.js';

const machine = myMachine.provide({
  actors: {
    loadActor: fromSafeAsync(async ({ input }) => ({ type: 'dataLoaded', data: await load(input.id) })),
  } satisfies Partial<MachineActors<typeof myMachine>>,
});
```

Packages export their machine's actor map for hosts (`ParameterSetActors`, `ProjectRevisionsActors`, …). `provide()` rejects a slot typed `X | undefined`, so never pass a conditional spread or a `Partial` map value: choose between whole maps with a ternary, each checked with `satisfies`.

### Use `createAsyncLogic` outside the UI

```typescript
const fetchDataActor = createAsyncLogic<Data, { url: string }>({
  run: async ({ input, signal }) => {
    const response = await fetch(input.url, { signal });
    signal.throwIfAborted();
    return response.json();
  },
});
```

**Key**: use the `signal`. XState aborts it when the state exits or the machine stops. Check `signal.throwIfAborted()` after each `await`. Aborting stops cooperative work; it does not undo a write that already reached an external authority.

### Use `createCallbackLogic` for long-running processes

```typescript
const fileWatcherActor = createCallbackLogic<EventObject, WatchInput>(({ sendBack, input }) => {
  const interval = setInterval(async () => {
    const changes = await pollForChanges(input.directory);
    if (changes.length > 0) {
      sendBack({ type: 'filesChanged', changes });
    }
  }, input.intervalMs);

  // Cleanup: guaranteed to run on actor stop
  return () => {
    clearInterval(interval);
  };
});
```

Type a stored callback logic as `CallbackActorLogic<TEvent, TInput>`; `ReturnType<typeof createCallbackLogic<…>>` binds the schema overload.

---

## Cleanup and Exit

### Separate graceful close from abrupt stop

Use explicit closing states and acknowledgements when a machine must drain writes, flush state or reconcile an ambiguous external effect before shutdown. Only stop the actor after that graceful flow settles.

An abrupt root `actor.stop()` stops invoked and spawned children, so callback cleanup functions release their resources. It does **not** run the root machine's `exit` (in v5 or v6). Keep resource disposal in owning callback actors, child actors or the React resource boundary rather than a root `exit`.

### Error-isolate cleanup chains

If cleanup iterates over multiple resources, wrap each in try/catch so all resources are released even if one fails; critical cleanup (e.g. `worker.terminate()`) must always run. See [Worker Policy, Rule 5](./worker-policy.md#rule-5-error-isolated-cleanup).

### Guard against post-teardown operations

When a machine's teardown sets a `destroyed` flag, check it at every yield point of associated async work, and dispose a resource that arrives after teardown.

---

## React Integration

### Use `useActorRef` + `useSelector` (not `useMachine`)

`useMachine` re-renders on every change. Use `useActorRef` for the actor and `useSelector` with a stable selector for each value:

```typescript
function MyComponent(): React.JSX.Element {
  const actorRef = useActorRef(myMachine, { input: { /* ... */ } });
  const isLoading = useSelector(actorRef, (s) => s.matches('loading'));
  return (/* ... */);
}
```

### Actor lifecycle under `@xstate/react` 7

The effect cleanup queues `actor.stop()` in a microtask; an effect re-run for the same actor cancels it (RB1-1). So a Strict Mode double-mount never stops the actor, and a real unmount stops it one microtask later. A mount that finds its actor stopped replaces it with a fresh `createActor(machine, options)` — never a restart or a rehydrated snapshot. Tests reproduce these two paths with `strictModeRemount` and `unmountAndRemount` from `#lib/xstate-test.utils.js`; fake actors handed to `useSelector` must accept an observer (`toSnapshotCallback`).

### Input is read once at initialization

`useActorRef(machine, { input })` reads `input` only when the actor is created. To react to external changes, send events from an effect.

### Use `key` prop for identity-based remounting

When a component wraps a machine whose identity changes (e.g., a different project), key the provider by that identity so the old actor stops and a new one is created with fresh input.

### Actor propagation

Pass actor references via React context or props, not by reaching into a parent machine's context.

---

## Communication Patterns

### Parent-to-child and child-to-parent: `enq.sendTo`

Pass the parent ref through `input` rather than relying on an implicit parent. Guard refs that may be absent:

```typescript
entry: ({ context }, enq) => {
  if (context.parentRef) {
    enq.sendTo(context.parentRef, { type: 'childReady' });
  }
},
```

### Decoupled communication: `enq.emit`

Use emitted events for observers that subscribe with `actor.on(type, handler)`; the machine does not know who listens.

---

## Testing

### Test machines with `createActor`

```typescript
const actor = createActor(
  myMachine.provide({
    actors: {
      loadData: fromSafeAsync(async () => ({ type: 'dataLoaded', items: [1, 2, 3] })),
    } satisfies Partial<MachineActors<typeof myMachine>>,
  }),
  { input: { id: 'test-123' } },
);
actor.start();
actor.send({ type: 'load' });
const snapshot = await waitFor(actor, (s) => s.matches('ready'));
expect(snapshot.context.items).toHaveLength(3);
actor.stop();
```

- A test that stops an actor holds it as `Actor<…>`.
- `send` is a bound getter: spy on it with `vi.spyOn(actor, 'send', 'get').mockReturnValue(spy)`, wrapping `actor.send` to keep calling through.
- Graph paths from `xstate/graph` begin with the `@xstate.init` event (T17).
- Assert behaviour, not config shape: v6 has no named actions to find in `machine.config`.

### Test helpers in isolation

Export pure patch and predicate helpers from the machine module when they carry non-trivial logic, and unit-test them directly.

---

## Performance

### Minimize context size

Large context objects increase snapshot and devtools overhead. If a value is only needed to compute one transition, pass it through the event.

### Use `useSelector` with stable selectors

Define selectors outside components (or memoize them) to prevent unnecessary re-renders.

### Limit spawned actor count

Each spawned actor is a live object with subscriptions. For variable-count actors (geometry units, graphics views), set limits and stop them eagerly.

---

## References

- [XState v6 migration guide](https://stately.ai/docs/xstate/v6/xstate-v5-to-v6)
- [XState documentation](https://stately.ai/docs)
- [XState v6 Migration Blueprint](../research/xstate-v6-migration-blueprint.md) — findings K-10–K-17, S12–S15, T15–T19, RB1-1
- [Worker Policy](./worker-policy.md)
- [XState Patterns Research](../research/xstate-patterns.md)
- [TypeScript Policy](./typescript-policy.md) — type assertion rules, `as never` ban, mock typing patterns
- [TypeScript Overloads Research](../research/typescript-overloads.md) — overloaded function patterns and mock compatibility
- [Storage Policy](./storage-policy.md) — atomic read-modify-write rules for any storage primitive consumed by multiple actors
