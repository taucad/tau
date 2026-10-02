---
title: 'Subagent Threading & App-Level Agent Harness Blueprint'
description: 'Architecture blueprint for spawning concurrent subagent threads (Cursor multitask-style) on the LangChain/AI-SDK stack and hoisting the chat harness to an app-level provider with a chat-state-aware nav-history dropdown.'
status: draft
created: '2026-05-31'
updated: '2026-05-31'
category: architecture
related:
  - docs/policy/chat-request-config-policy.md
  - docs/policy/context-engineering-policy.md
  - docs/research/claude-code-subagent-architecture.md
  - docs/research/concurrent-chat-streams-agents-panel.md
  - docs/research/chat-composer-context-unification.md
  - docs/research/resumable-chat-streams.md
  - docs/research/parallel-tool-call-incremental-persistence.md
  - docs/research/eager-tool-dispatch-poc.md
---

# Subagent Threading & App-Level Agent Harness Blueprint

Design the architecturally-correct way to let the CAD agent spawn concurrent **subagent threads** (one level deep), and overhaul the frontend so chats live in an app-level provider and run continuously as the user navigates — surfaced through a state-aware `nav-history` chat dropdown.

## Executive Summary

The user wants three coupled capabilities:

1. **Subagent threading (API):** a tool the parent agent calls to spawn subagents that run as _independent threads_ (own `chatId`/`agentId`), whose streamed output and tool actions are routed to that thread. Single layer of depth for now.
2. **App-level harness (UI):** move the live chats out of the per-route subtree into an `apps/ui/app/root.tsx` provider so agents keep running as a continual process across navigation — enabling top-level + sub-level concurrency.
3. **Chat-state nav (UI):** keep the Projects list at top and add a Chats section below it (img1) listing **top-level** chats (last 3 chronological, extended to cover everything within 1 hour, "show more" +5), with per-chat status icons (standby / active / error) per the reference image. Background subagents stay out of the nav — they live in the spawn tool card.

**Key finding:** A subagent should be modelled as **another chat thread** (`childChatId`) linked to its parent (`parentChatId`), with the streamed output and tool actions of each thread routed by its `chatId` — NOT as an in-process LangGraph subgraph that interleaves into the parent transcript. The two most relevant production agents, **verified May 30 2026 against fresh source (Codex `MultiAgentV2`, Claude Code), both implement exactly this as _tagged-multiplex_**: the subagent runs **in-process on the server**, every streamed event is **stamped with its thread id**, and the client **demultiplexes** that single tagged stream into per-thread UI/persistence lanes (Codex `ThreadEventStore`; Claude `parent_tool_use_id`/`session_id` + `AsyncLocalStorage`). This validates the user's "`agentId`/`chatId` on the data parts" proposal as the **architecturally-correct target (Option 1′)**.

Tau already supplies two of the three legs for free: each chat has its own LangGraph checkpoint thread (`thread_id === chatId`) and its own Socket.IO RPC room (`chatId`-keyed, first-user-owns), retained in an app-shell reference-counted `ChatSessionStore`. The missing leg is the **output multiplex contract** — stamping data parts with `chatId` and demuxing in `use-chat`/`chat-persistence.machine`. **Decision (D11): build this architecturally-correct long-term form directly — Option 1′ variant (a), the Codex-faithful single tagged stream — rather than shipping the lower-infra client-orchestrated Option 2 as a stepping stone** (the entity model, depth guard, nav, and harness hoist are shared regardless, so there is no rewrite to amortise). Depth is capped at 1 by withholding `spawn_subagent` from child runs; concurrency is capped at 4 per parent.

