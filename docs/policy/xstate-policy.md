---
title: 'XState Policy'
description: 'State machine design, actor lifecycle, and React integration using XState v5. setup(), context rules, assign, invoke/spawn, useActorRef, cleanup patterns.'
status: active
created: '2026-03-04'
updated: '2026-09-05'
related:
  - docs/research/xstate-patterns.md
  - docs/policy/typescript-policy.md
  - docs/research/typescript-overloads.md
---

# XState Policy

Internal reference for state machine design in the Tau application. Standard patterns for state machine design, actor lifecycle, and React integration using XState v5.

## Rationale

XState v5 provides structured state management with automatic actor lifecycle and cleanup. Consistent patterns for context updates, async operations, and React integration prevent common pitfalls: direct mutation, fire-and-forget async, and orphaned actors. Machines that own lifecycle logic keep UI components simple and testable.

## Machine Definition

Keep each machine in its owning `.machine.ts` file, with its context, internal event, input and emitted types declared before the machine. Export the machine; expose an `ActorRefFrom<typeof machine>` reference type when consumers need it. A logic alias using `typeof machine` is not an actor reference.

Keep named actor logic in `setup().actors`. Preserve literal event discriminators through the declared emitted union, an explicit return type or `satisfies`; use a const assertion only when inference needs it. Do not add an unused error field or a redundant actors-map assertion to an otherwise lean machine.

### Use `setup()` for all machine definitions

Every machine must use the `setup()` API with explicit type declarations for `context`, `events`, and `input`:

```typescript
export const myMachine = setup({
  types: {
    context: {} as MyContext,
    events: {} as MyEvent,
    input: {} as MyInput,
  },
  actors: {
    /* named actor logic */
  },
  actions: {
    /* named action implementations */
  },
  guards: {
    /* named guard implementations */
  },
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

### Machine naming

- **Machine ID**: `kebab-case` (e.g., `'file-manager'`, `'kernel'`, `'project'`)
- **States**: Nouns or adjectives (`idle`, `loading`, `ready`, `error`, `rendering`, `exporting`)
- **Events**: `camelCase` verbs (e.g., `createGeometry`, `loadProject`, `setParameters`)
- **Actions**: `camelCase` verb phrases (e.g., `registerParentRef`, `destroyWorkers`, `emitProjectLoaded`)
- **Guards**: `camelCase` predicates (e.g., `isLoggedIn`, `hasValidData`, `isProjectIdChanging`)

Emitted events describe completed outcomes (`fileCreated`, `buildCompleted`). Active state names describe ongoing work; stable states name their outcome. Existing application actors use `Actor` for one-shot work and `Listener` for callbacks; preserve a domain's established driver naming where it conveys the actual role.

> **Note on `dot.case`**: XState v5 recommends `dot.case` for event names to enable wildcard transitions (`'kernel.*'`). The current codebase uses `camelCase`. New machines may adopt `dot.case` if wildcard matching provides clear value, but consistency within a machine is more important than convention.

---

## Context Rules

### Never mutate context directly

All context updates must go through `assign()`. Direct mutation (`context.foo = bar`) bypasses XState's immutability model and causes issues with devtools, state persistence, and `@xstate/react`'s snapshot rehydration.

```typescript
// INCORRECT:
actions: {
  setWorker({ context, event }) {
    context.worker = event.worker;  // Direct mutation
  },
}

// CORRECT:
actions: {
  setWorker: assign({
    worker: ({ event }) => event.worker,
  }),
}
```

### Keep context lean

Store only what the machine needs for decision-making and actor communication. Large data sets (file contents, geometry buffers) should live in external stores or dedicated actors.

### Use states, not boolean flags

Model distinct operational modes as states rather than boolean context flags:

```typescript
// INCORRECT: boolean flags in context
context: { isLoading: false, hasError: false, data: null }

// CORRECT: discrete states
states: {
  idle: {},
  loading: {
    invoke: { src: 'fetchData', onDone: 'success', onError: 'error' },
  },
  success: {},
  error: {},
}
```

---

## Actions

### `assign` for context updates

Use `assign` for all context updates. Prefer the property-based form for targeted updates. For complex nested updates, use the existing Immer `produce` helper inside `assign` to preserve immutability:

```typescript
// Property-based (preferred)
assign({
  count: ({ context }) => context.count + 1,
  name: ({ event }) => event.name,
});

