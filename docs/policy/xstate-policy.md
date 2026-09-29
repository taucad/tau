---
title: 'XState Policy'
description: 'State machine design, actor lifecycle, and React integration using XState v6. setup() schemas, transition functions, enqueue effects, invoke/spawn, useActorRef, cleanup patterns.'
status: active
created: '2026-03-04'
updated: '2026-09-25'
related:
  - docs/research/xstate-patterns.md
  - docs/research/xstate-v6-migration-blueprint.md
  - docs/research/verified-agent-substrate-charter.md
  - docs/research/agent-substrate-machine-contract-blueprint.md
  - docs/policy/typescript-policy.md
  - docs/research/typescript-overloads.md
---

# XState Policy

Internal reference for state machine design in Tau. Standard patterns for machine definition, actor lifecycle, and React integration using XState v6 (`xstate` `6.0.0-alpha.59`, `@xstate/react` `7.0.0-alpha.3`, pinned in the pnpm catalog).

## Rationale

XState provides structured state management with automatic actor lifecycle and cleanup. v6 replaces named action objects with **transition functions**: a transition computes its target and a context patch from `(args, enq)`, and every side effect goes through the `enq` queue. Consistent use of that shape keeps transitions pure and ordered, keeps async work in invoked actors, and keeps UI components simple and testable.

## Agent substrate contract

This section binds every owner machine and fold in the agent substrate (Verified Agent Substrate Charter, D1 and D12). Other app machines adopt it with their own changes. Each rule names its sources in parentheses. The charter's machine contract blueprint (W2) names how each rule is enforced.

### Form and placement

**MC-R1 When a machine is warranted.** A machine is warranted where it owns a lease, a dispatch, a binding or a reservation in one process and can refuse a transition. State derived from a durable log is a `createLogic` fold. I/O is a named effect injected at a composition root. No module-level map, flag or promise holds run, lease, leadership, placement or settlement state. A machine that mirrors another owner's fact is a defect. (D1; north star.)

**MC-R2 Imports.** A portable machine file imports only three things: `xstate`, its own package's modules through `#` specifiers, and types. It never imports a DOM or Node API, React, an app alias, a network client, a `?worker` URL, a sibling service or an `xstate/*` subpath. (North star rule 1.)

**MC-R3 Identity in input.** Ids such as `projectId`, `chatId`, `turnId` and `runId` arrive in `input`, as does the parent ref. They are copied into context once. (North star rule 4; S2 rule 7.)

**MC-R4 Composition root.** Each owner machine or tree ships one exported factory beside it.

- The factory takes the host's dependencies plus `clock`, `inspect` and `onRejectedEvent`, and forwards all three to `createActor`.
- Each call takes its own `clock`. No root keeps a module-level clock or actor, so a simulation can give each process its own clock.
- It returns the actor unstarted.
- Production passes none of the three options. Development may pass the console inspector and a warning hook. Tests pass the harness.

(North star rule 3; PT12.)

**MC-R5 Context.** Context holds scalars, plain records, refs to children this machine spawned, and correlation ids. It never holds functions, service instances, workers, ports, buffers or a second copy of a durable fact. A durable fact cached in context names its rehydration source in the file header; the `packages/revisions/src/sync.machine.ts` header is the format. (North star rule 5.)

### Purity and effects

**MC-R6 Purity.** These are pure: transition functions, guards, choices, context mappers, `input` factories, `entry` and `exit` bodies, `delays` and `timeout` functions.

- They use no clock, randomness, `crypto`, id minting, I/O or module state, and they never read another actor's snapshot.
- Time and ids arrive in events or input.
- A child's facts arrive as events that the parent folds into context.
- `snapshot.can()` and graph traversal run transition functions (N16), so impurity breaks tests as well as replay.

(PT1; S2 rule 2; L7 F8.)

**MC-R7 Evaluation order.** Write machines against v6's evaluation order:

- A state's `invoke.input` runs before its entry patch (S10).
- A transition reads the pre-exit context, and its patch wins over exit patches on the same key (S12, T9).
- Entry effects run before invoked children start (S13).
- A static context mapper runs twice per event (S14).
- Parallel regions read the pre-event context (S15).
- A macrostep stays under 1000 microsteps (N10).
- `initialTransition` and actor start deliver `@xstate.init` to a fold's `run`, which ignores it (N13; MC-R20).

**MC-R8 Named effects.** An effect is one of three things:

- `enq(namedEffect, …args)` with a named function;
- `enq(actions.name, …args)` with a custom action declared in `setup({ actions })`;
- a named actor in `setup({ actors })`.

