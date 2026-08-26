---
title: 'Runtime Compatibility Policy'
description: 'Wire-version, tolerant-reader, peer-support, notification, and compatibility-gate rules for @taucad/runtime and @taucad/rpc.'
status: active
created: '2026-08-15'
updated: '2026-08-16'
related:
  - docs/policy/rpc-policy.md
  - docs/policy/version-policy.md
  - docs/research/runtime-wire-compatibility-blueprint.md
  - docs/research/runtime-prepublish-gate-blueprint.md
---

# Runtime Compatibility Policy

This policy governs compatibility between runtime clients, worker hosts, transports, and the shared RPC wire. Package SemVer remains governed by [Version Policy](version-policy.md); wire compatibility is a separate contract.

## Scope

These rules apply to:

- `@taucad/runtime` call, notify, hello, and initialization payloads;
- the runtime protocol carried over `@taucad/rpc` channels;
- every first-party runtime transport, including in-process, Web Worker, Node worker, and Electron utility hosts;
- future transports that carry the same runtime protocol.

They do not promise compatibility for an unrelated protocol merely because it uses `@taucad/rpc`.

## Single Wire Version

`protocolVersion` in `packages/runtime/src/types/protocol-header.types.ts` is the single runtime wire version. Do not introduce a second runtime protocol version field or infer compatibility from package versions.

Every runtime worker hello must carry `protocolVersion`. A client must validate it after the channel hello arrives and before sending runtime initialization. A mismatch rejects connection with `TransportProtocolVersionError`; it must not wait for a later call to hang or time out.

RPC frame version `v` protects the lower-level frame grammar. A known frame kind with the wrong `v` is dropped with a once-per-channel diagnostic. It is never dispatched as an application message.

## Version Changes

A non-additive runtime wire change must increment `protocolVersion` in the same change. Non-additive changes include:

- removing or renaming a field;
- making an optional field required;
- narrowing an accepted field value;
- changing a field's meaning or unit;
- changing a call result or notify direction incompatibly;
- reusing an existing call or notify name for different semantics.

Incrementing a package version alone does not satisfy this rule.

## Additive Payload Changes

An additive wire change is a new optional field that a version-equal receiver can verifiably ignore while preserving the existing message semantics. Additive changes do not increment `protocolVersion`.

Runtime wire schemas must therefore be tolerant readers: unknown fields are preserved or ignored, while known-field type checks and mode invariants remain enforced. A change is not additive merely because its TypeScript property is optional.

Every additive change must include a compatibility test proving that the previous reader shape accepts the new payload. `packages/runtime/src/types/runtime-protocol-payload-shape.test.ts` is the canonical location for these pins.

## Notifications

Unknown notify names are forward-compatible. A receiver with protocol schemas must drop an unknown notify with a diagnostic and keep the channel alive. The receiver must never reinterpret it, throw it into another handler, or close the channel.

A known notify whose payload violates its known-field schema is also dropped because notifies have no response channel. Required state transitions must use acknowledged calls when the sender needs a typed rejection.

Adding a notify name requires adding its schema in the same change. Adding a field to an existing notify follows the additive-payload rules above.

## Supported Peer Range

Until this policy is amended with an explicit compatibility matrix, Tau supports same-build runtime peers only. The client and worker must be produced from the same Tau build and must report the same `protocolVersion`.

`runtimeVersion` is diagnostic metadata, not a replacement for protocol negotiation. Equal package versions do not override a `protocolVersion` mismatch, and unequal package-version strings do not establish incompatibility when the protocol header is equal.

Cached workers, Electron renderer/utility skew, and remote hosts are still subject to the same-build support statement. The connect-time protocol check exists to fail those unsupported pairings deterministically.

## Required Gates

The following tests are release gates for runtime wire changes:

- `packages/runtime/src/types/runtime-protocol-schema-coverage.test.ts` — every call and notify has a registered validator, and the protocol inventory is pinned;
- `packages/runtime/src/types/runtime-protocol-payload-shape.test.ts` — payload invariants and additive-reader compatibility;
- `packages/runtime/src/types/protocol-header.runtime.test.ts` — protocol-header validation and typed mismatch errors;
- `packages/runtime/src/framework/runtime-worker-client.initialize.test.ts` — hello ordering and connect-time mismatch rejection;
- `libs/rpc/src/wire.test.ts` and `libs/rpc/src/channel-lifecycle.test.ts` — frame-version rejection and diagnostic behavior;
- `libs/rpc/src/wire-protocol-validation.test.ts` — schema-bound notification drop behavior.

Do not weaken or bypass these gates to land a wire change. If a required behavior changes, update `protocolVersion`, implementation, policy, and tests together.

## Review Checklist

For every runtime wire change, reviewers must confirm:

1. the change is classified as additive or non-additive;
2. `protocolVersion` is bumped when the change is non-additive;
3. all touched payload schemas remain tolerant to unknown fields;
4. known-field invariants remain strict;
5. schema coverage and the relevant compatibility pin are present;
6. unsupported peers fail with a typed error or diagnostic rather than hanging.
