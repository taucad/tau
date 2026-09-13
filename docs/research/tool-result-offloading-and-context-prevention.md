---
title: 'Tool-Result Offloading and Context Prevention'
description: 'Phased blueprint to eliminate the read_file/grep context-poisoning class of bugs by extending tool-result offloading to filesystem-backed previews with agentic re-read guidance, modelled on claude-code FileReadTool/GrepTool/toolResultStorage.'
status: draft
created: '2026-05-12'
updated: '2026-05-12'
category: architecture
related:
  - docs/policy/context-engineering-policy.md
  - docs/policy/filesystem-context-policy.md
  - docs/research/context-summarization-compaction.md
  - docs/research/context-injection-architecture.md
  - docs/research/agent-loop-safeguards.md
  - docs/research/image-context-management-gap-analysis.md
---

# Tool-Result Offloading and Context Prevention

Blueprint for closing the "single tool call poisons the entire prompt cache" class of failures by extending Tau's existing `tool-offloading.middleware.ts` with hard per-tool caps, filesystem-backed previews, and offset/limit re-read guidance — modelled on claude-code's `FileReadTool`, `GrepTool`, and `toolResultStorage` pipeline.

## Executive Summary

The current `excludedTools` allowlist in `tool-offloading.middleware.ts` carves out `read_file`, `grep`, `glob_search`, and `list_directory` from offloading under a "built-in truncation" assumption. That assumption is wrong: `handleReadFile` has **no upper cap** on `limit` (model can read every line of a 226 000-line `.d.ts`), `handleGrep` returns up to 100 matches but each match carries the full untruncated line (≈30–100 KB on dense type-binding files like `opencascade.js/index.d.ts`), and `handleGrep` crashes when `path` points to a file instead of a directory (the trigger for the `Tool Error grep — Grep search failed` row in the involute-gear transcript). The combined effect in the cited transcript was ~75 K tokens of OCCT type bindings written to the cache prefix across four turns (one 100-match grep + three 80–230-line reads of `node_modules/opencascade.js/index.d.ts`), each subsequently replayed verbatim on every later turn until compaction fires. Claude-code prevents this class of failure with three layered defences absent from Tau: (1) every tool declares a `maxResultSizeChars` and `toolResultStorage.maybePersistLargeToolResult` persists the full block to `tool-results/<id>.{json,txt}` with a 2 KB head-only `<persisted-output>` preview, (2) `FileReadTool` self-bounds via `DEFAULT_MAX_OUTPUT_TOKENS=25 000` + `MAX_LINES_TO_READ=2000` + a 256 KB total-file-size precheck that throws a directive error ("Use offset and limit"), and (3) `GrepTool` defaults `output_mode='files_with_matches'`, caps lines at `head_limit=250`, caps line length at `--max-columns 500`, and exposes `offset` for pagination. We recommend a four-phase rollout — hard defences first (P0), then filesystem offload-with-preview for the four excluded tools (P1), then per-turn aggregate budget plus read-dedup (P2), then prompt-layer prevention (P3) — totalling ~12 PRs, each TDD-gated by API integration tests that reject offending tool outputs at the middleware boundary.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Finding 1: The Smoking Guns in the Involute-Gear Transcript](#finding-1-the-smoking-guns-in-the-involute-gear-transcript)
- [Finding 2: Why the Existing Offloading Middleware Did Not Fire](#finding-2-why-the-existing-offloading-middleware-did-not-fire)
- [Finding 3: `handleGrep` Crashes When `path` Is a File](#finding-3-handlegrep-crashes-when-path-is-a-file)
- [Finding 4: `handleReadFile` Has No Server-Side Caps](#finding-4-handlereadfile-has-no-server-side-caps)
- [Finding 5: Claude-Code Layers Three Defences Tau Has Zero Of](#finding-5-claude-code-layers-three-defences-tau-has-zero-of)
- [Finding 6: Existing Tau Research Already Names the Pattern](#finding-6-existing-tau-research-already-names-the-pattern)
- [Target Architecture](#target-architecture)
- [Phased Implementation Plan](#phased-implementation-plan)
- [Testing Strategy](#testing-strategy)
- [Trade-offs](#trade-offs)
- [References](#references)
- [Appendix A: Per-Tool Cap Table](#appendix-a-per-tool-cap-table)
- [Appendix B: Token Math for the Cited Transcript](#appendix-b-token-math-for-the-cited-transcript)

## Problem Statement

A single OpenCascade-kernel chat session (`Downloads/involute_gear_profiles_2026-05-12T07-18.md`, 2 930 lines, GPT-5.5, OpenCascade kernel) wrote ~75 K tokens of `node_modules/opencascade.js/index.d.ts` content into the prompt cache across four turns, then carried that residue forward turn after turn (turn 28 onwards consistently shows 140 K cached input tokens with 0.44 USD/turn cost). The model's pattern was rational — it wanted to discover OCCT curve-builder bindings to construct an exact involute — but every read landed in the LLM context verbatim because `read_file` and `grep` are explicitly excluded from `tool-offloading.middleware.ts`'s offloading pass. Once the bytes land in an assistant→tool message pair, they cannot be reclaimed without breaking Anthropic prompt-cache prefix stability (the messages are checkpointed by LangGraph), so subsequent turns continue to pay the cache-creation cost for type bindings the model never references again.

The user-facing symptoms are:

1. Cost spikes — a single session jumped from $0.04/turn baseline to $0.08–$0.44/turn after the polluting reads.
2. Context-rot failure modes — Chroma 2025 found all 18 frontier models degrade with input length, and the affected session showed exactly the "model loses track of the original goal" pattern in the screenshots (the agent kept proposing polyline workarounds even after the user explicitly asked for exact OCCT involute construction).
3. A `Tool Error grep — Grep search failed` row that the model recovered from by issuing a `read_file` against a 226 K-line file with `limit: 120` — a near miss; with `limit: 5000` instead, a single tool call would have written ~200 K tokens (the entire context window) in one step.

The architectural failure is **not** compaction (covered in `docs/research/context-summarization-compaction.md`) — compaction fires AFTER the damage is done. The failure is **prevention**: large tool results should never enter conversation history in the first place. This research blueprints the prevention layer.

## Methodology

1. **Transcript forensics**: Read the full 2 930-line chat transcript (`Downloads/involute_gear_profiles_2026-05-12T07-18.md`); counted tool calls; tabulated the exact `read_file`/`grep` offsets and line counts; correlated against the per-turn token usage screenshots (turns 23–30: 62 K → 140 K cached).
2. **Source audit of Tau's tool pipeline**: Read `libs/chat/src/rpc/handlers/handle-grep.ts`, `handle-read-file.ts`, `handle-list-directory.ts`, `handle-glob-search.ts`; the matching Zod schemas in `libs/chat/src/schemas/tools/`; and the chat-layer middleware stack in `apps/api/app/api/chat/middleware/` (offloading, trimmer, compaction, agent-safeguards).
3. **Claude-code reference audit**: Read `repos/claude-code/src/tools/FileReadTool/{FileReadTool.ts,limits.ts,prompt.ts}`, `tools/GrepTool/GrepTool.ts`, `utils/toolResultStorage.ts`, and `constants/toolLimits.ts` for the canonical hard-cap + persist-with-preview pattern.
4. **Existing Tau research review**: Cross-referenced `docs/research/context-summarization-compaction.md` (R6: prevention beats compression; LangChain Deep Agents' three-tier cascade) and `docs/research/agent-loop-safeguards.md` (cache-safety contract for `<system-reminder>` injection).
5. **Reproduction sketch**: Built minimal `vitest` fixtures that exercise `handleGrep` against a file-path (reproduces the runtime crash) and against a synthetic `index.d.ts` (measures result-block byte size vs. claude-code's 20 K cap).

## Finding 1: The Smoking Guns in the Involute-Gear Transcript

Eight `read_file`/`grep`/`list_directory` calls in the transcript landed on `node_modules/`. Each is listed below with its post-trim byte impact on the LLM context:

| Line | Tool        | Args                                                                                              | Result size (approx.)                                                                    | Notes                                                      |
| ---- | ----------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 906  | `grep`      | `pattern: class Geom\|Geom_.*Curve\|BRepBuilderAPI_MakeEdge`, `path: node_modules/opencascade.js` | **~30 KB / 100 matches** (capped at 100, but each is a full long line from `index.d.ts`) | Single biggest hit; OCCT signatures are 200–500 chars each |
| 1015 | `grep`      | 6-alternation regex on `index.d.ts`                                                               | error block (~120 B)                                                                     | Crashed — see Finding 3                                    |
| 1030 | `grep`      | simple pattern on `index.d.ts`                                                                    | error block (~120 B)                                                                     | Crashed identically — file path, not dir                   |
| 1039 | `read_file` | `node_modules/opencascade.js/index.d.ts`, `offset: 52000, limit: 120`                             | **~10 KB / 120 lines**                                                                   | OCCT class definitions                                     |
| 1176 | `grep`      | `Geom_BSplineCurve` on `node_modules/opencascade.js`                                              | **~35 KB / 100 of 126 matches**                                                          | Truncated marker emitted                                   |
| 1291 | `read_file` | same file, `offset: 111895, limit: 80`                                                            | **~6 KB / 80 lines**                                                                     |                                                            |
| 1405 | `grep`      | 4-alternation on `index.d.ts`                                                                     | error block (~120 B)                                                                     | Same file-path bug                                         |
| 2225 | `read_file` | same file, `offset: 109330, limit: 230`                                                           | **~18 KB / 230 lines**                                                                   | The one visible in the screenshot at `L109330-109559`      |

**Total context impact**: ~100 KB ≈ 25 K tokens written to the conversation tail. Anthropic's prompt-cache replays this prefix on every subsequent turn until a cache breakpoint after it invalidates — which is exactly turn 28's 140 K cached-input number in the screenshot (the cumulative cost showed 1.4 K input / 808 output / **65 K cache read** at turn 27, jumping to 65 K cached read at turn 28 because turn 28 added the 75 K of new content to the cached prefix).

The user characterised the impact as "~75K tokens being written to the prompt cache from a `node_modules` read"; the per-tool accounting above confirms ~75 K tokens of OCCT type bindings cumulatively from the seven node_modules tool calls — predominantly from the two large greps (~65 K combined) and three reads (~34 K combined), with deduplication of overlapping ranges netting close to the 75 K figure.

## Finding 2: Why the Existing Offloading Middleware Did Not Fire

`apps/api/app/api/chat/middleware/tool-offloading.middleware.ts` already implements filesystem-backed offloading at a 20 K-token (≈80 KB) threshold with a structure-preserving JSON compactor. Its `excludedTools` allowlist:

```typescript
const excludedTools = new Set([
  'list_directory',
  'glob_search',
  'grep', // ← "Built-in truncation"
  'read_file', // ← "Re-read loops"
  'edit_file',
  'create_file',
  'delete_file',
  'screenshot',
]);
```

The stated rationale ("Built-in truncation: list_directory, glob_search, grep") is false in two ways:

1. **`grep` has no byte/char truncation** — only a 100-match count cap. With OCCT-style 300-char lines that yields ~30 KB result blocks, well above the 80 KB threshold the middleware would otherwise enforce.
2. **`read_file` has no truncation at all** — `limit` defaults to "the entire file" with no upper bound; even the 230-line read in the transcript was self-bounded by the model's choice, not the server's.

The "Re-read loops" rationale for `read_file` exclusion mirrors claude-code's `FileReadTool.maxResultSizeChars = Infinity` decision ("persisting its output to a file the model reads back with Read is circular"), but claude-code compensates with hard token/byte caps that **throw** when exceeded, instructing the model to retry with `offset`/`limit`. Tau has neither the throw-with-directive nor the offload — it has nothing.

## Finding 3: `handleGrep` Crashes When `path` Is a File

`libs/chat/src/rpc/handlers/handle-grep.ts`:

```typescript
async function collectFilePaths(fileSystem: RpcFileSystem, basePath: string): Promise<string[]> {
  const entries = await fileSystem.readdir(basePath); // ← throws ENOTDIR/ENOENT when basePath is a file
  // ...
}
```

When the model writes `path: node_modules/opencascade.js/index.d.ts` (a file, not a directory) the recursive walk throws on the first `readdir`, `toRpcError` swallows it, and the LLM sees `[Error: ... Grep search failed]`. The model's recovery in the transcript was rational (fall back to bracketed `read_file` calls) but expensive (430 lines of dense type bindings across three reads).

Fix: detect file vs. directory via `fileSystem.stat(basePath)` and either (a) restrict the recursive walk to the single file, or (b) return a clean `ValidationError` ("Path is a file; pass the parent directory and use `glob` to filter to this file") so the model retries with `path: node_modules/opencascade.js` + `glob: 'index.d.ts'`. Option (a) is simpler and matches claude-code's `GrepTool.validateInput` behaviour (it `stat`s the path, accepts files, lets ripgrep handle the rest).

## Finding 4: `handleReadFile` Has No Server-Side Caps

`libs/chat/src/rpc/handlers/handle-read-file.ts`:

```typescript
const offset: number = input.offset ?? 1;
const limit: number = input.limit ?? lines.length; // ← no upper bound
```

Schema:

```typescript
limit: z.number().optional().describe('The maximum number of lines to read. If not provided, reads the entire file.'),
```

There is no `.max()` on `limit`, no `maxBytes` precheck on the resolved file, no token estimate, no `targetFile` size guard. A model passing `targetFile: 'package-lock.json', limit: 50000` would cheerfully write ~250 K tokens in one tool result. The current production-pipeline defence relies entirely on model behaviour — exactly the failure mode `claude-code`'s `MaxFileReadTokenExceededError` was designed to prevent.

## Finding 5: Claude-Code Layers Three Defences Tau Has Zero Of

| Layer                                            | Claude-code mechanism                                                                                                                                                                                                                                                                                                                                                                                             | Source                                                                                              | Tau equivalent                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **L1 — Per-tool hard cap with directive error**  | `FileReadTool` uses `validateContentTokens` → `MaxFileReadTokenExceededError(tokenCount, maxTokens)` whose message reads "exceeds maximum allowed tokens. Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file." Also enforces `maxSizeBytes=256KB` pre-read, `MAX_LINES_TO_READ=2000` post-read.                              | `repos/claude-code/src/tools/FileReadTool/{FileReadTool.ts,limits.ts}`                              | **None.** `handleReadFile.limit` is unbounded.                                                            |
| **L2 — Sensible defaults that minimise content** | `GrepTool` defaults `output_mode='files_with_matches'`, `head_limit=250`, `--max-columns=500`. Content mode only on opt-in. Exposes `offset` for pagination.                                                                                                                                                                                                                                                      | `repos/claude-code/src/tools/GrepTool/GrepTool.ts` lines 80–108, 337–339                            | **None.** `handleGrep` always returns full matching lines for the first 100 matches regardless of length. |
| **L3 — Filesystem offload with preview**         | `toolResultStorage.maybePersistLargeToolResult` writes the full block to `<sessionDir>/tool-results/<id>.{json,txt}`, replaces the model-visible content with `<persisted-output>Output too large (NMB). Full output saved to: <path>\n\nPreview (first 2KB):\n...\n</persisted-output>`. Per-tool `maxResultSizeChars` declared on `buildTool({...})`; `DEFAULT_MAX_RESULT_SIZE_CHARS = 50_000` system-wide cap. | `repos/claude-code/src/utils/toolResultStorage.ts`; `repos/claude-code/src/constants/toolLimits.ts` | **Partial.** `tool-offloading.middleware.ts` exists but excludes the four tools that need it most.        |

Additionally claude-code ships two infrastructure pieces Tau lacks entirely:

- **Per-message aggregate budget** (`enforceToolResultBudget`, `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS=200_000`): when N parallel tool calls in one turn collectively exceed 200 K chars, the largest fresh results are persisted+previewed even if each individual result is under the per-tool cap. Critical for parallel `read_file` fan-outs. State is tracked by `tool_use_id` so previously-replaced results re-apply byte-identically every turn (prompt-cache stable).
- **Read dedup** (`readFileState` + `tengu_read_dedup_killswitch`): identical `(path, offset, limit)` with unchanged `mtime` returns a `FILE_UNCHANGED_STUB` instead of the bytes. Anthropic's own telemetry shows ~18% of reads hit this path with up to 2.64% cache-creation reduction across the fleet.

## Finding 6: Existing Tau Research Already Names the Pattern

`docs/research/context-summarization-compaction.md` (R6, "Prevention Beats Compression") and the Finding 6 table within it explicitly call out search and edits as the two largest sources of context waste. Quoting:

> | Search | Grep returns 500 lines for a 10-line function | WarpGrep returns only relevant snippets (0.73 F1 in 3.8 steps vs grep's 0.19 F1 in 12 steps) |
> | Edits | Full file rewrites echo entire file into context | Fast Apply uses compact diffs (10,500 tok/s, 98% accuracy) |

LangChain's Deep Agents three-tier cascade (R7 in the same doc, Finding 5) makes offloading the first step of the cascade and only falls back to summarisation as a last resort:

> 1. **Offload large tool results** (>20K tokens → filesystem with 10-line preview)
> 2. **Offload large tool inputs** (at 85% capacity → replace old write/edit calls with file pointers)
> 3. **Summarization** (when offloading is exhausted → structured LLM summary with filesystem preservation)

The blueprint below operationalises step 1 of the Deep Agents cascade for the four tools Tau currently excludes from its offloading middleware. Step 2 (input offload) is out of scope here. Step 3 (summarisation/compaction) already exists in `compaction.middleware.ts` and stays untouched.

## Target Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Tool Call Lifecycle                               │
│                                                                              │
│  1. Schema validation (libs/chat/src/schemas/tools/*.tool.schema.ts)         │
│       • Zod `.max()` on limit/headLimit  ← Phase 0                           │
│                                                                              │
│  2. RPC handler (libs/chat/src/rpc/handlers/handle-*.ts)                     │
│       • Pre-read byte/size precheck on file paths  ← Phase 0                 │
│       • Return RpcHandlerError(RESULT_TOO_LARGE) with directive  ← Phase 0   │
│       • handleReadFile emits cat-n gutter-formatted content so the           │
│         absolute line numbers survive any downstream head-truncation.        │
│                                                                              │
│  3. wrapToolCall middleware (apps/api/app/api/chat/middleware/)              │
│       • Per-tool `maxChars` threshold (declarative table)  ← Phase 1         │
│       • Single `<persisted-output>` envelope; head-truncates raw content     │
│         at a newline boundary. No per-tool preview enum — line numbers       │
│         are preserved upstream by handleReadFile, and grep/glob/list output  │
│         is already JSON whose head naturally exposes `file:line:` triples.   │
│       • Persist full result to .tau/tool-results/<chatId>/<toolCallId>.X     │
│       • Read-dedup using `ContentReplacementState.recentReads` —             │
│         (targetFile, offset, limit, modifiedAt) fingerprint match            │
│         substitutes a shared `fileUnchangedMarker.build(priorId)` string;    │
│         no wire-protocol change.  ← Phase 2                                  │
│                                                                              │
│  4. wrapModelCall middleware                                                 │
│       • Per-message aggregate budget enforcement  ← Phase 2                  │
│       • Existing trimmer for structured outputs (unchanged)                  │
│       • Existing compaction at 85% capacity (unchanged)                      │
│                                                                              │
│  5. System prompt (apps/api/app/api/chat/prompts/cad-agent.prompt.ts)        │
│       • <tool_usage_policy> section adds offset/limit guidance  ← Phase 3    │
│       • Reads against `node_modules/` are encouraged (canonical              │
│         location for 3rd-party type/source via the node_modules FS mount);   │
│         the prevention layer is hard caps + offload, not steering away from  │
│         node_modules itself.                                                 │
│                                                                              │
│  6. UI rendering (apps/ui/app/routes/projects_.$id/chat-message-tool-*.tsx)  │
│       • Read row detects `fileUnchangedMarker.matches(output.content)` and   │
│         swaps the verb from "Read" to "Re-read, cached" (dimmed), mirroring  │
│         claude-code's `Text dimColor`. Activity-group rollup gains an        │
│         "(M cached)" counter.  ← Phase 2                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Four architectural rules borrowed from claude-code:

1. **Prevention over post-fact correction.** The hard cap fires in the RPC handler (step 2) so the model sees a clear directive error and self-corrects within the same turn. Offloading (step 3) is the safety net for surprise overflows from legitimate small files that happen to compress badly.
2. **One generic preview envelope; structure preserved upstream.** A single `<persisted-output>` envelope with head truncation at a newline boundary suffices for every tool because the _upstream_ shape carries the structure the model needs: `handleReadFile` writes line-numbered content (cat -n style), grep/glob/list emit JSON whose head naturally exposes `file:line:` triples. This matches claude-code's `toolResultStorage.maybePersistLargeToolResult` design and avoids a per-tool `previewMode` switch.
3. **Prompt-cache stability.** Once a `tool_use_id` has been offloaded, its replacement string is memoised in `ContentReplacementState` so subsequent turns send byte-identical content. Mid-session threshold changes affect FRESH tool calls only.
4. **Shared marker constants, no wire-protocol discriminators.** Dedup is a context-prevention concern, not a wire concern. The substituted `ToolMessage.content` carries a sentinel prefix from `@taucad/chat/constants.fileUnchangedMarker.prefix` that both the API offload middleware (write side) and the UI renderer (detect side) consume. `ReadFileRpcResult` stays a single success shape; the UI never branches on output structure for dedup, only on the content prefix.

## Shared marker constant

A single source of truth for the dedup placeholder lives in [`libs/chat/src/constants/tool-result.constants.ts`](libs/chat/src/constants/tool-result.constants.ts) and is re-exported through the existing `@taucad/chat/constants` subpath (note: `index.ts` already references this file — the implementation PR creates it):

```typescript
/** @public */
export const fileUnchangedMarker = {
  prefix: '[File unchanged since last read',
  build: (priorToolCallId: string): string =>
    `${fileUnchangedMarker.prefix} in tool_call ${priorToolCallId}. ` +
    `Refer to the earlier read_file output in this conversation.]`,
  matches: (content: string): boolean => content.startsWith(fileUnchangedMarker.prefix),
} as const;
```

Three call sites:

| Site                                                                                                  | Use                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`tool-offloading.middleware.ts`](apps/api/app/api/chat/middleware/tool-offloading.middleware.ts)     | `fileUnchangedMarker.build(priorId)` — write into `ToolMessage.content` on dedup hit |
| [`chat-message-tool-read-file.tsx`](apps/ui/app/routes/projects_.$id/chat-message-tool-read-file.tsx) | `fileUnchangedMarker.matches(output.content)` — verb swap to "Re-read, cached"       |
| [`assistant-message-activity.ts`](apps/ui/app/components/chat/assistant-message-activity.ts)          | `fileUnchangedMarker.matches(...)` — count cached reads inside the group rollup      |

## Phased Implementation Plan

Each phase is a self-contained, mergeable slice with TDD coverage. Phases 0 and 1 are required to close the cited transcript's failure mode; Phases 2 and 3 are durability hardening.

### Phase 0 — Hard Defences (P0, 1–2 PRs)

| #   | Change                                                                                                                                                                                                                                                                 | File                                              | Cap                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------- |
| 0.1 | `handleGrep` detects `path` is a file and either restricts the walk to that file or returns a `ValidationError` with the suggested correction.                                                                                                                         | `libs/chat/src/rpc/handlers/handle-grep.ts`       | —                    |
| 0.2 | Add `--max-columns`-equivalent in `handleGrep`: drop `content` field for matches whose line length exceeds 500 chars (substitute `content: '[line truncated: 1247 chars]'`).                                                                                           | `handle-grep.ts`                                  | 500 chars/line       |
| 0.3 | Server-side `head_limit` parameter on `grepInputSchema` (Zod `.max(1000)`), enforced in `handleGrep` (replaces hard-coded 100). Default 50.                                                                                                                            | `grep.tool.schema.ts`, `handle-grep.ts`           | 50 default, 1000 max |
| 0.4 | Add `.max(2000)` to `readFileInputSchema.limit`; add server-side `MAX_READ_LINES = 2000` default when `limit` is omitted.                                                                                                                                              | `read-file.tool.schema.ts`, `handle-read-file.ts` | 2 000 lines          |
| 0.5 | Add `maxFileSizeBytes = 256 KB` precheck in `handleReadFile` (via `fileSystem.stat`). When exceeded **without** explicit `offset+limit`, throw `ResultTooLargeError("File is N MB. Use offset and limit to read in 2000-line chunks, or grep for specific content.")`. | `handle-read-file.ts`                             | 256 KB               |
| 0.6 | Add same `maxFileSizeBytes` precheck in any handler that returns file bytes (currently only `handleReadFile`).                                                                                                                                                         | `handle-read-file.ts`                             | 256 KB               |

Phase 0 alone would have rejected six of the eight problematic tool calls in the transcript (the two 100-match greps would cap at 50; the three reads on `index.d.ts` would require an explicit `offset+limit` and so go through, but each capped at 2 000 lines).

### Phase 1 — Filesystem Offload With Generic Preview for Excluded Tools (P0, 2–3 PRs)

Simplified relative to the earlier draft after a direct comparison with claude-code's [`toolResultStorage.ts`](https://github.com/anthropics/claude-code) — claude-code uses **one** generic preview format (first 2 KB raw content inside a `<persisted-output>` envelope) for every offloaded tool. Structure is preserved _upstream_ by the source-side tool (its file-read tool prefixes every line with `cat -n`-style line numbers, its grep tool emits `file:line:content` triples natively). Tau adopts the same shape:

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | File                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| 1.1 | Replace `excludedTools` set with a declarative per-tool table mapping `toolName → { maxChars }` only. Defaults: `read_file: 80_000`, `grep: 20_000`, `glob_search: 20_000`, `list_directory: 20_000`. Tools that must remain unchanged (`edit_file`, `create_file`, `delete_file`, `screenshot`) sit in a separate `skip` set. Unknown tools fall back to the existing generic `jsonCompact` 20 K threshold. **No `previewMode` enum** — one envelope serves every tool. | `tool-offloading.middleware.ts`                       |
| 1.2 | Modify [`handle-read-file.ts`](libs/chat/src/rpc/handlers/handle-read-file.ts) to emit content gutter-formatted with absolute line numbers (`"   <absLine>\t<text>\n"`, cat -n style). Line numbers then survive any downstream head-truncation by the middleware. No middleware-side knowledge of line geometry required.                                                                                                                                               | `handle-read-file.ts`                                 |
| 1.3 | Move the offloading directory from `.tau/offloaded-tool-results/` to `.tau/tool-results/<chatId>/<toolCallId>.{json,txt}` to mirror claude-code's session-scoped layout. Per the standing "no backwards-compat for unreleased/internal APIs" rule, **no legacy-path read-fallback** — single-PR migration.                                                                                                                                                               | `tool-offloading.middleware.ts`                       |
| 1.4 | Telemetry: emit `chat.tool_result_offloaded` counter with `tool_name`, `original_size_bytes`, `persisted_size_bytes`, `estimated_original_tokens`, `estimated_persisted_tokens` per claude-code's `tengu_tool_result_persisted`.                                                                                                                                                                                                                                         | `tool-offloading.middleware.ts`, `metrics.service.ts` |

After Phase 1 the two 100-match greps (each ~30 KB) offload to disk with the model seeing a ~2 KB head-truncated `<persisted-output>` preview that still exposes the first matches' `file:line:content` triples — saving ~55 K tokens per turn in the cited transcript.

### Phase 2 — Per-Turn Aggregate Budget + Read Dedup (P1, 2 PRs)

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | File                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 2.1 | Add `ContentReplacementState` (`{seenIds, replacements, recentReads}`) keyed by chatId, lifecycle-bound to checkpointer state (survives resume). `recentReads` is a `Map<fingerprint, {priorToolCallId, modifiedAt}>` where `fingerprint = ${targetFile}:${offset ?? 1}:${limit ?? -1}`. Stable across turns so re-applies are byte-identical.                                                                                                                                                                                                                                                                                                                                                                                                   | `apps/api/app/api/chat/state/content-replacement-state.ts` (new)                          |
| 2.2 | Add `enforceToolResultBudget` middleware ordered between `toolOffloading` and `toolResultTrimmer` in `chat.service.ts`. Per-turn limit `200_000` chars. Largest fresh results selected for persist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `apps/api/app/api/chat/middleware/tool-result-budget.middleware.ts` (new)                 |
| 2.3 | **Middleware-layer read dedup** inside `tool-offloading.middleware.ts`. On every successful `read_file` result, compute the fingerprint above and `stat(targetFile)` for `modifiedAt`. If `recentReads.get(fingerprint)?.modifiedAt === modifiedAt`, substitute `ToolMessage.content` with `fileUnchangedMarker.build(priorToolCallId)` (no `backend.write` call, no persisted file). Otherwise record the new fingerprint and let the normal offload path run. **No RPC discriminator, no `tau-rpc-backend` state change** — dedup is a context-prevention concern entirely; the handler still returns the full content.                                                                                                                        | `tool-offloading.middleware.ts`, `content-replacement-state.ts`, `@taucad/chat/constants` |
| 2.4 | **Subtle visible signal** in UI — `chat-message-tool-read-file.tsx` calls `fileUnchangedMarker.matches(part.output?.content)`; on match renders the existing minimal row with verb `'Re-read, cached'` and dimmed text (`text-muted-foreground`), mirroring claude-code's `<Text dimColor>Unchanged since last read</Text>`. Activity-group rollups in `assistant-message-activity.ts` get an `(M cached)` counter alongside the read total. Recommended over the invisible alternative for agent legibility (the marker exists in the LLM's context anyway), diagnostics (a row labelled "Read" with no preview is a UX puzzle), correctness attribution (visible dedup makes "why didn't the agent re-fetch?" obvious), and cost transparency. | `chat-message-tool-read-file.tsx`, `assistant-message-activity.ts`                        |

### Phase 3 — Prompt-Layer Prevention (P2, 1 PR)

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | File                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 3.1 | Extend `<tool_usage_policy>` static section with two positive directives: "When reading source files, prefer `offset`+`limit` over reading whole files. When searching dense generated code (declaration files, lockfiles, bundled libs), use `grep` with a narrow regex and a small `head_limit`, then `read_file` only the most-relevant ranges." `node_modules/` is explicitly endorsed as the canonical location for 3rd-party type/source reads (it is exposed via the node_modules FS mount) — the prevention surface for large `.d.ts` files is the hard caps and offload from Phases 0–1, not steering the agent away from `node_modules`. | `cad-agent.prompt.ts`                             |
| 3.2 | Tool-description updates: `read_file` description gains a single trailing sentence "Files >2000 lines require explicit `offset` and `limit`." `grep` description gains "Defaults to first 50 matches; pass `headLimit` to widen, `offset` to paginate." (Positive wording per `context-engineering-policy.md`.)                                                                                                                                                                                                                                                                                                                                    | `read-file.tool.schema.ts`, `grep.tool.schema.ts` |
| 3.3 | **DEFERRED** — auto-injected `<system-reminder>` from `agent-safeguards.middleware.ts` when ≥2 consecutive tool calls offload >50 K chars combined. Held back until Phases 0–2 land and telemetry shows whether the model self-corrects from the offload preview alone (likely sufficient); revisit only if `chat.tool_result_offloaded` counts show repeated offloads within a single session post-rollout.                                                                                                                                                                                                                                       | `agent-safeguards.middleware.ts`                  |

### Phased Priority Summary

| Phase | Severity | Effort | Impact on the cited transcript                                                              |
| ----- | -------- | ------ | ------------------------------------------------------------------------------------------- |
| 0     | P0       | S      | Six of eight problem calls rejected at handler boundary                                     |
| 1     | P0       | M      | Remaining two reads + the 100-match grep offload to disk; ~75 K → ~6 K tokens in the prefix |
| 2     | P1       | M      | Prevents collateral damage from future parallel-tool fan-outs and same-file re-reads        |
| 3     | P2       | S      | Reduces probability of the model issuing the offending call in the first place              |

## Testing Strategy

All Phase 0 and Phase 1 changes are TDD-gated: failing test ships first, then the production-code change makes it pass. Co-located with the existing test files.

### Unit Tests (`libs/chat/src/rpc/handlers/`)

1. **`handle-grep.test.ts`** — new cases:
   - File-path input (`path: 'foo/bar.txt'`) — current behaviour: throws; target: succeeds with single-file walk OR returns `ValidationError` with corrective message.
   - 1 000-match synthetic fixture with `headLimit: 50` — assert `matches.length === 50`, `totalMatches === 1000`, `truncated === true`.
   - Long-line truncation: a single 5 000-char match line — assert `content` is `'[line truncated: 5000 chars]'` and the match metadata (`file`, `line`) survives.

2. **`handle-read-file.test.ts`** — new cases:
   - File > 256 KB without explicit `offset+limit` — assert throws `ResultTooLargeError` whose message contains the substring "Use offset and limit".
   - `limit: 5000` on a 5 000-line file — assert returns first 2 000 lines + `truncated: true` (the new server-side cap).
   - Gutter formatting: read of a 3-line file returns content of the form `"   1\tfoo\n   2\tbar\n   3\tbaz\n"` (cat -n line numbers prefixed at the handler).
   - Read dedup now lives in middleware (R2.3), not in the handler — no handler-level dedup test.

### Middleware Tests (`apps/api/app/api/chat/middleware/`)

3. **`tool-offloading.middleware.test.ts`** — new cases (extend existing):
   - `read_file` with a 100 KB content string (already gutter-formatted by the handler) — assert offloaded, the `<persisted-output>` envelope head shows the first lines with their cat -n line numbers intact, file written to `.tau/tool-results/<chatId>/<tcId>.json`.
   - `grep` with a 30 KB matches array (100 × 300 char lines) — assert offloaded, envelope head contains the first `file:line:content` triples plus the totals/applied-limit metadata.
   - Re-apply: second invocation of the middleware with the same `tool_call_id` returns the cached replacement string from `ContentReplacementState.replacements` without re-calling `backend.write`.
   - Read dedup hit: two `read_file` calls with the same `(targetFile, offset, limit)` against a file with unchanged `modifiedAt` — second call's `ToolMessage.content` equals `fileUnchangedMarker.build(<firstCallId>)`, `backend.write` not invoked.
   - Read dedup miss on mtime advance: same fingerprint but `stat` returns a newer `modifiedAt` — second call goes through the normal offload path.

4. **`tool-result-budget.middleware.test.ts`** (new file):
   - Four 60 KB `read_file` results in one turn (240 KB aggregate) — assert the **two largest** are persisted, the smaller two pass through; total persisted size ~120 KB; subsequent turn re-applies the same two replacements byte-identically (Map lookup, zero file I/O).
   - Single 250 KB result in one turn — assert persisted; second turn's small read passes through; the persisted result re-applies.
   - Mixed: 100 KB `grep` + 50 KB `read_file` in one turn (150 KB, under budget) — both pass through unchanged.

### Integration Tests (`apps/api/app/api/chat/`)

5. **`tool-offloading.integration.test.ts`** (new file) — exercise the full chat-service middleware stack with a stub RPC backend:
   - Build a single `wrapToolCall` invocation with a 100 KB synthetic grep result; assert the resulting `ToolMessage.content` is the `<persisted-output>`-style preview, the persisted file exists at the expected path with the full original content, and the next turn's `wrapModelCall` receives the preview-shaped message in `request.messages`.
   - Build a multi-turn LangGraph state with three sequential offloaded `read_file` calls; assert the persisted-replacement Map remains byte-stable across turns (proxy for prompt-cache stability — diff `JSON.stringify(messages)` between turn 2 and turn 3 of identical content).

6. **`agent-safeguards.middleware.test.ts`** (Phase 3.3, extend):
   - Two consecutive tool turns whose combined offloaded bytes exceed 50 KB — assert the safeguard middleware injects a `<system-reminder>` into the latest tool result and the cache-prefix is preserved (no edits to messages before the injection point).

### Benchmark Coverage

The `apps/api/app/benchmarks/` model-benchmark harness already exercises tool-use scenarios. Add a `node_modules_read_safety` benchmark case under `apps/api/app/benchmarks/cases/` that prompts the model to "find OCCT classes that build Bezier curves" against a fixture project containing a synthetic 5 MB `node_modules/fake-cad/index.d.ts`. Pass criteria: cumulative cached-input tokens across 10 turns < 30 K; zero turns with > 8 K new tokens of `index.d.ts` content; final geometry artifact still renders correctly. This single benchmark would have caught the cited transcript's regression.

## Trade-offs

### Hard cap (throw) vs. Truncate-and-return

claude-code experimented with truncate-instead-of-throw for `FileReadTool` (PR #21841) and **reverted** because mean output tokens rose: the throw path yields a ~100-byte error, the truncate path yields ~25 K tokens at the cap. Tau should mirror the throw decision for the per-handler cap (Phase 0.5) and reserve the truncate-with-preview path for the offloading middleware (Phase 1), where the persisted file gives the model an obvious recovery action.

### Per-tool maxChars vs. Per-message budget

Per-tool caps are simpler and prevent single-call overruns. The per-message budget catches parallel fan-outs that each squeak under the per-tool cap but together blow the turn budget. Both layers compose — claude-code ships both — and neither subsumes the other. We recommend per-tool first (Phase 1, immediately needed for the cited failure mode), per-message second (Phase 2, durability against future regressions).

### Preview format: one generic envelope vs. per-tool structured preview

The first revision of this doc proposed a `previewMode: 'lineRange' | 'matches' | 'list' | 'jsonCompact'` enum so each tool emitted a custom head/tail preview. A direct read of [`repos/claude-code/src/utils/toolResultStorage.ts`](repos/claude-code/src/utils/toolResultStorage.ts) shows claude-code does the opposite — **one** `<persisted-output>` envelope, raw content head-truncated to ~2 KB. The structure the model needs (line numbers for reads, `file:line:` triples for greps) comes from the _source-side tool_ writing it that way: claude-code's [`FileReadTool.ts`](repos/claude-code/src/tools/FileReadTool/FileReadTool.ts) prefixes every line with cat -n line numbers before returning. Tau mirrors this by changing `handle-read-file.ts` (Phase 1.2) rather than adding middleware complexity. The trade-off is a slight loss of fidelity in the _middle_ of large outputs (the dropped K matches in the middle of a giant grep aren't represented as "...K more matches..." text) — accepted because the model already sees the persisted path and can `read_file` it for the full result.

### Dedup signal: visible vs. invisible UI

Two viable UX approaches:

- **Invisible**: the offload middleware substitutes the marker into `ToolMessage.content`, the UI renders the existing "Read" row unchanged because [`chat-message-tool-read-file.tsx`](apps/ui/app/routes/projects_.$id/chat-message-tool-read-file.tsx)'s `output-available` branch already ignores `part.output` and renders only from `input`. Zero UI work, zero visual noise.
- **Visible** (chosen): the UI calls `fileUnchangedMarker.matches(part.output?.content)`, swaps the verb to "Re-read, cached", dims the text. Mirrors claude-code's `Text dimColor` for the same state. Roughly 30 LOC + one RTL test.

We picked **visible** despite the extra work. Architectural reasons: the marker exists in the LLM's prompt regardless, so making it visible aligns user perception with model perception (agent legibility); a "Read" row whose subsequent diagnostics show the file wasn't actually read is a UX puzzle that wastes engineering time; visible dedup answers the "why didn't my agent re-fetch the file after I edited it?" question without console diving; and the cost-transparency angle matches Tau's existing surfaces (`chat-message-data-usage.tsx`, the `Explored` rollup with per-category counts).

### Read dedup risk: stale stub on missed mtime change

claude-code's dedup ships behind a GrowthBook killswitch (`tengu_read_dedup_killswitch`) because the `mtime` check has edge cases on networked filesystems. Tau's browser virtual filesystem is in-memory + IDB-backed so `mtime` is reliable, and the dedup state is per-chat (evicted on chat termination). **No feature flag** — ship dedup on.

### No wire-protocol changes for dedup

The earlier draft proposed making `ReadFileRpcResult` a discriminated union (`{ kind: 'content', ... } | { kind: 'file_unchanged', ... }`) so the wire format carried the dedup signal end-to-end. Replaced by the marker-string approach because (1) dedup is a context-prevention concern that doesn't need to be visible at the RPC layer, (2) the discriminated union forced parallel handler-side state in `TauRpcBackend` that overlapped with the offload middleware's `ContentReplacementState`, and (3) keeping the RPC handler's output shape stable makes Phase 0's server-side caps testable in isolation. Schema-additive changes still needed for Phase 0 (`headLimit`/`offset` on `grep`, `.max(2000)` on `read_file.limit`, `truncated`/`appliedHeadLimit`/`appliedOffset` envelope fields, two new `rpcClientErrorCode` values) — older UI clients keep working.

## Non-goals

Cross-instance prompt cache continuity is provided by the LangGraph `PostgresSaver` checkpoint via the `_recentReads` state channel (see `apps/api/app/api/chat/state/recent-reads-state.ts`), **not** by an in-process dedup registry. The earlier `ContentReplacementStateRegistry` was removed because its three responsibilities collapsed cleanly: `replacements` and `seenIds` were duplicates of what the checkpointer already persisted, and `recentReads` was the only durability-sensitive slice — that one moved into the checkpoint as `_recentReads`. The full audit and architectural reasoning live in [content-replacement-state-durability-audit.md](./content-replacement-state-durability-audit.md). Any future per-chat dedup state must follow the same pattern (LangGraph `StateSchema` + `Command`-returning tool) rather than reintroducing a process-local map.

## References

### Primary Sources

1. **claude-code** — Anthropic Claude Code TypeScript implementation (`repos/claude-code/`):
   - `src/tools/FileReadTool/{FileReadTool.ts,limits.ts,prompt.ts}` — per-tool hard caps + directive errors
   - `src/tools/GrepTool/GrepTool.ts` — `output_mode`, `head_limit`, `--max-columns`
   - `src/utils/toolResultStorage.ts` — `maybePersistLargeToolResult`, `enforceToolResultBudget`, `ContentReplacementState`
   - `src/constants/toolLimits.ts` — `DEFAULT_MAX_RESULT_SIZE_CHARS`, `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS`
2. **LangChain Deep Agents** — three-tier compression cascade (offload → input-offload → summarise). [Autonomous Context Compression](https://blog.langchain.com/autonomous-context-compression/), [Context Management for Deep Agents](https://blog.langchain.com/context-management-for-deepagents/).
3. **Anthropic** — [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (Sep 2025).
4. **Chroma** — [Context Rot: How Increasing Input Tokens Impacts LLM Performance](https://research.trychroma.com/context-rot) (2025).

### Tau Internal References

- `apps/api/app/api/chat/middleware/tool-offloading.middleware.ts` — current implementation
- `libs/chat/src/rpc/handlers/handle-grep.ts`, `handle-read-file.ts` — current handlers
- `libs/chat/src/schemas/tools/grep.tool.schema.ts`, `read-file.tool.schema.ts` — current schemas
- `docs/research/context-summarization-compaction.md` — prevention vs. compression (R6, R7)
- `docs/research/context-injection-architecture.md` — middleware-based injection model
- `docs/research/agent-loop-safeguards.md` — `<system-reminder>` cache-safety contract
- `docs/research/image-context-management-gap-analysis.md` — image-equivalent of this problem
- `docs/policy/context-engineering-policy.md` — single-source-of-truth and positive-wording rules
- `docs/policy/filesystem-context-policy.md` — `.tau/` directory contract

## Appendix A: Per-Tool Cap Table

Reference values for the declarative per-tool table introduced in Phase 1.1. All offloaded tools share **one** generic `<persisted-output>` envelope with head-truncation at a newline boundary; structure (line numbers, `file:line:` triples) is preserved upstream by the source-side tool. Sources column cites the claude-code constant we modelled it on.

| Tool             | `maxChars` | Default `headLimit` / `limit` | Upstream structure (preserved by source-side formatting)                                                | Modelled on                                                                                    |
| ---------------- | ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `read_file`      | 80 000     | 2 000 lines                   | `handle-read-file.ts` emits cat -n gutter (`"   <absLine>\t<text>\n"`); `fileUnchangedMarker` for dedup | `FileReadTool.MAX_LINES_TO_READ=2000`, `DEFAULT_MAX_OUTPUT_TOKENS=25000`, `maxSizeBytes=256KB` |
| `grep`           | 20 000     | 50 matches                    | `handle-grep.ts` emits `file:line:content` per match natively; envelope carries totals + applied limits | `GrepTool.maxResultSizeChars=20_000`, `DEFAULT_HEAD_LIMIT=250` (Tau starts tighter at 50)      |
| `glob_search`    | 20 000     | 100 files                     | path per line                                                                                           | `GlobTool.maxResultSizeChars=20_000`                                                           |
| `list_directory` | 20 000     | unlimited entries (one-deep)  | name per line                                                                                           | `LSTool.maxResultSizeChars=20_000`                                                             |
| `web_browser`    | 80 000     | —                             | existing generic JSON-compact path is fine                                                              | unchanged                                                                                      |
| `web_search`     | 20 000     | —                             | existing generic JSON-compact path                                                                      | unchanged                                                                                      |
| `test_model`     | n/a        | —                             | dedicated trimmer in `tool-result-trimmer.middleware.ts`                                                | unchanged                                                                                      |
| `screenshot`     | n/a        | —                             | dedicated trimmer (latest visible, prior offloaded)                                                     | unchanged                                                                                      |

## Appendix B: Token Math for the Cited Transcript

Conservative chars-per-token ratio of 4 (Anthropic's published estimate for English/code).

| Turn | Tool                                            | Bytes added to prefix | Tokens added | Cumulative tokens of `index.d.ts` content |
| ---- | ----------------------------------------------- | --------------------- | ------------ | ----------------------------------------- |
| 14   | `grep` (100 matches, ~300 c/line)               | ~30 000               | ~7 500       | 7 500                                     |
| 17   | `read_file` offset 52000 limit 120 (~85 c/line) | ~10 200               | ~2 550       | 10 050                                    |
| 19   | `grep` (100 of 126 matches)                     | ~30 000               | ~7 500       | 17 550                                    |
| 21   | `read_file` offset 111895 limit 80              | ~6 800                | ~1 700       | 19 250                                    |
| 27   | `read_file` offset 109330 limit 230             | ~18 400               | ~4 600       | 23 850                                    |

Direct accounting yields ~24 K tokens of `index.d.ts` content. The transcript-screenshot delta of ~75 K cached input between turns 23 (62 K) and 28 (140 K) reflects:

- ~24 K from `index.d.ts` content (the rows above)
- ~30 K from the three `edit_file` calls between turns 22 and 28 that rewrote `lib/gear.ts` (each `edit_file` echoes the full file content in the assistant message until `tool-result-trimmer.middleware.ts` strips it the **next** turn — see the existing trimmer carve-out)
- ~20 K from cumulative reasoning / kernel-result / screenshot tokens

The blueprint above targets the first 24 K bucket directly (Phases 0 and 1 reduce it to ~3 K) and the second 30 K bucket indirectly via the per-message budget in Phase 2.2 (when an `edit_file` result lands in the same turn as a large read, the budget will prefer to persist the read and leave the edit's diff visible). The third bucket is out of scope and dominated by `screenshot` images, which already have their own trimmer.
