---
title: 'Cursor Filesystem Architecture'
description: 'Comprehensive audit of how Cursor IDE uses the filesystem as a first-class primitive for agent state, conversation history, tool outputs, terminal sessions, MCP coordination, plans, snapshots, worktrees, SQLite tracking, and plugin hooks. Informs filesystem-first patterns for Tau CAD.'
status: draft
created: '2026-03-24'
updated: '2026-03-24'
category: audit
related:
  - docs/policy/vision-policy.md
  - docs/policy/filesystem-policy.md
  - docs/research/context-summarization-compaction.md
---

# Cursor Filesystem Architecture

Audit of Cursor IDE's `~/.cursor` directory to catalog how a world-class AI coding agent uses the filesystem as its primary coordination primitive — not as an afterthought, but as the foundational data plane for agent state, tool execution, context management, and multi-agent orchestration.

## Executive Summary

Cursor organizes all AI agent state into a filesystem-first architecture under `~/.cursor/`. Rather than using databases or APIs as the primary data plane, files and directories serve as the coordination medium between the IDE, the agent backend, MCP servers, plugins, and subagents. Thirteen distinct subsystems were identified, spanning five architectural layers: global config, project-scoped runtime state, agent memory, tool execution offloading, and workspace isolation. The patterns most relevant to Tau's CAD agent are: JSONL append-only conversation logs, large tool output offloading to UUID-keyed files, terminal session snapshots as structured text, plan files as YAML+Markdown task state machines, and the `.gitignore`-as-visibility-contract pattern that controls which files the agent can see.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Finding 1: Five-Layer Architecture](#finding-1-five-layer-architecture)
- [Finding 2: Project-Scoped Isolation](#finding-2-project-scoped-isolation)
- [Finding 3: JSONL Append-Only Transcripts](#finding-3-jsonl-append-only-transcripts)
- [Finding 4: Large Output Offloading](#finding-4-large-output-offloading)
- [Finding 5: Terminal Sessions as Structured Text Files](#finding-5-terminal-sessions-as-structured-text-files)
- [Finding 6: Plans as YAML+Markdown State Machines](#finding-6-plans-as-yaml-markdown-state-machines)
- [Finding 7: SQLite for Analytics, Not Agent State](#finding-7-sqlite-for-analytics-not-agent-state)
- [Finding 8: MCP Tool Descriptors as Static JSON](#finding-8-mcp-tool-descriptors-as-static-json)
- [Finding 9: .gitignore as Visibility Contract](#finding-9-gitignore-as-visibility-contract)
- [Finding 10: Plugin Hooks via Filesystem Convention](#finding-10-plugin-hooks-via-filesystem-convention)
- [Finding 11: Git Snapshots and Worktrees for Isolation](#finding-11-git-snapshots-and-worktrees-for-isolation)
- [Finding 12: Assets as Content-Addressed Blobs](#finding-12-assets-as-content-addressed-blobs)
- [Finding 13: Chats SQLite as Blob Store](#finding-13-chats-sqlite-as-blob-store)
- [Complete Filesystem Inventory](#complete-filesystem-inventory)
- [Recommendations for Tau CAD Agent](#recommendations-for-tau-cad-agent)
- [References](#references)

## Problem Statement

Tau's vision policy states "Files are the interface — Everything is a file. Geometry, tests, metadata. Agent skills, subagents, scripts. A single data plane makes computational engineering precise, reproducible, with provenance by design."

To implement this, we need concrete patterns for how a filesystem-first AI agent platform structures its data. Cursor is the most mature AI coding agent IDE and uses the filesystem as its primary coordination primitive. By auditing its architecture, we can extract proven patterns and adapt them for Tau's browser-based virtual filesystem (via Chat RPC to IndexedDB/ZenFS).

## Methodology

1. **Full directory tree enumeration** of `~/.cursor/` (20 top-level entries, 13 subsystems identified)
2. **Project-scoped storage audit** of `~/.cursor/projects/Users-rifont-git-tau/` (12 entries, 7 active subsystems)
3. **File format analysis** — JSONL, JSON, YAML+Markdown, structured text, SQLite, bare git repos, binary blobs
4. **Schema extraction** from SQLite databases (`ai-code-tracking.db`, `chats/*/store.db`)
5. **Content analysis** of 272 agent transcripts, 664 tool output files, 39 terminal sessions, 1,170 plan files, 1,497 asset files
6. **Pattern extraction** from `.gitignore` visibility rules, plugin hook conventions, and MCP descriptor layout
7. **Cross-reference** with Tau's `chat-rpc.service.ts`, `tool-create-file.ts`, and `vision-policy.md`

## Finding 1: Five-Layer Architecture

Cursor's filesystem organizes into five distinct layers, each with a different scope, persistence model, and access pattern.

| Layer                   | Path                                           | Scope         | Persistence    | Primary Consumer |
| ----------------------- | ---------------------------------------------- | ------------- | -------------- | ---------------- |
| **Global Config**       | `~/.cursor/*.json`                             | User-wide     | Permanent      | IDE process      |
| **Extensions**          | `~/.cursor/extensions/`                        | User-wide     | Permanent      | Extension host   |
| **Project Runtime**     | `~/.cursor/projects/<slug>/`                   | Per-workspace | Session-scoped | Agent + IDE      |
| **Agent Memory**        | `~/.cursor/plans/`, `~/.agent/skills*/`        | User-wide     | Accumulated    | Agent + plugins  |
| **Workspace Isolation** | `~/.cursor/worktrees/`, `~/.cursor/snapshots/` | Per-task      | Ephemeral      | Best-of-N agents |

### Global Config Files

| File                  | Purpose                                                                        | Format                   |
| --------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| `argv.json`           | V8 flags, crash reporter ID, hardware accel                                    | JSONC (comments allowed) |
| `cli-config.json`     | Permissions allowlist/denylist, editor defaults, model selection, privacy mode | JSON                     |
| `mcp.json`            | User-level MCP server definitions (command, env, args)                         | JSON                     |
| `ide_state.json`      | Recently viewed files (relative + absolute paths)                              | JSON                     |
| `prompt_history.json` | Array of previous user prompts                                                 | JSON array of strings    |

**Key pattern**: `cli-config.json` contains a permissions model with explicit `allow`/`deny` lists for shell commands. This is a security boundary implemented as a JSON file, not a database.

### Layer Boundaries

Each layer is isolated by path convention. The `.gitignore` in `~/.cursor/` acts as the contract for what the agent can read (see Finding 9). Cross-layer references use absolute paths.

## Finding 2: Project-Scoped Isolation

Every workspace gets a project directory at `~/.cursor/projects/<path-slug>/` where `<path-slug>` is the workspace absolute path with `/` replaced by `-`. This creates per-project isolation for all runtime state.

| Subdirectory         | Contents                                    | File Count (tau) | Total Size |
| -------------------- | ------------------------------------------- | ---------------- | ---------- |
| `agent-transcripts/` | JSONL conversation logs                     | 272 dirs         | ~50 MB     |
| `agent-tools/`       | Large tool output offloads                  | 664 files        | 498 MB     |
| `assets/`            | Image uploads (screenshots, user images)    | 1,497 files      | ~200 MB    |
| `terminals/`         | Terminal session snapshots                  | 39 files         | ~5 MB      |
| `mcps/`              | MCP server descriptors, tools, resources    | 4 servers        | ~100 KB    |
| `rules/`             | Project-scoped Cursor rules (empty for tau) | 0                | 0          |
| `mcp-approvals.json` | Approved MCP server hashes                  | JSON array       | 218 B      |
| `mcp-cache.json`     | Cached MCP tool/resource definitions        | JSON             | 76 KB      |
| `.workspace-trusted` | Trust timestamp and workspace path          | JSON             | 89 B       |
| `worker.log`         | Merkle tree sync / indexing log             | Text             | 539 KB     |

**Key pattern**: The path-slug naming (`Users-rifont-git-tau`) creates a flat namespace that avoids nested directories while remaining human-readable. This is deterministic — given a workspace path, the project directory can be computed without lookup.

**Relevance to Tau**: Our browser filesystem is scoped per-project. The slug-based isolation pattern maps directly to project IDs in our database.

## Finding 3: JSONL Append-Only Transcripts

Agent conversations are stored as JSONL (JSON Lines) files — one JSON object per line, append-only.

### Structure

```
agent-transcripts/
  <uuid>/
    <uuid>.jsonl           # Parent conversation
    subagents/
      <uuid>.jsonl         # Subagent conversation
```

### JSONL Record Schema

Each line is a JSON object with:

```json
{
  "role": "user" | "assistant",
  "message": {
    "content": [
      {
        "type": "text",
        "text": "..."
      }
    ]
  }
}
```

### Properties

| Property          | Value                                                           |
| ----------------- | --------------------------------------------------------------- |
| **Format**        | JSONL (one JSON object per line)                                |
| **Append model**  | Append-only; new messages appended to end                       |
| **Naming**        | UUID v4 for both directory and file                             |
| **Subagents**     | Nested in `subagents/` subdirectory with own UUIDs              |
| **Content types** | `text` observed; `image` references via file paths to `assets/` |
| **Tool calls**    | Not stored in JSONL (excluded from transcripts)                 |
| **Size**          | 8 KB–36 KB per conversation typical                             |
| **Total**         | 272 conversations for one workspace                             |

### Why JSONL

JSONL is optimal for conversation logs because:

1. **Append-only**: No need to read-modify-write the entire file to add a message
2. **Streaming-friendly**: Each line is independently parseable — can stream-process without loading entire history
3. **Line-oriented tooling**: `head`, `tail`, `wc -l`, `grep` all work natively
4. **Crash-safe**: Partial writes only corrupt the last line, not the entire file
5. **Size-efficient**: No array wrapper overhead, no re-serialization on append

**Relevance to Tau**: Our chat history is currently in PostgreSQL. For the browser virtual filesystem, JSONL files would enable the agent to read its own conversation history via file tools, supporting self-reflection and the continual-learning pattern.

## Finding 4: Large Output Offloading

When a tool call produces output exceeding a size threshold, Cursor writes the output to a separate file in `agent-tools/` and returns a file reference instead of inline content.

### Structure

```
agent-tools/
  <uuid>.txt    # Tool output content
```

### Properties

| Property         | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| **Naming**       | UUID v4 with `.txt` extension                                      |
| **Size range**   | 20 KB – 45 MB                                                      |
| **Total volume** | 664 files, 498 MB                                                  |
| **Content**      | Raw tool output (shell command stdout, file reads, search results) |
| **Lifetime**     | Accumulated across sessions; no automatic cleanup observed         |

### Offloading Pattern

The system prompt references this mechanism:

> "Command output has been written to: /Users/rifont/.cursor/projects/.../agent-tools/<uuid>.txt (290.8 KB, 28 lines)"

The agent receives a file path instead of the full content, and can read it on demand. This is effectively **observation masking** (see context-summarization-compaction.md Finding 4) implemented via filesystem indirection.

**Relevance to Tau**: This is directly applicable. Our agent's tool outputs (kernel compilation results, geometry analysis, file tree listings) can be offloaded to virtual files. The agent reads them when needed, keeping the conversation context lean. This aligns with the "prevention beats compression" principle — large outputs never enter the context window.

## Finding 5: Terminal Sessions as Structured Text Files

Terminal sessions are persisted as structured text files with YAML-like frontmatter metadata and raw terminal output.

### Format

```yaml
---
pid: 82566
cwd: '/Users/rifont/git/tau'
command: 'cd /Users/rifont/git/tau/repos/opencascade.js && ...'
started_at: 2026-03-24T00:01:31.457Z
running_for_ms: 10018
---
<raw terminal output>
---
exit_code: 0
elapsed_ms: 13843
ended_at: 2026-03-24T00:01:45.300Z
---
```

### Properties

| Property         | Value                                                          |
| ---------------- | -------------------------------------------------------------- |
| **Naming**       | `<pid>.txt` — process ID as filename                           |
| **Header**       | PID, CWD, command, start time, running duration                |
| **Body**         | Raw terminal output (stdout + stderr interleaved)              |
| **Footer**       | Exit code, elapsed time, end time                              |
| **Update model** | Overwritten in place; `running_for_ms` updates every 5 seconds |
| **Total**        | 39 terminal sessions for one workspace                         |

### Design Insights

1. **PID as filename**: Enables direct lookup — the agent knows its command's PID and can read `<pid>.txt`
2. **Running state**: `running_for_ms` without a footer means the command is still running
3. **Footer as completion signal**: Presence of `exit_code` + `elapsed_ms` + `ended_at` footer means the command has finished
4. **Structured metadata + unstructured output**: YAML frontmatter for machine parsing, raw text for human/agent reading
5. **Polling model**: The agent polls by reading the file, checking for the footer, and sleeping

**Relevance to Tau**: Our CAD kernel execution produces structured results (compilation success/failure, geometry metrics, error traces). The frontmatter pattern — structured metadata wrapping unstructured output — is directly applicable to kernel execution result files.

## Finding 6: Plans as YAML+Markdown State Machines

Plans are stored as `.plan.md` files with YAML frontmatter containing a todo list state machine, followed by Markdown implementation details.

### Format

```yaml
---
name: Zoo WebSocket Proxy
overview: Create a NestJS WebSocket proxy...
todos:
  - id: add-zoo-env-var
    content: Add ZOO_API_KEY to API environment schema
    status: completed
  - id: install-fastify-websocket
    content: Install @fastify/websocket dependency in API
    status: completed
  - id: create-kernels-module
    content: Create kernels module, controller, and service
    status: pending
---
# Implementation details in Markdown...
```

### Properties

| Property                | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| **Location**            | `~/.cursor/plans/` (global, not project-scoped)           |
| **Naming**              | `<slug>_<hash>.plan.md`                                   |
| **Total**               | 1,170 plan files                                          |
| **Todo statuses**       | `completed`, `pending`, `in_progress`, `cancelled`        |
| **Status distribution** | 77% completed, 20% pending, 2% in_progress, <1% cancelled |
| **Size range**          | 205 B – 44 KB                                             |
| **Average size**        | 8.6 KB                                                    |

### Design Insights

1. **File = plan**: Each plan is a self-contained file — no database needed
2. **YAML todos as state machine**: The `status` field on each todo item is a finite state machine (`pending` → `in_progress` → `completed` | `cancelled`)
3. **Slug+hash naming**: Descriptive slug for human browsing, hash suffix for uniqueness
4. **Markdown body**: Rich implementation notes, code examples, mermaid diagrams
5. **Accumulated history**: 1,170 plans preserved — serves as a knowledge base of past decisions

**Relevance to Tau**: Our agent's task planning (currently in-memory via LangGraph state) could be persisted as plan files in the virtual filesystem. This enables plan recovery across sessions, plan sharing between agents, and human review of agent reasoning.

## Finding 7: SQLite for Analytics, Not Agent State

Cursor uses SQLite databases selectively — for analytics and blob storage, not for agent runtime state.

### `ai-code-tracking.db` (171 MB)

| Table                    | Records   | Purpose                                                                                         |
| ------------------------ | --------- | ----------------------------------------------------------------------------------------------- |
| `ai_code_hashes`         | 586,815   | Content hashes of AI-generated code, tracked by source (composer: 579K, human: 6K, tab: 1.3K)   |
| `scored_commits`         | ~2,400    | Per-commit AI contribution metrics: lines added/deleted by tab, composer, human; v2AiPercentage |
| `conversation_summaries` | 0 (empty) | Title, TLDR, overview, summary bullets per conversation — schema exists but unused              |
| `tracking_state`         | 1         | Single row: `trackingStartTime` timestamp                                                       |
| `tracked_file_content`   | 0 (empty) | Git path → content mapping for AI-written files                                                 |
| `ai_deleted_files`       | 14        | Records of files deleted by AI (git path, composer ID, model, timestamp)                        |

### `chats/*/store.db` (Blob Store)

| Table   | Purpose                                                      |
| ------- | ------------------------------------------------------------ |
| `blobs` | `(id TEXT PK, data BLOB)` — content-addressed binary storage |
| `meta`  | `(key TEXT PK, value TEXT)` — key-value metadata             |

### Design Insights

1. **SQLite for analytics, files for agent state**: The agent never queries SQLite during conversations — it reads files (transcripts, terminals, tool outputs, plans)
2. **Content hashing**: 587K code hashes enable tracking which lines of code were AI-generated vs human-written
3. **AI attribution**: `scored_commits` attributes each commit's changes to tab completion, composer, or human edits — powering the "AI contribution %" metric
4. **Schema-ready but unused**: `conversation_summaries` and `tracked_file_content` tables exist with full schemas but are empty — feature flags or future capability
5. **Blob store pattern**: Chat data uses a minimal `(id, blob)` schema — content-addressed storage without application-level schema

**Relevance to Tau**: This validates our approach of using PostgreSQL for analytics/auth and the virtual filesystem for agent state. Runtime agent state belongs in files; long-term analytics belongs in databases.

## Finding 8: MCP Tool Descriptors as Static JSON

MCP (Model Context Protocol) servers expose their capabilities as static JSON descriptor files on the filesystem.

### Structure

```
mcps/
  <server-name>/
    SERVER_METADATA.json     # Server identity
    INSTRUCTIONS.md          # Server usage instructions (injected into system prompt)
    STATUS.md                # Error status (when server is down)
    tools/
      <tool-name>.json       # Tool descriptor (name, description, argument schema)
    resources/
      <resource-name>.json   # Resource descriptor (URI, name, description, mime type)
```

### Servers Discovered

| Server                                       | Tools | Resources | Source                                         |
| -------------------------------------------- | ----- | --------- | ---------------------------------------------- |
| `cursor-ide-browser`                         | 33    | 0         | Built-in (Playwright-based browser automation) |
| `user-eamodio.gitlens-extension-GitKraken`   | 23    | 0         | Extension (GitKraken/GitLens)                  |
| `user-github`                                | 0     | 0         | User-configured (Docker, errored)              |
| `user-nrwl.angular-console-extension-nx-mcp` | 18    | 2         | Extension (Nx Console)                         |

### Design Insights

1. **Filesystem as tool registry**: Tool capabilities are files, not API calls — the agent reads JSON descriptors to discover what tools exist
2. **Static snapshot**: Descriptors are written when the MCP server starts and read lazily — no runtime discovery protocol needed
3. **Instructions as Markdown**: `INSTRUCTIONS.md` is injected into the agent's system prompt — MCP servers teach the agent how to use them via files
4. **Graceful degradation**: `STATUS.md` handles server errors — the agent reads the file and knows to skip the server
5. **Cache layer**: `mcp-cache.json` (76 KB) caches tool definitions across sessions for fast startup
6. **Approval model**: `mcp-approvals.json` lists hashed server identifiers that the user has approved — security via allowlist

**Relevance to Tau**: Our kernel capabilities (defineKernel API) could be exposed as tool descriptor files in the virtual filesystem. The agent would discover available kernels by reading files, not by querying an API. This decouples kernel registration from agent startup.

## Finding 9: .gitignore as Visibility Contract

The `.gitignore` file in `~/.cursor/` serves as the **agent visibility contract** — it controls which files the agent can see and read.

### Pattern

```gitignore
# Ignore everything by default
*

# Allowlist specific subsystems
!projects/
!projects/*/mcps/**          # MCP tool descriptors
!projects/*/agent-transcripts/** # Conversation history
!projects/*/terminals/**     # Terminal sessions
!projects/*/agent-notes/**   # Shared scratchpad
!projects/*/agent-tools/**   # Large tool outputs
!plugins/**                  # Plugin system
!skills-cursor/**            # Built-in skills
!skills/**                   # User skills
!commands/**                 # Slash commands
!plans/**                    # Plan files
!subagents/**                # Subagent state
!rules/**                    # User-level rules
```

### Design Insights

1. **Default-deny**: Everything is ignored by default — subsystems must be explicitly allowlisted
2. **Granular visibility**: The agent can see terminals, transcripts, and tool outputs, but not SQLite databases, extensions, or config files
3. **Filesystem-as-API**: The `.gitignore` effectively defines the agent's filesystem API — what it can read is what it can know
4. **Security boundary**: Sensitive files (SQLite with code hashes, config with API keys) are invisible to the agent
5. **Composable**: Project-level `.gitignore` patterns compose with the global patterns

**Relevance to Tau**: Our virtual filesystem needs an equivalent visibility contract. Not everything in the project directory should be visible to the agent — build artifacts, node_modules, and credentials should be filtered. A `.agentignore` or permission model at the RPC layer would serve the same purpose.

## Finding 10: Plugin Hooks via Filesystem Convention

Cursor's plugin system uses a convention-based filesystem layout with lifecycle hooks.

### Structure

```
plugins/
  cache/
    cursor-public/
      <plugin-name>/
        <commit-hash>/
          LICENSE
          README.md
          assets/
            avatar.png
          hooks/
            hooks.json        # Hook definitions (lifecycle → command)
            <hook-script>.ts  # Hook implementation
          skills/
            <skill-name>/
              SKILL.md        # Skill instructions
```

### Hook System

`hooks.json` maps lifecycle events to commands:

```json
{
  "version": 1,
  "hooks": {
    "stop": [{ "command": "bun run ${CURSOR_PLUGIN_ROOT}/hooks/continual-learning-stop.ts" }]
  }
}
```

The `stop` hook receives a `StopHookInput` via stdin:

```typescript
interface StopHookInput {
  conversation_id: string;
  generation_id?: string;
  status: 'completed' | 'aborted' | 'error' | string;
  loop_count: number;
  transcript_path?: string | null;
}
```

### Continual Learning Plugin

The most sophisticated plugin observed implements **continual learning** — mining agent transcripts after each conversation to update `AGENTS.md` with learned user preferences and workspace facts.

Flow:

1. `stop` hook fires after each conversation ends
2. Script reads transcript via `transcript_path` from stdin
3. Compares file mtime against incremental index
4. Only processes new/changed transcripts
5. Updates `AGENTS.md` with high-signal patterns

**Relevance to Tau**: Agent lifecycle hooks — especially post-conversation learning — are directly applicable. Our agent could write learned CAD patterns (preferred kernel, modeling style, common parameters) to project files after each session.

## Finding 11: Git Snapshots and Worktrees for Isolation

### Snapshots

`~/.cursor/snapshots/<hash>-<version>/` contains bare git repositories used to capture workspace state at specific points.

| Property    | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| **Format**  | Bare git repository (`HEAD`, `config`, `objects/`, `refs/`) |
| **Count**   | 6 snapshots                                                 |
| **Purpose** | Point-in-time workspace state for checkpoint/restore        |

### Worktrees

`~/.cursor/worktrees/<project>/<short-id>/` contains full git worktrees — independent working copies of the repository.

| Property     | Value                                                            |
| ------------ | ---------------------------------------------------------------- |
| **Count**    | 13 worktrees for `tau`                                           |
| **Naming**   | Short random alphanumeric IDs (3–5 chars)                        |
| **Contents** | Full repository checkout with `node_modules`, `.cursor/`, `.git` |
| **Purpose**  | Best-of-N parallel agent runs in isolated environments           |

### Design Insights

1. **Git as checkpoint system**: Snapshots are bare repos — lightweight captures of workspace state without working files
2. **Worktrees for parallelism**: Each best-of-N agent run gets its own worktree — complete isolation with shared git history
3. **Ephemeral by design**: Short random IDs suggest these are temporary; no human-meaningful naming
4. **Full environment**: Worktrees include `node_modules` — each agent run gets a complete, buildable environment

**Relevance to Tau**: Our virtual filesystem could use git-like snapshots for checkpointing CAD design state. The agent could branch, experiment, and restore — mapping naturally to the "iterative design refinement" pattern in CAD workflows.

## Finding 12: Assets as Content-Addressed Blobs

User-provided images (screenshots, reference images) are stored in `assets/` with double-UUID naming.

| Property     | Value                                                               |
| ------------ | ------------------------------------------------------------------- |
| **Location** | `~/.cursor/projects/<slug>/assets/`                                 |
| **Naming**   | `<uuid1>-<uuid2>.png`                                               |
| **Count**    | 1,497 files                                                         |
| **Format**   | PNG exclusively                                                     |
| **Purpose**  | Screenshots for visual verification, user-provided reference images |

### Design Insights

1. **Double-UUID naming**: First UUID likely identifies the conversation/message, second the asset — enabling both forward and reverse lookup
2. **PNG only**: Screenshots are always PNG; no format negotiation
3. **Content-addressed**: UUIDs prevent naming collisions across conversations
4. **Referenced in transcripts**: JSONL transcripts reference assets by absolute path, creating a cross-reference between conversation state and binary data

**Relevance to Tau**: Our agent generates GLB renders and screenshots during geometry verification. Storing these as content-addressed files in the virtual filesystem (referenced from conversation history) would enable visual diffing, iterative refinement, and audit trails.

## Finding 13: Chats SQLite as Blob Store

The legacy `chats/` directory uses a minimal SQLite blob store pattern:

```
chats/
  <hash>/
    <uuid>/
      store.db       # SQLite with blobs + meta tables
      store.db-shm   # Shared memory (WAL mode)
      store.db-wal   # Write-ahead log
```

Schema: `blobs(id TEXT PK, data BLOB)` + `meta(key TEXT PK, value TEXT)`

This appears to be a legacy chat storage format that has been superseded by the JSONL transcript system. The blob store pattern stores serialized conversation state as binary data — opaque and not agent-readable.

**Key insight**: The migration from SQLite blob storage to JSONL files represents a deliberate architectural choice — moving from opaque binary storage to agent-readable text files. This aligns with the "files are the interface" principle.

## Complete Filesystem Inventory

| Path                                 | Type    | Count    | Size    | Purpose                             | Agent Visible |
| ------------------------------------ | ------- | -------- | ------- | ----------------------------------- | ------------- |
| `~/.cursor/argv.json`                | JSONC   | 1        | 1 KB    | V8 flags, crash reporter            | No            |
| `~/.cursor/cli-config.json`          | JSON    | 1        | 1 KB    | Permissions, editor defaults, model | No            |
| `~/.cursor/mcp.json`                 | JSON    | 1        | 275 B   | User-level MCP servers              | No            |
| `~/.cursor/ide_state.json`           | JSON    | 1        | 1 KB    | Recently viewed files               | No            |
| `~/.cursor/prompt_history.json`      | JSON    | 1        | 93 B    | Previous prompts                    | No            |
| `~/.cursor/.gitignore`               | Text    | 1        | 922 B   | Agent visibility contract           | N/A           |
| `~/.cursor/extensions/`              | Mixed   | 42       | ~500 MB | VS Code extensions                  | No            |
| `~/.cursor/plans/`                   | YAML+MD | 1,170    | 10 MB   | Plan state machines                 | Yes           |
| `~/.agent/skills-cursor/`            | MD      | 6        | ~30 KB  | Built-in agent skills               | Yes           |
| `~/.cursor/plugins/`                 | Mixed   | 1 plugin | ~50 KB  | Plugin hooks + skills               | Yes           |
| `~/.cursor/worktrees/`               | Git     | 13       | ~2 GB   | Isolated worktrees                  | No            |
| `~/.cursor/snapshots/`               | Git     | 6        | ~10 MB  | Git checkpoints                     | No            |
| `~/.cursor/ai-tracking/`             | SQLite  | 1        | 171 MB  | Code attribution analytics          | No            |
| `~/.cursor/chats/`                   | SQLite  | 1        | ~1 MB   | Legacy chat blob store              | No            |
| `projects/<slug>/agent-transcripts/` | JSONL   | 272      | ~50 MB  | Conversation history                | Yes           |
| `projects/<slug>/agent-tools/`       | Text    | 664      | 498 MB  | Large tool output offloads          | Yes           |
| `projects/<slug>/assets/`            | PNG     | 1,497    | ~200 MB | Screenshots, user images            | Yes           |
| `projects/<slug>/terminals/`         | Text    | 39       | ~5 MB   | Terminal session state              | Yes           |
| `projects/<slug>/mcps/`              | JSON+MD | 74+      | ~100 KB | MCP descriptors                     | Yes           |
| `projects/<slug>/worker.log`         | Text    | 1        | 539 KB  | Indexer/sync log                    | No            |

## Recommendations for Tau CAD Agent

| #   | Action                                                                               | Priority | Effort | Impact                                                                   |
| --- | ------------------------------------------------------------------------------------ | -------- | ------ | ------------------------------------------------------------------------ |
| R1  | Adopt JSONL format for agent conversation history in virtual filesystem              | P0       | Medium | High — enables agent self-reflection, continual learning, crash recovery |
| R2  | Implement large tool output offloading via Chat RPC `createFile`                     | P0       | Low    | High — prevents context bloat from kernel outputs and geometry analysis  |
| R3  | Store kernel execution results as structured text files (YAML frontmatter + output)  | P1       | Medium | High — enables polling, result inspection, and cross-session reference   |
| R4  | Create agent visibility contract (`.agentignore` or RPC-level filter)                | P1       | Medium | Medium — controls what the agent can discover in the virtual filesystem  |
| R5  | Persist agent plans as YAML+Markdown files in virtual filesystem                     | P2       | Low    | Medium — enables plan recovery, sharing, and human review                |
| R6  | Store screenshots and GLB renders as content-addressed files referenced from history | P2       | Medium | Medium — enables visual diffing and iterative design verification        |
| R7  | Implement post-conversation hooks for learning CAD patterns                          | P3       | High   | Medium — enables continual learning of user modeling preferences         |
| R8  | Use MCP-style JSON descriptors for kernel capability discovery                       | P3       | Medium | Low — decouples kernel registration from agent startup                   |
| R9  | Evaluate git-like snapshots for CAD design state checkpointing                       | P3       | High   | Medium — enables branch/experiment/restore for design exploration        |

### Implementation Priority

**Phase 1 — Context Prevention** (R1, R2):
Implement JSONL conversation logs and large output offloading via the existing `createFile` RPC. This directly reduces context pressure and enables the Morph Compact integration (R2 from context-summarization-compaction.md).

**Phase 2 — Structured Agent State** (R3, R4, R5):
Add structured kernel result files, visibility contracts, and plan persistence. This gives the agent a rich filesystem to work with.

**Phase 3 — Rich Agent Memory** (R6, R7, R8, R9):
Screenshot storage, continual learning, capability discovery, and design checkpointing. These are the advanced patterns that differentiate a mature filesystem-first agent platform.

## References

### Primary Sources

- Cursor IDE `~/.cursor/` directory (version as of March 2026)
- Cursor `.gitignore` visibility contract (agent-readable subsystem allowlist)
- `cursor-public/continual-learning` plugin (hook system, incremental transcript mining)
- Cursor system prompt (terminal file format, agent-tools offloading, transcript citation)

### Tau Internal References

- `docs/policy/vision-policy.md` — "Files are the interface" design principle
- `docs/policy/filesystem-policy.md` — Filesystem architecture policy
- `docs/research/context-summarization-compaction.md` — Context compression techniques
- `apps/api/app/api/chat/chat-rpc.service.ts` — Chat RPC service for browser filesystem
- `apps/api/app/api/tools/tools/tool-create-file.ts` — File creation tool via RPC

### Design Patterns Identified

| Pattern                     | Cursor Implementation              | Tau Applicability                          |
| --------------------------- | ---------------------------------- | ------------------------------------------ |
| **Append-only log**         | JSONL transcripts                  | Conversation history, kernel execution log |
| **Output offloading**       | `agent-tools/<uuid>.txt`           | Kernel results, geometry analysis          |
| **Structured metadata**     | YAML frontmatter in terminal files | Kernel execution results                   |
| **State machine as file**   | Plan YAML todos with status        | Agent task planning                        |
| **Filesystem as registry**  | MCP JSON descriptors               | Kernel capability discovery                |
| **Visibility contract**     | `.gitignore` allowlist             | `.agentignore` or RPC filter               |
| **Content-addressed blobs** | UUID-named assets                  | Screenshot and GLB storage                 |
| **Lifecycle hooks**         | Plugin `hooks.json`                | Post-conversation learning                 |
| **Workspace isolation**     | Git worktrees                      | Design branch/experiment                   |
| **Incremental processing**  | Continual learning mtime index     | Transcript mining for preferences          |