An inline `enq(() => …)` is forbidden in owner machines, because its effect descriptor has an empty type (N6). An effect whose result matters has a default that throws a sentence naming what was not provided. Only a callback driver may default to a no-op.

Custom actions are provided once, at the composition root, with `.provide({ actions })`, never in a machine file. Each is an arrow keyed by its effect name, so its `Function.name` equals its key (S1 H3). When the actions object is built by a call, the owner's conformance test checks the names and that every argument survives JSON.

(PT2; north star rule 2.)

**MC-R9 Keyed effects.** Effect arguments are JSON-safe. An external effect's idempotency key derives from durable identity (`runId`, attempt, position), never from randomness. (D15; D18 with S1's conditions.)

**MC-R10 Async logic.** One-shot I/O is `createAsyncLogic({ run })`.

- `run` passes `signal` to every I/O call and calls `signal.throwIfAborted()` after each `await`.
- The machine reads the result as `event.output` in `onDone` and handles `onError`.
- The substrate does not use `fromSafeAsync`.

(A7; S2 rule 10.)

**MC-R11 Wiring and ports.** Wiring that must end with a state is an invoked listener or subscription logic.

- `enq.listen` and `subscribeTo` apply only to refs the machine owns, and they map to public events. `enq.listen` on a spawned child's ref receives what the child emits, including an emit from its final state's entry.
- A listener is a separate system actor, not a child. It outlives its state, and any internal event it sends is dead-lettered (S2 surprise 5).
- A port is a real actor ref, never a `{ send }` object (S2 rule 12, surprise 3).

(S2 rule 8.)

### Failure

**MC-R12 Failure.** Every owner machine declares a root `onError`. The handler records the error in context and enters a modelled state that still answers every public event. The root `onError` receives:

- effect failures (`xstate.error.execution`), including a choice that returned no target;
- unhandled child failures (`xstate.error.actor`);
- sends to an undefined or unknown child (`xstate.error.communication`).

Every `invoke` also has its own `onError` (RB1; L3 D8). Every choice returns a target on every path (S2 surprise 8); without a root `onError`, a choice with no target errors the actor. (PT3; I27.)

### Addressing and commands

**MC-R13 Addressing.** A machine addresses peers only through:

- refs from input, kept in context;
- its own child refs and ids;
- `listen` and `subscribeTo` on those refs.

It never uses `registryKey`, `createSystem` registries, `system.get`, the `parent` argument, `sendParent`, a string `sendTo` target other than an own child id, route states, `checkStateIn(self…)`, `getNextSnapshot` or `getInitialSnapshot`. It checks an optional ref before sending to it (PT13).

A spawn id names a child only while that child lives. After the child completes, a send to its id is a communication fault, so the machine checks its own record of the child first, or sends to `children[id]` after checking it. A child reports its end with an event it emits. The parent does not treat `xstate.done.actor` as that report, because it can arrive after a respawn under the same id.

(PT8; S2 rule 7.)

**MC-R14 Command surface.** An owner actor's `send` is never handed to untrusted code. The host exposes one typed command function per public event. The port adapter validates seam payloads and answers unreadable commands. Machines configure no validator (EQ5). (PT5.)

**MC-R15 Internal events.** `schemas.internalEvents` lists only events the machine raises to itself, such as continuations and delayed timer events. Results from children, listeners, ports and hosts are public events carrying a correlation id that the machine checks.

Internal events are not a security boundary. Pure `transition()` does not enforce them, and built-in `xstate.*` events can be forged (N1–N3). The deprecated top-level `internalEvents` array is not used. (PT4; S2 rule 4.)

### Timers

**MC-R16 Timers and timeouts.**

- `after` expresses a debounce, a coalescing window, a backoff, a heartbeat or a liveness backstop. It never stands in for an in-process peer's answer; the peer answers on every edge (D13).
- A backstop ends a state only when every durable effect it abandons is fenced, so that the effect's later writes are refused. Otherwise it cancels and keeps waiting (D13).
- State and invoke `timeout`/`onTimeout`, and `createAsyncLogic({ timeout })`, appear only on external edges. Each such edge is listed in the owner's timeout table as an exported named constant (I30). A state `timeout` counts from entry to its state, compound states included, and is cancelled on exit.
- A timeout is detected through `onTimeout`, or through `event.error instanceof TimeoutError` in `onError`. It is never detected through `signal.reason`, which is a plain `AbortError` (S2 g1).
- Every timer delivery is answered. A delayed `enq.raise` or an `after` arrives as an `xstate.timer` delivery, and its handler returns a target or `{}`, never `undefined`. A timer whose reason has ended is cancelled with `enq.cancel(id)`, or its handler answers `{}` with a comment.
- Delay functions are pure, and any jitter arrives in input (N9).
- One injected clock drives every timer in a tree.