// Function-based (for returning full context shape)
assign(({ context, event }) => ({
  ...context,
  count: context.count + event.value,
}));
```

### No side effects in `assign`

`assign` callbacks must be pure — compute and return new values only. No logging, API calls, mutations, or I/O:

```typescript
// INCORRECT: mutation inside assign
assign({
  version({ context }) {
    context.buffer.push(newEntry); // Side effect!
    return context.version + 1;
  },
});

// CORRECT: return new value
assign(({ context }) => ({
  buffer: context.buffer.withEntry(newEntry),
  version: context.version + 1,
}));
```

### `enqueueActions` for conditional multi-action composition

Use `enqueueActions` when you need to conditionally execute different combinations of built-in actions:

```typescript
enqueueActions(({ enqueue, context, check }) => {
  enqueue.assign({ status: 'processing' });

  if (check('shouldNotify')) {
    enqueue.sendTo(context.parentRef, { type: 'processing' });
  }

  for (const child of context.children) {
    enqueue.stopChild(child);
  }
});
```

Do not use `enqueueActions` when `assign` alone suffices.

### No fire-and-forget async in actions

Actions are synchronous. Never wrap async operations in `void (async () => { ... })()`:

```typescript
// INCORRECT: invisible to XState, not cancellable
actions: {
  doWork({ context }) {
    void (async () => {
      const result = await heavyComputation();
      context.result = result;
    })();
  },
}
```

For async operations, use **invoked actors** (`fromPromise`, `fromCallback`). See [Async Operations](#async-operations).

### `assertEvent` for type narrowing

Use `assertEvent` in actions that handle specific events to narrow the event type:

```typescript
registerParentRef: assign({
  parentRef({ event }) {
    assertEvent(event, 'initializeKernel');
    return event.parentRef;
  },
}),
```

---

## Actors

### When to use each actor type

| Actor                          | Lifecycle                        | Cancellation            | Use case                                          |
| ------------------------------ | -------------------------------- | ----------------------- | ------------------------------------------------- |
| `invoke` with `fromPromise`    | State-scoped (auto-stop on exit) | `AbortSignal`           | One-shot async (API calls, initialization)        |
| `invoke` with `fromCallback`   | State-scoped (auto-stop on exit) | Cleanup function return | Long-running processes (event listeners, polling) |
| `invoke` with `fromObservable` | State-scoped (auto-stop on exit) | Unsubscribe             | Streaming data sources                            |
| `spawn` (inside `assign`)      | Manual (explicit `stopChild`)    | Manual                  | Dynamic actors needing a context reference        |
| `spawnChild` (action)          | Manual (explicit `stopChild`)    | Manual                  | Dynamic actors without context reference          |

### Prefer `invoke` over `spawn` when possible

`invoke` provides automatic lifecycle management — the actor starts when the state is entered and stops when the state is exited. Prefer `invoke` unless the actor needs to persist across multiple states.

When a dynamic child must exist with a retained reference at parent startup, create it in the owning context initializer. Stop the existing child before replacing it. Use `ActorRefFrom<typeof childMachine>` for stored refs and pass a required parent ref through input/context for child-to-parent `sendTo`.

When a transition must reset the current state's timer or debounce, use `reenter: true` so exit and entry lifecycle actually run.

### Always stop spawned actors

Spawned actors are NOT automatically stopped when the parent machine stops. Always pair `spawn` with explicit `stopChild`:

```typescript
// Spawn
entry: assign({
  workerRef: ({ spawn }) => spawn('workerActor', { id: 'my-worker' }),
});

// Stop — in exit action or explicit cleanup
exit: enqueueActions(({ enqueue, context }) => {
  if (context.workerRef) {
    enqueue.stopChild(context.workerRef);
    enqueue.assign({ workerRef: undefined });
  }
});
```

### Always handle `onError` for invoked promises

```typescript
invoke: {
  src: 'fetchData',
  onDone: {
    target: 'success',
    actions: assign({ data: ({ event }) => event.output }),
  },
  onError: {
    target: 'error',
    actions: assign({ error: ({ event }) => event.error }),
  },
}
```

The only exception is `fromCallback`, which does not emit `onDone`/`onError` events.

---

## Async Operations

### Use `fromSafeAsync` Instead of `fromPromise`

`fromSafeAsync` (from `#lib/xstate.lib.js`) is the standard async actor creator. It replaces `fromPromise` with React Strict Mode safety built in.

