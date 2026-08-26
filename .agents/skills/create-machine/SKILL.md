---
name: create-machine
description: Create or update a headless XState machine in its owning Tau domain. Use when adding machine logic, extracting reusable state, choosing app-local versus package ownership, or publishing one machine through a direct package subpath.
---

# Create Machine

Create or update one XState v5 machine without grouping unrelated domains by
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

Follow `docs/policy/xstate-policy.md` and `docs/policy/library-api-policy.md`:

- use `setup()` with explicit input, context, and event types;
- model modes as states, keep context serializable and immutable, and use
  `assign()` for updates;
- inject external work with named actors and `.provide()`;
- prefer invoked actors and return deterministic cleanup from `fromCallback`;
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

- headless `createActor()` startup and stop;
- provided actor substitution and event ordering;
- invalid input boundaries;
- serializable snapshots;
- repeated transitions and cleanup without leaked subscriptions;
- exactly one exported machine value for a public subpath;
- public type assertions.

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
