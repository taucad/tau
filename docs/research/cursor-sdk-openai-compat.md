---
title: 'Cursor SDK Internals and OpenAI Chat Completions Compatibility'
description: 'Deep mine of @cursor/sdk@1.0.12 — its public surface, local/cloud runtimes, wire format, and a fit-assessment for exposing Cursor as an OpenAI-compatible chat-completions endpoint.'
status: active
created: '2026-05-05'
updated: '2026-05-05'
category: comparison
---

# Cursor SDK Internals and OpenAI Chat Completions Compatibility

Mines the published `@cursor/sdk@1.0.12` npm package, the public Cursor Cloud Agents REST API, and the Cursor IDE wire format reverse-engineered by community projects. Then assesses whether and how the surface can be exposed behind an OpenAI Chat Completions interface (`/v1/chat/completions` + `/v1/models`) — and what an honest adapter shape looks like.

## Executive Summary

The Cursor SDK is **agent-shaped**, not chat-shaped. A "Cursor agent" is a durable, stateful container holding a working tree (local) or a cloned repo (cloud), a built-in tool catalogue (shell, edit, read, write, glob, grep, ls, semSearch, mcp, task, …), and a conversation history that survives across `agent.send()` calls. There is no stateless "send these messages, get one completion" mode in the public surface. The cloud REST API at `https://api.cursor.com/v1/agents/...` is also agent-shaped — even `/v1/models` returns only a list of allowed model IDs, with no `/v1/chat/completions` endpoint.

You **can** build an OpenAI-compatible adapter, but it will be lossy: most Chat Completions request fields (`tools`, `tool_choice`, `temperature`, `top_p`, `n`, `seed`, `stop`, penalties, `logit_bias`, `response_format`, multi-turn `messages` arrays) have no Cursor analogue or actively conflict with the agent semantics. The seven existing community proxies (anyrobert/cursor-api-proxy, R44VC0RP/cursor-opencode-auth, leeguooooo/agent-cli-to-api, …) all wrap the `cursor-agent` CLI or speak Cursor's internal Connect-RPC directly; none are built on `@cursor/sdk` (it is too new — published April 2026, current version `1.0.12` from May 1 2026).

**Verdict: Reference, not Adopt.** Tau already has its own AI chat layer (`apps/api` + `libs/chat`), provider routing across Anthropic / Vertex / OpenAI / Cerebras / Together / Ollama, and an LLM-tool surface that is incompatible with Cursor's "agent owns everything" model. Bolting Cursor in via an OpenAI shim would add a 5.5 MB Node-only bundle (with `sqlite3`, `@statsig/js-client`, native sandbox helpers per platform), force per-request agent provisioning, leak Cursor's cwd/repo requirement into Tau's pipeline, and provide no capability that Tau's existing LangGraph agent does not already have.

The interesting parts of this research are: the SDK's wire-format documentation that lets future Tau work talk to Cursor as a _kernel-side_ tool (e.g. an MCP server that exposes Cursor's repo-aware refactor as a callable resource), and the field-by-field mapping table below as a reference for any team being asked to "wrap Cursor as an OpenAI endpoint".

## Methodology