**Primary blocker for "keep agents running across navigation":** `root.tsx` already mounts the long-lived `ChatSessionStoreProvider` and a global IndexedDB `FileManagerProvider rootDirectory='/'`, but the Socket.IO socket (`ChatRpcSocketProvider`) and the project-scoped filesystem binding (`FileManagerProvider projectId rootDirectory=/projects/:id`) that answer CAD/file/kernel RPCs are mounted **only inside the `projects_.$id` route**. Tokens can keep streaming through an acquired app-shell `Chat`, but **project tool execution dies when the project route unmounts**. The overhaul must hoist or virtualize the RPC socket + per-running-project filesystem bindings at the app shell.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Part A — Current Architecture (Findings)](#part-a--current-architecture-findings)
- [Part B — External State of the Art (May 2026)](#part-b--external-state-of-the-art-may-2026)
- [Part C — Subagent Threading Design](#part-c--subagent-threading-design)
- [Part D — Frontend Harness Overhaul](#part-d--frontend-harness-overhaul)
- [Part E — Nav-History: Projects (top) + Chats (below)](#part-e--nav-history-projects-top--chats-below)
- [Recommendations](#recommendations)
- [Resolved Decisions](#resolved-decisions)
- [Assumptions](#assumptions)
- [Diagrams](#diagrams)
- [References](#references)

## Problem Statement

The CAD agent is single-threaded: one user message → one assistant turn on one thread. There is no way for the agent to fan out into parallel, isolated workstreams that the user can observe and steer independently (the "Cursor multitask" experience — several agent threads live in the app at once). Separately, the chat UI is bound to the active project route: navigating away tears down the chat panel's providers, and `nav-history` lists _projects_, not _chats_, with no notion of live agent state.

We need a blueprint that (a) adds first-class subagent threads at one level of depth with correct stream/action attribution, (b) hoists the chat harness to be app-global and always-running, and (c) re-skins navigation around chats with live state icons.

## Methodology

- Read the backend chat pipeline: `chat.controller.ts`, `chat.service.ts`, `chat-rpc.gateway.ts`, the `adding-tools` skill, and the agent middleware stack.
- Read the frontend harness: `chat-session-store.ts`, `active-chat-provider.tsx`, `shared-chat-transport.ts`, `use-cad-chat-client.ts`, `project-chat-rpc-bindings.tsx`, `projects_.$id/route.tsx`, `root.tsx`.
- Read the data model: `libs/chat` `Chat` entity, `use-project-manager.tsx` chat CRUD.
- Read nav surfaces: `nav-history.tsx`, `temporal.utils.ts`.
- External research (May 2026): current LangChain docs for DeepAgents synchronous subagents, async subagents, DeepAgents event streaming, LangGraph subgraph streaming, and AI SDK `useChat`/`Chat` status and resume APIs. Local packages are currently catalogued as `langchain@^1.4.0`, `@langchain/langgraph@^1.3.0`, `deepagents@^1.10.2`, `ai@^6.0.99`, and `@ai-sdk/react@^3.0.101`; the checked-out `repos/deepagentsjs` source is older (`libs/deepagents/package.json` reports `1.8.4`) and should be refreshed before implementation if source-level internals matter.

## Part A — Current Architecture (Findings)

### A1 — Backend agent + streaming (one run = one thread)

`POST /v1/chat` (`chat.controller.ts`) handles a turn as Server-Sent Events. For the `cad` profile it builds LangChain messages, then runs a LangGraph agent and pipes the result to the AI-SDK UI message stream:

```216:218:apps/api/app/api/chat/chat.controller.ts
      const stream = await agent.graph.stream(
        { messages },
        {
          configurable: {
            thread_id: chatId,
            chatRpcService: this.chatRpcService,
            ...
          },
          streamMode: ['values', 'messages', 'custom'],
```

- Agent built by `createAgent(...)` from `langchain` (resolved `1.4.0`; `@langchain/langgraph@1.3.0`) — a high-level `ReactAgent`, **not** a hand-built `StateGraph`/`createReactAgent` — with a **fixed `allTools` array** (CAD, filesystem, research tools), a large middleware stack, a `PostgresSaver` **checkpointer**, and a LangGraph `Store` (Redis read-dedup).
- `thread_id === chatId` everywhere: the checkpoint thread, the RPC configurable, the abort registry.
- Output: `toUIMessageStream(stream)` → transform chain → `createUIMessageStreamResponse` → SSE. There is exactly **one** stream per request; no subgraph/subagent namespace handling exists today.

### A2 — Socket.IO RPC routing (chatId rooms, first-user-owns)

Tool _execution_ happens on the **client**. The backend tool issues `chatRpcService.sendRpcRequest({ chatId, toolCallId, rpcName, args })` over Socket.IO; the client runs the FS/kernel/graphics op and acks (`adding-tools` skill, Step 6). Routing is **room-per-chatId**:

```141:171:apps/api/app/api/chat/chat-rpc.gateway.ts
  private async handleJoinMessage(client, data): Promise<{ success: boolean }> {
    const chatId = data?.chatId;
    ...
    const registered = this.chatRpcService.registerConnection(chatId, client, userId);
    ...
    await client.join(chatId);
```

Implications for subagents:

- A subagent with its own `childChatId` must have a client that has **joined the `childChatId` room** for its tools to execute.
- Ownership is per-`chatId` and first-user-wins, so a child room is owned by the same user — no conflict, but the child must be _mounted client-side_.

### A3 — Frontend harness (app-shell store + per-route binding)

The **app-shell** already owns live chats. `root.tsx` mounts `<ChatSessionStoreProvider>` and `<GlobalChatFlushGuard>` inside the root provider stack. `ChatSessionStore` is a vanilla, reference-counted registry of per-`chatId` objects (AI-SDK `Chat`, persistence machine, draft machine):

```233:245:apps/ui/app/services/chat-session-store.ts
  public acquire(chatId: string): ChatSession {
    const existing = this.#sessions.get(chatId);
    if (existing) { existing.refcount += 1; return existing; }
    const session = this.#createSession(chatId);
    ...
```

- Public API: `acquire/release/get/list/subscribeMembership/subscribeChat/subscribeStatus/getStatus/getUsage/setLatestAgentBody`.
- **`getStatus(chatId)` already exposes the live AI-SDK `ChatStatus`** (`'ready' | 'submitted' | 'streaming' | 'error'`) per acquired session — exactly the signal the nav icons need (for _mounted_ chats).
- Transport: every `Chat` uses one module-level `sharedChatTransport` (`DefaultChatTransport` → `${TAU_API_URL}/v1/chat`). **Concurrent streaming across multiple acquired sessions is already supported** — each `Chat` owns its own fetch/SSE. This matches AI SDK's current `Chat`/`useChat` contract: an existing `Chat` instance can be passed into UI hooks, statuses are `submitted | streaming | ready | error`, and `sendMessage`/`regenerate` accept per-request `body` payloads.
- `<ActiveChatProvider chatId>` (`active-chat-provider.tsx`) is a _per-subtree binding_ to the currently active chat for composer UIs; it `acquire`s the session. Today **exactly one** `ActiveChatProvider` mounts per project route (bound to `editorMachine.context.focusedChatId` via `focused-chat-gate.tsx`). Switching the focused chat **releases the prior session**; at refcount 0 the store disposes its `Chat` (kills the stream + RPC binding). So although the store _can_ hold N sessions, **production UI keeps only the focused chat alive** — the missing piece is a "running set" of `chatId`s retained independent of focus (the retention policy in D2/R7).

### A4 — Chat entity + persistence (multiple chats per project already modelled)

```41:63:libs/chat/src/types/chat.types.ts
export type Chat = {
  id: string;
  resourceId: string; // Links chat to a resource (e.g., build)
  name: string;
  messages: MyUIMessage[];
  ...
  activeModel?: string;
  activeKernel?: KernelId;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};
```

- Chats are stored in IndexedDB via `use-project-manager.tsx`: `createChat(resourceId, chat)`, `getChatsForResource(resourceId)`, `getChat(chatId)`. **The data model already supports N chats per resource (project).**
- There is **no global "all chats" query** today (only per-resource) and **no `status` or `parentChatId` field** on `Chat`. Both are additions this feature needs.

### A5 — Nav history lists _projects_, not chats

`nav-history.tsx` renders `useProjects()` grouped by `groupItemsByTimeHorizon` (`temporal.utils.ts` → `Today / Yesterday / N days ago / Last week / …`), paginated by `projectsPerPage = 5` via a "Load More" button, each row a `History` icon + dropdown (rename/duplicate/share/delete). It is built on `SidebarGroup/SidebarMenu/SidebarMenuButton/SidebarMenuAction`. There is **no chat listing and no status icon** today. `groupItemsByTimeHorizon` buckets by _day_; we **keep these day buckets as the display structure unchanged** and express the "within the last hour" rule purely as a visibility-_count_, not a new sub-day bucket (see Part E).

### A6 — The route-scoped RPC/FS constraint (the real blocker)

The Socket.IO connection and the project filesystem are mounted **inside the project route only**:

```27:42:apps/ui/app/routes/projects_.$id/route.tsx
function RouteProvider({ children }) {
  const { id } = useParams();
  return (
    <SharedWorkerGate>
      <FileManagerProvider projectId={id} rootDirectory={`/projects/${id}`} initialBackend='indexeddb'>
        <ChatRpcSocketProvider>
          ...
```

`<ProjectChatRpcBindings>` (mounted in the project subtree) already iterates **every** live session in the store and joins each chat's RPC room:

```29:44:apps/ui/app/routes/projects_.$id/project-chat-rpc-bindings.tsx
  const chatIds = useSyncExternalStore(
    (l) => store.subscribeMembership(l),
    () => store.list(), () => store.list());
  return <>{chatIds.map((chatId) => <SingleChatRpcBinding key={chatId} chatId={chatId} />)}</>;
```

So **multi-room RPC fan-out already exists** — but only while a project route is mounted. Leave the route and the socket + FS unmount: streaming continues, **tool execution stops**. This is the central thing the "always-running" overhaul must fix.

## Part B — External State of the Art (May 2026)

- **`deepagents` (JS, `deepagents@1.10.x` in Tau's catalog)** ships a `task` tool via `SubAgentMiddleware`. Synchronous subagents are for context quarantine and specialized instructions; they block the supervisor until completion and return one result. The docs explicitly warn not to use them for simple tasks, intermediate-context handoff, or overhead-heavy splits.
- **`AsyncSubAgent` (preview, introduced in `deepagents` 1.9.0)** is now the closest upstream analogue to "multitask": a supervisor starts a background task, receives a task ID immediately, can check/update/cancel/list tasks, and each task runs on its own Agent Protocol thread. The docs also store task metadata in a dedicated `asyncTasks` state channel so compaction does not erase task handles. This is the same _shape_ we want, but not the same transport: Tau needs browser-hosted project RPC and app-native chat rows rather than a separate Agent Protocol server as the first enabling layer.
- **LangGraph/LangChain JS streaming** surfaces nested work two ways: `streamMode` with `subgraphs: true` yields `[namespace, chunk]` where `namespace = ["name:runtime_id", …]`; DeepAgents' higher-level `stream.subagents` projection discovers delegated task handles lazily with `.messages/.toolCalls/.values/.output`. The docs recommend `stream.subagents` for user-facing delegated-agent UI and raw `namespace` parsing only when exact interleaving order is needed.

### Codex & Claude Code both use _tagged-multiplex, in-process_ subagents (verified May 30 2026)

Source verified against a freshly-synced `repos/codex` (upstream `openai/codex` @ `966932124`, 2026-05-30) and `repos/claude-code`. **This is the load-bearing finding for the user's "tagged data parts" proposal: the two most relevant production agents both run subagents _in-process_ and demultiplex a single tagged event stream into per-thread UI lanes. Neither opens a separate client-initiated connection per subagent.**

- **Codex `MultiAgentV2` collab tools** (`codex-rs/core/src/tools/handlers/multi_agents_v2/{spawn,send_message,wait,close_agent,assign_task,list_agents}.rs`). The model's surface is a verb set: `spawn_agent`, `send_message`/`assign_task`, `wait`, `resume`, `close_agent`, `list_agents` — strongly parallel to the user's "Cursor multi-task" intent.
- **A subagent is a `ThreadId` (UUID v7), spawned in-process** by `session.services.agent_control.spawn_agent_with_metadata(config, op, source, opts)` (`spawn.rs`). The parent's turn stays the orchestrator; there is **no client round-trip to create the child**. Depth is bounded by `next_thread_spawn_depth(session_source)` (their analogue of "1 layer of depth").
- **Every event is tagged with `thread_id`; the client demultiplexes.** Spawn emits `CollabAgentSpawnBeginEvent { sender_thread_id, … }` / `CollabAgentSpawnEndEvent { sender_thread_id, new_thread_id, status, … }`. All turn/item notifications (`TurnStarted/TurnCompleted/ItemStarted/ItemCompleted`) carry `thread_id`. The TUI fans these into a **per-thread `ThreadEventStore`** (`codex-rs/tui/src/app/thread_events.rs`): the active thread drives the visible widget; inactive threads buffer + replay on switch (`Alt+←/→` fast-switch in `multi_agents.rs`). **This is precisely the user's Option 1′ (an `agentId`/`chatId` tag on each data part → routed into the correct persistence pathway).**
- **Status enum maps 1:1 to the nav icons:** `CollabAgentStatus { PendingInit, Running, Interrupted, Completed, Errored, Shutdown, NotFound }` (`multi_agents.rs`) → our `standby / active / error`. Codex also renders nickname + role labels (`Robie [explorer]`) and a green/dim status dot per agent row — directly reusable design language for Part E.
- **Claude Code** uses the same shape with different identifiers: in-process subagents isolated via `AsyncLocalStorage` `SubagentContext { agentId, parentSessionId, invokingRequestId }` (`repos/claude-code/src/utils/agentContext.ts`), and every streamed SDK event carries `parent_tool_use_id` + `session_id` (`coreSchemas.ts`, `ccrClient.ts` `scopeKey`) so the renderer can scope/route messages to the right sidechain. Again: one tagged stream, demuxed client-side.
- **The one Tau-specific caveat (why this isn't a free copy-paste):** Codex and Claude execute their tools **server/CLI-side, inside the agent's own sandbox**, so a `thread_id` tag on the _output_ stream is sufficient — the child's tool calls never need a client to answer them. **Tau's tools execute on the _client_** (CAD kernel, filesystem, render over Socket.IO RPC). So a tag on data parts solves _output routing + persistence-pathway selection_ (exactly as the user hypothesised), but the child's **client-side tool RPC still needs a room the browser can service**. The good news: Tau already has per-`chatId` RPC rooms and a fan-out (`ProjectChatRpcBindings`) — so the child's tool transport is solved by keying its RPC room on `childChatId`, independent of how its output stream is multiplexed. This converges the two design options (see Part C, Option 1′).

### Prior art in-repo (reconciliation)

- **`docs/research/claude-code-subagent-architecture.md`** (`active`) analyses Claude Code's `AgentTool` + coordinator/fork/swarm models and recommends R1–R3 (coordinator graph, `createSubagentContext`, an in-process `AgentTool`) toward **Vision Phase 3**. That blueprint is a _CLI-process_ model (separate processes, git worktrees, filesystem mailboxes) and maps to **Option 1** here. This document does not contradict it: it scopes the **web-app enablement** where a "subagent process" is realised as **another chat thread** (`Option 2`), reusing Tau's SSE/RPC/checkpoint plumbing. If/when Phase 3 wants server-side coordinator graphs, `AgentTool`/`CompiledSubAgent` can be layered underneath a thread without changing the client contract.
- **Transfer-tool stubs already exist** (`transfer_to_cad_expert`, `transfer_to_research_expert`, `transfer_back_to_supervisor`) in `libs/chat` (`tool.constants.ts`, `message.schema.ts`) with a UI card (`chat-message-tool-transfer.tsx`), but are **not** wired into `ToolService`/`allTools`. They are latent supervisor-pattern scaffolding; the `spawn_subagent` tool is a distinct verb and should not be conflated with them. **Decision: retire the stubs** (D10) so spawn-a-thread is the single mental model.
- **`docs/research/concurrent-chat-streams-agents-panel.md`** describes the aspirational `ChatRegistryProvider` + N `<ChatInstance>` design. That design is **already realised** by the app-shell `ChatSessionStore` (the registry) — treat the store as the registry; do **not** reintroduce React-owned `Chat` lifecycles.

## Part C — Subagent Threading Design

### Design options

#### Option 1 — In-process LangGraph subgraph / `deepagents` `task` (server-orchestrated)

Parent run hosts the subagent as a subgraph; stream with `subgraphs: true`; route child chunks by namespace into distinct UI lanes.

- ✅ Minimal new wiring on the model side; battle-tested context isolation.
- ❌ One `thread_id`, one SSE, one RPC room → **child tool actions execute against the parent's `chatId`** (wrong attribution; the client can't distinguish which thread a `read_file` belongs to).
- ❌ No natural "child is its own chat in the sidebar" — children are sub-lanes of one transcript, not threads.
- ❌ Parallel `task` calls hit checkpoint-namespace conflicts unless each subagent is its own `StateGraph` node (per LangGraph docs).
- ❌ Fights Tau's entire per-`chatId` persistence/RPC/transport design.

> **Note:** Option 1 is the _naïve_ in-process model (one stream, no per-thread tag). The attribution failure it suffers is exactly what Codex/Claude Code fixed by **tagging** every event — captured below as Option 1′.

#### Option 1′ — Tagged-multiplex: server-orchestrated in-process child + `chatId`-tagged data parts (the user's proposal; matches Codex/Claude)

The `spawn_subagent` tool runs the child **in-process on the server** (a LangChain `createAgent` sub-run / nested graph under its own `thread_id === childChatId`), exactly like Codex's `agent_control.spawn_agent`. Every data part the child emits is **stamped with `childChatId` (`agentId`)** before it goes onto the wire. The client's `use-chat` / `chat-persistence.machine` layer reads that tag and routes the part into the **child chat's** persistence pathway — so the child appears as its own thread, its tokens land in its own transcript, and the nav shows it as a distinct row. The child's **client-side tool RPC is keyed on `childChatId`** (its own room via the existing `ProjectChatRpcBindings` fan-out), so tool actions are attributed correctly even though orchestration is server-side.

- ✅ **Correct attribution** — restored by the tag; the failure of Option 1 does not apply.
- ✅ **Server owns orchestration** (spawn / wait / close / depth) natively — no client round-trip to _start_ a child; the parent turn can `wait` in-process (Codex's exact model), which makes `await`-mode reconciliation far cleaner than Option 2's cross-RPC bridge.
- ✅ **Validated at scale** by both freshly-verified references (Part B).
- ✅ Child is still a first-class chat row (the tag drives a real persistence pathway), so nav nesting + state icons work identically to Option 2.
- ⚠️ **Transport work:** requires a multiplex contract — either (a) one parent SSE that interleaves `chatId`-tagged parts for parent + children, or (b) the server opening the child's run and the client attaching a second SSE keyed by `childChatId`. (a) is closest to Codex (single tagged stream) but needs the SSE framing + `use-chat` demux to learn the tag; (b) is closer to today's per-chat transport.
- ⚠️ **Client tool execution** still needs the child's RPC room joined (same requirement as Option 2 + the harness hoist in Part D); the tag does **not** remove the Part D work.
- ❌ More invasive on the **streaming contract** than Option 2 (which reuses the per-chat SSE verbatim).

#### Option 2 — Client-orchestrated child threads (REJECTED — lower-infra alternative, see Verdict / D11)

The `spawn_subagent` tool does **not** run the subagent inline. It emits a control-plane RPC to the parent's client; the client creates a child `Chat` (`childChatId`, `parentChatId`, seeded prompt + inherited agent config), `acquire`s it in the app-shell `ChatSessionStore`, and dispatches a normal run. The child streams over its **own** SSE to `POST /v1/chat`, persists under its **own** `thread_id`, and executes tools over its **own** RPC room — all via the **existing** pipeline. The parent tool returns a handle and (optionally) awaits the child's terminal summary.

- ✅ Correct attribution for free: child output, checkpoint, and tool actions are all keyed to `childChatId`.
- ✅ Reuses 100% of the pipeline (SSE, PostgresSaver, RPC rooms, persistence machine, nav, `ProjectChatRpcBindings` auto-binds the child room).
- ✅ Child is a first-class chat → appears in the new nav dropdown with its own state icon, nested under the parent.
- ✅ Concurrency is the default (each `Chat` owns its stream); matches "multitask".
- ✅ Depth cap is trivial: withhold `spawn_subagent` from child runs.
- ❌ Requires the harness overhaul (Part D) so child tools can run regardless of route.
- ❌ Result reconciliation (parent waiting on child) needs an explicit bridge (below).

| Dimension                  | Option 1 (naïve in-process)    | Option 1′ (tagged-multiplex, server-orchestrated)                          | Option 2 (client-orchestrated)         |
| -------------------------- | ------------------------------ | -------------------------------------------------------------------------- | -------------------------------------- |
| Orchestration locus        | server (parent run)            | **server (parent run, native `wait`/`close`/depth)**                       | client (`SubagentManager` round-trip)  |
| Output stream identity     | parent SSE + namespace         | `childChatId` **tag** on each data part                                    | child SSE (connection = `childChatId`) |
| Checkpoint thread          | parent `thread_id` (**wrong**) | child `thread_id`                                                          | child `thread_id`                      |
| Tool RPC room              | parent `chatId` (**wrong**)    | `childChatId` (**correct**)                                                | `childChatId` (**correct**)            |
| Appears as own chat        | no (sub-lane)                  | yes (tag drives persistence pathway)                                       | yes                                    |
| Concurrency model          | superstep / async middleware   | native per-thread, server-driven                                           | native per-`Chat`, client-driven       |
| Reuses Tau pipeline        | partial                        | RPC/persistence yes; **new SSE multiplex contract**                        | full (SSE verbatim)                    |
| New infra needed           | —                              | SSE tag framing + `use-chat` demux (+ stream-attach if child uses own SSE) | cross-RPC `await` bridge               |
| Matches verified precedent | no                             | **yes (Codex `MultiAgentV2`, Claude Code)**                                | partial (transport differs)            |
| Matches "multitask"        | no                             | yes                                                                        | yes                                    |

**Verdict: Option 1′ (tagged-multiplex, server-orchestrated) is the architecturally-correct target**, and it is what the user's "`agentId`/`chatId` on the data parts" intuition describes. It is the model both freshly-verified production agents converged on (Codex `MultiAgentV2`, Claude Code), it keeps orchestration (spawn/`wait`/`close`/depth) server-side where it belongs — making `await`-mode reconciliation a native in-process wait rather than a cross-RPC bridge — and the `childChatId` tag is exactly the "streamed outputs linked to the actions of a given thread" requirement, made explicit on the wire.

The cost is a **streaming-contract change**: the server must stamp each data part with its `chatId` and the client's `use-chat`/`chat-persistence.machine` must demultiplex by that tag into the right pathway (Codex's `ThreadEventStore` fan-out is the reference). Tau already supplies the other two legs for free — per-`chatId` checkpoint threads and per-`chatId` RPC rooms (`ProjectChatRpcBindings`) — so the child's **tool execution** is attributed correctly without new work beyond the Part D harness hoist.

**Decision (resolved — see D11): build the architecturally-correct long-term form, i.e. Option 1′ realised as variant (a) — a single multiplexed stream of `chatId`-stamped parts demuxed client-side**, mirroring Codex's single tagged app-server stream. We do **not** ship Option 2 as a stepping stone: the entity model, depth guard, nav, and harness hoist are shared either way, so there is no rewrite to avoid — going straight to 1′(a) avoids building and then discarding a client-orchestrated spawn round-trip + cross-RPC bridge. Option 2 remains documented only as the rejected lower-infra alternative.

### Recommended architecture

#### C1 — `spawn_subagent` tool (server-orchestrated, background-only first cut)

A new tool added to `allTools` in `chat.service.ts`, authored per the `adding-tools` skill (schema in `libs/chat`, backend def under `apps/api/app/api/tools/tools/`, UI card, registration). Under Option 1′ the tool runs **in-process on the server**: it mints `childChatId` (in the existing `chat` id space — D2), starts a child agent run under `thread_id === childChatId` whose data parts are stamped with that id, and returns immediately. There is **no client round-trip to start the child**. Input:

```typescript
const spawnSubagentInputSchema = z.object({
  task_name: z.string().describe('Short lowercase label for the subagent thread (letters, digits, underscores)'),
  prompt: z
    .string()
    .describe('Complete, self-contained task brief for the subagent (it starts with a fresh context — see C7)'),
  role: z
    .enum(['explorer', 'assembler'])
    .describe('explorer = fresh-context research/exploration; assembler = designs/builds CAD assemblies'),
  model: z.string().describe('Model slug chosen from <search-models> or <cad-models> in the tool description (see C6)'),
});
```

- **`background` only (first cut).** The tool resolves immediately with `{ task_name, childChatId }`; the parent turn continues and does meaningful non-overlapping work. The parent observes/steers the child through the tool's UI card (C8/Part E), which renders the child's live `ChatRunState`. **`await`/blocking-wait + a `wait`/`check_subagent` verb are deferred** (D1) — when added, they reconcile via a server-side in-process wait (Codex's native model), not a cross-RPC bridge.
- **Returned value is the _handle only_** (`task_name` + `childChatId`), never the child's transcript — context isolation is enforced in C8.

#### C2 — Depth = 1 enforcement

Two server-side guards, defense-in-depth (orchestration is server-side under Option 1′, so both live on the server):

1. **Toolset exclusion:** `ChatService.createAgent` omits `spawn_subagent` from `allTools` when the run is a child (`parentChatId` present on the run config). This is the load-bearing guard — a depth-1 child literally cannot see the tool.
2. **Handler guard:** the `spawn_subagent` handler also rejects (with a `RespondToModel` error) if invoked from a thread that already has a `parentChatId`, and rejects spawn #5 when 4 children are already live (C9).

#### C3 — Linking (agentId / chatId)

Add to the `Chat` entity:

```typescript
parentChatId?: string;   // present ⇒ this chat is a subagent thread (depth 1)
spawnedChatIds?: string[]; // parent's children, for nav nesting + cascade controls
status?: ChatRunState;   // see C4 — persisted last-known run state for unmounted chats
```

`agentId` in the user's framing maps cleanly to `chatId` (the thread identity); `childChatId` is minted server-side in the existing `chat` id space (D2 — `generatePrefixedId(idPrefix.chat)` semantics) so it is a first-class chat. The parent↔child link is the `parentChatId`/`spawnedChatIds` pair. Tool actions are routed by `childChatId` via its own RPC room (already keyed by `chatId`); streamed **output** is routed by the new `chatId` tag on each data part (the Option 1′(a) multiplex contract, R1a). `spawnedChatIds` exists for cascade controls (C9) and the tool-card view — **not** for nav nesting, since subagents do not appear in the nav (D9).

#### C4 — Derived run-state (for status icons)

`ChatRunState` (`standby | active | error`) is **derived, not persisted** (D8): compute it live from `store.getStatus(chatId)` for acquired sessions, and for non-acquired chats derive from the persisted `Chat` row's coarse facts the user already expects to see — `Chat.error` present ⇒ `error`; otherwise `standby`. **`active` is never persisted**: a chat that was mid-stream when the tab closed reconciles to `standby` on reload (no stuck spinners), and only goes `active` again when a live run is actually in flight. This matches "the expected logic a user will expect": active iff genuinely running now, error iff the last run errored, standby otherwise.

| ChatRunState (icon) | Source                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| `active`            | live `store.getStatus` ∈ {`submitted`, `streaming`} only                       |
| `error`             | live `error`, else persisted `Chat.error` present                              |
| `standby`           | everything else (`ready` / terminal-success / never-run / reloaded-mid-stream) |

#### C5 — Server orchestration + client demux

Under Option 1′ the **server** owns spawn/lifecycle; the **client** is a demux consumer, not an orchestrator:

1. **Server (in the `spawn_subagent` handler):** mint `childChatId`; create the child run under `thread_id === childChatId` with the parent's `resourceId` (shared project FS — D3), the seed prompt, the chosen `model` (C6), and the child toolset (full mutating set **minus** `spawn_subagent` — C2/D4); start streaming its data parts **stamped with `childChatId`** onto the multiplexed stream (R1a).
2. **Client demux:** `use-chat`/`chat-persistence.machine` reads each part's `chatId` tag and routes it to that chat's pathway. On first sight of a new `childChatId`, the app-shell harness `createChat(resourceId, { parentChatId, … })` + `store.acquire(childChatId)` so the child becomes a live session; `ProjectChatRpcBindings` (hoisted to app-shell — Part D §D1) auto-joins the child's RPC room so its **client-side tool calls** execute in the spawning tab (D5).
3. **Cascade (C9):** stopping/deleting a parent stops its `spawnedChatIds`.

#### C6 — Subagent model selection (`<search-models>` / `<cad-models>`)

The parent agent picks the child's `model` from the **server-wide** model catalog, surfaced in the `spawn_subagent` tool description as two intent-labelled buckets (the user's `<search-models>` / `<cad-models>`). This mirrors Codex's `spawn_agent_models_description` (which injects the picker-visible `ModelPreset`s with per-model descriptions, `repos/codex/codex-rs/core/src/tools/handlers/multi_agents_spec.rs`), but adds Tau's cost/latency framing so the model reasons about _fit_:

```text
Choose `model` for the subagent based on the work:
<search-models>   <!-- cheap & fast: exploration, search, read-only research, triage -->
- `<slug>`: <one-line description>
  …
</search-models>
<cad-models>      <!-- slow & expensive: assembly design, multi-step CAD generation, hard reasoning -->
- `<slug>`: <one-line description>
  …
</cad-models>
Prefer a <search-models> entry for `role: explorer`; prefer a <cad-models> entry for `role: assembler`. Pick the cheapest model that can do the job.
```

- The catalog is injected **dynamically by the server** at tool-build time from the same model registry the app already exposes (classified into the two buckets via model metadata — fast/cheap vs slow/expensive), exactly as Codex passes `SpawnAgentToolOptions.available_models`. Keep it short (Codex caps the inline list) to protect the tools-block prompt cache (`context-engineering-policy.md`).
- `model` is **required** here (unlike Codex's optional inherit-parent default) because the whole point of the feature is letting the parent right-size cost per subtask; the description tells it to default to a `<search-models>` entry when unsure.

#### C7 — Subagent prompt & roles (exploration with fresh context, assembly design)

Best-practice language mined from Claude Code's `AgentTool` (`repos/claude-code/src/tools/AgentTool/prompt.ts`) and Codex's `spawn_agent` description. The tool description (the HOW) and the parent system-prompt guidance (the WHEN) follow `context-engineering-policy.md` (single source of truth, examples over rules):

- **Two roles, both with the full mutating toolset (D4) — the role shapes the brief, not the tool-gate:**
  - `explorer` — open-ended research/exploration in a **fresh context**. Fresh context is the point: it quarantines exploration tool-noise out of the parent transcript (Claude Code's fork/fresh-agent rationale; Codex's "well-scoped task").
  - `assembler` — designs/builds CAD assemblies (multi-part models), typically on a `<cad-models>` model.
- **Writing the prompt (carried verbatim-in-spirit from Claude Code):** "Brief the subagent like a smart colleague who just walked into the room — it has not seen this conversation." Explain the goal and why; state what is in-scope vs out-of-scope and what the parent is handling; for lookups hand over the exact target, for investigations hand over the question (prescribed steps become dead weight when the premise is wrong). **"Never delegate understanding"** — do not write "based on your findings, fix it"; include the concrete paths/parameters the child needs.
- **When to delegate (parent system prompt, positive framing — Codex pattern):** delegate concrete, bounded, _parallelisable_ sidecar work that materially advances the task without blocking the immediate next step; keep tightly-coupled or critical-path work local; run independent explorations in parallel in one turn; do not duplicate work between parent and child.
- **Don't peek / don't race (Claude Code):** while a background subagent runs, do other non-overlapping work; do not poll its transcript; never fabricate or predict a child's result — report status, not a guess, until its terminal state lands.

#### C8 — Context isolation: subagents return only their expected response (D7a)

Cross-thread context leak is prevented structurally, following Codex/Claude Code:

- **The parent only ever receives the child's final, expected response — never its transcript.** Claude Code: "it will return a single message back to you." Codex's `wait_agent` v2 deliberately returns "a brief wait summary **without the agent's final content**", and the final answer is delivered as one message. Tau mirror: the `spawn_subagent` tool result is the **handle only** (C1); when result-passing lands (post-`await`, D1), the parent receives **only the child's final assistant message** (optionally shape-constrained), not intermediate tool calls or reasoning.
- **The child's stream is tagged to the child** (R1a), so its tokens/tool parts land in the child's pathway and transcript — they never interleave the parent's context window.
- **Brief the child to end with a concise, scoped final report** (Claude Code's "report in under N words" / structured-output guidance) so the returned payload is small and on-topic.

#### C9 — Concurrency cap, stop-agent, and global stop-all (D6)

- **Cap = 4 concurrent live subagents per parent**, enforced as Codex does it — by stating the limit in the `spawn_subagent` description (its `max_concurrent_threads_per_session` guidance string): _"Do not keep more than 4 agents open at a time; close agents you no longer need."_ A server-side guard rejects spawn #5 with a `RespondToModel`-style error so the parent self-corrects.
- **Per-subagent stop (user action):** a Stop control on each subagent's tool card (and on its chat row if focused) → aborts that child's run and releases it. Reuse the existing per-chat abort path the chat-textarea stop button already drives.
- **Global stop-all via the existing chat-textarea stop button:** when the focused chat is a parent with running `spawnedChatIds`, the stop button stops the parent **and** cascades an abort to all of its subagents (and, defensively, any of their descendants — though depth=1 means none today). This is the user-facing "stop everything" affordance; it composes the per-chat abort over `[parentChatId, ...spawnedChatIds]`.

## Part D — Frontend Harness Overhaul

### D1 — Hoist the run substrate to the app shell (the enabling change)

Today `root.tsx` mounts the store and global file-manager shell, but **not** the RPC socket or the project-scoped FS binding. To keep agents running across navigation, hoist (or make app-shell-capable):

- `<ChatRpcSocketProvider>` → app shell (one socket; rooms are per-chat already).
- `<ProjectChatRpcBindings>` → app shell (it already fans across `store.list()`; it just needs the socket + an FS resolver in scope).
- **Project filesystem access:** tool RPCs resolve against `FileManagerProvider projectId`. A running chat is bound to a `resourceId`/project; the harness must mount/keep-alive the FS for any project that has a live (running) chat — not only the route's project. Options: (a) extend the existing global app-shell `FileManagerProvider rootDirectory='/'` with project-scoped mounts keyed by running `resourceId`; (b) mount a lightweight per-running-project FS binding sibling to the chat runtime; (c) keep the project route provider for foreground work and add an app-shell background binding only for retained running chats. This is the **largest** piece of the overhaul and the main risk surface.

The existing `<GlobalChatFlushGuard>` already proves the app-shell-fan-out pattern; D1 extends the same idea to the RPC/FS plane.

### D2 — Active vs. live distinction

`<ActiveChatProvider>` stays as the _composer binding_ for whichever chat the user is focused on. "Live/running" chats are simply those acquired by an app-shell retention owner, not by the focused composer. The nav drives `acquire`/focus; navigation no longer releases a running chat because the harness holds an independent ref while a run is in-flight. Define an explicit retention policy: a chat session is retained while it is running (live status), while it has running children, or while it is the focused chat; it is released otherwise after the user navigates away.

### D3 — Demux owner + subagent index (app shell)

Under Option 1′ there is **no client-side `SubagentManager` orchestrator** (orchestration is server-side — C5). Instead, an app-shell **demux owner** consumes the multiplexed stream: on first sight of a tagged `childChatId` it `createChat(resourceId, { parentChatId, … })` + `store.acquire`s the child so it becomes a live session, maintains the `parentChatId → childChatId[]` index (used by the tool card and stop-all cascade — not the nav), and drives per-child + cascade abort (C9). It mounts alongside `ChatSessionStore`/`ProjectChatRpcBindings` at the shell (Part D §D1).

## Part E — Nav-History: Projects (top) + Chats (below)

**Keep the existing Projects list at the top of the sidebar exactly as today; add a new Chats section _below_ it** (the img1 layout — `Projects` group, then a `Chats` group). The Chats section lists **top-level chats only** — i.e. chats with no `parentChatId`. **Background subagents never appear in the nav (D9)**; they are navigable only via the parent's `spawn_subagent` tool card (C8/below), which renders each child's `ChatRunState`. This deliberately drops the earlier "nested child rows in the nav" idea.

The chat-listing logic already exists in `chat-history-selector.tsx` (`useChats(projectId)`, `groupItemsByTimeHorizon`, rename/delete, persisted-error display via `AlertCircle`/`text-warning`) — **migrate from there**, do not rebuild. Source for the global list: a new `getAllChats()` worker query, or aggregate `getChatsForResource` across the user's resources (the `use-all-usage.ts` cross-project loop is the existing pattern); filter non-deleted **and `parentChatId == null`**, sort by `updatedAt` desc. Non-project chats (the homepage `chat_homepage_main` under `homepage_main_chat_resource`) are top-level chats and **do** belong in this global list.

Behaviour:

- **Maintain the day bucket.** Keep `groupItemsByTimeHorizon`'s day-granular grouping (`Today / Yesterday / …`) as the _display_ structure exactly as today — do **not** add an hour-level "Recent" bucket. The "within 1 hour" rule is a **visibility-count** layered on top, not a grouping change.
- **Default visible = `max(3, count of chats with now - updatedAt <= 3_600_000)`.** Compute this count on the recency-sorted flat list, then render the day-bucketed groups and reveal items via the existing flat-slice-across-groups pattern (`visibleCount`, as in `nav-history.tsx`). Net effect: always ≥3 rows, auto-extended so every chat touched in the last hour stays visible, all under their normal day-bucket labels.
- **"Show more" +5:** a `visibleCount` that starts at the computed default and increments by 5 until all chats are shown (mirrors today's `Load More`, step 5).
- **Expandable dropdown:** the whole Chats section is a collapsible (reuse the sidebar collapsible / `DropdownMenu` patterns already in `nav-history.tsx`).
- **State icons (per reference image, confirmed — D12):** leading icon reflects `ChatRunState`:
  - `standby` → neutral idle glyph (e.g. `Circle`/`MessageCircle`, muted) — matches the "check/standby" rows.
  - `active` → animated indicator (e.g. `Loader` spinner, or the `AnimatedShinyText` / `animate-shiny-text` shimmer used by `chat-activity-summary.tsx` for "Exploring…") — matches the highlighted "active" row. (Canonical class is `animate-shiny-text`; there is no `text-shimmer` class.)
  - `error` → error glyph (muted destructive tone on the **icon only**, per the chat-tool color rule — never red text).

Per learned UI conventions: color is reserved for the leading icon; titles/chevrons use the muted↔foreground hover ramp; the active/shimmer form is scoped to genuinely live chats only.

### Subagents live in the tool card, not the nav (D9)

The `spawn_subagent` tool's UI card (the `adding-tools` UI component) is the **only** surface for observing/navigating a subagent. Per spawned child it shows: `task_name` + nickname, `role`, chosen `model`, and the live `ChatRunState` (standby/active/error, same icon language as the nav), plus the per-child **Stop** control (C9). Selecting a child opens its thread in the focused-chat view without ever listing it in the sidebar. This keeps the nav a clean list of user-started top-level chats while still giving full visibility + control over background agents.

## Recommendations

| #   | Action                                                                                                                                                                                                            | Priority | Effort | Impact |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Adopt **Option 1′(a)** (server-orchestrated in-process subagents + single multiplexed `chatId`-stamped stream) as _the_ mechanism, matching Codex `MultiAgentV2` / Claude Code; no Option-2 stepping stone (D11)  | P0       | —      | High   |
| R1a | Build the **multiplex contract**: stamp every data part with its `chatId`/`agentId` and demultiplex in `use-chat`/`chat-persistence.machine` into the correct pathway (Codex `ThreadEventStore` is the reference) | P0       | High   | High   |
| R2  | Hoist `ChatRpcSocketProvider` + `ProjectChatRpcBindings` + project-FS access to the app shell so tool RPC survives navigation; spawning tab owns child RPC (D1-harness, D5)                                       | P0       | High   | High   |
| R3  | Add server-orchestrated `spawn_subagent` tool (`task_name`, `prompt`, `role`, required `model`); enforce depth=1 (exclude tool from child runs) + cap **4** concurrent (C1–C2, C9, D6)                            | P0       | Med    | High   |
| R4  | Extend `Chat` entity with `parentChatId`/`spawnedChatIds`; **derive** `ChatRunState` (not persisted); add `getAllChats()` (top-level only) worker query (C3–C4, Part E, D8/D9)                                    | P0       | Med    | High   |
| R5  | Wire server orchestration + client demux: on first sight of a tagged `childChatId`, app-shell `createChat`+`acquire`; cascade stop to `spawnedChatIds` (C5)                                                       | P0       | Med    | High   |
| R6  | Inject the **`<search-models>`/`<cad-models>`** catalog + delegation/exploration/assembly prompt language mined from Codex/Claude Code into the tool description + parent system prompt (C6/C7, D7)               | P0       | Med    | High   |
| R7  | Enforce **context isolation**: subagent returns final message only, never its transcript (C8, D7a)                                                                                                                | P0       | Low    | High   |
| R8  | Rework `nav-history.tsx` → Projects (top) + Chats (below, top-level only); 3 + <1hr visibility, +5, derived status icons (Part E, D3/D9/D12)                                                                      | P1       | Med    | Med    |
| R9  | Build the `spawn_subagent` **tool card** (per-child role/model/status + Stop) as the sole subagent surface; wire chat-textarea stop button to cascade stop-all (Part E, C9, D6/D9)                                | P1       | Med    | Med    |
| R10 | Session retention policy: hold refcount while running or has running children; release otherwise post-navigation (D2-harness)                                                                                     | P1       | Low    | Med    |
| R11 | Retire `transfer_to_*` / `transfer_back_to_supervisor` schemas + `chat-message-tool-transfer.tsx` (D10)                                                                                                           | P2       | Low    | Low    |
| R12 | **Deferred:** `await`/in-process `wait` verb + server-side wait reconciliation (D1)                                                                                                                               | P2       | Med    | High   |

## Resolved Decisions

All open questions from the prior pass are now resolved (user direction). They are recorded here as binding decisions for `/superplan`.

1. **D1 — `await` is deferred; ship `background`-only first.** First cut: `spawn_subagent` is fire-and-continue; the parent observes children via the tool card. A blocking `await`/`wait`/`check_subagent` verb is added later, reconciled as a **server-side in-process wait** (Codex's model), not a cross-RPC bridge. Marked deferred throughout (C1, A6).
2. **D2 — `childChatId` is server-minted in the existing `chat` id space** (`generatePrefixedId(idPrefix.chat)` semantics). Subagent chats are first-class chats; no new id namespace.
3. **D3 — Child inherits the parent's `resourceId` (shares the project FS) — confirmed desirable.** Nav keeps **Projects at top level** and adds **Chats below** (img1); it does **not** replace projects with chats.
4. **D4 — Subagents get the full mutating toolset** (minus `spawn_subagent`). The prompt decides which tools to use. **No file locking** and no read-only scoping; concurrent edits are acceptable.
5. **D5 — The spawning tab services the child's RPC.** The tab that initiated the spawn owns the child's RPC room (first-user-owns, deterministic).
6. **D6 — Concurrency + stop controls.** Cap **4** concurrent subagents per parent (stated in the tool description + server guard — C9). Add a per-subagent **Stop** user action. The **existing chat-textarea stop button stops the parent and cascades stop to all its subagents** (global stop-all).
7. **D7 — Tool/prompt language is mined from Codex + Claude Code** (C6/C7): guide the parent to delegate **exploration with a fresh context** and **assembly design** to subagents; expose server-wide models as `<search-models>` (cheap/fast) and `<cad-models>` (slow/expensive) and instruct selection by need.
8. **D7a — Subagents return only their expected response** (C8): the parent receives the child's final message only — never its transcript — to prevent cross-thread context leak (Codex `wait` "summary without final content"; Claude Code "single message back").
9. **D8 — `ChatRunState` is derived, not persisted** (C4): `active` only while genuinely running, `error` from the last run's error, `standby` otherwise — "the expected logic a user will expect"; reloaded mid-stream chats show `standby`, never a stuck spinner.
10. **D9 — Background subagents never appear in the nav.** They are navigable only via the parent's `spawn_subagent` tool card, which shows each child's status (Part E). Top-level chats only in the sidebar.
11. **D10 — Retire the transfer-tool stubs.** Remove the latent `transfer_to_*` / `transfer_back_to_supervisor` schemas + `chat-message-tool-transfer.tsx` UI; the spawn-a-thread model is the single mental model.
12. **D11 — Build the architecturally-correct long-term solution: Option 1′ variant (a)** — server-orchestrated in-process subagents on a **single multiplexed stream** of `chatId`-stamped data parts, demuxed client-side (Codex-faithful). No Option-2 stepping stone (see Verdict).
13. **D12 — Status-icon language confirmed** against the reference image (standby / active / error per img3).

## Assumptions

- **A1.** "agentId" ≡ `chatId` (thread identity); no separate agent identifier is introduced.
- **A2.** One level of depth only: children cannot spawn. Enforced server-side by toolset exclusion.
- **A3.** Subagents operate on the **same project filesystem** as their parent (shared `resourceId` — D3), with the **full mutating toolset and no file locking** (D4); concurrent edits are accepted.
- **A4.** We keep AI-SDK `Chat` + SSE as the streaming substrate and do **not** adopt `deepagents`/LangGraph _subgraph-namespace_ streaming. The naïve in-process model (Option 1) is rejected; the chosen target is **Option 1′(a)** — server-orchestrated in-process subagents on a single multiplexed stream of `chatId`-stamped data parts demuxed client-side (D11), compatible with AI-SDK SSE once the tag is added to the framing.
- **A5.** Tool-execution concurrency is supported by per-`chatId` RPC rooms; output multiplex is the one new transport leg (R1a). The remaining work is harness hoisting + the tag contract, not a new streaming engine.
- **A6.** First cut ships `background` subagents (fire-and-observe via the tool card); `await`/in-process-wait is deferred (D1).
- **A7.** No backend resumable-stream infra is assumed (per `resumable-chat-streams.md`); the multiplex is a single live stream (1′a), not client-attach-to-running (1′b).
- **A8.** Status icons derive purely from chat run-state — **derived, not persisted** (D8: live `getStatus`, else persisted `Chat.error`) — not from geometry/render state, consistent with "sharing/UX must not gate on render".

## Diagrams

### Spawn sequence (Option 1′(a), `background` mode)

```mermaid
sequenceDiagram
  participant LLM as Parent agent (thread=parentChatId)
  participant API as Server agent layer (in-process)
  participant Mux as Multiplexed SSE (chatId-stamped parts)
  participant UI as use-chat / chat-persistence.machine (demux)
  participant Store as ChatSessionStore (app shell)
  participant RPC as Socket.IO (childChatId room, spawning tab)

  LLM->>API: tool call spawn_subagent(task_name, prompt, role, model)
  API->>API: mint childChatId; start child run (thread=childChatId, resourceId inherited)
  API-->>Mux: parent ToolMessage {task_name, childChatId} (handle only)
  API-->>Mux: child data parts, each stamped chatId=childChatId
  Mux-->>UI: parts (tagged)
  UI->>Store: first-seen childChatId → createChat(parentChatId) + acquire
  Note over Store,RPC: ProjectChatRpcBindings (app shell) joins childChatId room
  UI-->>RPC: child tool calls execute in spawning tab (own room)
  Note over LLM: parent continues non-overlapping work (no await)
  Note over UI: child observed/steered via spawn_subagent tool card (status + Stop)
```

### Thread/identity routing (single tagged stream)

```text
                         ┌─ part{chatId=parentChatId} ─► parent pathway ─► RPC room parentChatId ─► project FS
multiplexed SSE ──► demux ┤
                         └─ part{chatId=childChatId}  ─► child pathway  ─► RPC room childChatId  ─► project FS (shared)

parentChatId  spawnedChatIds:[childChatId]   (has spawn_subagent; cap 4; stop cascades)
childChatId   parentChatId: parentChatId     (depth 1; no spawn_subagent; not in nav)
```

## References

- LangChain Deep Agents (JS) — synchronous subagents (`task`): https://docs.langchain.com/oss/javascript/deepagents/subagents
- LangChain Deep Agents (JS) — async subagents (`start_async_task`, `check_async_task`, `update_async_task`, `cancel_async_task`, `list_async_tasks`): https://docs.langchain.com/oss/javascript/deepagents/async-subagents
- LangChain Deep Agents event streaming (`stream.subagents`, per-subagent `.messages/.toolCalls/.output`, raw namespace fallback): https://docs.langchain.com/oss/javascript/deepagents/event-streaming
- LangGraph JS subgraph streaming (`subgraphs: true`, `[namespace, data]` tuples): https://docs.langchain.com/oss/javascript/langgraph/streaming
- AI SDK UI `useChat` / `Chat` contract (existing `Chat` instance, statuses, `resumeStream`): https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- Tau: `apps/api/app/api/chat/chat.controller.ts`, `chat.service.ts`, `chat-rpc.gateway.ts`
- Tau: `apps/ui/app/services/chat-session-store.ts`, `apps/ui/app/hooks/active-chat-provider.tsx`, `apps/ui/app/routes/projects_.$id/project-chat-rpc-bindings.tsx`, `apps/ui/app/routes/projects_.$id/route.tsx`, `apps/ui/app/root.tsx`
- Tau: `libs/chat/src/types/chat.types.ts`, `apps/ui/app/hooks/use-project-manager.tsx`, `apps/ui/app/components/nav/nav-history.tsx`, `apps/ui/app/utils/temporal.utils.ts`
- Codex `MultiAgentV2` (verified `openai/codex` @ `966932124`, 2026-05-30): `repos/codex/codex-rs/core/src/tools/handlers/multi_agents_v2/{spawn,send_message,wait,close_agent,assign_task,list_agents}.rs`, `repos/codex/codex-rs/tui/src/multi_agents.rs`, `repos/codex/codex-rs/tui/src/app/thread_events.rs`, `repos/codex/codex-rs/protocol/src/thread_id.rs`
- Codex spawn-tool spec + prompt/model-catalog language (delegation, `<models>` injection, concurrency, `wait` summary-without-content): `repos/codex/codex-rs/core/src/tools/handlers/multi_agents_spec.rs`
- Claude Code subagent context + tagging: `repos/claude-code/src/utils/agentContext.ts`, `repos/claude-code/src/entrypoints/sdk/coreSchemas.ts` (`parent_tool_use_id`), `repos/claude-code/src/cli/transports/ccrClient.ts` (`scopeKey`)
- Claude Code `AgentTool` prompt (briefing/fresh-context, "never delegate understanding", don't-peek/don't-race, single-message-back, foreground vs background): `repos/claude-code/src/tools/AgentTool/prompt.ts`
- `.agent/skills/adding-tools/SKILL.md`
- Related: `docs/policy/chat-request-config-policy.md`, `docs/research/chat-composer-context-unification.md`, `docs/research/resumable-chat-streams.md`, `docs/research/parallel-tool-call-incremental-persistence.md`, `docs/research/eager-tool-dispatch-poc.md`
