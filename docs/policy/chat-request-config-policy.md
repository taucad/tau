---
title: 'Chat Request Config Policy'
description: 'Single source of truth for chat request configuration: schema-as-registry, top-level `agent` block, and the profile-scoped chat-client indirection that keeps configuration centralized.'
status: active
created: '2026-05-18'
updated: '2026-05-18'
related:
  - docs/research/chat-metadata-first-class-architecture.md
  - docs/research/chat-edit-message-metadata-stripping.md
  - docs/policy/library-api-policy.md
  - docs/policy/testing-policy.md
---

# Chat Request Config Policy

Internal reference for how per-request chat configuration (model, kernel, mode, tool choice, testing toggle, snapshot, context payload) flows from the UI to the API. Rules here lock in the architecture defined by the [chat metadata first-class architecture blueprint](../research/chat-metadata-first-class-architecture.md).

## Rationale

Before this policy, per-turn configuration leaked across the codebase in three incompatible shapes — the last user message's `metadata.*` (read by `extractRequestConfig` on the server, repeatedly stripped on edits), inline `body: { kernel, model, ... }` literals stamped by each UI submission site, and module-scope helpers like `useChatConstants` that owned a second transport. Adding a new flag required touching every site, and the regularity of "edit-resubmit loses kernel" and "missing testingEnabled" 400s confirmed the design was structurally broken (see [chat-edit-message-metadata-stripping](../research/chat-edit-message-metadata-stripping.md)).

The new shape is a single Zod-defined `agent` block on the request body, composed inside profile-scoped chat-client hooks, and dispatched into the persistence machine through one indirection layer — so adding a flag is one schema edit plus one assembler-hook line, and every UI site automatically picks it up.

## Rules

### 1. The Schema Is the Registry

All per-request chat configuration is defined in `libs/chat/src/schemas/agent-config.schema.ts`. The exported `agentConfigSchema` discriminated union (`profile: 'cad' | 'project_name' | 'commit_name'`) and the `chatTurnRequestSchema` wrapper in `libs/chat/src/schemas/chat-turn-request.schema.ts` are the only sources of truth. The API mounts these schemas verbatim (`apps/api/app/api/chat/chat.dto.ts`); UI clients import them through `@taucad/chat/schemas`. The wrapper schema is named after the domain concept (a single chat turn), not after HTTP body vocabulary — the API DTO class (`CreateChatDto`) keeps the HTTP-layer name because that is where the transport binding lives.

**Why**: One schema → one set of types → one JSON Schema → one validator on both sides. Drift is impossible because there is nothing to drift from.

CORRECT:

```typescript
import { agentConfigSchema, chatTurnRequestSchema } from '@taucad/chat/schemas';
```

INCORRECT:

```typescript
// Duplicating the shape in apps/api/.../some.dto.ts or in apps/ui/.../some.types.ts
type AgentConfig = { profile: 'cad'; model: string; kernel: string };
```

### 2. Use the Top-Level `agent` Block — Never per-Message Metadata

Per-request configuration travels as a single `agent` object on the wire body. Never read or write `lastUserMessage.metadata.<config>` on the API side; never stamp configuration into `messages[i].metadata.<config>` on the UI side beyond purely historical display fields (`createdAt`, `status`).

**Why**: Edit/regen flows rewrite trailing messages and strip foreign metadata fields. Anchoring configuration to a transient message is the exact bug that drove this refactor.

CORRECT:

```typescript
// UI
chat.sendMessage(message, { body: { agent: { profile: 'cad', model, kernel /* … */ } } });

// API
const { agent } = body;
switch (agent.profile) {
  case 'cad':
    return handleCad(body, agent, response);
}
```

INCORRECT:

```typescript
// UI
const message = createMessage({ metadata: { kernel, model, testingEnabled } });
chat.sendMessage(message); // wire body is `messages` only — server has nothing to discriminate on.

// API
const lastUser = messages.findLast((m) => m.role === 'user');
const modelId = lastUser?.metadata?.model ?? 'openai-gpt-5.5-fallback'; // metadata.model no longer exists; read body.agent.model.
```

### 3. Pure Zod — Never `.refine()` / `.superRefine()` on Request Schemas

`agentConfigSchema`, `chatTurnRequestSchema`, and every nested fragment must be pure structural Zod (`z.object`, `z.discriminatedUnion`, `z.string`, `z.literal`, `.optional()`, `.default(...)`). No `.refine()` / `.superRefine()` / `.check()` / `.transform()` callbacks may live on request schemas.

**Why**: Pure Zod converts cleanly to JSON Schema (`z.toJSONSchema`) with `oneOf` keyed on the discriminator. Refines collapse to brittle `not` / `if` / `then` keywords that confuse downstream tooling (OpenAPI generators, client codegen, schema diff). The `chat.controller.json-schema.test.ts` snapshot test fails the moment a refine slips in.

CORRECT:

```typescript
export const cadAgentConfigSchema = z.object({
  profile: z.literal('cad'),
  model: z.string(),
  kernel: kernelIdSchema,
  snapshot: chatSnapshotSchema.default({}),
});
```

INCORRECT:

