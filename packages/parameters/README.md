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

## Stored record

Values live in a sidecar next to the source, `.tau/parameters/<entry>.json`. There is one record shape and no migration path:

```json
{
  "recordVersion": 1,
  "profile": "tau-json-structure-units-03-v1",
  "activeGroup": "default",
  "order": ["default"],
  "groups": { "default": { "values": { "width": 20 }, "bindings": {} } }
}
```

`serializeParameterRecord` writes canonical bytes: object keys are sorted inside values and bindings, so equal records have equal bytes. `readParameterRecord` classifies bytes as `current`, `unsupported-preserved` or `invalid-preserved` without changing them.

Every reader applies one refusal policy through `requireParameterRecord`. A record with another version or profile throws `UNSUPPORTED_RECORD`; unreadable JSON or a record without `recordVersion` throws `INVALID_RECORD`. Both carry `applicationState: 'known-not-applied'`, and the bytes stay on disk untouched. Kernels report the code as a runtime issue, the agent tool returns an `unresolved` result with the code, and the editor offers _Reset to model defaults_, which writes a fresh record only if the preserved bytes are still there.

## Operation boundary

`loadParameterSnapshot` resolves a manifest between two source snapshots and proves every file in `manifest.identity.sourceFiles` still has the digest the manifest was compiled from; a file the manifest saw as missing stays pinned as absent. A drift throws `STALE_MANIFEST`. Reading an absent sidecar produces a virtual default without writing it. `refreshParameterSnapshot` re-reads only the sidecar. `reloadParameterSnapshot` snapshots the source first and reuses the held manifest only while those bytes are unchanged; hosts use it for reads in the held resolution mode.

`planParameterChange` returns a rejection, a semantic no-op, or replacement bytes with checked preconditions. A value edit is rebased onto a newer revision only when the fields it touches are unchanged, so an edit to another field never conflicts with it. `commitParameterChange` submits one checked write. A source change or competing write therefore conflicts rather than overwriting newer data.

The set machine sequences these functions and publishes native events. Each `settled` event names the request it settles; a confirm or cancel naming no held command emits `command-rejected` instead. Pending commands form a queue of at most 16, and a newer transient for the same field replaces the older one in place with a `cancelled-before-apply` settlement. A final is never displaced, and a full queue refuses with `BUSY`. A `resolve` in the held mode refreshes bytes and never cancels a plan awaiting confirmation; only a changed mode or a source change does. A refresh that finds the same identity does not re-emit `loaded`. The machine drains escaped writes on close and uses bounded readback after an uncertain acknowledgement. A missing durable receipt remains indeterminate; it does not prove that a write was not applied.

The input machine keeps a retained draft per editor. An authority refresh with an unchanged value adopts the new revision instead of conflicting, and a focused field that has just committed starts its next draft from the first keystroke.

Explicit declarations take precedence over versioned English inference. Native values and per-field provenance are retained. Unknown units remain unknown. Decimal data is preserved but is not presented as exact executable binary64 arithmetic.

## Source-unit changes

A binding admits a source-unit change only when its producer declares `sourceUnitCapability` (currently `change-source-unit:preserve-size:v1`). The record stores the chosen unit with the producer and capability that interpret it, and the producer converts values when it builds. The request names that capability with the manifest's source identity. Its `dependencies` field is optional; each supplied entry must equal `manifest.identity.sourceFiles` for that file, otherwise the plan is refused with `STALE_MANIFEST`. Planning returns `confirmation-required` with a plan fingerprint, and only a `confirm` with that fingerprint writes the record.

A saved source unit stays valid across unrelated source edits while the same producer still advertises the same capability for the same authored unit. When that no longer holds, value edits are refused with `SOURCE_UNIT_REBIND_REQUIRED` until the group is reset or the unit is chosen again.

## Development

From the Tau workspace root, use the `parameters` Nx project for lint, test, typecheck, build and package checks. The JSON Structure SDK license is reproduced in `NOTICE`.
