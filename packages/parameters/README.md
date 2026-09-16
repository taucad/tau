# @taucad/parameters

Portable parameter declarations, unit inference, record projection and checked change planning. Runtime produces manifests; this package does not import runtime or own a filesystem.

## Entry points

- `@taucad/parameters`: pure manifest admission, English inference, value projection, explicit snapshots and operation planning.
- `@taucad/parameters/authority`: stateless snapshot loading, checked commit and record refresh using caller-supplied byte authority.
- `@taucad/parameters/set-machine`: native XState workflow and a per-command subscription helper.
- `@taucad/parameters/input-machine`: retained draft and input validation workflow.
- `@taucad/parameters/schema`: existing JSON Schema admission helpers.
- `@taucad/parameters/json`: bounded JSON admission.

XState is an optional peer for the machine entry points. The pure entry point does not depend on XState or runtime.

## Operation boundary

Resolve a manifest and exact source/sidecar preconditions with `loadParameterSnapshot`. Reading an absent sidecar produces a virtual default without writing it. `planParameterChange` returns a rejection, a semantic no-op, or replacement bytes with checked preconditions. `commitParameterChange` submits one checked write. A source change or competing write therefore conflicts rather than overwriting newer data.

The set machine sequences these functions and publishes native `settled` events. Host composition supplies its load, commit and observation actors. It coalesces queued edits while retaining the final release, drains escaped writes on close and uses bounded readback after an uncertain acknowledgement. A missing durable receipt remains indeterminate; it does not prove that a write was not applied.

Explicit declarations take precedence over versioned English inference. Native values and per-field provenance are retained. Unknown units remain unknown. Decimal data is preserved but is not presented as exact executable binary64 arithmetic.

## Source-unit changes

Plans require the declared producer capability, dependency identity and explicit confirmation. The generic checked sidecar writer refuses source-unit transactions with `UNSUPPORTED_SOURCE_UNIT_TRANSACTION`. A host must supply an actual declaration-owner transaction; editing only the sidecar is not an atomic source change.

## Development

From the Tau workspace root, use the `parameters` Nx project for lint, test, typecheck, build and package checks. The JSON Structure SDK license is reproduced in `NOTICE`.