(PT7; north star rule 7; A5, A6.)

### Totality and correlation

**MC-R17 Totality.** In every state, an owner machine does one of three things with each public event:

- it takes a transition;
- it answers with a refusal that echoes the request id;
- it ignores the event because the (state, event) pair is on its declared ignore list.

The ignore list is exported beside the machine as `<name>IgnoredEvents`, of type `ReadonlyArray<readonly [state: string, eventType: string]>`. Each state is a dotted path or `'*'`. A choice state is transient: no event arrives in it, and no ignore pair names it.

Two cases are defects: a transition that returns `undefined` with no ancestor handling the event, and an unlisted event that nothing handles. An explicit `{}` is reserved for idempotent re-delivery and for stale answers (MC-R18), and it says so in a comment. (D13; I26; S2 rule 5.)

**MC-R18 Correlation.**

- Every request to a peer carries a request id, and every answer echoes it.
- A machine drops an answer it did not ask for, or one from an earlier attempt, by returning `{}` after its correlation check. An ignore pair cannot tell a stale answer from a fresh one, so a pair is declared only for a state in which every answer of that type is stale.
- Coalescing keeps and answers every requester.
- Host commands carry a command id.
- Matching on a verb-and-subject tuple is retired.

(D14; D15; north star rule 6.)

### Persistence and folds

**MC-R19 Persistence and rehydration.** The log is the record (D3).

- Product code never persists a snapshot, never restores one and never configures `migrate`. Tests may round-trip snapshots (PT9).
- A machine is rehydrated from the fold of the records its owner appended. Memory-only facts are declared, and a restart reconstructs them to a safe state.
- An effect result that must survive a restart is a domain event the host appends. It is never a journaled `xstate.done.actor` event (PT6; S2 surprise 1; N8).
- Pure `transition()` serves conformance and differential tests, not rehydration.

**MC-R20 Folds and selection.** Derived facts are `createLogic` folds that are pure and total over the events they receive.

- A fold's `run` returns `undefined` for every event except its input, which leaves its context unchanged. `initialTransition` and actor start deliver `@xstate.init` to `run`, so a fold that folds every event corrupts its initial state.
- Every fold's test asserts `foreignEventChanges(logic)` is empty.
- Another actor's snapshot is read only in `select*` functions, outside transitions. Object selections use `select(selector, equal)`.

(D1; S2 rule 13; A8; N13.)

### Versions and the gate

**MC-R21 Versions and named types.** Every substrate owner machine declares `version`. It bumps the version when the order of its effects or events, or its public alphabet, can change (PT11). The version is recorded on every trace line and in any durable journal, never in chat-log rows (D3; D16).

A published machine that composes other machines exports a named interface (K17), which the package `build` checks.

**MC-R22 Experimental gate and upstream pin.** The following appear only under `__spikes__`, in tests and in tooling. They stay there until a ruling adopts them after the beta freezes their contract. (PT10; D18; EQ5.)

- the modules `xstate/durable`, `xstate/validation`, `xstate/fsm` (with `createFSM`) and `xstate/scxml`;
- `executeEffects`, `getEffectDescriptor`, `machineVersions` and `createMachineFromConfig`;
- the runtime helpers `runStep`, `deliverEvent`, `stopActor` and `terminateActor`;
- `ActorSystemRuntime` and `system.runtime`;
- remote handles (`embedChildren`);
- `enq.step`.

`xstate` and `@xstate/react` stay pinned to exact versions in the catalog. A bump is its own change. It re-runs the S1 and S2 spike suites (`packages/agent-host/src/__spikes__/durable/` and `v6-core/`) and the lint's export check, and a changed result reopens the rules it touches (L1 F1–F2).

### Tests and lifecycle

**MC-R23 Tests.** Owner machine tests use `@taucad/xstate-testing`:

- `guardActors` on every actor; each test takes the dead letters, unanswered events and faults it expects;
- `StepClock` for every timer;
- `unansweredEvents` over the public alphabet, with the exported ignore list, and `unreachedStates`;
- `foreignEventChanges` for every fold;
- a numbered path table at the head of the file, kept current with `pathTable`;
- the shared fakes for scripted effects.

Never order events across actors by inspection time. Inspection reports each actor's deliveries in that actor's order, not in causal order (S2 surprise 11). Cross-actor order comes from release points or the ledger sequence.

(PT12; S2 rules 5 and 14; north star rule 8.)

