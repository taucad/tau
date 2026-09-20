---
title: 'Parameter Record Policy'
description: 'What the parameter sidecar may store, and how concurrency, echoes and rendering are decided around it.'
status: active
created: '2026-09-17'
updated: '2026-09-21'
---

# Parameter Record Policy

Internal reference for the durable parameter record at `.tau/parameters/<entry>.json` and the rules every reader and writer of it shares.

## Rationale

The record had grown into a protocol ledger: a version, a profile, an ordering, per-field bindings, the last operation and a request receipt all lived beside the values. Every one of those is derivable from the live manifest or belongs to a single in-flight exchange, so each added a way for the file to disagree with the producer and a second answer to "what is current". The record now holds only what a person authored, and the live manifest answers everything else.

## Rules

### 1. Store only what a person authored

The record is exactly `activeGroup` plus a `groups` object with at least one group. Every group contains `values` and may contain `units` and `sourceUnits` maps keyed by RFC 6901 instance pointers beginning with `/`. `activeGroup` must name one of those groups. Group key order is display order. Nothing else may be stored.

`units[p]` is the unit a person chose. `sourceUnits[p]` marks the stored number for conversion from that chosen unit to the producer unit, and the schema therefore requires `sourceUnits[p] === units[p]`. A pointer in `units` alone is a relabel: its stored number and numeric bounds keep their values and are not converted.

Readers enforce the record bounds before accepting it: at most 1 MiB of bytes, 1,000,000 JSON characters, depth 64 and 10,000 nodes.

**Why**: Anything a producer can recompute is a second copy that can be wrong; anything belonging to one exchange is gone by the time the file is read again.

CORRECT:

```json
{
  "activeGroup": "default",
  "groups": {
    "default": {
      "values": { "shellLength": 20 },
      "units": { "/shellLength": "in" },
      "sourceUnits": { "/shellLength": "in" }
    }
  }
}
```

INCORRECT:

```json
{
  "recordVersion": 1,
  "profile": "tau-json-structure-units-03-v1",
  "activeGroup": "default",
  "order": ["default"],
  "lastOperation": { "requestId": "agent:1" },
  "groups": { "default": { "values": { "shellLength": 520 }, "bindings": { "/shellLength": { "unit": "in" } } } }
}
```

### 2. Never persist manifest-derived data or protocol evidence

Units, quantity kinds, spaces, references, representations, constraints, defaults, producer identity and source revisions come from the manifest the runtime compiled for this render. Request identifiers, operation kinds, write receipts and actor session tokens belong to the exchange, not the file.

**Why**: A stored binding outlives the declaration it copied. A stored receipt makes the record a log that every reader must interpret.

The one exception is a person's own unit choice. `units[p]` records that choice. Presence of the same pointer and unit in `sourceUnits` is the converting-claim marker described by Rule 1; absence from `sourceUnits` makes the choice a relabel only. The producer unit and capability still come from the manifest and are never copied into the record.

### 3. Refuse an unreadable record through one policy, and never overwrite its bytes

`requireParameterRecord` is the single admission point. Unreadable JSON, an unknown key, or a record that fails the strict schema throws `INVALID_RECORD` carrying `applicationState: 'known-not-applied'`. The bytes stay on disk untouched.

**Why**: Data loss is never the recovery. The person decides whether to discard their file.

Kernels surface the code as a runtime issue, the agent tool returns an `unresolved` result naming it, and the editor offers _Reset to model defaults_ — a checked write whose precondition is the preserved bytes, so a concurrent repair is never clobbered. There is no migration path and no backward compatibility: a record in a retired shape is simply invalid.

### 4. Prove concurrency with the sidecar's own bytes and the live manifest revision

A checked write carries exactly one precondition: the sidecar bytes the change was planned from (`null` for an absent file). A request carries `expected.manifestRevision`, and the planner refuses it with `STALE_MANIFEST` once the live manifest differs.

**Why**: A source change already produces a new manifest revision, so one in-memory token covers every semantic input. Source files are never digested at the authority boundary.

A value edit may also carry a field-scoped `base` — the value and effective binding its editor was working from. The edit commits while its own field still holds that value, so another field's commit, a group operation or an agent write elsewhere in the record never refuses it.

### 5. Adopt an own-write echo instead of rejecting on it

A watch event whose re-read returns bytes equal to the ones this actor just wrote is adopted without re-publishing. A record change arriving during planning or confirmation refreshes and re-plans. A checked-write conflict follows the same route for at most three total attempts; exhaustion rejects with `RECORD_CONFLICT`.

**Why**: The write's own notification arrives after the command that caused it. Treating it as foreign made an edit reject itself.

Only `base` decides whether the field itself moved. After an uncertain write, the machine re-reads the record and compares bytes: the planned bytes settle as `committed`, the planned-from bytes as `WRITE_FAILED`, and any other valid bytes settle as indeterminate `UNKNOWN_APPLICATION` before work continues from that refreshed record. Only a failed recovery read enters uncertain mode with `RECOVERY_FAILED`; resolving the authority exits that mode.

### 6. Keep three explicit render lanes and one value precedence

The three render lanes are:

- **Watch** for an external sidecar change from an agent, another tab, git or a hand edit.
- **Staged commit** after this actor's checked write, carrying the exact sidecar bytes just persisted so the UI does not wait for its watch echo.
- **Transient scrub** carrying a never-persisted preview sample. It may update displayed geometry but never the published artifact.

Values reach the kernel only as sidecar bytes or as a never-persisted scrub sample. The staged commit is not a second value authority: it carries those same persisted bytes, and the later watch event is hash-equal.

At render time the precedence is `defaults ← stored ← caller overrides`: the resolver merges `parameterRecordInputValues(record)` below caller overrides. After the middleware chain, the worker converts unit-bearing text and fills missing defaults once at the kernel boundary. A unit-bound numeric field accepts a number in its declared unit or text such as `"20 in"`; a record value marked by `sourceUnits` becomes that text. Unit-bearing text for a field with no unit is refused with `SEMANTICS_UNRESOLVED`.

**Why**: The watch owns foreign writes, staging removes latency from an acknowledged local commit, and scrubbing gives live feedback without turning a preview into stored state. One documented precedence keeps all three lanes semantically equal.

## Summary Checklist

- [ ] The written record contains only `activeGroup`, a non-empty `groups`, and each group's `values`, `units` and `sourceUnits`
- [ ] `activeGroup` exists, pointer keys begin with `/`, every `sourceUnits[p]` equals `units[p]`, and group order is display order
- [ ] The reader enforces the byte, character, depth and node bounds
- [ ] Nothing manifest-derived and no request evidence is stored
- [ ] The reader calls `requireParameterRecord` and leaves refused bytes alone
- [ ] The write's only precondition is the sidecar's own bytes
- [ ] The request carries the live manifest revision, and a value edit carries its field `base`
- [ ] Watch, staged commit and transient scrub preserve `defaults ← stored ← caller overrides`

## References

- Package: `packages/parameters` (`README.md`, `AGENTS.md`)
- Related: `docs/policy/filesystem-authority-policy.md`, `docs/policy/xstate-policy.md`