```typescript
export const cadAgentConfigSchema = z
  .object({
    /* … */
  })
  .refine((value) => isAllowedKernel(value.kernel), { message: 'unknown kernel' });
```

### 4. Defaults Live in the Schema — But Only Real Defaults

Every optional configuration field that has a **sensible non-empty default value** (a number, an enum literal, a behaviour-shaping object) encodes that default in Zod via `.default(value)`. UI clients may pass `undefined`; the API never has to "fill in" missing keys.

When the only "default" you can think of is an **empty object that means "absent"**, use `.optional()` instead. `.default({})` plus a controller-side "is this default empty? collapse to undefined" check is two indirections expressing one thing the schema can express directly. The wire ↔ parsed type identity (`z.input` ≡ `z.infer`) is also a feature: assembler hooks and handlers see the same shape.

**Why**: Real defaults belong in the schema so the JSON Schema is honest (`"default": <value>` is published) and every handler stops re-deriving the same fallback. Sentinel-empty defaults are not real defaults — they are validation noise. Surfacing `undefined` straight through is cheaper and more accurate.

CORRECT — real default, encoded in schema:

```typescript
maxTokens: z.number().int().positive().default(4096),
mode: z.enum(['agent', 'plan']).default('agent'),
```

CORRECT — optional with no real default:

```typescript
snapshot: chatSnapshotSchema.optional(),
contextPayload: contextPayloadSchema.optional(),
// Controller reads `agent.snapshot` directly; a single `if (snapshot)` check
// downstream gates injection. No `isSnapshotEmpty` helper, no collapse step.
```

INCORRECT — sentinel "empty default" that forces a controller-side collapse:

```typescript
snapshot: chatSnapshotSchema.default({}),
// …and then in the controller, an ugly middle layer:
const isSnapshotEmpty = (s: ChatSnapshot): boolean =>
  s.fileTree === undefined && s.activeFile === undefined && s.openFiles === undefined;
const snapshot = isSnapshotEmpty(agent.snapshot) ? undefined : agent.snapshot;
```

### 5. Profile-Scoped Chat Clients Are the Only Wire Surface

Every UI site that wants to talk to `POST /v1/chat` goes through a profile-scoped client hook in `apps/ui/app/chat-clients/`:

| Profile        | Client hook              | Exposed verbs                                       |
| -------------- | ------------------------ | --------------------------------------------------- |
| `cad`          | `useCadChatClient()`     | `submit`, `edit`, `retry`, `regenerateTail`, `stop` |
| `project_name` | `useProjectNameClient()` | `generate(prompt)`                                  |
| `commit_name`  | `useCommitNameClient()`  | `generate(prompt)`                                  |

The shared AI SDK transport + `Chat` factory live in `apps/ui/app/chat-clients/_internal/shared-chat-transport.ts` and may **only** be imported by those three client files. The chat-session store consumes the live `Chat` instance through the `_internal/use-active-chat-instance.ts` hook; no other module may touch the `_internal/` folder.

**Why**: Indirection of one. Adding `testingEnabled` to the wire surface is exactly one assembler-hook line; adding a new profile is exactly one schema branch + one client file. No call-site sweeps.

**Enforced by**: ESLint `no-restricted-imports` scoped to the `_internal/` path.

CORRECT:

```typescript
const cadChat = useCadChatClient();
cadChat.submit({ text });
cadChat.edit(messageId, { text, imageUrls });
cadChat.retry(messageId, modelIdOverride);
```

INCORRECT:

```typescript
import { Chat } from '@ai-sdk/react';
import { sharedChatTransport } from '#chat-clients/_internal/shared-chat-transport.js';
const chat = new Chat({ id, transport: sharedChatTransport /* … */ });

// or, hand-building the body literal anywhere outside the three client modules:
const body = { agent: { profile: 'cad', model, kernel, mode, toolChoice, testingEnabled } };
fetch('/v1/chat', { method: 'POST', body: JSON.stringify({ messages, ...body }) });
```

### 6. Controller Dispatches via `switch (body.agent.profile)`

`apps/api/app/api/chat/chat.controller.ts` opens with a single `switch (body.agent.profile)`. Each case receives a statically-typed `agent` variant (no re-parsing, no `lastUserMessage.metadata` reads, no `modelId === 'name-generator'` string-matching). New profiles are added by extending `agentConfigSchema` and adding one `case` arm.

**Why**: Discrimination is the schema's job; handlers should never re-derive it from message bodies. The legacy `modelId === 'name-generator' | 'commit-name-generator'` string match was a smell that hid the profile in a sentinel value.

CORRECT:

```typescript
switch (body.agent.profile) {
  case 'project_name': { /* … */ }
  case 'commit_name': { /* … */ }
  case 'cad': {
    const { agent } = body; // statically `Extract<AgentConfig, { profile: 'cad' }>`
    return this.streamAgentResponse({ /* … */, modelId: agent.model, kernel: agent.kernel });
  }
}
```

INCORRECT:

```typescript
const { modelId, kernel, mode } = extractRequestConfig(body.messages);
if (modelId === 'name-generator') return sendNameStream(/* … */);
if (modelId === 'commit-name-generator') return sendCommitStream(/* … */);
```