#### Generic parameters — `fromSafeAsync<TReturn, TInput>`

Follows the same `<TOutput, TInput>` convention as `fromPromise`. Specify both generics to type the input and return value:

```typescript
import { fromSafeAsync } from '#lib/xstate.lib.js';

type LoadedEvent = { type: 'dataLoaded'; data: Data };
type LoadInput = { id: string };

// Data-returning actor — specify both TReturn and TInput
const loadActor = fromSafeAsync<LoadedEvent, LoadInput>(async ({ input, signal }) => {
  const data = await fetchData(input.id, { signal }); // input: LoadInput
  return { type: 'dataLoaded', data }; // return: LoadedEvent
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

> **Why explicit generics?** TypeScript does not support partial type argument inference (as of TS 6.0). You must specify both `TReturn` and `TInput` when you need typed input — same limitation as `fromPromise<TOutput, TInput>`.

**Key rules**:

1. **Do not use `as const`** on individual literal values — contextual typing from generic parameters or `.provide()` already preserves literal types (see `docs/policy/typescript-policy.md` Rule 6).
2. **Always use generic parameters** (`fromSafeAsync<TReturn, TInput>`) — never declare types inline in the function signature. Inline `_: { input: ...; signal: ... }` parameter annotations or `: Promise<T>` return annotations duplicate what the generics already express.
3. **Never use `as never`** on `fromSafeAsync(...)` results in `provide()` calls. If the types don't match, fix the placeholder actor's generic parameters. See `docs/policy/typescript-policy.md` for resolution patterns.
4. **Placeholder actors must use generics for their return type** since throw-only bodies infer `Promise<never>`.

```typescript
// CORRECT: generics declare both return type and input type
const loadActor = fromSafeAsync<LoadedEvent, LoadInput>(async () => {
  throw new Error('loadActor not provided');
});

// INCORRECT: inline parameter and return annotations
const loadActor = fromSafeAsync(async (_: { input: LoadInput; signal: AbortSignal }): Promise<LoadedEvent> => {
  throw new Error('loadActor not provided');
});
```

In test `provide()` overrides, TypeScript infers types from the machine definition. Omit generics when the function body has a valid return path:

```typescript
const testMachine = myMachine.provide({
  actors: {
    // Inference works — return value provides the type
    loadActor: fromSafeAsync(async () => {
      return { type: 'dataLoaded', data: mockData };
    }),
    // Void actors — inference works for empty bodies
    saveActor: fromSafeAsync(async () => {
      await saveMockData();
    }),
  },
});
```

For throw-only test overrides, avoid `never` inference by consolidating into a single factory with an option flag:

```typescript
// CORRECT: single factory with option — avoids never inference
function createTestActor(options?: { throwOnLoad?: boolean }) {
  return createActor(
    myMachine.provide({
      actors: {
        loadActor: fromSafeAsync(async () => {
          if (options?.throwOnLoad) throw new Error('load failed');
          return { type: 'dataLoaded', data: mockData };
        }),
      },
    }),
  );
}

