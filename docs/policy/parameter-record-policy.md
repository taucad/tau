---
title: 'Parameter Record Policy'
description: 'What the parameter sidecar may store, and how concurrency, echoes and rendering are decided around it.'
status: active
created: '2026-09-17'
updated: '2026-09-17'
---

# Parameter Record Policy

Internal reference for the durable parameter record at `.tau/parameters/<entry>.json` and the rules every reader and writer of it shares.

## Rationale

The record had grown into a protocol ledger: a version, a profile, an ordering, per-field bindings, the last operation and a request receipt all lived beside the values. Every one of those is derivable from the live manifest or belongs to a single in-flight exchange, so each added a way for the file to disagree with the producer and a second answer to "what is current". The record now holds only what a person authored, and the live manifest answers everything else.

## Rules

### 1. Store only what a person authored

The record is exactly `activeGroup` plus, per group, `values` and the optional `units` and `sourceUnits` maps keyed by RFC 6901 instance pointer. Nothing else may be stored.

**Why**: Anything a producer can recompute is a second copy that can be wrong; anything belonging to one exchange is gone by the time the file is read again.

CORRECT:

```json
{
  "activeGroup": "default",
  "groups": { "default": { "values": { "shellLength": 520 }, "units": { "/shellLength": "in" } } }
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

The one exception is a person's own claim: `units` says what the stored number means, and `sourceUnits` says which producer-sanctioned variant a source-unit-capable producer converts back from. Both are authored, not derived.

### 3. Refuse an unreadable record through one policy, and never overwrite its bytes

`requireParameterRecord` is the single admission point. Unreadable JSON, an unknown key, or a record that fails the strict schema throws `INVALID_RECORD` carrying `applicationState: 'known-not-applied'`. The bytes stay on disk untouched.

**Why**: Data loss is never the recovery. The person decides whether to discard their file.

Kernels surface the code as a runtime issue, the agent tool returns an `unresolved` result naming it, and the editor offers _Reset to model defaults_ — a checked write whose precondition is the preserved bytes, so a concurrent repair is never clobbered. There is no migration path and no backward compatibility: a record in a retired shape is simply invalid.

### 4. Prove concurrency with the sidecar's own bytes and the live manifest revision

A checked write carries exactly one precondition: the sidecar bytes the change was planned from (`null` for an absent file). A request carries `expected.manifestRevision`, and the planner refuses it with `STALE_MANIFEST` once the live manifest differs.

**Why**: A source change already produces a new manifest revision, so one in-memory token covers every semantic input. Source files are never digested at the authority boundary.

A value edit may also carry a field-scoped `base` — the value and effective binding its editor was working from. The edit commits while its own field still holds that value, so another field's commit, a group operation or an agent write elsewhere in the record never refuses it.

### 5. Adopt an own-write echo instead of rejecting on it

A watch event whose re-read returns bytes equal to the ones this actor just wrote is adopted without re-publishing. A record change arriving during planning or confirmation refreshes and re-plans; it never rejects a queued command.

**Why**: The write's own notification arrives after the command that caused it. Treating it as foreign made an edit reject itself.

Only `base` decides whether the field itself moved. An uncertain write re-reads the record and compares bytes: the written bytes settle as `committed`, the planned-from bytes as `WRITE_FAILED`, and anything else stays indeterminate.

### 6. Let the watched record be the only render trigger

The runtime registers the sidecar as a watched dependency of every render. A checked write to it is what brings the geometry up to date; no UI path forwards the stored values to the kernel alongside it.

**Why**: Two triggers render twice for one edit and can disagree about which values are current.

A preview has no record. It owns its values in its own machine and sends them straight to the kernel; that is the only place values travel outside the file.

## Summary Checklist

- [ ] The written record contains only `activeGroup`, `values`, `units` and `sourceUnits`
- [ ] Nothing manifest-derived and no request evidence is stored
- [ ] The reader calls `requireParameterRecord` and leaves refused bytes alone
- [ ] The write's only precondition is the sidecar's own bytes
- [ ] The request carries the live manifest revision, and a value edit carries its field `base`
- [ ] The change reaches geometry through the watched sidecar, not a second path

## References

- Package: `packages/parameters` (`README.md`, `AGENTS.md`)
- Related: `docs/policy/filesystem-authority-policy.md`, `docs/policy/xstate-policy.md`