### 7. Agent-Body Assemblers Are Hooks, Not Constants

Each profile has an assembler hook (`useCadAgentConfig`, `useProjectNameAgentConfig`, `useCommitNameAgentConfig`) that composes the current `agent` payload from the producer hooks (`useActiveChatModel`, `useActiveChatKernel`, cookies, `useChatSnapshot`, `useContextPayload`). The chat-client memoises `body = { agent }` on assembler identity. Adding a new field is exactly one line in the assembler and one optional field on the schema.

**Why**: Producer hooks already encode the "current UI state". Composing the body inside a hook means every render has the freshest values and the chat-client never has to reach across module boundaries to read state.

### 8. Hydration Auto-Regenerate Falls Back to `latestAgentBody`

When the persistence machine hydrates a chat whose last user message has `status: 'pending'`, it dispatches a `regenerate` request through the persistence machine before the chat-client has had a chance to attach a `body`. The chat-session store falls back to the `latestAgentBody` published by `useCadChatClient.useEffect`. Production code must always call `store.setLatestAgentBody(activeChatId, body)` from the chat-client mount effect.

**Why**: Without the fallback, the first turn of a homepage-seeded chat would dispatch with `body: undefined` and the API would 400 with `agent: Required`. This rule keeps the hydration path on the same wire contract as every other dispatch.

### 9. No Persisted-Metadata Reads in Handlers

Server handlers must never read `message.metadata.<config>` to derive request configuration. Per-message metadata (`messageMetadataSchema`) carries display-side state only — creation timestamp and lifecycle status. It must not influence routing, model selection, kernel selection, tool choice, testing toggle, or anything else on the request path. Agent config lives exclusively on `body.agent`.

**Why**: The persistence layer rewrites trailing messages on edit/retry; treating `messages[-1].metadata` as a configuration source is the original bug this refactor exists to fix. After the schema narrow, the historical config fields no longer exist on `MyMetadata`, so this rule is structurally enforced — the entry remains as documentation of intent.

### 10. Test the Wire Contract End-to-End

Every chat client ships a `*.wire.integration.test.tsx` co-located with its source. The test mounts the client in jsdom, invokes a verb (`submit`/`retry`/`regenerateTail`/`generate`), captures the request the client hands to `useChatActions` (or `fetch`), composes a full chat-turn request, and asserts `chatTurnRequestSchema.parse(...)` accepts it. The exact same schema is what the API uses to validate `POST /v1/chat`, so a green test proves the contract holds.

**Why**: The class of bugs this policy exists to kill — "missing kernel", "missing testingEnabled", "wrong profile" — is caught at compile time by Zod inference, but only the wire-shape integration test proves that the producer hooks actually populate every required field on the live render path.

## Anti-Patterns

| Anti-pattern                                                                 | Why it's banned                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `lastUserMessage.metadata.<config>` reads on the server                      | Edit/retry rewrites the trailing message; configuration vanishes mid-flow.                  |
| Inline `body: { agent: { … } }` literals outside `apps/ui/app/chat-clients/` | Defeats the indirection-of-one rule; each new flag requires another sweep.                  |
| `.refine()` / `.superRefine()` on request schemas                            | Breaks JSON Schema generation; pollutes the published OpenAPI shape with `not`/`if`.        |
| `import { Chat } from '@ai-sdk/react'` outside the chat-client tree          | Bypasses the body-composition layer; the new wire body never gets attached.                 |
| `modelId === 'name-generator' \| 'commit-name-generator'` discrimination     | Profile lives on `agent.profile`; sentinel-string matching hides it from the type system.   |
| `useChatConstants` (deleted in t18)                                          | Owned a second `DefaultChatTransport`; superseded by the `_internal/shared-chat-transport`. |

## Summary Checklist

- [ ] New configuration field defined on `agentConfigSchema` (pure Zod, default-encoded if optional)
- [ ] UI producer hook surfaces the value (cookie, XState selector, snapshot, etc.)
- [ ] Profile assembler hook reads the producer and exposes the field
- [ ] No new `import { Chat }` / `import { DefaultChatTransport }` outside `_internal/`
- [ ] No new `metadata.<config>` reads in handlers (structurally impossible — `MyMetadata` is `{ createdAt?, status? }`)
- [ ] Wire-shape integration test covers the field
- [ ] `chat.controller.json-schema.test.ts` snapshot regenerated and reviewed (still clean `oneOf`)

## References

- Blueprint: `docs/research/chat-metadata-first-class-architecture.md`
- Smoking gun audit: `docs/research/chat-edit-message-metadata-stripping.md`
- Schema source: `libs/chat/src/schemas/agent-config.schema.ts`
- Wire schema: `libs/chat/src/schemas/chat-turn-request.schema.ts`
- Controller dispatch: `apps/api/app/api/chat/chat.controller.ts`
- Profile chat clients: `apps/ui/app/chat-clients/`
- Shared transport (restricted): `apps/ui/app/chat-clients/_internal/shared-chat-transport.ts`
- Related: `docs/policy/library-api-policy.md`, `docs/policy/testing-policy.md`
