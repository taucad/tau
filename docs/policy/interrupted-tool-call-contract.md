---
title: 'Interrupted Tool-Call Contract Policy'
description: 'Schema and provider-adapter rules for interrupted, stale, and partial AI SDK tool lifecycle parts'
status: active
created: '2026-04-23'
updated: '2026-07-22'
related:
  - docs/research/interrupted-tool-call-validation-failure.md
  - docs/research/google-cancel-followup-stale-tool-part-validation.md
  - docs/research/ui-message-schema-type-safety.md
  - docs/policy/testing-policy.md
  - docs/policy/cross-provider-content-contract.md
---

# Interrupted Tool-Call Contract Policy

Internal reference for how the API models, validates, and downstream-adapts tool parts when the user interrupts an assistant turn or when persisted AI SDK UI messages contain stale partial lifecycle state.

## Rationale

When a user stops or preempts a stream, the AI SDK can leave tool parts in several partial states: `input-streaming`, `input-available`, or `output-error` with malformed or incomplete arguments. If a later user message follows that assistant turn, those in-progress tool parts are no longer live stream state. They are historical interrupted records, and accepting the follow-up is a legitimate user flow.

The API owns this wire contract. The UI finalizer still cleans up the local tail for display and IndexedDB persistence, but the schema boundary must also recover stale histories from IndexedDB, future clients, CLI flows, tests, and third-party callers.

## Rules

### 1. Historical In-Progress Tool Parts Are Interrupted Records

A static or dynamic tool part in `input-streaming` or `input-available` becomes stale when it belongs to an assistant message followed by a later user message. `uiMessagesSchema` must canonicalize those historical in-progress parts to `output-error` with structured `USER_INTERRUPTED` metadata before strict per-tool validation runs.

Active current-tail assistant messages are different: if no later user message exists, `input-streaming` can remain live with typed partial static input or unknown dynamic input.

### 2. Static Tool Inputs Must Match Their Lifecycle State

Use the static tool schema according to the AI SDK lifecycle contract:

- `input-streaming` accepts typed partial input or `undefined`;
- `input-available`, `approval-requested`, `approval-responded`, `output-available`, and `output-denied` require complete typed input;
- `output-error` accepts complete typed input or `undefined`.

Dynamic tools remain unknown and must not use the static registry. Invalid static interrupted input is demoted to `rawInput` and `input` is cleared before strict validation.

### 3. `rawInput` Is the Lossless Forensic Channel

`rawInput: z.unknown().optional()` is the lossless channel for partial, malformed, or provider-native argument data. Keep canonical static `input` compatible with its lifecycle type instead of widening it to `unknown`.

Provider conversion uses the existing `input ?? rawInput` behavior, so interrupted attempts still produce coherent model history.

### 4. Normalize Inbound Payloads in `z.preprocess`

`uiMessagesSchema` wraps the strict per-part schema in `z.preprocess(normalizeToolLifecycleParts, rawUiMessagesSchema)`.

`normalizeToolLifecycleParts` is the single API-boundary lifecycle normalizer. It:

- scans messages right-to-left with a `seenLaterUser` boolean;
- terminalizes historical static and dynamic `input-streaming` / `input-available` tool parts;
- uses `tool-input.registry.ts` only for static tool states where strict validation or invalid-input demotion is meaningful;
- never consults the static registry for `dynamic-tool`;
- copies arrays/objects only when something actually changes;
- is idempotent.

Do not move this to a transform after strict validation; strict validation would reject the stale shape before the normalizer can repair it.

### 5. Dynamic Tools Follow Lifecycle Shape, Not Static Registry Shape

`dynamic-tool` parts are tool parts. They use `toolName` for provider-facing identity and lifecycle repair, but they have no entry in `tool-input.registry.ts` and must not be strict-validated through static Tau tool schemas.

Shared tool helpers should use `isAnyToolPart` / `getToolPartName` when behavior applies to both static and dynamic tools.

### 6. Approval Lifecycle State Must Not Be Rewritten as Interruption

Approval lifecycle states (`approval-requested`, `approval-responded`, `output-denied`) are valid AI SDK UI message states. Tau requires complete input for static approval states, keeps dynamic input unknown, and preserves approval metadata, but provider replay through the current LangChain adapter is not fully supported.

