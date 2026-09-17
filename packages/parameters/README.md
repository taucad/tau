# @taucad/parameters

Portable parameter declarations, unit inference, record projection and checked change planning. Runtime produces manifests; this package does not import runtime or own a filesystem.

## Entry points

- `@taucad/parameters`: pure manifest admission, English inference, value projection, explicit snapshots and operation planning.
- `@taucad/parameters/authority`: stateless snapshot loading, checked commit and record refresh using caller-supplied byte authority.
- `@taucad/parameters/set-machine`: native XState workflow and a per-command subscription helper.
- `@taucad/parameters/schema`: existing JSON Schema admission helpers.
- `@taucad/parameters/json`: bounded JSON admission.

XState is an optional peer for the machine entry points. The pure entry point does not depend on XState or runtime.

## Stored record

Values live in a sidecar next to the source, `.tau/parameters/<entry>.json`. It holds what a person authored and nothing else: no version, no profile, no protocol evidence, and nothing derivable from the live manifest.

```json
{
  "activeGroup": "default",
  "groups": { "default": { "values": { "shellLength": 520 }, "units": { "/shellLength": "in" } } }
}
```

`units` is the unit the stored number means, keyed by RFC 6901 instance pointer. Its presence is the field's `project` provenance: it overrides an inferred manifest unit, and conflicts with an explicitly declared one. `sourceUnits` records the variant a source-unit-capable producer converts back from. Both are omitted when empty.

`serializeParameterRecord` writes canonical bytes: keys are sorted inside `values`, `units` and `sourceUnits`, group order is preserved and the file ends with a newline, so equal records have equal bytes.

Every reader applies one refusal policy through `requireParameterRecord`. Unreadable JSON, an unknown key or a record that fails its schema throws `INVALID_RECORD` with `applicationState: 'known-not-applied'`, and the bytes stay on disk untouched. Kernels report the code as a runtime issue, the agent tool returns an `unresolved` result with the code, and the editor offers _Reset to model defaults_, which writes a fresh record only if the preserved bytes are still there.

## Operation boundary

`loadParameterSnapshot` resolves the producer's semantics and retains the exact sidecar bytes. Source files are neither read nor digested: a source change produces a new manifest revision, which is what refuses a request built against the old one. Reading an absent sidecar produces a virtual default without writing it, and `refreshParameterSnapshot` re-reads only the sidecar.

`planParameterChange` returns a rejection, a semantic no-op, or replacement bytes with one checked precondition: the sidecar's own bytes. A request whose `expected.manifestRevision` differs from the live manifest is refused with `STALE_MANIFEST`. A value edit carrying `base` commits while its own field still holds that value under an unchanged effective binding, so an edit to another field never conflicts with it. `commitParameterChange` submits one checked write, and a competing write conflicts rather than overwriting newer data.

The set machine sequences these functions and publishes native events. Each `settled` event names the request it settles; a confirm or cancel naming no held command emits `command-rejected` instead. Pending commands form a queue of at most 8, and a newer value edit for the same field replaces the older one in place with a `cancelled-before-apply` settlement. A record change during planning or confirmation refreshes and re-plans rather than rejecting, and a re-read that returns the bytes this actor just wrote is adopted without re-publishing. An uncertain write re-reads the record and compares bytes: the written bytes settle as `committed`, the planned-from bytes as `WRITE_FAILED`, and anything else stays indeterminate.

Explicit declarations take precedence over versioned English inference. Native values and per-field provenance are retained. Unknown units remain unknown. Decimal data is preserved but is not presented as exact executable binary64 arithmetic.

## Source-unit changes

A binding admits a source-unit change only when its producer declares `sourceUnitCapability` (currently `change-source-unit:preserve-size:v1`). The record stores the chosen unit under `units` and the producer-sanctioned variant under `sourceUnits`; the producer to convert back for comes from the live manifest, never from the file. Planning returns `confirmation-required` with a plan fingerprint, and only a `confirm` with that fingerprint writes the record.

A saved source unit stays valid while the same producer still advertises the same capability for that pointer. When that no longer holds, value edits are refused with `SOURCE_UNIT_REBIND_REQUIRED` until the group is reset or the unit is chosen again.

## Development

From the Tau workspace root, use the `parameters` Nx project for lint, test, typecheck, build and package checks. The JSON Structure SDK license is reproduced in `NOTICE`.
