---
title: 'Context Injection Architecture'
description: 'Deep audit of how user-defined context (AGENTS.md, skills, rules, transcripts) gets intercepted, read, and injected into the LLM system prompt — Cursor vs Tau comparison with gap analysis and recommendations.'
status: active
created: '2026-03-24'
updated: '2026-03-24'
category: comparison
related:
  - docs/research/cursor-filesystem-architecture.md
  - docs/research/transcript-search-architecture.md
  - docs/policy/filesystem-context-policy.md
  - docs/policy/context-engineering-policy.md
---

# Context Injection Architecture

Audit of how user-defined context files (AGENTS.md, skills, rules, transcripts) are intercepted, read, and injected into the LLM system prompt — comparing Cursor's production system with Tau's current implementation to identify gaps and opportunities for a world-class automatic context reading system.

## Executive Summary

Cursor uses a **three-tier context injection model** — always-on rules, glob-triggered rules, and manually attached skills — resolved entirely at the IDE layer before the LLM call. Tau uses a **middleware-based model** where `deepagents` middleware reads context from the browser virtual filesystem via RPC during agent startup. Tau's current approach has critical reliability gaps: missing `.tau/` directories silently return empty results, there is no scaffolding for user-customizable context, skills and memory middleware load once per agent invocation but never reload mid-session, and there is no equivalent to Cursor's glob-matching or always-on injection. Seven recommendations are proposed to close the gap.

## Problem Statement

Tau supports user-defined context through `.tau/skills/` and `.tau/AGENTS.md` (loaded by `deepagents` middleware), and agent-written context through transcripts and tool offloading. However, these features are wired but not yet reliable:

1. No `.tau/` directory scaffolding exists — skills/memory middleware silently gets empty results on fresh projects
2. No equivalent to Cursor's `alwaysApply` or glob-triggered rule injection
3. No visibility into what context was actually injected (debugging is opaque)
4. Edge cases around trailing slashes, missing files, and RPC disconnection are unhandled
5. Skills metadata is loaded once at agent start and never refreshed during long sessions

## Methodology

1. **Cursor system audit**: Examined `.cursor/rules/*.mdc` frontmatter (10 rules), `.agent/skills/` (13 skills), agent transcripts (JSONL schema), and the `~/.cursor/.gitignore` visibility contract
2. **Cursor injection trace**: Analyzed how Cursor embeds `<always_applied_workspace_rules>`, `<agent_skills>`, `<manually_attached_skills>`, and `<user_rules>` XML tags in the system prompt (observed from our own transcript JSONL)
3. **Tau middleware source audit**: Read `deepagents@1.8.4` bundle (`createSkillsMiddleware`, `createMemoryMiddleware`, `BackendProtocol`), `chat.service.ts` wiring, `TauRpcBackend`, and `ChatRpcService`
4. **Tau RPC client audit**: Traced the browser-side RPC handler chain (`chat-rpc-socket.service.ts` → `rpc-handlers.ts` → `rpc-dispatcher.ts` → `handle-list-directory.ts` / `handle-read-file.ts`)
5. **Edge case analysis**: Tested behavior for missing directories, missing files, trailing slash mismatches, and disconnected sockets

## Finding 1: Cursor's Three-Tier Injection Model

Cursor resolves all user-defined context at the IDE layer and embeds it in the system prompt via structured XML tags before the LLM call.

### Tier 1: Always-Applied Rules (`alwaysApply: true`)

Injected on every agent turn regardless of file context.

```xml
<always_applied_workspace_rules>
  <always_applied_workspace_rule name="path/to/rule.mdc">
    [Full rule content inlined]
  </always_applied_workspace_rule>
</always_applied_workspace_rules>
```

In Tau's workspace: only `package-manager.mdc` uses `alwaysApply: true`.

### Tier 2: Glob-Triggered Rules (`alwaysApply: false` + `globs`)

Injected when the user's currently focused file matches the rule's glob patterns. The IDE evaluates the glob match, not the LLM.

| Rule                      | Globs                                          | Activated by                    |
| ------------------------- | ---------------------------------------------- | ------------------------------- |
| `testing.mdc`             | `*.test.ts`                                    | Editing a test file             |
| `ui-design.mdc`           | `*.tsx`                                        | Editing a React component       |
| `xstate.mdc`              | `*.machine.ts`                                 | Editing a state machine         |
| `context-engineering.mdc` | `**/tools/**/*.ts`, `**/prompts/**/*.ts`, etc. | Editing prompt/middleware files |

These appear in the system prompt only when relevant, keeping context lean.