Until approval replay is implemented end-to-end, the API must fail explicitly before provider calls via `assertSupportedApprovalReplay`, returning `UNSUPPORTED_TOOL_APPROVAL_REPLAY`. The sanitizer must never silently relabel an approval response as `USER_INTERRUPTED`.

### 7. Provider Adapters Must See Paired Interrupted Tool Results

Once a stale tool part is canonicalized to interrupted `output-error`, the existing provider path applies:

- `toBaseMessages` carries the tool call using `input ?? rawInput`;
- cross-provider content normalization strips or heals provider-specific tool-call content blocks as needed;
- `messageContentSanitizerMiddleware` ensures every provider-facing tool call has a matching `ToolMessage`.

Synthetic interrupted tool results must include matching `tool_call_id`, `name`, `status: 'error'`, and JSON content with `{ errorCode, toolName, toolCallId, message }`.

### 8. Separate Wire Recovery From Canonical Output

When the AI SDK changes a lifecycle field or state, compare both its exported UI-message types and its runtime validator. Recover legacy wire shapes through preprocessing, defaults, or `rawInput`; every successful `uiMessagesSchema` output must remain assignable to `MyUIMessage[]` without an assertion. Do not copy a permissive intermediate `unknown` field into canonical output merely because the upstream validator later casts its result.

## Decision Table

| Concern                           | Location                                                                   |
| --------------------------------- | -------------------------------------------------------------------------- |
| UI-message wire schema            | `libs/chat/src/schemas/message.schema.ts` (`uiMessagesSchema`)             |
| Tool lifecycle normalization      | `libs/chat/src/schemas/message.schema.ts` (`normalizeToolLifecycleParts`)  |
| Strict static tool input schemas  | `libs/chat/src/schemas/tools/*.tool.schema.ts`                             |
| Static tool input registry        | `libs/chat/src/schemas/tool-input.registry.ts`                             |
| Static/dynamic tool part helpers  | `libs/chat/src/utils/tool-part.utils.ts`                                   |
| UI tail finalization              | `apps/ui/app/utils/chat.utils.ts` (`finalizeInterruptedToolParts`)         |
| Unsupported approval replay guard | `apps/api/app/api/chat/utils/assert-supported-approval-replay.ts`          |
| Synthetic tool-result pairing     | `apps/api/app/api/chat/middleware/message-content-sanitizer.middleware.ts` |

## Anti-Patterns

- Special-casing `edit_file`, `read_file`, or any individual tool for stale-state repair.
- Treating every malformed tool input as acceptable forever; completed static success states still use strict schemas.
- Copying permissive `validateUIMessages` branches without checking the exported AI SDK output types.
- Requiring the web UI to heal every payload before the API can accept it.
- Running lifecycle repair after strict Zod validation.
- Consulting `tool-input.registry.ts` for `dynamic-tool`.
- Letting approval lifecycle state fall through to synthetic `USER_INTERRUPTED`.
- Adding provider-specific Google middleware for a DTO validation failure.

## Summary Checklist

- [ ] Historical assistant `input-streaming` / `input-available` tool parts followed by a user message canonicalize to interrupted `output-error`.
- [ ] Active current-tail static `input-streaming` parts use typed partial input; dynamic parts remain unknown.
- [ ] Static available, approval, success, and denied states validate complete input.
- [ ] Invalid static interrupted input moves to `rawInput`.
- [ ] Dynamic tools are included in lifecycle normalization and UI finalization.
- [ ] `rawInput`, `title`, provider metadata, and approval metadata are preserved where valid.
- [ ] Approval histories fail explicitly before provider replay until adapter support exists.
- [ ] API round-trip tests cover the June 11 `edit_file` part 47 and June 18 `read_file` part 20 fixtures.
- [ ] Performance tests assert copy-on-write and registry short-circuiting.

## References

- `docs/research/google-cancel-followup-stale-tool-part-validation.md`
- `docs/research/interrupted-tool-call-validation-failure.md`
- `docs/research/ui-message-schema-type-safety.md`
- `docs/policy/testing-policy.md`
- `repos/ai/packages/ai/src/ui/ui-messages.ts`
- `repos/ai/packages/ai/src/ui/validate-ui-messages.ts`