**MC-R24 Lifecycle.** A factory returns an unstarted actor. Its owner starts it once and never restarts a stopped actor (R3). A caller treats a rejected `waitFor` as "the actor is gone" (RB2a).

**MC-R25 React.**

- `useSelector` throws an errored actor's error during render (RB1). Projections must therefore never throw, and every owner has a root `onError`.
- Stores and adapters create substrate actors as roots; hooks do not. A hook-owned actor stops a microtask after unmount, and remounts overlap (RB2).
- A reconnect after a real stop yields a fresh actor, so consumers never cache refs (RB3).
- Per-render sync goes through `logic.sources`, provided at module level (RB4).
- `@xstate/react` 7 has no stop-and-rehydrate cycle (RB1-1). That removes the reason `fromSafeAsync` was written.

### Schemas and identity

These rules come from the XState v6 maximal-use review (`synthesis/xstate-v6-maximal-use.md`, probe k).

**MC-R26 Per-state context.** A fact that exists only in some states lives in those states' `schemas.context`, declared in `setup({ states })`, never as an optional root key. A transition into a narrowed state supplies its keys, which the types enforce. Code reads a narrowed key only after `snapshot.matches(…)` or inside that state's handlers. Keys survive exit at runtime, because patches are shallow merges, so nothing outside the state reads them. Records kept in a map, such as a parent's per-key slots, use a discriminated union in plain TypeScript instead. (XV1; k1, k1b, k11.)

**MC-R27 Transition identity.** Every transition of an owner machine that has a TLA+ spec is a static config, or a `{ to, meta, description }` object whose `to` is the transition function. Its `meta.tla` names the spec action the transition refines, typed by `schemas.transitionMeta` as that spec's action union. A bare function transition's returned `meta` never reaches the microstep, so owners do not rely on it. When one handler both takes and refuses, the spec action covers both branches, and the outcome travels in the trace line's fields. (XV2; k3, k3b, k9.)

**MC-R28 Tags.** A category that a consumer asks about an owner's snapshot is a tag declared in `schemas.tags`, and consumers read it with `hasTag`, never with a list of state values. Consumers are `select*` functions, quiescence checks, tests and W1's `Matches`. (XV3; k4.)

**MC-R29 Typed outcomes.** An effect actor declares `schemas.output` as a tagged union of every expected outcome, refusals included, and `onDone` switches over it exhaustively. `onError` means a defect and enters a modelled fault state (MC-R12). Every emitted event is declared in `schemas.emitted`. (XV4; k5.)

**MC-R30 Runtime schemas in tests.** In a package that already ships Zod (`@taucad/agent-host`, `@taucad/host`, `apps/ui`), owners declare runtime schemas, and `schemas.events` reuses the wire's payload schemas (D11). Reuse a wire payload schema as the value of an event's `payload` key, `{ commandId, payload }`, because alpha.59 makes a directly reused schema's optional keys required. Owner tests run the machine through the harness's `validated(machine)`, which checks events, context, per-state context, emitted events and output at every step. Product code never installs a validator (MC-R22). `packages/revisions` keeps `types<T>()`. (XV5; k6, k10.)

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

| v5                                 | v6                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `emit(…)`                          | `enq.emit(event)`                                                                                                 |
| `sendTo(ref, …)` / `sendParent(…)` | `enq.sendTo(ref, event)` (pass the parent ref by input)                                                           |
| `raise(…)`                         | `enq.raise(event)`                                                                                                |
| `spawnChild` / `spawn` in `assign` | `const ref = enq.spawn('src', { id, input })`                                                                     |
| `stopChild(ref)`                   | `enq.stop(ref)`                                                                                                   |
| `log`, custom action body          | A named effect: `enq(effectName, …args)` or `enq(actions.name, …args)`. An inline body only outside the substrate |

`enq` effects run after the transition is taken; pass the values they need as arguments. Never perform an effect directly in a transition body or a context mapper — it would run on evaluation, not on the transition.

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