### Tier 3: Manually Attached Skills

The user explicitly attaches a skill (via `/skill-name` or UI). The full `SKILL.md` content is inlined:

```xml
<manually_attached_skills>
  <skill name="create-policy" path="/path/to/SKILL.md">
    [Full SKILL.md content]
  </skill>
</manually_attached_skills>
```

### Tier 4: Available Skills Catalog

All skills' metadata (name, trigger description, path) are listed in the system prompt, but their full content is NOT inlined — only the path. The agent reads the `SKILL.md` on demand.

```xml
<agent_skills>
  <available_skills>
    <agent_skill fullPath="/path/to/SKILL.md">
      Trigger description here
    </agent_skill>
  </available_skills>
</agent_skills>
```

### Key Design Insight

Cursor's injection is **deterministic and IDE-controlled**. The LLM receives exactly the context the IDE computed — no filesystem reads during the LLM call, no race conditions, no missing-file edge cases. The agent can still read skill files on demand, but the catalog is always present.

## Finding 2: Tau's Middleware-Based Injection Model

Tau uses `deepagents` middleware to read context from the browser virtual filesystem at agent startup, then injects it into the system message.

### Skills Middleware (`createSkillsMiddleware`)

| Phase     | Hook             | Behavior                                                                                       |
| --------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| Discovery | `beforeAgent`    | Calls `backend.lsInfo('.tau/skills/')` to list subdirectories, then reads `SKILL.md` from each |
| Injection | `wrapModelCall`  | Appends `SKILLS_SYSTEM_PROMPT` to `request.systemMessage` via `concat()`                       |
| Caching   | Closure variable | `loadedSkills` populated once; skipped if already loaded or state has `skillsMetadata`         |

The injected content includes metadata only (name, description, path) — not full skill bodies. Progressive disclosure: the agent reads `SKILL.md` on demand.

### Memory Middleware (`createMemoryMiddleware`)

| Phase     | Hook            | Behavior                                                                                                     |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| Load      | `beforeAgent`   | Reads each path in `sources` (e.g., `.tau/AGENTS.md`) via `backend.read()` or `downloadFiles()`              |
| Injection | `wrapModelCall` | Builds new `SystemMessage` with content block array; appends `<agent_memory>` section with full file content |
| Caching   | State key       | Skipped if `memoryContents` already in state (e.g., restored from checkpointer)                              |

Memory content is inlined in full — unlike skills which only inject metadata.

### System Prompt Construction

The static system prompt (`getCadSystemPrompt`) is built once at `createAgent` time:

```
<role> → <workflow> → <test_requirements> → <visual_inspection> →
<code_standards> → <error_handling> → <canonical_example> →
<research_capabilities> → <transcript_search> → [plan_mode]
```

Then at each model call, middleware appends:

1. Skills catalog (from `createSkillsMiddleware`)
2. Memory contents (from `createMemoryMiddleware`)
3. Prompt caching breakpoints (from `promptCachingMiddleware`)

### Key Design Insight

Tau's injection is **runtime and filesystem-dependent**. The middleware reads from the browser filesystem via RPC during agent startup, which introduces failure modes absent in Cursor's static injection.

## Finding 3: Critical Reliability Gaps

### Gap 1: No `.tau/` Directory Scaffolding

**Problem**: On a fresh project, `.tau/skills/` and `.tau/AGENTS.md` do not exist. The middleware silently gets empty results.

- `lsInfo('.tau/skills/')` → browser `readdir` walks the tree snapshot, finds nothing → `{ success: true, entries: [] }` → no skills loaded
- `read('.tau/AGENTS.md')` → ZenFS throws ENOENT → `toRpcError` → `{ success: false, errorCode: 'FILE_NOT_FOUND' }` → `deepagents` interprets string starting with "Error:" as failure → `null` → no memory loaded

**Impact**: Skills and memory middleware never inject any context on fresh projects. The user gets no indication that the system supports these features.

**Cursor comparison**: Cursor doesn't have this problem because `.cursor/rules/` and `.agent/skills/` are tracked in git. The IDE reads them from the workspace, not a virtual filesystem.

### Gap 2: Trailing Slash Mismatch

**Problem**: The browser `readdir` implementation uses `parentDirectory(entryPath) === path` for string equality. If the server sends `path: '.tau/skills/'` (trailing slash) but tree entries have parent `.tau/skills` (no trailing slash), the listing returns empty even when files exist.

