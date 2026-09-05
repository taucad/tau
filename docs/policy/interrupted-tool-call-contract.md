---
title: 'Interrupted Tool-Call Contract Policy'
description: 'Durable rules for partial, interrupted, denied, and disconnected tool calls across UI messages and portable agent events'
status: active
created: '2026-04-23'
updated: '2026-09-05'
related:
  - docs/research/interrupted-tool-call-validation-failure.md
  - docs/research/google-cancel-followup-stale-tool-part-validation.md
  - docs/research/ui-message-schema-type-safety.md
  - docs/policy/testing-policy.md
  - docs/policy/cross-provider-content-contract.md
---

# Interrupted Tool-Call Contract Policy

Tau represents a tool call as durable lifecycle evidence. A stopped UI stream or disconnected host must settle every historical call before another model turn, while preserving enough input and identity to audit or safely retry the work.

## Rules

### 1. Normalize persisted UI history at the trust boundary

Use `uiMessagesSchema` in `libs/chat/src/schemas/message.schema.ts` for untrusted or persisted UI messages. An assistant tool part in `input-streaming` or `input-available` becomes a historical interruption only when a later user message proves it is no longer the live tail.

Canonicalize that historical part to `output-error` with structured `USER_INTERRUPTED` metadata before strict static-tool validation. A current tail may remain in progress.

### 2. Validate input according to lifecycle state

For registered static tools:

- `input-streaming` accepts partial typed input or no input;
- `input-available`, approval states, `output-available`, and `output-denied` require complete typed input;
- `output-error` may preserve malformed or partial input in `rawInput` while clearing canonical `input`.

Dynamic-tool input remains unknown. Never apply the static registry to dynamic parts. Approval input that no longer satisfies its schema must fail validation; do not erase the input and thereby change the approval meaning.

### 3. Preserve forensic input and stable identity

Use `rawInput` as the lossless channel for partial, malformed, or provider-native arguments. Keep the tool-call ID and tool name stable through validation, interruption, persistence, transport, and replay.

Do not turn a partial call into a new call merely to make validation pass.

### 4. Finalize only the interrupted UI tail

`finalizeInterruptedToolParts` in `apps/ui/app/utils/chat.utils.ts` may settle in-progress parts only on the interrupted assistant tail. It must consult `RpcLedger` before assigning an error: if execution already produced an output, preserve that settled outcome.

Map stop, preemption, disconnect, and failure causes to their explicit structured termination code. Persist the finalized tail through `ChatSessionStore` before accepting a follow-up that depends on it.

### 5. Treat the host event log as durable authority

Portable-host tool input and output events form the canonical execution pair. On reattach or resume, derive pending calls from the whole event log rather than the currently rendered UI suffix.

When a client disconnect leaves an input without output, `TauAgentHost` must append exactly one synthetic `CLIENT_DISCONNECTED` output for that call before continuing. Repeated recovery must be idempotent.

### 6. Remind the model to verify uncertain side effects

After synthesizing disconnected outputs, inject the stable one-time recovery reminder from `packages/agent-host/src/harness/interrupt-recovery.ts`. The reminder must tell the model that a tool may have completed and that state should be verified before retrying a side effect.

Do not claim that an interrupted tool definitely did or did not execute when the host lacks evidence.

### 7. Preserve approval and denial as first-class outcomes

Approval requests, approval responses, denials, aborts, and transport loss are distinct records. Do not flatten them into generic error text. Resume only from a durable approval or interruption record that matches the original tool-call ID.

### 8. Keep display repair separate from execution replay

UI finalization repairs presentation and persisted UI-message compatibility. Host recovery repairs the portable execution log. Neither layer may invoke the tool as a side effect of normalization.

### 9. Test boundary and recovery behavior

Tests must cover active-tail acceptance, historical canonicalization, invalid static approval input, dynamic input, settled-ledger preservation, disconnect output synthesis, idempotent recovery, and the one-time verification reminder.

Assert typed structures and stable IDs. Do not rely only on display strings or snapshots.

## Ownership

- UI-message normalization: `libs/chat/src/schemas/message.schema.ts`
- UI lifecycle helpers: `libs/chat/src/utils/tool-part.utils.ts`
- Tail finalization: `apps/ui/app/utils/chat.utils.ts`
- Settled-call ledger: `apps/ui/app/services/rpc-ledger.ts`
- UI persistence: `apps/ui/app/services/chat-session-store.ts`
- Portable recovery: `packages/agent-host/src/harness/interrupt-recovery.ts`
- Resume orchestration: `packages/agent-host/src/host/tau-agent-host.ts`