Transitions are synchronous. Async work is a named actor (see [Async Operations](#async-operations)). Its result reaches the machine as the actor's output in `onDone`, never through an effect that writes back.

---

## Actors

### When to use each actor type

| Actor                                      | Lifecycle                        | Cancellation            | Use case                                                     |
| ------------------------------------------ | -------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `invoke` with `fromSafeAsync`              | State-scoped (auto-stop on exit) | `AbortSignal`           | App machines outside the substrate, until each migrates (A7) |
| `invoke` with `createAsyncLogic({ run })`  | State-scoped (auto-stop on exit) | `AbortSignal`           | One-shot async; required in the substrate                    |
| `invoke` with `createCallbackLogic`        | State-scoped (auto-stop on exit) | Cleanup function return | Long-running processes (event listeners, polling)            |
| `invoke` with `createEventObservableLogic` | State-scoped (auto-stop on exit) | Unsubscribe             | Streaming data sources                                       |
| `enq.spawn` / context-factory `spawn`      | Parent-scoped; explicit removal  | `enq.stop` for removal  | Dynamic actors needing a context reference                   |

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

### `fromSafeAsync` is retired

The substrate does not use `fromSafeAsync` (MC-R10); its one-shot I/O is `createAsyncLogic`, read in `onDone`. `fromSafeAsync` (from `#lib/xstate.lib.js`) stays only for app machines outside the substrate until each migrates (A7). It delivers its result to the parent as an **event** (which must carry a `type`), and a stopped invocation never delivers. The notes below apply to those remaining machines.

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
    loadActor: createAsyncLogic<Data, { id: string }>({
      run: async ({ input, signal }) => {
        const data = await load(input.id, { signal });
        signal.throwIfAborted();
        return data;
      },
    }),
  } satisfies Partial<MachineActors<typeof myMachine>>,
});
```

Packages export their machine's actor map for hosts (`ParameterSetActors`, `ProjectRevisionsActors`, …). `provide()` rejects a slot typed `X | undefined`, so never pass a conditional spread or a `Partial` map value: choose between whole maps with a ternary, each checked with `satisfies`.

### Use `createAsyncLogic`

```typescript
const fetchDataActor = createAsyncLogic<Data, { url: string }>({
  run: async ({ input, signal }) => {
    const response = await fetch(input.url, { signal });
    signal.throwIfAborted();
    return response.json();
  },
});
```

**Key**: use the `signal`. XState aborts it when the state exits or the machine stops. Pass it to every I/O call and check `signal.throwIfAborted()` after each `await`. Aborting stops cooperative work; it does not undo a write that already reached an external authority.

- The result is `event.output` in `onDone`; every invoke has an `onError` (MC-R10, MC-R12).
- A slot the host must provide defaults to logic that throws a sentence naming what was not provided (MC-R8).
- `createAsyncLogic({ timeout })` appears only on an external edge listed in the owner's timeout table (MC-R16). The parent sees the timeout as `event.error instanceof TimeoutError` in `onError`, or through `onTimeout`; `signal.reason` is a plain `AbortError` and cannot tell a timeout from a stop.

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

### Test machines with the shared harness

Owner machine tests use `@taucad/xstate-testing` (MC-R23): `guardActors` on every actor, `StepClock` for every timer, the shared fakes for scripted effects, and one enumeration test per machine.

```typescript
import { StepClock } from '@taucad/xstate-testing/clock';
import { createFakePromiseActors } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';

it('should refuse a cut while a turn holds the checkout', async () => {
  const guard = guardActors({ ignore: { checkout: checkoutIgnoredEvents } });
  const clock = new StepClock();
  const promises = createFakePromiseActors();
  const actor = createActor(checkoutMachine.provide({ actors: { cut: promises.actor('cut') /* … */ } }), {
    input,
    clock,
    inspect: guard.inspect,
  });
  actor.start();
  // …drive the rows; take only what the row expects: expect(guard.take('deadLetter')).toEqual([]);
});

it('should answer every public event in every reachable state', () => {
  const options = {
    input,
    events: publicEvents,
    limit: 500,
    serializeState: (s: AnyMachineSnapshot) => JSON.stringify(s.value),
  };
  expect(unansweredEvents(checkoutMachine, { ...options, ignore: checkoutIgnoredEvents })).toEqual([]);
  expect(unreachedStates(checkoutMachine, options)).toEqual([]);
});
```

A fold's test is one line: `expect(foreignEventChanges(chatProjectionLogic)).toEqual([])`. A test that needs runtime schema checks runs `createActor(validated(machine), …)` (MC-R30).

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
- [Verified Agent Substrate Charter](../research/verified-agent-substrate-charter.md) — D1, D12–D16, D18
- [Agent Substrate Machine Contract Blueprint](../research/agent-substrate-machine-contract-blueprint.md) — how each MC rule is enforced (lint, harness, conformance)
- [Worker Policy](./worker-policy.md)
- [XState Patterns Research](../research/xstate-patterns.md)
- [TypeScript Policy](./typescript-policy.md) — type assertion rules, `as never` ban, mock typing patterns
- [TypeScript Overloads Research](../research/typescript-overloads.md) — overloaded function patterns and mock compatibility
- [Storage Policy](./storage-policy.md) — atomic read-modify-write rules for any storage primitive consumed by multiple actors