`deepagents` normalizes paths to end with `/` or `\`:

```javascript
// From deepagents bundle
const normalized = sourcePath.endsWith('/') || sourcePath.endsWith('\\') ? sourcePath : sourcePath + '/';
```

This means `lsInfo('.tau/skills/')` sends `path: '.tau/skills/'` to the RPC, which hits the trailing slash mismatch in the browser `readdir`.

**Impact**: Skills may never be discovered even when present, depending on how `parentDirectory()` handles the path.

### Gap 3: No Glob-Triggered Rules

**Problem**: Tau has no mechanism to inject context based on the file the user is currently editing. The system prompt is the same whether the user is editing a test file, a prompt file, or a CAD model file.

**Cursor comparison**: Cursor evaluates glob patterns at the IDE layer and selectively injects relevant rules. This keeps context lean and domain-specific.

### Gap 4: No Always-Applied Rules

**Problem**: Tau has a static system prompt that handles the `alwaysApply` case, but there is no mechanism for users to define their own always-on rules (analogous to Cursor's `alwaysApply: true` rules).

**Cursor comparison**: AGENTS.md and `alwaysApply` rules are always injected. Users can customize agent behavior without code changes.

### Gap 5: Skills Load Once, Never Refresh

**Problem**: `createSkillsMiddleware` loads skills in `beforeAgent` and caches them in a closure variable. If a user creates a new skill file mid-session, it will not be discovered until a new agent invocation (new chat message).

**Cursor comparison**: Cursor reads rules from the workspace filesystem on every turn. New rules are picked up immediately.

### Gap 6: No Injection Visibility

**Problem**: There is no way for the user or developer to see what context was actually injected into the system prompt. If skills or memory fail to load (silently), the agent behaves differently with no diagnostic output.

**Cursor comparison**: Cursor's transcript JSONL contains the full system prompt with all injected XML tags, making it possible to audit exactly what the agent received.

### Gap 7: RPC Disconnection During Load

**Problem**: If the WebSocket disconnects between `registerConnection` and `beforeAgent`, skills/memory RPC calls fail with `NO_CONNECTION`. The middleware logs `debug` and returns empty results — the agent proceeds without context.

**Impact**: Intermittent context loss on flaky connections, with no user-visible error.

## Finding 4: Cursor's Injection Lifecycle

Tracing through Cursor's transcript JSONL reveals the exact lifecycle:

```
1. User opens workspace
2. IDE reads .cursor/rules/*.mdc files from workspace
3. IDE parses frontmatter (alwaysApply, globs, description)
4. IDE reads .agent/skills/*/SKILL.md files
5. IDE reads AGENTS.md from workspace root

Per user message:
6. IDE identifies currently focused file(s)
7. IDE evaluates glob patterns against focused files
8. IDE assembles system prompt:
   a. Core system instructions (hardcoded by Cursor)
   b. <always_applied_workspace_rules> — all alwaysApply=true rules
   c. <user_rules> — user-level rules
   d. <agent_skills> with <available_skills> — skills catalog (metadata only)
   e. <manually_attached_skills> — if user attached any
   f. <open_and_recently_viewed_files> — editor state
   g. <git_status> — workspace git state
   h. <terminal_files_information> — terminal session format docs
   i. Glob-matched rules (injected inline, not in a wrapper tag)
9. LLM call with assembled prompt
10. Repeat from step 6 for next message
```

**Key observation**: Steps 6-8 happen on every user message, not just at agent creation. This means Cursor's context is always fresh — new rules, changed files, updated git status are all reflected immediately.

## Finding 5: Tau's Injection Lifecycle

```
1. User sends chat message
2. API creates agent (chat.service.ts createAgent)
3. getCadSystemPrompt() builds static prompt (once per invocation)
4. createCachedSystemMessage() wraps with cache breakpoint
5. Middleware chain initialized with closures

Per model call (may happen multiple times per user message):
6. beforeAgent hooks fire:
   a. createSkillsMiddleware reads .tau/skills/ via RPC (first call only)
   b. createMemoryMiddleware reads .tau/AGENTS.md via RPC (first call only)
7. wrapModelCall hooks fire in order:
   a. Tool metrics + error handling
   b. Tool offloading (large results → files)
   c. Compaction (context compression)
   d. Message sanitization
   e. Prompt caching breakpoints
   f. Logging + observability
   g. Transcript (append to JSONL)
   h. Skills (append catalog to system message)
   i. Memory (append AGENTS.md to system message)
