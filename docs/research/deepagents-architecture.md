---
title: 'Deep Agents Architecture and Applicability to Tau'
description: 'Comprehensive analysis of LangChain Deep Agents (deepagentsjs) architecture — middleware system, context compression, filesystem backends, subagent orchestration, skills, and memory — with mapping to Tau CAD agent integration path.'
status: draft
created: '2026-03-24'
updated: '2026-03-24'
category: reference
related:
  - docs/policy/context-engineering-policy.md
  - docs/research/context-summarization-compaction.md
  - docs/research/cursor-filesystem-architecture.md
---

# Deep Agents Architecture and Applicability to Tau

Source-level analysis of `langchain-ai/deepagentsjs` (v1.8.4) to evaluate its middleware architecture, context compression, filesystem abstraction, subagent orchestration, skills, and memory systems as a reference implementation — and eventual migration target — for Tau's LangGraph-based CAD agent.

## Executive Summary

Deep Agents is LangChain's "batteries-included agent harness" built on LangGraph. It implements the four patterns that distinguish deep agents from shallow tool-loop agents: **planning** (`todoListMiddleware`), **sub-agents** (`createSubAgentMiddleware`), **filesystem access** (`createFilesystemMiddleware` with pluggable backends), and **summarization** (`createSummarizationMiddleware` with history offloading). The middleware architecture is composable: each capability is a `createMiddleware()` that adds tools, state, and model-call wrappers without modifying the core agent. For Tau, the most immediately applicable subsystems are the `BackendProtocol` abstraction (maps directly to our Chat RPC), the summarization middleware with filesystem-based history offloading (validates our Morph Compact integration strategy), and the `StateBackend` (stores files in LangGraph state — our current architecture). A phased migration from Tau's bespoke tool definitions to Deep Agents middleware would unify our stack with LangChain's canonical patterns.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Finding 1: Middleware-First Architecture](#finding-1-middleware-first-architecture)
- [Finding 2: Pluggable Backend Protocol](#finding-2-pluggable-backend-protocol)
- [Finding 3: Three-Tier Context Compression](#finding-3-three-tier-context-compression)
- [Finding 4: Tool Result Eviction to Filesystem](#finding-4-tool-result-eviction-to-filesystem)
- [Finding 5: Subagent Orchestration with State Isolation](#finding-5-subagent-orchestration-with-state-isolation)
- [Finding 6: Skills System with Progressive Disclosure](#finding-6-skills-system-with-progressive-disclosure)
- [Finding 7: AGENTS.md Memory with Active Learning](#finding-7-agentsmd-memory-with-active-learning)
- [Finding 8: VFS Backend for Browser Environments](#finding-8-vfs-backend-for-browser-environments)
- [Tau Integration Mapping](#tau-integration-mapping)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [References](#references)

## Problem Statement

Tau's CAD agent (`chat.controller.ts` → LangGraph) has grown organically with bespoke tool definitions, custom message transforms, and no context compression. As the agent matures, we need:

1. **Automatic context compression** to prevent context rot in long CAD sessions
2. **Filesystem-first state management** aligned with our vision policy ("Files are the interface")
3. **Subagent orchestration** for parallelizing geometry analysis, file operations, and design iteration
4. **Skills and memory** for persistent agent knowledge across sessions

Deep Agents addresses all four concerns with a middleware architecture built on the same LangGraph primitives we already use. This investigation evaluates whether to adopt it directly, use it as a reference, or build equivalent systems.

## Methodology

1. **Repo cloned** via `pnpm repos add langchain-ai/deepagentsjs -g ai --clone` into `repos/deepagentsjs/`
2. **Full source analysis** of `libs/deepagents/src/` (74 TypeScript files across agent, middleware, backends, skills, testing)
3. **Middleware internals read** — `summarization.ts` (1,262 lines), `fs.ts` (987 lines), `subagents.ts` (719 lines), `memory.ts` (349 lines), `skills.ts` (734 lines)
4. **Backend protocol analysis** — `protocol.ts`, `state.ts`, `filesystem.ts`, `composite.ts`, `store.ts`
5. **Provider analysis** — `node-vfs/`, `quickjs/`, `daytona/`, `deno/`, `modal/` sandbox providers
6. **Cross-reference** with Tau's `chat.controller.ts`, `chat-rpc.service.ts`, `tool-create-file.ts`, context engineering policy, and prior research

## Finding 1: Middleware-First Architecture

Deep Agents wraps LangChain's `createAgent` with a middleware stack. Each middleware is a composable unit that can add tools, state, system prompt sections, and model-call wrappers.

### `createDeepAgent` Default Middleware Stack

```typescript
const runtimeMiddleware = [
  todoListMiddleware(), // Planning: write_todos tool
  createFilesystemMiddleware(), // FS: ls, read_file, write_file, edit_file, glob, grep, execute
  createSubAgentMiddleware(), // Delegation: task tool for spawning subagents
  createSummarizationMiddleware(), // Context: auto-compress at threshold
  createPatchToolCallsMiddleware(), // Compat: fix malformed tool calls across providers
  // Conditionally added:
  createSkillsMiddleware(), // Skills: progressive disclosure of SKILL.md files
  anthropicPromptCachingMiddleware(), // Caching: cache_control breakpoints
  createCacheBreakpointMiddleware(), // Caching: system prompt breakpoints
  createMemoryMiddleware(), // Memory: AGENTS.md loading + active learning
  humanInTheLoopMiddleware(), // HITL: interrupt-before/after on tools
];
```

### Middleware API Surface

Each middleware uses `createMiddleware()` from `langchain` which provides:

| Hook            | When                 | Purpose                                                 |
| --------------- | -------------------- | ------------------------------------------------------- |
| `stateSchema`   | Compile time         | Extends agent state with middleware-specific fields     |
| `tools`         | Compile time         | Adds tools to the agent's tool set                      |
| `beforeAgent`   | Before first step    | One-time state initialization (e.g., load memory)       |
| `wrapModelCall` | Before each LLM call | Modify messages, system prompt, tools; intercept errors |
| `wrapToolCall`  | After each tool call | Post-process tool results (e.g., eviction)              |

**Relevance to Tau**: Our agent currently uses a flat middleware pipeline (`toUIMessageStream` → `createStaticToolTransform` → `createToolOutputTransform` → etc.) in `chat.controller.ts`. Deep Agents' middleware model is richer — it composes at the LangGraph level, not the stream transform level. Adopting this pattern would let us add capabilities (compression, memory, skills) without modifying the controller.

## Finding 2: Pluggable Backend Protocol

The `BackendProtocol` interface abstracts all filesystem operations behind a uniform API. Five backend implementations exist:

| Backend             | Storage           | Persistence               | Use Case                               |
| ------------------- | ----------------- | ------------------------- | -------------------------------------- |
| `StateBackend`      | LangGraph state   | Per-thread (checkpointed) | Default; no external storage needed    |
| `StoreBackend`      | LangGraph Store   | Cross-thread              | Persistent memory across conversations |
| `FilesystemBackend` | Local disk        | Permanent                 | CLI agents, local development          |
| `CompositeBackend`  | Multiple backends | Configurable              | Layered storage (state + disk)         |
| `VfsSandbox`        | In-memory VFS     | Session                   | Isolated sandboxed execution           |

### Protocol Methods

```typescript
interface BackendProtocol {
  lsInfo(path: string): MaybePromise<FileInfo[]>;
  read(filePath: string, offset?: number, limit?: number): MaybePromise<string>;
  readRaw(filePath: string): MaybePromise<FileData>;
  grepRaw(pattern: string, path?: string, glob?: string): MaybePromise<GrepMatch[] | string>;
  globInfo(pattern: string, path?: string): MaybePromise<FileInfo[]>;
  write(filePath: string, content: string): MaybePromise<WriteResult>;
  edit(filePath: string, old: string, new_: string, replaceAll?: boolean): MaybePromise<EditResult>;
  uploadFiles?(files: [string, Uint8Array][]): MaybePromise<FileUploadResponse[]>;
  downloadFiles?(paths: string[]): MaybePromise<FileDownloadResponse[]>;
}
```

### State Update Flow

`StateBackend` returns `filesUpdate` in `WriteResult`/`EditResult` which the middleware applies via LangGraph `Command`:

```typescript
// write_file tool returns a Command to update state
return new Command({
  update: { files: result.filesUpdate, messages: [message] },
});
```

This keeps state updates within LangGraph's reducer system, enabling concurrent updates from parallel subagents via `fileDataReducer`.

**Relevance to Tau**: This maps directly to our Chat RPC architecture. Our `ChatRpcService.sendRpcRequest()` sends filesystem operations to the browser, which executes them on the virtual filesystem (ZenFS/IndexedDB). A `TauRpcBackend` implementing `BackendProtocol` would bridge Deep Agents' filesystem middleware to our browser-based storage. The `StateBackend` is our current de facto approach (state in LangGraph), and the `BackendProtocol` gives us a clean abstraction to move toward browser-side persistence.

## Finding 3: Three-Tier Context Compression

The `createSummarizationMiddleware` implements a three-tier compression cascade that operates before each model call.

### Tier 1: Tool Argument Truncation

Old messages (beyond a `keep` threshold) have their `write_file` and `edit_file` arguments truncated to `maxLength` (default 2,000 chars). This targets the largest source of context waste — full file rewrites echoed in conversation history.

### Tier 2: Proactive Summarization

When total tokens exceed a trigger threshold (default: 85% of model's `maxInputTokens`), the middleware:

1. **Determines cutoff index** — messages before cutoff are summarized, messages after are preserved
2. **Offloads to backend** — appends evicted messages to `/conversation_history/{session_id}.md` as Markdown
3. **Generates summary** — LLM call to compress evicted messages into key points
4. **Replaces messages** — cutoff messages replaced with a `HumanMessage` containing the summary and a file path reference

### Tier 3: Emergency ContextOverflowError Recovery

If the model still overflows after summarization, the middleware:

1. Catches `ContextOverflowError` from the provider
2. Calibrates `tokenEstimationMultiplier` to account for underestimation (tool_use blocks, JSON overhead)
3. Re-summarizes with more aggressive cutoff
4. Falls back to `compactToolResults()` — distributes remaining token budget equally across `ToolMessage` content

### Configuration

```typescript
// Profile-based (when model has maxInputTokens):
trigger: { type: "fraction", value: 0.85 }  // 85% of context window
keep:    { type: "fraction", value: 0.10 }   // Keep last 10%

// Fallback (no model profile):
trigger: { type: "tokens", value: 170_000 }
keep:    { type: "messages", value: 6 }
```

### Safe Cutoff Logic

The `findSafeCutoffPoint()` function ensures AI/ToolMessage pairs are never split across the summarization boundary:

- If cutoff lands on a `ToolMessage`, looks backward for the parent `AIMessage`
- If backward distance exceeds half the cutoff position (indicating a single AI call with many tool calls), advances forward instead
- Prevents orphaned tool results that confuse the model

**Relevance to Tau**: This validates our context-summarization-compaction.md recommendations. The three-tier cascade (truncate args → proactive summarize → emergency compact) maps to our proposed hybrid of observation masking + Morph Compact + fallback summarization. Key difference: Deep Agents uses LLM summarization (lossy), while we plan to use Morph Compact (verbatim, zero hallucination). We can replace the `createSummary()` call with a Morph Compact call while keeping the surrounding infrastructure (cutoff logic, history offloading, safe cutoff).

## Finding 4: Tool Result Eviction to Filesystem

The `createFilesystemMiddleware` wraps tool calls with an eviction layer that offloads large results to the filesystem.

### Eviction Flow

1. Tool call executes normally
2. `wrapToolCall` checks if result content exceeds `toolTokenLimitBeforeEvict` (default: 20,000 tokens ≈ 80 KB)
3. Large results are written to `/large_tool_results/{sanitized_tool_call_id}`
4. Original `ToolMessage` content is replaced with a preview (head + tail) and a file path reference
5. Agent can `read_file` the full result with pagination (`offset`/`limit`)

### Excluded Tools

Some tools are excluded from eviction by design:

| Tool                      | Reason                                                                  |
| ------------------------- | ----------------------------------------------------------------------- |
| `ls`, `glob`, `grep`      | Have built-in truncation; large results mean the query needs refinement |
| `read_file`               | Evicting read results causes re-read loops                              |
| `edit_file`, `write_file` | Return minimal confirmation messages                                    |

**Relevance to Tau**: This is the "observation masking via filesystem indirection" pattern from cursor-filesystem-architecture.md Finding 4. Our kernel execution outputs (geometry analysis, compilation results) are prime candidates for eviction. The 20,000 token threshold is a good starting point for our CAD agent.

## Finding 5: Subagent Orchestration with State Isolation

The `createSubAgentMiddleware` provides a `task` tool that spawns ephemeral subagents with isolated context windows.

### Key Design Decisions

1. **State exclusion**: Messages, todos, structuredResponse, skillsMetadata, and memoryContents are excluded from subagent state — each subagent starts clean
2. **File state sharing**: The `files` channel uses `ReducedValue` with `fileDataReducer` — parallel subagents can modify files concurrently and changes merge via reducer
3. **General-purpose subagent**: A default "general-purpose" subagent inherits all tools from the main agent; custom subagents can have specialized tools
4. **Skills isolation**: Custom subagents do NOT inherit skills from the main agent — they must declare their own `skills` array
5. **Each subagent gets its own summarization middleware**: Prevents context rot in long-running subagent tasks

### Subagent Middleware Stack

Each subagent (including general-purpose) gets:

```typescript
const subagentMiddleware = [
  todoListMiddleware(),
  createFilesystemMiddleware({ backend }),
  createSummarizationMiddleware({ model, backend }),
  createPatchToolCallsMiddleware(),
  // + Anthropic prompt caching if applicable
];
```

**Relevance to Tau**: Our existing `Task` tool in Cursor already implements this pattern at the IDE level. For the Tau agent, we can use Deep Agents' subagent middleware to parallelize CAD tasks — e.g., one subagent for geometry analysis while another searches for reference files. The `ReducedValue` file reducer is critical for merging parallel file changes.

## Finding 6: Skills System with Progressive Disclosure

Skills are on-demand workflows loaded from backend storage, following the Agent Skills specification (agentskills.io).

### Skill Structure

```
/skills/<source>/
  <skill-name>/
    SKILL.md          # YAML frontmatter + Markdown instructions
```

### SKILL.md Format

```yaml
---
name: my-skill
description: 'What this skill does (max 1024 chars)'
compatibility: 'When to use this skill'
---
# Skill Instructions
Markdown content loaded when the skill is activated...
```

### Loading Strategy

Skills are loaded in `beforeAgent` from configurable source paths. Multiple sources are layered with last-one-wins semantics:

```typescript
const agent = createDeepAgent({
  skills: ['/skills/user/', '/skills/project/'],
  // project skills override user skills with same name
});
```

**Relevance to Tau**: We already have a skills system in Cursor (`.agent/skills/`). Deep Agents' skills middleware would let us expose CAD-specific skills (kernel workflows, geometry patterns, testing recipes) to the agent via the virtual filesystem. The progressive disclosure pattern — listing skills in the system prompt, loading full content only when activated — keeps context lean.

## Finding 7: AGENTS.md Memory with Active Learning

The `createMemoryMiddleware` loads `AGENTS.md` files and injects them into the system prompt with active learning guidelines.

### Key Features

1. **Multi-source loading**: Paths like `["~/.deepagents/AGENTS.md", "./.deepagents/AGENTS.md"]` are loaded and concatenated
2. **Active learning prompt**: Extensive system prompt guidelines for when to update memory (user corrections, preferences, feedback) and when not to (transient information, one-time tasks)
3. **Edit-file integration**: The agent updates memory by calling `edit_file` on the AGENTS.md file — no special API needed
4. **Cache control**: Optional `cache_control: { type: "ephemeral" }` for Anthropic prompt caching

### Memory System Prompt (Key Section)

The memory system prompt instructs the agent to:

- **Update immediately** when user provides corrections, role descriptions, or tool usage preferences
- **Skip** for transient info, one-time tasks, acknowledgments
- **Never store** API keys, passwords, or credentials
- **Prioritize** memory updates before responding (first action, not afterthought)

**Relevance to Tau**: This maps to our continual-learning plugin pattern (cursor-filesystem-architecture.md Finding 10). For Tau, AGENTS.md content would include learned CAD preferences (preferred kernel, modeling style, unit conventions, material libraries) persisted in the virtual filesystem.

## Finding 8: VFS Backend for Browser Environments

The `@langchain/node-vfs` provider implements `SandboxBackendProtocol` using an in-memory virtual filesystem (`node-vfs-polyfill`).

### Architecture

```
VfsSandbox
  ├── VirtualFileSystem (in-memory)    # File read/write/glob/grep
  ├── temp directory sync              # For shell command execution
  └── path rewriting                   # /src/index.js → /tmp/vfs-exec-xxx/src/index.js
```

### Key Properties

| Property      | Value                                              |
| ------------- | -------------------------------------------------- |
| Storage       | In-memory (`VirtualFileSystem`)                    |
| Persistence   | Session-scoped (lost on stop)                      |
| Execution     | Syncs to temp dir, runs `/bin/bash -c`, syncs back |
| Path model    | Absolute paths from `/workspace/` root             |
| Initial files | Configurable via `initialFiles` option             |

**Relevance to Tau**: This is the closest existing backend to our browser virtual filesystem. Our implementation would be a `TauRpcBackend` that delegates `BackendProtocol` methods to `ChatRpcService.sendRpcRequest()`, executing file operations on the browser's ZenFS/IndexedDB store instead of an in-memory VFS. Unlike VfsSandbox which syncs to temp dirs for execution, our backend would use the existing kernel worker for code execution.

## Tau Integration Mapping

| Deep Agents Concept             | Tau Current State                                       | Integration Path                                           |
| ------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `BackendProtocol`               | Bespoke tool definitions via `ChatRpcService`           | Create `TauRpcBackend` implementing `BackendProtocol`      |
| `StateBackend`                  | LangGraph state (implicit)                              | Already equivalent; explicit adoption formalizes pattern   |
| `createFilesystemMiddleware`    | Custom `tool-create-file.ts`, `tool-read-file.ts`, etc. | Replace custom tools with middleware + `TauRpcBackend`     |
| `createSummarizationMiddleware` | None (context-summarization-compaction.md planned)      | Adopt middleware, swap `createSummary()` for Morph Compact |
| `createSubAgentMiddleware`      | Not implemented in Tau agent                            | Adopt directly for parallel geometry analysis              |
| `createSkillsMiddleware`        | Skills in `.agent/skills/` (IDE-level only)             | Expose CAD skills via virtual filesystem                   |
| `createMemoryMiddleware`        | AGENTS.md via Cursor continual-learning plugin          | Expose learned CAD preferences via virtual filesystem      |
| `todoListMiddleware`            | Not implemented                                         | Adopt directly for task tracking                           |
| `VfsSandbox`                    | ZenFS/IndexedDB via Chat RPC                            | Build `TauRpcBackend` (RPC-based, not VFS-based)           |
| Tool result eviction            | None                                                    | Adopt `wrapToolCall` eviction pattern                      |

### TauRpcBackend Sketch

```typescript
import type { BackendProtocol, WriteResult, EditResult, FileInfo } from 'deepagents';

export class TauRpcBackend implements BackendProtocol {
  constructor(
    private readonly rpcService: ChatRpcService,
    private readonly chatId: string,
    private readonly toolCallId: string,
  ) {}

  async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    const result = await this.rpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: 'readFile',
      args: { targetFile: filePath, offset, limit },
    });
    assertRpcSuccess(result, { toolName: 'read_file', toolCallId: this.toolCallId });
    return result.content;
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    const result = await this.rpcService.sendRpcRequest({
      chatId: this.chatId,
      toolCallId: this.toolCallId,
      rpcName: 'createFile',
      args: { targetFile: filePath, content },
    });
    assertRpcSuccess(result, { toolName: 'write_file', toolCallId: this.toolCallId });
    return { path: filePath, filesUpdate: null }; // External storage
  }

  // ... implement remaining BackendProtocol methods via RPC
}
```

## Recommendations

| #   | Action                                                             | Priority | Effort | Impact                                                          |
| --- | ------------------------------------------------------------------ | -------- | ------ | --------------------------------------------------------------- |
| R1  | Create `TauRpcBackend` implementing `BackendProtocol` via Chat RPC | P0       | Medium | High — unlocks entire Deep Agents middleware stack              |
| R2  | Adopt `createSummarizationMiddleware` with Morph Compact swap      | P0       | Medium | High — automatic context compression with filesystem offloading |
| R3  | Adopt `createFilesystemMiddleware` to replace bespoke file tools   | P1       | Medium | Medium — standardizes tool definitions, adds eviction           |
| R4  | Adopt `todoListMiddleware` for agent task tracking                 | P1       | Low    | Medium — structured planning for multi-step CAD tasks           |
| R5  | Add `deepagents` as a dependency and use `createDeepAgent`         | P2       | High   | High — full middleware stack, but requires migration            |
| R6  | Implement subagent orchestration for parallel geometry tasks       | P2       | Medium | Medium — context isolation for parallel analysis                |
| R7  | Expose CAD skills as SKILL.md files in virtual filesystem          | P3       | Medium | Medium — progressive disclosure of kernel workflows             |
| R8  | Implement AGENTS.md memory for learned CAD preferences             | P3       | Medium | Medium — persistent user/project preferences                    |

### Phased Adoption

**Phase 1 — Backend Bridge** (R1, R2):
Create `TauRpcBackend` and wire `createSummarizationMiddleware` into `chat.controller.ts`. This gives immediate context compression with history offloading, using our existing Chat RPC infrastructure. Swap the summary generation from LLM summarization to Morph Compact for zero-hallucination compression.

**Phase 2 — Tool Migration** (R3, R4):
Replace bespoke tool definitions with `createFilesystemMiddleware`. This standardizes our file tools (ls, read, write, edit, glob, grep) and adds tool result eviction. Adopt `todoListMiddleware` for structured task tracking.

**Phase 3 — Full Migration** (R5, R6):
Add `deepagents` as a dependency and use `createDeepAgent` as the agent factory. This replaces our custom `createAgent` setup with Deep Agents' full middleware stack, including subagent orchestration.

**Phase 4 — Agent Intelligence** (R7, R8):
Expose CAD skills and AGENTS.md memory via the virtual filesystem. This enables the agent to learn user preferences, discover kernel capabilities, and apply project-specific modeling conventions.

## Trade-offs

### Adopting Deep Agents vs. Building Equivalent

| Dimension            | Adopt Deep Agents                       | Build In-House              |
| -------------------- | --------------------------------------- | --------------------------- |
| **Time to value**    | Weeks (middleware exists)               | Months (build from scratch) |
| **Maintenance**      | Upstream maintains; we track releases   | We own all maintenance      |
| **Customization**    | Constrained by middleware API           | Full control                |
| **Stack alignment**  | LangChain/LangGraph native              | Custom patterns             |
| **Breaking changes** | Upstream can break us (v1.x → v2.x)     | We control versioning       |
| **CAD specifics**    | General-purpose; CAD logic in our tools | CAD-native from start       |

**Verdict**: Adopt incrementally via the backend bridge pattern (Phase 1). Deep Agents' `BackendProtocol` abstraction means we can use their middleware without depending on their backends. If the middleware works well, proceed to full adoption. If customization needs diverge, we have the reference implementation.

### LLM Summarization vs. Morph Compact in Deep Agents Pipeline

| Dimension              | Deep Agents Default (LLM Summary)          | Morph Compact Swap                       |
| ---------------------- | ------------------------------------------ | ---------------------------------------- |
| **Fidelity**           | Lossy — paraphrases file paths, parameters | Verbatim — surviving text byte-identical |
| **Compression**        | 70–90%                                     | 50–70%                                   |
| **Speed**              | Model-dependent (5–15s)                    | 33,000 tok/s (<2s for 100K)              |
| **Integration**        | Built-in `createSummary()`                 | Replace with Morph API call              |
| **History offloading** | Compatible (offload before summarize)      | Compatible (offload before compact)      |
| **Hallucination risk** | Medium (summarization may invent details)  | Zero                                     |

**Verdict**: Swap `createSummary()` with Morph Compact for the CAD agent. The filesystem offloading, cutoff logic, and error recovery from Deep Agents' middleware can be reused unchanged. Only the summary generation step needs replacement.

### StateBackend vs. TauRpcBackend

| Dimension       | StateBackend (default)           | TauRpcBackend (browser)           |
| --------------- | -------------------------------- | --------------------------------- |
| **Storage**     | LangGraph state (server memory)  | Browser IndexedDB (client)        |
| **Persistence** | Per-thread (checkpointed)        | Per-project (permanent)           |
| **Size limits** | Limited by checkpoint size       | Limited by IndexedDB quota (~2GB) |
| **Latency**     | In-memory (0ms)                  | RPC round-trip (~50ms)            |
| **Offline**     | Requires server                  | Works offline (browser-local)     |
| **Write flow**  | `Command({ update: { files } })` | RPC → browser → IndexedDB         |

**Verdict**: Use `TauRpcBackend` for file persistence (browser is the source of truth for user files) and `StateBackend` for ephemeral agent state (conversation-scoped working files like tool result evictions and summarization history).

## References

### Primary Sources

- `repos/deepagentsjs/` — langchain-ai/deepagentsjs v1.8.4 (cloned via `pnpm repos`)
- `libs/deepagents/src/agent.ts` — `createDeepAgent` factory (387 lines)
- `libs/deepagents/src/middleware/summarization.ts` — Context compression (1,262 lines)
- `libs/deepagents/src/middleware/fs.ts` — Filesystem tools + eviction (987 lines)
- `libs/deepagents/src/middleware/subagents.ts` — Subagent orchestration (719 lines)
- `libs/deepagents/src/middleware/memory.ts` — AGENTS.md memory (349 lines)
- `libs/deepagents/src/middleware/skills.ts` — Skills system (734 lines)
- `libs/deepagents/src/backends/protocol.ts` — Backend protocol definition (507 lines)
- `libs/deepagents/src/backends/state.ts` — LangGraph state backend (298 lines)
- `libs/providers/node-vfs/src/sandbox.ts` — VFS sandbox backend (681 lines)

### Tau Internal References

- `docs/policy/context-engineering-policy.md` — Context engineering policy
- `docs/research/context-summarization-compaction.md` — Context compression techniques
- `docs/research/cursor-filesystem-architecture.md` — Cursor filesystem patterns
- `docs/policy/vision-policy.md` — "Files are the interface" design principle
- `apps/api/app/api/chat/chat-rpc.service.ts` — Chat RPC service
- `apps/api/app/api/tools/tools/tool-create-file.ts` — File creation tool via RPC
