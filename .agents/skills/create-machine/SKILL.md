---
name: create-machine
description: Create or update a headless XState machine in its owning Tau domain. Use when adding machine logic, extracting reusable state, choosing app-local versus package ownership, or publishing one machine through a direct package subpath.
---

# Create Machine

Create or update one XState v6 machine without grouping unrelated domains by
implementation technology.

## Ownership Decision

Resolve ownership before choosing generator options:

1. Keep application orchestration local when it imports app services, routes,
   UI aliases, or has only one application consumer.
2. Use an existing domain package when the state is renderer/UI neutral and the
   package already owns the capability.
3. Create a new domain package through `/create-package` only when a real
   headless consumer, second consumer, or public package boundary justifies it.
4. Never create a generic machines package. XState is an implementation detail,
   not the ownership boundary.

Ask only when the evidence leaves a public ownership or behavior choice truly
ambiguous.

## Create

Inspect `tools/workspace-plugin/src/generators/machine/schema.json`, then run the
generator. A publishable package requires one direct singular subpath:

```bash
pnpm nx g @taucad/workspace-plugin:machine <name> \
  --project=<owning-project> --subpath=<subpath>
```

An application-local machine omits `--subpath`:

```bash
pnpm nx g @taucad/workspace-plugin:machine <name> --project=<application-project>
```

The generator is the only supported scaffold. Do not hand-add machine files,
XState dependencies, package exports, or build entries.

## Update

If the machine or subpath already exists, inspect and update it in place. Do not
rerun the create generator and do not introduce a compatibility machine unless
an existing released API requires it.

## Implement

Follow `docs/policy/xstate-policy.md` (its "Agent substrate contract", MC-R1–MC-R30, binds every
owner machine) and `docs/policy/library-api-policy.md`:

- use `setup({ schemas })` with `types<T>()` for input and context and an event
  schema map for events;
- declare a root `onError` that enters a modelled state, and `version: '1'`,
  bumped when the alphabet or effect order can change (MC-R12, MC-R21);
- export one `create<Name>Actor` factory beside the machine that forwards
  `clock`, `inspect` and `onRejectedEvent` and returns the actor unstarted
  (MC-R4);
- give every effect a name: `enq(namedFn, …)`, `enq(actions.name, …)` or a named
  actor whose default refuses with a sentence naming what was not provided
  (MC-R8); one-shot I/O is `createAsyncLogic`, read in `onDone`, never
  `fromSafeAsync` (MC-R10);
- answer every public event in every state, and export the pairs the machine
  ignores as `<name>IgnoredEvents` (MC-R17);
- list every `after`, `timeout` or `createAsyncLogic({ timeout })` on an
  external edge in an exported timeout table; never let a timer stand in for a
  peer's answer (MC-R16);
- model modes as states and keep context serializable; transitions return a
  context patch, and every effect goes through `enq` in a transition function;
- inject external work with named actors and `.provide()`, typing provided maps
  with `satisfies Partial<…Actors>` and exporting the actor map for hosts;
- prefer invoked actors and return deterministic cleanup from
  `createCallbackLogic`;
- give a published machine that composes other machines a named exported
  interface so its declarations build;
- keep React, renderer, filesystem, routing, and app actor references outside a
  reusable machine;
- export exactly one machine value from each public machine subpath; supporting
  types, selectors, guards, and pure helpers may share that subpath;
- keep stable domain contracts and pure math at the package root rather than
  re-exporting machine values there.

Replace the generated idle baseline with the requested behavior. Generation is
an intermediate step, not completion.

## Verify

Tests must cover the behavior requested plus:

- the shared harness on every actor (MC-R23): `guardActors` from
  `@taucad/xstate-testing/inspect` with the exported ignore list, `StepClock`
  from `@taucad/xstate-testing/clock` for timers, and the fakes from
  `@taucad/xstate-testing/fakes` for scripted effects;
- one enumeration test: `unansweredEvents` and `unreachedStates` from
  `@taucad/xstate-testing/paths` both return `[]`;
- headless `createActor()` startup and stop;
- provided actor substitution and event ordering;
- invalid input boundaries;
- serializable snapshots;
- repeated transitions and cleanup without leaked subscriptions;
- exactly one exported machine value for a public subpath;
- public type assertions;
- for a published package, the `build` target, which emits declarations that
  `typecheck` does not.

Run and repair every applicable check:

```bash
pnpm nx lint <owning-project>
pnpm nx test <owning-project> --watch=false
pnpm nx typecheck <owning-project>
pnpm nx build <owning-project>
pnpm nx pkgcheck <owning-project>
```

For application-local machines, omit unavailable build/pkgcheck targets. For a
published package, also inspect the packed artifact and verify source,
`publishConfig.exports`, and build-entry parity.

## Definition of Done

- Ownership follows the domain and every named consumer is wired.
- Requested behavior is implemented with no applicable placeholders.
- Superseded state and bridges are removed after parity.
- Dependencies match emitted imports.
- Relevant checks pass, or a concrete blocker is reported with evidence.