8. LLM call
9. afterModel hooks fire (transcript logging)
10. wrapToolCall hooks fire per tool call
11. Back to step 6 for next model call (but skills/memory skip reload)
```

**Key observation**: Steps 6a and 6b only run on the first model call per invocation. Context is stale for multi-turn within the same invocation. The static system prompt (step 3) is frozen for the entire agent lifecycle.

## Finding 6: AGENTS.md Comparison

| Aspect              | Cursor                                                                               | Tau                                                   |
| ------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **Location**        | Workspace root `AGENTS.md`                                                           | `.tau/AGENTS.md` (virtual filesystem)                 |
| **Read timing**     | Every user message                                                                   | Once per agent invocation (`beforeAgent`)             |
| **Injection point** | `<always_applied_workspace_rules>` (if referenced by a rule) or direct system prompt | `<agent_memory>` block appended to system message     |
| **Editability**     | User edits in IDE, git-tracked                                                       | Agent edits via `edit_file` tool, stored in IndexedDB |
| **Auto-learning**   | `continual-learning` plugin mines transcripts on `stop` hook, updates AGENTS.md      | Not implemented                                       |
| **Refresh**         | Immediate (read on each turn)                                                        | Stale until new chat message                          |
| **Content**         | Workspace facts, user preferences, skills table, conventions                         | Same schema, but loaded from virtual FS               |

## Finding 7: Skills System Comparison

| Aspect                     | Cursor                                          | Tau                                              |
| -------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| **Location**               | `.agent/skills/*/SKILL.md` (git-tracked)        | `.tau/skills/*/SKILL.md` (virtual FS)            |
| **Discovery**              | IDE scans at startup + on file change           | `lsInfo` via RPC in `beforeAgent` (once)         |
| **Catalog injection**      | `<available_skills>` with paths + descriptions  | `SKILLS_SYSTEM_PROMPT` with paths + descriptions |
| **Full content injection** | `<manually_attached_skills>` when user attaches | Agent reads `SKILL.md` via `read_file` tool      |
| **Activation model**       | User explicitly attaches via `/skill-name`      | Agent decides to read based on catalog           |
| **User creation**          | Create directory + `SKILL.md` in workspace      | Must use `create_file` tool in chat (no UI)      |
| **Refresh**                | Immediate (rescanned on change)                 | Never during session                             |

## Recommendations

| #   | Action                                                                                                                     | Priority | Effort | Impact                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------------------------------------------------------------------------------ |
| R1  | Scaffold `.tau/` directory with `AGENTS.md` template on project creation                                                   | P0       | Low    | High — ensures memory middleware always has something to load                  |
| R2  | Fix trailing slash normalization in browser `readdir` to match `deepagents` path convention                                | P0       | Low    | High — skills discovery currently broken by path mismatch                      |
| R3  | Add glob-triggered context injection via per-kernel or per-file-type rule files in `.tau/rules/`                           | P1       | Medium | High — enables lean, domain-specific context injection                         |
| R4  | Add system prompt assembly logging (what was injected, byte counts, timing) as a debug SSE event                           | P1       | Low    | Medium — eliminates blind debugging of context injection failures              |
| R5  | Reload skills metadata on each model call, not just `beforeAgent` first call                                               | P1       | Low    | Medium — enables mid-session skill creation without starting a new chat        |
| R6  | Add a `.tau/rules/` convention with frontmatter (`alwaysApply`, `globs`) and a `createRulesMiddleware` that evaluates them | P2       | High   | High — full parity with Cursor's rule injection model                          |
| R7  | Implement post-conversation learning hook that mines transcripts and updates `.tau/AGENTS.md`                              | P3       | High   | Medium — automatic preference learning like Cursor's continual-learning plugin |

### R1: `.tau/` Directory Scaffolding

When a new project is created, scaffold:

```
.tau/
  AGENTS.md          # Template with project sections
  skills/            # Empty directory (ready for user skills)
  transcripts/       # Created automatically by transcript middleware
  offloaded-tool-results/  # Created automatically by tool offloading
```

The `AGENTS.md` template should include sections matching Cursor's format:

```markdown
# Project Memory

## Conventions

<!-- Agent-learned coding conventions go here -->

## Architecture

<!-- Project architecture notes -->

## Learned Preferences