1. `npm pack @cursor/sdk` (v1.0.12, 2.7 MB tgz, 11.7 MB unpacked, 134 files).
2. Read every `.d.ts` under `dist/esm/` (~1300 lines of declarations covering the entire public surface).
3. Bundle archaeology on `dist/esm/index.js` (5.5 MB minified webpack ESM bundle) and the dynamic chunk `dist/esm/642.index.js` (17 KB cloud SSE client) via `grep -ao` for URLs, RPC method names, headers, and library markers. The main bundle is a single line; isolating clean string matches required `grep -ao` rather than `grep -E`.
4. Fetched canonical docs:
   - [`@cursor/sdk` npm page](https://www.npmjs.com/package/@cursor/sdk)
   - [TypeScript SDK reference](https://cursor.com/docs/api/sdk/typescript) (1286 lines, fully captured)
   - [Cloud Agents REST API](https://cursor.com/docs/cloud-agent/api/endpoints)
5. Deployed two parallel subagents: one for full SDK module-graph extraction (95 numbered findings), one for the OpenAI-compat fit assessment + community-proxy prior-art landscape.
6. Cross-referenced community reverse-engineering at [`eisbaw/cursor_api_demo`](https://github.com/eisbaw/cursor_api_demo) for the Connect-RPC framing the SDK's local executor uses against `api2.cursor.sh`.

## SDK Architecture at a Glance

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Consumer code (Node.js >= 18)                                              │
│   import { Agent, Cursor } from "@cursor/sdk"                              │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │
       ┌───────┴────────┐
       │  SDKAgent      │   send() / stream() / wait() / cancel() / close()
       │  (durable)     │
       └───────┬────────┘
               │
       ┌───────┴────────┐  agent ID prefix routes the runtime:
       │  RunExecutor   │   bc-…  → cloud   |   anything else → local
       └─┬────────────┬─┘
         │            │
   ┌─────┴─────┐ ┌────┴──────────────────┐
   │  Local    │ │  Cloud                │
   │  Executor │ │  Executor             │
   └─────┬─────┘ └────┬──────────────────┘
         │            │
  ┌──────┴────┐  ┌────┴────────────────────┐
  │ sqlite3   │  │ CloudApiClient          │
  │ run /     │  │ • REST  api.cursor.com  │
  │ checkpoint│  │ • SSE   /runs/{id}/stream│
  │ store     │  └─────────────────────────┘
  │ blob KV   │
  │ Connect-  │
  │ RPC client├──────► api2.cursor.sh  (Connect-RPC, application/connect+proto)
  │ (proto)   │
  └───────────┘
```

## Findings

### Finding 1: The SDK is two distinct runtimes behind one façade

`Agent.create({ local: { cwd } })` returns an `agent-…` ID. `Agent.create({ cloud: { repos } })` returns a `bc-…` ID. The id prefix is the _only_ runtime discriminator at the call site — `Agent.resume(id)`, `Agent.get(id)`, `Agent.getRun(id)` all dispatch on `id.startsWith("bc-")` (`agent.d.ts` L121–L122; SDK skill at `.agent/skills-cursor/cursor-sdk/SKILL.md` warns that omitting both `local` and `cloud` silently defaults to local). That single dispatch decision drives:

| Aspect                 | Local                                                                                 | Cloud                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Where the agent runs   | Caller's Node process                                                                 | Cursor-hosted (or self-hosted pool) VM                                                    |
| Filesystem             | Caller's `cwd` (read/write directly)                                                  | Cloned `repos[].url` inside the VM                                                        |
| Auth                   | `CURSOR_API_KEY` exchanged for an access token via Connect-RPC                        | Same key, sent as `Authorization: Bearer <key>` (or HTTP Basic with key as username)      |
| Persistence            | sqlite3-backed `AgentRunStore` + `AgentCheckpointStore` + `BlobStore` on local disk   | Server-side; survives the SDK process exiting                                             |
| Stream transport       | In-process `SDKMessage` async generator                                               | Server-Sent Events on `GET /v1/agents/{id}/runs/{runId}/stream`                           |
| Required dependencies  | `sqlite3`, `@statsig/js-client`, ripgrep prebuilt, native sandbox-helper per platform | Just network                                                                              |
| Model required         | Yes — `Cursor.models.list()` validated client-side                                    | Optional — server resolves the team default                                               |
| MCP servers            | stdio + HTTP/SSE; OAuth tokens reused from the desktop Cursor app's keychain only     | HTTP/SSE only (stdio unsupported); OAuth handled server-side, headers/auth redacted in VM |
| `local.settingSources` | Honored                                                                               | Ignored (cloud always loads `project` / `team` / `plugins`)                               |

The SDK skill calls trap #1 "Missing `cloud: { repos }` silently defaults to local" — a real observation reflected in the type system: both `local` and `cloud` are optional on `AgentOptions` (`options.d.ts` L121–L142).

### Finding 2: The cloud REST API is fully public and minimal

Every cloud capability is reachable from `curl`. From `cloud-api-client.d.ts` and the [Cloud Agents API docs](https://cursor.com/docs/cloud-agent/api/endpoints):

| Verb     | Path                                        | Purpose                                              |
| -------- | ------------------------------------------- | ---------------------------------------------------- |
| `POST`   | `/v1/agents`                                | Create agent + enqueue initial run                   |
| `GET`    | `/v1/agents`                                | List agents (cursor-paginated, `prUrl` filter)       |
| `GET`    | `/v1/agents/{id}`                           | Read durable agent metadata                          |
| `POST`   | `/v1/agents/{id}/archive`                   | Soft-delete                                          |
| `POST`   | `/v1/agents/{id}/unarchive`                 | Restore                                              |
| `DELETE` | `/v1/agents/{id}`                           | Hard delete                                          |
| `POST`   | `/v1/agents/{id}/runs`                      | Send follow-up prompt (returns run handle)           |
| `GET`    | `/v1/agents/{id}/runs`                      | List runs                                            |
| `GET`    | `/v1/agents/{id}/runs/{runId}`              | Read run state                                       |
| `POST`   | `/v1/agents/{id}/runs/{runId}/cancel`       | Cancel (terminal — irreversible)                     |
| `GET`    | `/v1/agents/{id}/runs/{runId}/stream`       | SSE event stream (supports `Last-Event-ID` resume)   |
| `GET`    | `/v1/agents/{id}/artifacts`                 | List artifacts                                       |
| `GET`    | `/v1/agents/{id}/artifacts/download?path=…` | Presigned S3 URL (15-min TTL)                        |
| `GET`    | `/v1/me`                                    | API key info                                         |
| `GET`    | `/v1/models`                                | Allowed model IDs (string list — _not_ OpenAI shape) |
| `GET`    | `/v1/repositories`                          | GitHub repos accessible via Cursor's GitHub App      |
| `POST`   | `/v1/sub-tokens`                            | Mint 1-hour user-scoped worker token                 |

The SSE stream emits these event kinds (from the docs):

| Event       | Payload                        |
| ----------- | ------------------------------ | --------- | ---------- | ------- | ----------- | ------------ |
| `status`    | `{ runId, status: "CREATING"   | "RUNNING" | "FINISHED" | "ERROR" | "CANCELLED" | "EXPIRED" }` |
| `assistant` | `{ text }` (text delta)        |
| `thinking`  | `{ text }` (reasoning delta)   |
| `tool_call` | tool-call lifecycle update     |
| `heartbeat` | keepalive                      |
| `result`    | `{ runId, status }` — terminal |
| `error`     | `{ code, message }`            |
| `done`      | `{}`                           |

Reconnect with `Last-Event-ID` against the same run; the server may return `410 stream_expired` after the retention window (advertised on the `X-Cursor-Stream-Retention-Seconds` response header). One run is active per agent at a time — `POST /v1/agents/{id}/runs` while `RUNNING` returns `409 agent_busy` (cloud only — local agents instead expose `SendOptions.local.force` to expire the wedged run).

### Finding 3: The local executor speaks Connect-RPC to `api2.cursor.sh`

The local runtime does _not_ use the public REST API. From bundle archaeology and `executor-common.d.ts`:

- Bundle string match: `"api2.cursor.sh":e.baseUrl` and `createConnectTransport({baseUrl:r,httpVersion:"1.1",interceptors:[t],nodeOptions:{rejectUnauthorized:!isDev}})` (`dist/esm/index.js`).
- Imported from `@anysphere/proto/aiserver/v1/privacy_mode_pb.js` (`executor-common.d.ts` L5–L8) and `@anysphere/agent-client` (`AgentClient`, `executor-common.d.ts`).
- Runtime headers seen in the bundle: `Authorization: Bearer <apiKey>`, `x-cursor-client-type`, `x-cursor-client-version`, `x-cursor-streaming`, `x-cursor-hook-conversation-id`, `x-cursor-hook-generation-id`, `x-cursor-hook-model`.
- Only one Connect client is created via `createPromiseClient`-style wiring at the JS level: `DashboardService.getUserPrivacyMode` (telemetry/ghost-mode lookup at startup). All other server traffic routes through the imported `AgentClient` (an opaque Connect client whose actual RPC method names are baked into protobuf descriptors — `StreamUnifiedChatRequest`, `StreamUnifiedChatResponse`, `StreamUnifiedChatRequestWithTools`, `StreamUnifiedChatResponseWithTools` are all present as proto messages in the bundle).

[`eisbaw/cursor_api_demo`](https://github.com/eisbaw/cursor_api_demo) reverse-engineered the same wire from a different angle (intercepting the Cursor IDE itself) and documented:

- Endpoint: `https://api2.cursor.sh` (primary), `https://api3.cursor.sh` (telemetry), `https://agent.api5.cursor.sh` (agent privacy)
- Content-Type: `application/connect+proto`
- Streaming framing: `[msg_type:1B][msg_len:4B big-endian][msg_data]` where msg_type is `0=raw protobuf`, `1=gzip protobuf`, `2=raw JSON`, `3=gzip JSON`

The same key (`CURSOR_API_KEY`) authenticates both wire shapes — it is exchanged for a short-lived access token (`exchangeApiKeyForAccessToken` in `executor-common.d.ts` L11) before the first Connect call.

### Finding 4: Public SDK surface decomposed

`index.d.ts` re-exports from `public-api.js` and a handful of focused modules. Grouped:

| Group                    | Exported symbols (selection)                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Static façades**       | `Agent` (`create`, `prompt`, `resume`, `list`, `get`, `getRun`, `listRuns`, `archive`, `unarchive`, `delete`), `Cursor` (`me`, `models.list`, `repositories.list`)                                                                                                    |
| **Handles**              | `SDKAgent`, `Run`, `RunResult`, `RunStatus`, `RunOperation`, `RunGitInfo`                                                                                                                                                                                             |
| **Stream events**        | `SDKMessage` union: `SDKSystemMessage` \| `SDKUserMessageEvent` \| `SDKAssistantMessage` \| `SDKThinkingMessage` \| `SDKToolUseMessage` \| `SDKStatusMessage` \| `SDKTaskMessage` \| `SDKRequestMessage`                                                              |
| **Deltas (lower-level)** | `InteractionUpdate` union with 14 variants including `text-delta`, `thinking-delta`, `tool-call-started`/`partial-tool-call`/`tool-call-completed`, `step-started`/`completed`, `turn-ended` (carries `usage`), `summary-*`, `shell-output-delta`                     |
| **Conversation**         | `ConversationTurn` (agent or shell), `ConversationStep`, `AssistantMessage`, `ThinkingMessage`, `UserMessage`, `ShellCommand`, `ShellOutput` + Zod schemas                                                                                                            |
| **Tool catalogue**       | `ReadToolCall`, `WriteToolCall`, `EditToolCall`, `DeleteToolCall`, `GlobToolCall`, `GrepToolCall`, `LsToolCall`, `ReadLintsToolCall`, `McpToolCall`, `SemSearchToolCall`, `ShellToolCall`, `TaskToolCall`, `UpdateTodosToolCall`, `CreatePlanToolCall` (14 built-ins) |
| **Options**              | `AgentOptions`, `LocalAgentOptions`, `CloudAgentOptions`, `McpServerConfig`, `ModelSelection`, `ModelParameterValue`, `AgentDefinition` (subagents)                                                                                                                   |
| **Errors**               | `CursorAgentError` (root) + `AuthenticationError`, `RateLimitError`, `ConfigurationError`, `IntegrationNotConnectedError`, `NetworkError`, `UnknownAgentError`, `UnsupportedRunOperationError`                                                                        |
| **Local-runtime kit**    | `CursorAgentPlatform`, `createAgentPlatform`, `RunEventTailer`, `LocalRunStreamEvent`, `createInMemoryRunEventNotifier`, `LocalRunEventNotifierServer`, `decodeLocalRunStreamEvent` (for embedders building their own UI on top of the local store)                   |

The `RunInteractionAccumulator` is the canonical reducer that turns `InteractionUpdate` deltas into `ConversationTurn[]` — useful as a reference if a third-party consumer wants to materialise the same view from a different transport.

### Finding 5: Built-in tools always run, and the consumer cannot disable them

The 14 built-in tools listed above are not opt-in — they are part of the agent's identity. There is no `AgentOptions` field to suppress `shell` or `edit`; the model decides, and the SDK reports the result via `SDKToolUseMessage` events. Custom tools come in only via `mcpServers` (per-server, not per-tool gating). This is fundamentally incompatible with the OpenAI Chat Completions model where the caller hands the model a `tools: [{ type: "function", function: {...} }]` array and expects only those to fire.

The SDK docs include this stability note (and we should treat it as a hard contract):

> Tool call schema is not stable. The `args` and `result` payloads on `tool_call` events reflect each tool's internal shape and can change as tools evolve. Tool names can also be renamed or replaced. Treat `args` and `result` as `unknown` and parse defensively. The event envelope (`type`, `call_id`, `name`, `status`) is stable.

### Finding 6: Bundle weight and runtime requirements

| Dimension            | Value                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Tarball size         | 2.7 MB (134 files, 11.7 MB unpacked)                                                                            |
| Main bundle          | `dist/esm/index.js` — 5.5 MB single-line minified webpack ESM                                                   |
| Dynamic chunk        | `dist/esm/642.index.js` — 17 KB (cloud SSE consumer)                                                            |
| Type declarations    | `dist/esm/types/conversation-types.d.ts` alone is 444 KB (full union of every tool args/result)                 |
| Runtime deps         | `sqlite3`, `@bufbuild/protobuf`, `@connectrpc/connect`, `@connectrpc/connect-node`, `@statsig/js-client`, `zod` |
| Optional native deps | `@cursor/sdk-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-x64}` (sandbox-helper per platform)           |
| External CLI dep     | `ripgrep` prebuilt (`prepare:rg` script during package build)                                                   |
| Node version         | `>= 18` (uses `await using`, `Symbol.asyncDispose`)                                                             |

`sqlite3` is a hard runtime dependency, not optional — `executor-common.d.ts` and `platform.d.ts` reference `AgentRunStore`/`AgentCheckpointStore`/`BlobStore` from `@anysphere/agent-kv`, all of which are sqlite3-backed in the bundled local runtime. Browser/edge deployment is not viable without rewriting the local executor.

### Finding 7: There is no system-message channel in `agent.send()`

`agent.send(message: string | SDKUserMessage, options?: SendOptions)` accepts only the user turn. The system prompt is _server-side_ (Cursor's agent prompt is baked into the runtime) plus _subagent prompts_ (`AgentDefinition.prompt` for named subagents, picked up via the `Agent` tool). There is no place for an OpenAI consumer's `messages: [{ role: "system", content: "..." }]` payload to land — the closest analogue is creating a custom subagent named for the request and forcing the parent agent to spawn it, which is brittle.

### Finding 8: Per-send model overrides are sticky

> The `model` you pass to `agent.send()` overrides the agent's selection for that run, then becomes sticky: subsequent sends without an override continue to use the new model. (SDK docs)

In OpenAI Chat Completions, `model` is per-request and idempotent. Mapping a Cursor agent reused across consumer requests violates this expectation: a third request that omits `model` will silently use whatever the second request set. An adapter must either pass `model` on every send or accept this leak.

### Finding 9: `Cursor.models.list()` and `GET /v1/models` disagree in shape

| Surface                       | Returns                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TS SDK `Cursor.models.list()` | `ModelListItem[]` with `id`, `displayName`, `description?`, `parameters?` (per-model param defs), `variants?` (preset bundles) |
| REST `GET /v1/models`         | `{ items: string[] }` — flat list of IDs only                                                                                  |

The richer per-model `parameters` definition (e.g. composer-2's `thinking: low | high`) is only available through the SDK or via `Cursor.models.list()` over Connect-RPC, not through REST. An OpenAI shim that reads from REST loses the parameter surface; one that reads from the SDK pulls in the full local-runtime bundle.

## OpenAI Chat Completions Mapping

### Per-Field Mapping Table

Classification: **D** Direct · **L** Lossy · **A** Adapter-only (workaround) · **U** Unsupported · **C** Conflicts with agent semantics.

| OpenAI field                   | Cls | Cursor mapping                                                                                                                                                                                                                                            |
| ------------------------------ | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `model`                        | L   | `ModelSelection.id` (sticky, see Finding 8). Validate against `Cursor.models.list()` first.                                                                                                                                                               |
| `messages[].role: "system"`    | U   | No channel on `agent.send()`. Workaround: prepend to user text or define a subagent — both are leaks.                                                                                                                                                     |
| `messages[].role: "user"`      | A   | Concatenate `text` parts → `agent.send(text)`. Image parts → `SDKUserMessage.images`.                                                                                                                                                                     |
| `messages[].role: "assistant"` | C   | The agent already remembers its own assistant turns. Replaying them is wrong (duplicate output) and dropping them desyncs Cursor's view from the consumer's view. Adapter must reconcile via `Agent.getRun(...).conversation()` and reject on divergence. |
| `messages[].role: "tool"`      | C   | Tool results in Cursor flow back via `SDKToolUseMessage` `result` fields, generated by the _built-in_ tool execution. A consumer-supplied tool result is not addressable.                                                                                 |
| `messages[].content` images    | A   | `SDKUserMessage.images: SDKImage[]` (base64 + mimeType, or remote URL). Five-image / 15 MB cap.                                                                                                                                                           |
| `temperature`                  | U   | Not exposed. `model.params` carries categorical `thinking: low                                                                                                                                                                                            | high` etc. — not numeric sampling. |
| `top_p`                        | U   | Not exposed.                                                                                                                                                                                                                                              |
| `max_tokens`                   | U   | Not exposed. Run length is bounded by tool-budget and wall-clock, not output tokens.                                                                                                                                                                      |
| `n`                            | U   | One run per send. Adapter would have to fan out to N agents, multiplying billing.                                                                                                                                                                         |
| `stop`                         | U   | Not exposed.                                                                                                                                                                                                                                              |
| `presence_penalty`             | U   | Not exposed.                                                                                                                                                                                                                                              |
| `frequency_penalty`            | U   | Not exposed.                                                                                                                                                                                                                                              |
| `logit_bias`                   | U   | Not exposed.                                                                                                                                                                                                                                              |
| `seed`                         | U   | Not exposed.                                                                                                                                                                                                                                              |
| `response_format`              | U   | Not exposed; agent decides format. JSON mode would need a system-prompt injection (already U).                                                                                                                                                            |
| `tools`                        | C   | Cursor expects MCP servers (`mcpServers: Record<string, McpServerConfig>`), not inline JSON-Schema function defs. Reject or attempt synthesis-via-MCP-shim (deep work, fragile).                                                                          |
| `tool_choice`                  | C   | Cursor's planner decides when to call which tool. No client-side override.                                                                                                                                                                                |
| `parallel_tool_calls`          | C   | Implicit; Cursor may emit multiple concurrent tool calls but the consumer cannot pin behaviour.                                                                                                                                                           |
| `stream: true`                 | D   | `run.stream()` (cloud or local). Map per Finding 10.                                                                                                                                                                                                      |
| `stream_options.include_usage` | A   | Cursor exposes `usage` only via `onDelta`'s `TurnEndedUpdate` — not via `run.stream()`. Adapter must subscribe via `agent.send({ onDelta })` and surface in the final chunk.                                                                              |
| `user`                         | A   | Best slot to stash the durable Cursor agent ID for sticky-mode reuse (alternative: custom `X-Cursor-Agent-Id` header).                                                                                                                                    |
| `metadata`                     | A   | No native pass-through; can be folded into `name` / `cloud.envVars`.                                                                                                                                                                                      |
| `logprobs`                     | U   | Not exposed.                                                                                                                                                                                                                                              |
| `audio` modality               | U   | Text + image only.                                                                                                                                                                                                                                        |

Net: **15 fields Unsupported, 6 Conflicts, 6 Adapter-only, 1 Lossy, 1 Direct.** That is the answer to "is it possible?" — yes, but the resulting endpoint exposes ~5 % of the OpenAI request surface honestly and rejects the rest.

### Stream Translation Table

`run.stream()` yields `SDKMessage` envelopes; OpenAI consumers expect `data: {choices: [{delta: {…}}]}` SSE chunks (`text/event-stream`). Mapping:

| `SDKMessage` event             | Payload fields                                                            | OpenAI translation                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------- | -------- | ------------------------------------------------------------------------------------------ |
| `system` (subtype `init`)      | `model`, `tools[]` (catalogue)                                            | First chunk: `delta: { role: "assistant" }`. Discard `tools[]` (not consumer-actionable).                                                                                                                                                                                                  |
| `user` (echo of prompt)        | `message.content: TextBlock[]`                                            | Drop. The consumer already sent it.                                                                                                                                                                                                                                                        |
| `assistant`                    | `message.content: (TextBlock                                              | ToolUseBlock)[]`                                                                                                                                                                                                                                                                           | For each `TextBlock`: emit `delta: { content: text }`. **Verify whether `assistant` events are cumulative or incremental** before shipping; if cumulative, diff against last seen text. For each `ToolUseBlock`: emit `delta: { tool_calls: [{ index, id, type: "function", function: { name, arguments: JSON.stringify(input) } }] }`. |
| `thinking`                     | `text`, `thinking_duration_ms?`                                           | Map to OpenAI's reasoning extension: `delta: { reasoning_content: text }` (DeepSeek precedent — not core OpenAI spec; document this in the adapter's README).                                                                                                                              |
| `tool_call` (status=running)   | `call_id`, `name`, `args?`                                                | `delta: { tool_calls: [{ index, id: call_id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }`. Maintain a `call_id → index` map.                                                                                                                                |
| `tool_call` (status=completed) | `call_id`, `result?`, `truncated?`                                        | Synthesize `role: "tool"` chunk with `tool_call_id: call_id, content: JSON.stringify(result)` _if_ the consumer enabled `tool_choice` semantics; otherwise drop (OpenAI-compatible consumers don't expect tool _results_ in completion chunks unless they themselves drive the tool call). |
| `status`                       | `status: CREATING                                                         | RUNNING                                                                                                                                                                                                                                                                                    | FINISHED                                                                                                                                                                                                                                                                                                                                | ERROR | CANCELLED | EXPIRED` | Drop or surface via `x-cursor-status` SSE comment. Map terminal states to `finish_reason`. |
| `task`                         | `status?`, `text?`                                                        | Drop (Cursor-internal milestone marker).                                                                                                                                                                                                                                                   |
| `request`                      | `request_id`                                                              | Drop or convert to `error` (consumer cannot fulfil approval interactively over a single completion call).                                                                                                                                                                                  |
| —                              | `RunResult.status === "finished"`                                         | Final chunk: `delta: {}, finish_reason: "stop"`.                                                                                                                                                                                                                                           |
| —                              | `RunResult.status === "error"`                                            | `finish_reason: "stop"` + `error` field; or 502.                                                                                                                                                                                                                                           |
| —                              | `RunResult.status === "cancelled"`                                        | `finish_reason: "stop"`.                                                                                                                                                                                                                                                                   |
| `TurnEndedUpdate` (onDelta)    | `usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }` | Final chunk's `usage: { prompt_tokens, completion_tokens, total_tokens, prompt_tokens_details: { cached_tokens } }` — **only** if consumer requested `stream_options.include_usage`. Note: not visible via `run.stream()`; the adapter must subscribe via `agent.send({ onDelta: ... })`.  |

OpenAI's terminal frame `data: [DONE]` is unconditional; emit after the `finish_reason` chunk regardless of Cursor's `done` event.

### Architectural Impedance Mismatches

| #   | Mismatch                                                                                                               | Severity | Mitigation                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| M1  | Stateless completion vs durable agent — OpenAI clients retry on network errors, duplicating the prompt into the agent  | High     | Per-request agent (Sketch A) eliminates state but loses caching. Sticky mode (Sketch B) needs idempotency keys.                |
| M2  | Built-in tools always run — `shell`/`edit`/`write` may fire on any prompt                                              | High     | Document loudly; provide a `local: { sandboxOptions: { enabled: true } }` opt-in to scope blast radius.                        |
| M3  | MCP servers ≠ OpenAI `tools` array                                                                                     | High     | Reject `tools` at boundary, or build an MCP shim per request (expensive, fragile).                                             |
| M4  | Mandatory `cwd` (local) or `repos` (cloud)                                                                             | High     | Adapter must accept either as a header (`X-Cursor-Cwd` / `X-Cursor-Repos`) or fail closed.                                     |
| M5  | No `system` message slot                                                                                               | Medium   | Inject as user-prefix or via subagent definition; document the leak.                                                           |
| M6  | Sticky `model` selection                                                                                               | Medium   | Always pass `model` on every send; never rely on agent-level default.                                                          |
| M7  | History reconciliation in sticky mode — consumer sends `messages[]` longer than the agent has seen                     | High     | Use `Run.conversation()` / `Agent.list({ runtime: cloud })` to detect divergence; reject with 409 rather than silently desync. |
| M8  | Cursor key vs OpenAI key — a naive `Authorization: Bearer …` pass-through routes consumer's OpenAI key to Cursor (401) | High     | Always strip incoming `Authorization`; substitute server-side `CURSOR_API_KEY`.                                                |
| M9  | Billing leak — Cursor charges per Cursor pricing on the operator's account                                             | High     | Operator must rate-limit and meter; do not expose without per-tenant accounting.                                               |
| M10 | Cancellation is irreversible (`run.cancel()` → `CANCELLED` permanent)                                                  | Medium   | Map OpenAI client disconnect → `run.cancel()` only after a grace period; otherwise a flaky network kills runs.                 |
| M11 | Agent ID lifecycle — no obvious place to stash it on a stateless OpenAI request                                        | Medium   | Use `user` field (already string-typed in OpenAI spec) or a custom `X-Cursor-Agent-Id` header.                                 |
| M12 | Per-token granularity — OpenAI `delta.content` is per-token; Cursor `assistant` events arrive at higher granularity    | Low      | Subscribe via `onDelta` for `text-delta` updates and re-fragment.                                                              |

### Sketch A — Stateless Adapter

Each `/v1/chat/completions` call creates and disposes one agent. Cleanest semantics; latency cost on every call (cloud agent VM cold-start, local sqlite open).

```typescript
import { Agent, type SDKMessage } from '@cursor/sdk';
import express from 'express';

const app = express();
app.use(express.json());

app.post('/v1/chat/completions', async (req, res) => {
  const { messages, model, stream, user } = req.body;
  const last = messages.at(-1);
  if (last?.role !== 'user') return res.status(400).json({ error: 'last message must be user' });

  const cwd = req.header('x-cursor-cwd') ?? process.cwd();
  res.setHeader('content-type', stream ? 'text/event-stream' : 'application/json');

  await using agent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY!,
    model: { id: model ?? 'composer-2' },
    local: { cwd },
    name: user,
  });

  const promptText =
    typeof last.content === 'string'
      ? last.content
      : last.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');

  const run = await agent.send(promptText);
  const cmplId = `chatcmpl-${run.id}`;

  if (stream) {
    for await (const event of run.stream()) {
      const chunk = sdkEventToOpenAiChunk(event, cmplId, model);
      if (chunk) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    const result = await run.wait();
    res.write(
      `data: ${JSON.stringify({ id: cmplId, choices: [{ index: 0, delta: {}, finish_reason: result.status === 'finished' ? 'stop' : 'stop' }] })}\n\n`,
    );
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    const result = await run.wait();
    res.json({
      id: cmplId,
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: result.result ?? '' }, finish_reason: 'stop' }],
    });
  }
});

function sdkEventToOpenAiChunk(e: SDKMessage, id: string, model: string) {
  if (e.type === 'assistant') {
    const text = e.message.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return text
      ? { id, object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content: text } }] }
      : null;
  }
  if (e.type === 'thinking')
    return {
      id,
      object: 'chat.completion.chunk',
      model,
      choices: [{ index: 0, delta: { reasoning_content: e.text } }],
    };
  return null;
}
```

What this leaks: every request pays cold-start cost; no conversation memory across consecutive `/v1/chat/completions` calls (each call boots a fresh agent that re-sniffs the cwd). For cloud runtime, every request also creates a new `bc-…` agent in the operator's Cursor dashboard — these accumulate and need housekeeping (`Agent.archive`/`Agent.delete`).

### Sketch B — Sticky-Agent Adapter

Map `(client_id) → SDKAgent`, reuse across calls, send only the new turn. Cheaper on warm hits, complex reconciliation:

```typescript
import { Agent, type SDKAgent } from '@cursor/sdk';
import express from 'express';
import { LRUCache } from 'lru-cache';

const slots = new LRUCache<string, { agent: SDKAgent; mutex: Promise<void> }>({
  max: 1000,
  ttl: 30 * 60 * 1000,
  dispose: async (slot) => {
    await slot.agent[Symbol.asyncDispose]().catch(() => {});
  },
});

app.post('/v1/chat/completions', async (req, res) => {
  const { messages, model, stream, user } = req.body;
  const clientId = req.header('x-cursor-agent-id') ?? user;
  if (!clientId) return res.status(400).json({ error: 'stateful mode requires `user` or `X-Cursor-Agent-Id`' });

  let slot = slots.get(clientId);
  if (!slot) {
    const agent = await Agent.create({
      apiKey: process.env.CURSOR_API_KEY!,
      model: { id: model ?? 'composer-2' },
      local: { cwd: req.header('x-cursor-cwd') ?? process.cwd() },
      name: clientId,
    });
    slot = { agent, mutex: Promise.resolve() };
    slots.set(clientId, slot);
  }

  const release = await acquire(slot);
  try {
    const seen = await summarizeAgentHistory(slot.agent);
    const expected = messages.slice(0, -1);
    if (!historiesAlign(seen, expected)) {
      slots.delete(clientId);
      return res
        .status(409)
        .json({ error: 'agent history diverges from request `messages`; recreate the agent or omit prior turns' });
    }

    const last = messages.at(-1);
    const prompt = typeof last.content === 'string' ? last.content : flattenContent(last.content);
    const run = await slot.agent.send(prompt, { model: model ? { id: model } : undefined });

    res.setHeader('content-type', stream ? 'text/event-stream' : 'application/json');
    res.setHeader('x-cursor-agent-id', slot.agent.agentId);
    if (stream) await pumpStream(run, res, model);
    else res.json(await runToCompletion(run, model));
  } finally {
    release();
  }
});

async function acquire(slot: { mutex: Promise<void> }): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  const prev = slot.mutex;
  slot.mutex = next;
  await prev;
  return release;
}
```

Trade-offs: per-slot mutex serialises calls per `clientId` (Cursor allows one active run per agent — `409 agent_busy` enforced server-side on cloud); LRU eviction disposes agents (deletes local sqlite store; cloud agents stay archived in the operator's dashboard until `Agent.delete`); divergence detection is best-effort (Cursor's structured `Run.conversation()` is per-run, not per-agent — full agent history requires `Agent.listRuns` + per-run conversation aggregation, which is expensive).

## Prior Art

Seven community projects already do this. None use `@cursor/sdk` (it is too new — `1.0.7` was the first published version, late April 2026; current `1.0.12` is a week old at time of this research).

| Project                                                                                         | Approach                                                | Notes                                                                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`anyrobert/cursor-api-proxy`](https://github.com/anyrobert/cursor-api-proxy)                   | Wraps `cursor-agent` CLI; npm SDK + CLI server          | 44★, v0.7.0 April 2026, requires Cursor CLI installed separately; ships TLS/HTTPS via Tailscale |
| [`tageecc/cursor-agent-api-proxy`](https://github.com/tageecc/cursor-agent-api-proxy)           | Wraps Cursor CLI; npm package                           | Background service on port 4646, OpenClaw integration, Node 20+                                 |
| [`leeguooooo/agent-cli-to-api`](https://github.com/leeguooooo/agent-cli-to-api)                 | Python gateway over multiple agent CLIs                 | 33★, unifies Cursor + Claude Code + Gemini + Codex behind one `/v1/*`                           |
| [`R44VC0RP/cursor-opencode-auth`](https://github.com/R44VC0RP/cursor-opencode-auth)             | macOS Keychain-extracted token + Connect-RPC translator | 106★, port 4141, JS, models composer-1/gpt-5.2-codex/claude-4.5-sonnet                          |
| [`JonRoosevelt/cursor-opencode-plugin`](https://github.com/JonRoosevelt/cursor-opencode-plugin) | OpenCode-targeted `/v1/chat/completions`                | Configurable model aliases, dynamic discovery, MVP                                              |
| [`Nomadcxx/opencode-cursor`](https://github.com/Nomadcxx/opencode-cursor)                       | OpenCode integration via `cursor-acp` provider          | Local proxy at `127.0.0.1:32124/v1`                                                             |
| [`eisbaw/cursor_api_demo`](https://github.com/eisbaw/cursor_api_demo)                           | Pure reverse-engineering of the Cursor IDE wire         | Python protobuf decoder, streaming framing reference, working client for IDE v2.6.22            |

LiteLLM ships pass-through-only support for the Cursor v0 endpoints (`agent.api5.cursor.sh`) — **not** chat-completions translation. The maintainers explicitly do not translate, which is the strongest external signal that the impedance is too high to do cleanly in a generic LLM gateway.

## Tau Alignment Analysis

Tau's existing AI stack (`apps/api` + `libs/chat`) is a LangGraph agent that:

- Owns its own provider routing (`@langchain/openai`, `@langchain/anthropic`, `@langchain/google-vertexai`, Cerebras, Together, Ollama).
- Owns its own tool surface (`fetch_geometry`, `capture_screenshot`, `test_model`, `edit_tests`, `get_kernel_result`, `read_file`/`grep`/`list_dir`/`edit_file`/`web_search`/`web_fetch`/etc.).
- Owns its own memory (Postgres `PostgresSaver`, IndexedDB on the UI, image storage).
- Owns its own context engineering (system prompt, kernel-section composition, agent-safeguards middleware, cross-provider thinking-block normalization).

A Cursor adapter would have to:

| Concern          | Cursor adapter would need                                                               | Tau's status today                                                                |
| ---------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| File access      | Bind a Tau project's `cwd` (browser IndexedDB or Node fs) to a Cursor local agent       | Tau filesystem is browser-first; Cursor wants a Node `cwd` — fundamental break    |
| Tools            | Disable Cursor's built-in `shell`/`edit`/`write` (cannot — see M2)                      | Tau's tools are explicitly enumerated and audited                                 |
| Provider routing | Cursor is a single provider                                                             | Tau already routes across 6+ providers                                            |
| Bundle weight    | +5.5 MB Node bundle, sqlite3, 5 native sandbox-helper packages                          | API runs in a Fly.io container — sustainable; UI bundle is browser — incompatible |
| Billing          | Operator pays Cursor pricing per run                                                    | Tau bills end-users via existing model abstractions                               |
| Tenant isolation | Per-tenant `CURSOR_API_KEY` (or service-account sub-tokens) + per-tenant agent eviction | Already handled via Better Auth + Postgres                                        |

There is no point of integration where Cursor's value is additive to Tau's pipeline. The closest case ("Cursor's repo-aware refactor as a callable tool from inside Tau's chat") is better served by **exposing Cursor as an MCP server** to Tau's agent (Cursor → Tau MCP, not OpenAI shim → Tau LangChain) — and that path requires zero adapter work.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                             | Priority | Effort | Impact                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | -------------------------------------------------------------------------------- |
| R1  | Do not adopt `@cursor/sdk` as a Tau provider. The architecture is incompatible with Tau's browser-first filesystem and explicit-tool model.                                                                                                                        | P0       | —      | Avoids 5.5 MB bundle, native deps, and an unowned tool surface inside Tau's chat |
| R2  | Do not build a Tau-internal OpenAI-compatible Cursor proxy. Seven community projects already exist; if a Tau engineer needs one for their own dev loop, reach for `anyrobert/cursor-api-proxy`.                                                                    | P1       | —      | Avoids duplicating commodity infrastructure                                      |
| R3  | If Cursor capabilities are ever desired _inside_ Tau's chat, model it as an MCP server consumed by Tau's LangGraph agent — not as an OpenAI shim. The MCP path preserves Tau's tool boundary, keeps billing isolated, and avoids the impedance mismatches above.   | P2       | Med    | Future-proofs the integration shape if Cursor exposes one                        |
| R4  | If a future Tau "headless agent runner" needs Connect-RPC against `api2.cursor.sh` (e.g. for benchmark comparisons), use the wire-format documentation at `eisbaw/cursor_api_demo` plus the SDK's published proto descriptors rather than embedding `@cursor/sdk`. | P3       | High   | Keeps Tau's runtime free of sqlite3/native deps                                  |
| R5  | Update `AGENTS.md` learned facts with the SDK's two-runtime model and the agent-shaped (not chat-shaped) wire so future research doesn't relitigate.                                                                                                               | P1       | Low    | Saves repeat investigation                                                       |

## Open Questions and Verification Items

1. **Cumulative vs incremental `assistant` events** — the docs and `.d.ts` don't disambiguate whether each `SDKAssistantMessage` carries the _delta_ since the last one or the _running total_. The translation table assumes incremental; verify against a live run before shipping any adapter.
2. **`local.sandboxOptions: { enabled: true }`** — what does it actually sandbox? The published d.ts is one field; the bundled implementation defines the policy.
3. **Default `cwd`** — local agent with no `local.cwd` falls through to `process.cwd()`, but is the entire tree indexed eagerly or lazily? Affects cold-start latency for sticky-mode adapters.
4. **`Cursor.models.list()` vs REST `GET /v1/models` divergence** — confirmed via docs; verify whether IDs are identical strings or whether REST exposes a subset.
5. **Idempotency** — does `POST /v1/agents` accept an idempotency key for safe retries? Not documented.
6. **`cloud.envVars` charset / size limits** — documented as encrypted at rest with `CURSOR_*` prefix banned; size cap unknown.
7. **Stream replay semantics** — `Last-Event-ID` is documented; behaviour on resume after `EXPIRED` (`410 stream_expired`) requires live test.
8. **`Run.conversation()` accuracy** — accumulated best-effort from the stream per the SDK skill; verify whether it is byte-identical to what `RunInteractionAccumulator` would produce given the same `SDKMessage` sequence.
9. **MCP OAuth fallback** — local agents reuse tokens from the desktop Cursor app's keychain; behaviour on a Tau CI runner (no desktop Cursor) is undocumented.
10. **Cloud `409 agent_busy`** — does it return immediately or wait? Affects the sticky-mode mutex's responsiveness.

## References

- [`@cursor/sdk` on npm](https://www.npmjs.com/package/@cursor/sdk) — v1.0.12, May 1 2026
- [TypeScript SDK reference](https://cursor.com/docs/api/sdk/typescript)
- [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints)
- [Cursor MCP docs](https://cursor.com/docs/mcp)
- [`eisbaw/cursor_api_demo`](https://github.com/eisbaw/cursor_api_demo) — wire-format reverse-engineering
- [`anyrobert/cursor-api-proxy`](https://github.com/anyrobert/cursor-api-proxy) — most-actively-maintained community OpenAI-shim
- [DeepSeek `reasoning_content` precedent](https://api-docs.deepseek.com/guides/reasoning_model) — for thinking-block surfacing in OpenAI-compat clients
- Local extracted SDK: `tmp/cursor-sdk-mine/package/` (gitignored)
- Cursor SDK skill: `.agent/skills-cursor/cursor-sdk/SKILL.md` (in-tree workflow guide)

## Appendix: SDK File Inventory

```text
package/
├── LICENSE.md
├── README.md
├── package.json
└── dist/
    ├── cjs/index.js                     # CJS build (mirror of esm)
    └── esm/
        ├── index.js                     # 5.5 MB single-line minified bundle
        ├── 642.index.js                 # 17 KB cloud-SSE dynamic chunk
        ├── index.js.LICENSE.txt         # third-party attributions
        ├── index.d.ts                   # public surface re-exports
        ├── public-api.d.ts              # internal aggregation
        ├── stubs.d.ts                   # Agent/Cursor static façades
        ├── agent.d.ts                   # SDKAgent + SendOptions
        ├── run.d.ts                     # Run, RunResult, RunStatus
        ├── messages.d.ts                # SDKMessage union + codec helpers
        ├── options.d.ts                 # AgentOptions + Local/CloudAgentOptions
        ├── errors.d.ts                  # CursorAgentError hierarchy
        ├── cloud-api-client.d.ts        # CloudApiClient REST shape
        ├── cloud-executor.d.ts          # createCloudExecutor + map-stream-event
        ├── cloud-mcp-utils.d.ts         # buildV1McpServers
        ├── local-executor.d.ts          # createLocalExecutor + LocalExecutorHandle
        ├── local-model-validation.d.ts  # resolveLocalModelSelection
        ├── executor-types.d.ts          # RunExecutor signature + options
        ├── executor-common.d.ts         # buildTransport, exchangeApiKeyForAccessToken
        ├── core-adapter.d.ts            # re-exports @anysphere/cursor-sdk-shared/core-adapter
        ├── platform.d.ts                # CursorAgentPlatform (run/checkpoint/event stores)
        ├── run-event-tailer.d.ts        # RunEventTailer streaming reducer
        ├── run-interaction-accumulator.d.ts # SDKMessage → ConversationTurn[]
        ├── subagent-conversion.d.ts     # AgentDefinition → V1CustomSubagent
        ├── tool-call-utils.d.ts         # re-export
        ├── analytics.d.ts               # Statsig analytics events
        ├── sdk-statsig.d.ts             # Statsig client bootstrap
        ├── artifacts.d.ts               # SDKArtifact
        ├── stubs.d.ts                   # Agent/Cursor static API
        ├── types/
        │   ├── conversation-types.d.ts  # 444 KB — full ToolCall/ConversationTurn unions
        │   ├── delta-types.d.ts         # re-export
        │   └── tool-call-types.d.ts     # re-export
        └── utils/
            ├── conversation-utils.d.ts  # getTurnType
            ├── logger.d.ts              # internal DEBUG-mode logger
            └── message-schemas.d.ts     # UserMessage/AssistantMessage Zod schemas
```