// INCORRECT: separate factory with inline return annotation
function createFailingActor() {
  return createActor(
    myMachine.provide({
      actors: {
        loadActor: fromSafeAsync(async (): Promise<LoadedEvent> => {
          throw new Error('load failed');
        }),
      },
    }),
  );
}
```

**Why `fromSafeAsync` over `fromPromise`**: React Strict Mode's `stopRootWithRehydration` cycle (mount → stop → rehydrate → restart) creates "zombie" Promise `.then()` handlers that fire after the actor is restarted. `fromSafeAsync` wraps the async work in an Observable with a `closed` guard and `AbortController` teardown, preventing stale emissions.

- Related: `docs/policy/typescript-policy.md` — type assertion rules for `fromSafeAsync` patterns
- Related: `docs/research/typescript-overloads.md` — mock compatibility with overloaded functions

### Use `fromPromise` for one-shot async (legacy)

> **Note**: Prefer `fromSafeAsync` for new code. `fromPromise` is retained for contexts where React Strict Mode is not a concern (e.g., server-side, non-React consumers).

```typescript
const fetchDataActor = fromPromise(async ({ input, signal }) => {
  const response = await fetch(input.url, { signal });
  signal.throwIfAborted();
  return response.json();
});
```

**Key**: Use the `signal` parameter. XState creates an `AbortController` for each invoked promise and aborts it when the state exits or the machine stops. Check `signal.throwIfAborted()` after each `await` to ensure the operation stops promptly.

### Use `fromCallback` for long-running processes

```typescript
const fileWatcherActor = fromCallback(({ sendBack, receive, input }) => {
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

The cleanup function is guaranteed to run when the actor is stopped (state exit or machine stop).

### Worker lifecycle as invoked callback

For workers tied to a specific machine state:

```typescript
const workerActor = fromCallback(({ sendBack }) => {
  const worker = new Worker(workerUrl, { type: 'module' });
  worker.onmessage = (event) => {
    sendBack({ type: 'workerResult', data: event.data });
  };
  return () => {
    worker.terminate();
  };
});

states: {
  active: {
    invoke: { src: 'workerActor', id: 'worker' },
    // Worker auto-terminates when leaving 'active' state
  },
}
```

---

## Cleanup and Exit Actions

### Every machine with resources must have exit actions

If a machine creates workers, opens connections, subscribes to events, or holds any resource that requires explicit cleanup, it must have a root-level `exit` action:

```typescript
setup({
  actions: {
    cleanup({ context }) {
      // Release all resources
    },
  },
}).createMachine({
  exit: ['cleanup'],
  // ...
});
```

### Error-isolate cleanup chains

If a cleanup action iterates over multiple resources, wrap each in try/catch to ensure all resources are released even if one cleanup fails:

```typescript
cleanup({ context }) {
  for (const disposable of context.disposables) {
    try {
      disposable();
    } catch (error) {
      console.error('[Cleanup] failed:', error);
    }
  }
  // Critical cleanup (e.g., worker.terminate()) must always run
  context.worker?.terminate();
}
```

See [Worker Policy, Rule 5](./worker-policy.md#rule-5-error-isolated-cleanup) for the full pattern.

### Guard against post-teardown operations

When a machine has exit actions that set a `destroyed` flag, check this flag at every yield point in any associated async operations:

```typescript
async function ensureResource(context: MachineContext): Promise<Resource> {
  if (context.destroyed) {
    throw new Error('Machine was stopped');
  }
  const resource = await createResource();
  if (context.destroyed) {
    resource.dispose();
    throw new Error('Machine was stopped during initialization');
  }
  return resource;
}
```

---

## React Integration

### Use `useActorRef` + `useSelector` (not `useMachine`)

`useMachine` (alias: `useActor`) re-renders on every state change. Use `useActorRef` for the actor reference and `useSelector` for fine-grained subscriptions:

```typescript
function MyComponent(): React.JSX.Element {
  const actorRef = useActorRef(myMachine, { input: { /* ... */ } });
  const isLoading = useSelector(actorRef, (s) => s.matches('loading'));
  const count = useSelector(actorRef, (s) => s.context.count);

  return (/* ... */);
}
```

### Input is read once at initialization

`useActorRef(machine, { input })` reads `input` only when the actor is created. Changing the `input` object on re-renders does NOT update the running actor. To react to external changes, send events:

```typescript
// Send events when props change
useEffect(() => {
  actorRef.send({ type: 'loadProject', projectId });
}, [actorRef, projectId]);
```

### Use `key` prop for identity-based remounting

When a component wraps a machine whose identity changes (e.g., different project ID), use a React `key` prop to force unmount/remount:

```typescript
<ProjectProvider key={projectId} projectId={projectId}>
  {children}
</ProjectProvider>
```

This ensures:

1. Old actor is stopped (cleanup runs)
2. New actor is created with fresh input

### Actor propagation

Pass actor references via React context or props, not by reaching into parent machine context:

```typescript
// CORRECT: Provider exposes actor ref via context
<ProjectContext.Provider value={{ projectRef: actorRef }}>
  {children}
</ProjectContext.Provider>

// INCORRECT: Reaching into parent machine internals
const kernelRef = parentActor.getSnapshot().context.kernelRef;
```

---

## Communication Patterns

### Parent-to-child: `sendTo`

```typescript
sendTo(({ context }) => context.childRef, { type: 'doWork', data: 42 });
```

### Child-to-parent: `sendTo` with parent ref (preferred over `sendParent`)

Pass the parent ref via `input` to avoid tight coupling:

```typescript
// Parent spawns child with self reference
entry: assign({
  childRef: ({ spawn, self }) =>
    spawn('child', {
      input: { parentRef: self },
    }),
});

// Child sends to parent via stored ref
entry: sendTo(({ context }) => context.parentRef, { type: 'childReady' });
```

### Guard `sendTo` targets against undefined

When the target actor ref may be undefined in some machine states, use `enqueueActions` with a guard:

```typescript
// RISKY — parentRef may be undefined
sendTo(({ context }) => context.parentRef!, { type: 'event' });

// SAFE — guarded
enqueueActions(({ context, enqueue }) => {
  if (context.parentRef) {
    enqueue.sendTo(context.parentRef, { type: 'event' });
  }
});
```

### Decoupled communication: `emit`

Use `emit` for events that parent components observe via `.on()` subscriptions, without requiring the machine to know who is listening:

```typescript
// Machine emits
emitProjectLoaded: (emit(({ event }) => ({
  type: 'projectLoaded',
  project: event.output,
})),
  // React component subscribes
  useEffect(() => {
    const sub = actorRef.on('projectLoaded', (event) => {
      // Handle event
    });
    return () => sub.unsubscribe();
  }, [actorRef]));
```

---

## Testing

### Test machines with `createActor`

```typescript
import { createActor, waitFor } from 'xstate';

test('transitions to ready on successful load', async () => {
  const actor = createActor(
    myMachine.provide({
      actors: {
        loadData: fromSafeAsync(async () => {
          return { type: 'dataLoaded', items: [1, 2, 3] };
        }),
      },
    }),
    { input: { id: 'test-123' } },
  );

  actor.start();
  actor.send({ type: 'load' });

  const snapshot = await waitFor(actor, (s) => s.matches('ready'));
  expect(snapshot.context.items).toHaveLength(3);

  actor.stop();
});
```

### Use `machine.provide()` for dependency injection

Override actors, actions, and guards for testing:

```typescript
const testMachine = machine.provide({
  actors: {
    fetchData: fromSafeAsync(async () => {
      return { type: 'dataFetched', data: mockData };
    }),
  },
  actions: {
    logAnalytics: () => {
      /* no-op */
    },
  },
  guards: {
    isAuthenticated: () => true,
  },
});
```

### Test guards and actions in isolation

Export guard and action functions for direct unit testing:

```typescript
// In machine file
export function isProjectIdChanging({ context, event }: GuardArgs): boolean {
  return event.projectId !== context.projectId;
}

// In test file
test('isProjectIdChanging returns true for different IDs', () => {
  expect(
    isProjectIdChanging({
      context: { projectId: 'a' },
      event: { type: 'loadProject', projectId: 'b' },
    }),
  ).toBe(true);
});
```

---

## Performance

### Minimize context size

Large context objects increase serialization overhead for devtools, persistence, and snapshot operations. If a value is only needed inside an action (not for state decisions), pass it through events rather than storing it in context.

### Use `useSelector` with stable selectors

Define selectors outside components or memoize them to prevent unnecessary re-renders:

```typescript
// CORRECT: Stable selector reference
const selectCount = (state: SnapshotFrom<typeof myMachine>) => state.context.count;

function MyComponent({ actorRef }: Props): React.JSX.Element {
  const count = useSelector(actorRef, selectCount);
  return <span>{count}</span>;
}
```

### Limit spawned actor count

Each spawned actor is a live object with subscriptions. For variable-count actors (geometry units, graphics views), set reasonable limits and clean up eagerly.

---

## References

- [XState v5 Documentation](https://stately.ai/docs)
- [XState v5 Actions](https://stately.ai/docs/actions)
- [XState v5 Actors](https://stately.ai/docs/actors)
- [XState v5 Invoke](https://stately.ai/docs/invoke)
- [XState v5 Callback Actors](https://stately.ai/docs/callback-actors)
- [XState v5 React Integration](https://stately.ai/docs/xstate-react)
- [Naming Conventions](https://stately.ai/blog/2024-01-23-state-machines-whats-in-a-name)
- [Migration to v5](https://stately.ai/blog/2024-02-02-migrating-machines-to-xstate-v5)
- [Worker Policy](./worker-policy.md)
- [XState Patterns Research](../research/xstate-patterns.md)
- [TypeScript Policy](./typescript-policy.md) — type assertion rules, `as never` ban, mock typing patterns
- [TypeScript Overloads Research](../research/typescript-overloads.md) — overloaded function patterns and mock compatibility
- [Storage Policy](./storage-policy.md) — atomic read-modify-write rules for any storage primitive consumed by multiple actors