<!-- User preferences discovered during conversations -->
```

Implementation: add to project creation flow in the UI.

### R2: Trailing Slash Fix

The browser `readdir` implementation uses exact string equality:

```typescript
const parentPath = entryPath.includes('/') ? parentDirectory(entryPath) : '';
if (parentPath === path) { ... }
```

Fix: normalize both sides by stripping trailing slashes before comparison.

### R3: Glob-Triggered Context Injection

Add a `createRulesMiddleware` that:

1. In `beforeAgent`, reads `.tau/rules/` for `*.md` files with YAML frontmatter
2. Parses `alwaysApply` and `globs` from frontmatter
3. In `wrapModelCall`, evaluates glob patterns against the user's current file context (passed via `runtime.context`)
4. Injects matching rules into the system message

This requires passing the user's current file context through the agent invocation chain.

### R4: Injection Visibility

Add a `contextAssemblyMiddleware` that emits a diagnostic SSE event:

```typescript
writer({
  type: 'context-assembly',
  skills: { count: loadedSkills.length, names: [...] },
  memory: { loaded: !!memoryContents['.tau/AGENTS.md'], bytes: ... },
  rules: { matched: [...], total: ... },
  systemPromptTokens: estimateTokens(systemMessage),
});
```

### R5: Skills Refresh per Model Call

Change `createSkillsMiddleware` to reload on every `wrapModelCall` instead of caching in the closure. The RPC overhead is minimal (one `list_directory` + N `read_file` calls for small skill sets). Gate with a TTL cache (e.g., 30 seconds) to avoid excessive RPC calls in rapid tool-call loops.

Since `deepagents` is an external package, this would require either:

- Patching the package via `pnpm patch`
- Contributing the change upstream
- Wrapping the middleware with a custom reload layer

## Trade-offs

| Approach                               | Pros                                                        | Cons                                                  |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| **Static injection (Cursor)**          | Deterministic, no runtime failures, immediate refresh       | IDE must understand all context types, tight coupling |
| **Middleware injection (Tau current)** | Extensible, decoupled, supports remote filesystems          | Runtime failures, stale caching, RPC latency          |
| **Hybrid (proposed)**                  | Best of both — scaffold guarantees + middleware flexibility | More complex, two injection paths to maintain         |

The recommended approach is **hybrid**: scaffold `.tau/` to eliminate the cold-start problem, fix the trailing slash bug to make skills discoverable, add rules middleware for glob-matching, and keep the existing middleware pipeline for extensibility.

## Diagrams

### Cursor Injection Flow

```
User opens workspace
      │
      ▼
  IDE reads .cursor/rules/*.mdc
  IDE reads .agent/skills/*/SKILL.md
  IDE reads AGENTS.md
      │
      ▼
  User sends message
      │
      ▼
  IDE evaluates focused file against globs
      │
      ▼
  IDE assembles system prompt:
  ┌─────────────────────────────────┐
  │ Core instructions (hardcoded)   │
  │ + alwaysApply rules (inlined)   │
  │ + glob-matched rules (inlined)  │
  │ + skills catalog (metadata)     │
  │ + attached skills (full content)│
  │ + user rules                    │
  │ + editor state                  │
  │ + git status                    │
  └─────────────────────────────────┘
      │
      ▼
  LLM call
```

### Tau Injection Flow (Current)

```
User sends message
      │
      ▼
  API creates agent
      │
      ▼
  getCadSystemPrompt() → static prompt (frozen)
      │
      ▼
  First model call
      │
      ▼
  beforeAgent:
    Skills middleware → RPC lsInfo('.tau/skills/') → may fail silently
    Memory middleware → RPC read('.tau/AGENTS.md') → may fail silently
      │
      ▼
  wrapModelCall:
    ... middleware chain ...
    Skills → append catalog to system message
    Memory → append AGENTS.md to system message
      │
      ▼
  LLM call with assembled prompt
      │
      ▼
  Subsequent model calls: skills/memory cached, NOT reloaded
```

### Tau Injection Flow (Proposed)

```
Project creation
      │
      ▼
  Scaffold .tau/:
    AGENTS.md (template)
    skills/ (empty dir)
    rules/ (empty dir)
      │
      ▼
  User sends message
      │
      ▼
  API creates agent with current file context
      │
      ▼
  getCadSystemPrompt() → static prompt
      │
      ▼
  Each model call:
    Rules middleware → read .tau/rules/*.md, match globs → inject
    Skills middleware → read .tau/skills/ (with TTL cache) → inject
    Memory middleware → read .tau/AGENTS.md → inject
      │
      ▼
  Diagnostic SSE: what was injected, byte counts
      │
      ▼
  LLM call with fresh, glob-filtered context
```

## References

- Cursor IDE `~/.cursor/` directory (version as of March 2026)
- `deepagents@1.8.4` bundle analysis (`dist/index.js`, `dist/index.d.ts`)
- Related: `docs/research/cursor-filesystem-architecture.md`
- Related: `docs/research/transcript-search-architecture.md`
- Policy: `docs/policy/filesystem-context-policy.md`
- Policy: `docs/policy/context-engineering-policy.md`
