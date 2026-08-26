---
title: 'Context Engineering Policy'
description: 'Comprehensive guide to optimizing system prompts, tool definitions, and context pipelines for LLM agents. Covers foundational principles, placement framework, cache economics, compaction safety, subagent criteria, untrusted content, and eval discipline.'
status: active
created: '2026-03-09'
updated: '2026-07-10'
related:
  - docs/policy/filesystem-context-policy.md
  - docs/research/transcript-search-architecture.md
  - docs/research/agent-harness-overhaul-charter.md
  - docs/research/harness-system-prompt-rewrite-spec.md
  - docs/research/harness-tool-description-rewrite-spec.md
  - docs/research/harness-skills-extraction-plan.md
  - docs/research/harness-missing-capabilities.md
  - docs/research/harness-cache-hygiene-audit.md
---

# Context Engineering Policy

Internal reference for optimizing system prompts, tool definitions, and context pipelines for LLM agents, rebuilt July 2026 against the cached reference catalog (`docs/reference/_index.yaml`, group `agent-harness`).

> **Implementation**: For rules on the filesystem-backed transcript, offloading, skills, memory, and compaction pipeline, see `docs/policy/filesystem-context-policy.md`.
>
> **Size exception**: This policy intentionally exceeds the 500-line budget in `create-policy` (approved 2026-07-03, single-file decision). It is the aggregate rulebook for the agent harness; splitting was considered and declined to keep one canonical document.
>
> **Citation rule**: Every numeric claim below cites a `docs/reference/<slug>.md` file in which the number appears verbatim (grep-verifiable). Claims that failed verification during the July 2026 adversarial audit were removed; see `docs/research/agent-harness-overhaul-charter.md` for the audit trail.

## Rationale

LLMs have finite attention budgets; every token competes for focus. Poor context engineering wastes tokens, degrades recall, and increases cost. A systematic approach—right altitude, single source of truth, correct placement, cache-stable assembly, safe compaction—maximizes agent effectiveness while minimizing context size.

**Key Sources** (all cached under `docs/reference/`):

- `anthropic-2025-effective-context-engineering` — Effective Context Engineering for AI Agents (Sep 2025)
- `anthropic-2025-writing-effective-tools` — Writing Effective Tools for Agents (Sep 2025)
- `mei-2025-context-engineering-survey` — A Survey of Context Engineering for LLMs (Jul 2025)
- `chroma-2025-context-rot` — Context Rot: How Increasing Input Tokens Impacts LLM Performance (Jul 2025)
- `manus-2025-context-engineering-lessons` — Lessons from Building Manus (Jul 2025)
- `cursor-2026-dynamic-context-discovery` — Dynamic Context Discovery (Jan 2026)
- `anthropic-2025-agent-skills` + `claude-docs-2025-skill-authoring-best-practices` — Agent Skills (Oct 2025)
- Full list: `groups.agent-harness` in `docs/reference/_index.yaml` (64 references).

---

## Part 1: Foundational Principles

### The Core Thesis

Context engineering is a formal discipline that systematically optimizes information payloads for LLMs, extending far beyond prompt design to encompass the entire informational environment (`mei-2025-context-engineering-survey`).

**Goal**: Find the _smallest possible set of high-signal tokens_ that maximize desired outcomes (`anthropic-2025-effective-context-engineering`).

The survey's core caution: "While current models, augmented by advanced context engineering, demonstrate remarkable proficiency in understanding complex contexts, they exhibit pronounced limitations in generating equally sophisticated, long-form outputs." Comprehension gains do not automatically become generation gains — verify agent output quality independently of context quality.

### Why Context is Finite

LLMs have an "attention budget" constrained by transformer architecture:

- **n² pairwise relationships** for n tokens causes performance degradation at scale
- **Context rot**: model performance degrades as input length grows, non-uniformly and model-specifically, even on tasks that are trivial at short lengths (`chroma-2025-context-rot`)
- Models develop attention patterns from training where shorter sequences are more common

Every token competes for attention. Tokens that don't directly contribute to the task dilute the model's focus — including tokens sitting in a cached prefix: caching changes what they cost, not what they do to attention.

### The Context Engineering Taxonomy (Mei et al., 2025)

| Component                          | Description                                         | Examples                               |
| ---------------------------------- | --------------------------------------------------- | -------------------------------------- |
| **Context Retrieval & Generation** | Designing and assembling input payloads             | Prompt construction, RAG, tool outputs |
| **Context Processing**             | Transforming context into optimized representations | Summarization, chunking, compression   |
| **Context Management**             | Storing, persisting, and refreshing context         | Memory systems, caching, compaction    |

### Developer-Provided Context Taxonomy (Jiang & Nam, 2025)

An empirical study of 401 open-source repositories with cursor rules identified five essential context categories: **Conventions**, **Guidelines**, **Project Information**, **LLM Directives**, **Examples** ([arXiv 2512.18925](https://arxiv.org/abs/2512.18925)). Structure developer-provided context into these categories for clarity.

---

## Part 2: Core Design Principles

### 1. Right Altitude

Balance between two failure modes (`anthropic-2025-effective-context-engineering`):

| Too Low (Brittle)       | Sweet Spot                  | Too High (Vague)       |
| ----------------------- | --------------------------- | ---------------------- |
| Hardcoded if-else logic | Specific heuristics         | Generic guidance       |
| Prescriptive step lists | Clear decision criteria     | Assumes shared context |
| Breaks on edge cases    | Model applies intelligently | Inconsistent behavior  |

**Calibration test**: Would a senior engineer need this level of detail, or would they infer it?

### 2. Single Source of Truth

Never explain the same concept twice. Duplication wastes tokens and can cause inconsistency — and cross-module contradictions measurably degrade instruction-following (`instruction-bleed-2026-prompt-interference`).

| Information Type | Location             | Content                                            |
| ---------------- | -------------------- | -------------------------------------------------- |
| Tool mechanics   | Tool description     | HOW: parameters, output format, technical behavior |
| Tool workflow    | System prompt        | WHEN: decision points, sequencing, priorities      |
| Domain reference | Skill/workspace file | Matcher catalogs, API references, worked examples  |

### 3. Context Placement Framework

Decide where content lives by how it is consumed. A permanent prompt slot is earned only by content that changes behavior on essentially every request (`anthropic-2025-agent-skills`, `cursor-2026-dynamic-context-discovery`).

| Content shape                                                             | Home                                    | Loading                                |
| ------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------- |
| Every-request behavior: identity, workflow, constraints, safety           | System prompt                           | Always-on                              |
| Task-conditional procedure consulted at a decision point ("author tests") | **Skill** (`SKILL.md`)                  | Metadata always-on; body on activation |
| Lookup-shaped reference consulted repeatedly at unpredictable points      | **Workspace file** + `grep`/`read_file` | Partial reads on demand                |
| Mechanics of one tool                                                     | Tool description                        | With the toolbelt                      |

Skill tier budgets (`claude-docs-2025-skill-authoring-best-practices`, `agentskills-2025-specification`): frontmatter `name` ≤64 chars and `description` ≤1024 chars are the only always-loaded parts; keep the SKILL.md body under 500 lines and split overflow into separate reference files loaded on demand.

**Provenance caution**: 26.1% of community-contributed skills contain vulnerabilities, and skills bundling executable scripts are 2.12× more likely to be vulnerable than instruction-only skills (`agent-skills-2026-survey`). Audit third-party skills before install; prefer instruction-only skills unless a script is essential.

### 4. Examples Over Rules

Examples are "pictures worth a thousand words" (`anthropic-2025-effective-context-engineering`). Keep **exactly one canonical, diverse example in the prompt per domain**; additional worked examples belong in skills or workspace reference files per the placement framework. One comprehensive example beats three paragraphs of explanation — and five examples beat none, but not from the always-on prompt slot.

### 5. Trust Model Capability

Modern LLMs are highly capable. Avoid:

- Explaining obvious steps ("analyze the error, understand it, fix it")
- Defensive repetition ("MUST", "NEVER", "CRITICAL", "IMPORTANT")
- Over-specifying standard programming practices
- Teaching the model public knowledge (glob syntax, regex basics)

**Test**: If a competent developer wouldn't need this instruction, the model probably doesn't either.

---

## Part 3: Optimization Techniques

### Progressive Context Loading

Start with minimal context, add incrementally as needed:

1. **Initial**: Role + current task + immediate context
2. **On-demand**: Retrieve additional context when required (just-in-time over pre-loading: hold lightweight identifiers like file paths, load data via tools at runtime — `anthropic-2025-effective-context-engineering`)
3. **Escalation**: Pull in more detail only for complex cases

Divide retrievable content into meaningful segments by topic rather than arbitrary token limits so on-demand reads stay small.

### Context Compression Techniques

| Technique            | Description                             | Use Case                                                                                                    |
| -------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tool-result clearing | Remove old tool outputs, keep the calls | Long conversations — the safest, lightest-touch compaction (`anthropic-2025-effective-context-engineering`) |
| Summarization        | Condense verbose content                | Long documents                                                                                              |
| Entity extraction    | Keep named entities, discard prose      | Reference data                                                                                              |
| Schema enforcement   | Structured output format                | API responses                                                                                               |

Do not rewrite older conversation history in place by recency tier (formerly "sliding windows" in this policy): in-place rewriting invalidates the KV-cache prefix on every turn and is dominated by pruning + running summary. Measured on a long-horizon benchmark: full context 71.0% task completion, recency pruning (last 5 tool calls) 79.0%, pruning + automated summarization 91.6% at −62.7% tokens versus full context (`less-context-better-agents-2026`).

### KV-Cache Economics

Cache-hit rate is a first-class production metric: cached input tokens cost ~10× less than uncached (e.g. $0.30 vs $3.00 per MTok on Claude Sonnet — `manus-2025-context-engineering-lessons`), and cache-friendly context assembly measured 41–80% API cost reduction across models (`dont-break-the-cache-2026-prompt-caching`).

Rules (`manus-2025-context-engineering-lessons`; promoted from the Cache-Safety Contract in `docs/research/agent-loop-safeguards.md`):

1. **Stable prefix**: no timestamps, request IDs, or mutable state in the cached system-prompt prefix. One changed token invalidates the cache from that point onward.
2. **Append-only history**: middleware must append messages, never mutate or reorder prior messages within a live session. Any injected reminder rides the message channel, not the prefix.
3. **Deterministic serialization**: fix JSON key ordering and section ordering; nondeterministic assembly is silent cache-busting.
4. **Stable toolbelt**: never add/remove tool definitions mid-conversation; mask unavailable tools instead. Tool definitions serialize near the prefix, so churn there busts everything after it.
5. **Structure for breakpoints**: `[CACHED: system prompt + tools + static examples][WORKSPACE: skills catalog + memory][DYNAMIC: per-request tail]` — put the breakpoint at the end of each stable block.

```
CORRECT:  static prompt (global) | skills/memory block | dynamic tail | incremental message cache
INCORRECT: model info and chatId interpolated into the first system-prompt block
```

### On-Demand Tool Exposure

Static tool definitions consume context and degrade selection accuracy as the toolbelt grows: with large tool libraries, retrieval-augmented selection more than tripled accuracy (13.62% → 43.13%) while cutting prompt tokens by over 50% (`rag-mcp-2025-prompt-bloat`), and roughly half of end-to-end failures across a 527-tool benchmark traced to retrieval errors (`livemcpbench-2025-tool-navigation`).

**Threshold rule**: below ~15 lean tools (Tau: 14), keep the toolbelt static — discovery adds a hop and a failure mode for no measurable win. Reach for on-demand exposure when the toolbelt grows to dozens of tools or definitions consume a meaningful share of the window (`anthropic-2025-advanced-tool-use`). Mechanisms, in preference order:

1. **Provider Tool Search** — 85% token reduction; MCP-eval accuracy improved from 49% to 74% (Opus 4) and 79.5% to 88.1% (Opus 4.5) with Tool Search Tool enabled (`anthropic-2025-advanced-tool-use`).
2. **File-based descriptors** — tool metadata as workspace files the agent reads on demand; 46.9% total-token reduction measured in MCP-calling runs (`cursor-2026-dynamic-context-discovery`).
3. **Code execution over tool schemas** — present tools as a code API; 98.7% token reduction in Anthropic's MCP example (`anthropic-2025-code-execution-with-mcp`); Cloudflare's Code Mode compresses 2,500+ endpoints from 1.17M tokens to ~1,000 (99.9% — `cloudflare-2026-code-mode`).

---

## Part 4: System Prompt Guidelines

### Structure with Clear Sections

Use XML tags or Markdown headers for distinct sections:

```xml
<role_definition>One paragraph max</role_definition>
<workflow>Tool sequence and decision points</workflow>
<constraints>Hard rules and boundaries</constraints>
```

**Why**: Helps model parse and reference specific guidance; enables selective attention and per-section telemetry.

### Tool References, Not Re-explanations

**Anti-pattern** (wasteful):

```
## Filesystem Tools
- **read_file**: Read contents of any file. Supports line offset and limit for large files...
- **edit_file**: Edit existing files with precise changes. Use // ... existing code ... syntax...
```

**Better** (efficient):

```
## Workflow
1. Read existing files before editing
2. Verify with get_kernel_result after changes
```

The tool descriptions already explain HOW; the prompt only needs WHEN.

### Condense Prescriptive Lists

**Anti-pattern** (30 tokens):

```
When you receive error feedback:
1. Analyze the specific error messages carefully
2. Preserve successful geometry from previous iterations
3. Apply incremental fixes rather than rewriting
```

**Better** (15 tokens):

```
On errors: analyze root cause, fix incrementally, preserve working code.
```

### No Per-Item Boilerplate

State list-wide policy once above the list, never per entry.

CORRECT:

```
Available skills (activate with `use_skill` when the task matches):
- geospec-authoring: Author GeoSpec geometry tests...
- sheet-metal: Sheet metal design rules...
```

INCORRECT:

```
- geospec-authoring: Author GeoSpec geometry tests...
  → Activate with `use_skill({ skillName: "geospec-authoring" })` before applying
- sheet-metal: Sheet metal design rules...
  → Activate with `use_skill({ skillName: "sheet-metal" })` before applying
```

### Merge Duplicated Concepts

| Symptom                                      | Solution                                     |
| -------------------------------------------- | -------------------------------------------- |
| Same workflow in 3 sections                  | Keep in `<workflow>`, reference elsewhere    |
| Tool explained in prompt AND description     | Remove from prompt                           |
| Example repeated with variations             | Keep one canonical example                   |
| Prompt rule contradicting a tool description | Pick the single owner; delete the other copy |

### Terse Professional Language

| Verbose                                                                                            | Terse                                            |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| "This transparency ensures users understand your thought process and can provide input if needed." | Remove entirely                                  |
| "CRITICAL: You MUST always do X. Never forget X."                                                  | "Do X after Y."                                  |
| "One of your MAIN PRIORITIES is to learn from your interactions."                                  | "Save the underlying pattern before continuing." |

---

## Part 5: Tool Description Guidelines

### Optimal Structure

```typescript
description: `[One-line purpose statement]

[When to use - 2-3 bullet points max]

[Key behavior/output - only if non-obvious]`;
```

**Target**: Under 150 words per tool. Write descriptions like onboarding docs for a new hire: make implicit query formats, terminology, and resource relationships explicit; use unambiguous parameter names (`anthropic-2025-writing-effective-tools`).

### Let Schemas Self-Document

Parameter documentation belongs in Zod schemas, not description text:

```typescript
// CORRECT: Schema describes parameters
const schema = z.object({
  pattern: z.string().describe('Glob pattern (e.g., "**/*.ts")'),
  directory: z.string().optional().describe('Directory to search'),
});

// Tool description focuses on purpose/behavior
description: `Find files matching a glob pattern. Use for locating files by type or name.`;
```

### Separation of Concerns

| Tool Description    | System Prompt                  |
| ------------------- | ------------------------------ |
| What the tool does  | When to use it in workflow     |
| Parameter semantics | Sequencing with other tools    |
| Output format       | Priority and decision criteria |
| Error conditions    | Domain-specific guidance       |

### Token-Efficient Tool Results

Tool RESULTS consume context on every call — design them as carefully as descriptions (`anthropic-2025-writing-effective-tools`):

- **Expose a `response_format` enum** (concise vs detailed) where results vary in depth; Anthropic's Slack example returned 72 tokens concise vs 206 detailed for the same semantic content.
- **Cap and paginate**: restrict responses to ~25,000 tokens by default with pagination/filtering/range selection; truncation messages should steer the agent toward narrower queries.
- **Semantic identifiers over opaque IDs**: return names/paths/slugs, not UUIDs — agents reason better over natural-language identifiers.
- **Actionable errors**: no raw tracebacks or bare codes; state the fix and show a correctly formatted input example.
- **Route UI-bound payloads out of the model channel**: full file contents, diffs for display, and render artifacts belong in data parts or trimmed fields, with middleware enforcing the cap (see `tool-result-trimmer` / offloading in `docs/policy/filesystem-context-policy.md`).

### Negative Guidance Is Selective

Reserve `When NOT to use:` (or any explicit anti-guidance block) for tools where misuse is **costly** — latency, cost, destructive side-effects — AND the alternative is **non-obvious** to a frontier LLM. House ceiling: **≤ 20% of the toolbelt**; default to positive selection criteria in `<workflow>`. The observed exemplar is stricter: `claude-code` carries "When NOT to use" on 2 of its 40 tools (5%) — AgentTool and TodoWriteTool, its two highest-overuse-risk tools. Tau sits at 2 of 14 (14%): `test_model` and `use_skill`.

When you do include negative guidance, prefer **a single positive trailing redirect** over a `When NOT to use:` heading:

```typescript
// CORRECT: positive redirect for one genuine confusion zone
description: `Search file contents using regex.

For finding files by name pattern, use \`glob\`.`;

// INCORRECT: defensive over-explanation that duplicates obvious knowledge
description: `Search file contents using regex.

When NOT to use:
- NOT for finding files by name pattern — use \`glob\` instead.
- NOT for reading a file end-to-end — use \`read_file\`.`;
```

---

## Part 6: Advanced Patterns

### Plan-Aware Context Engineering (PAACE, Yuksel 2025)

For long-horizon tasks, optimize context based on the upcoming plan: next-k-task relevance modeling, plan-structure analysis, function-preserving compression of completed steps (`yuksel-2025-paace-plan-aware-context`).

### Subagent Decision Criteria

Subagents are **context-isolation devices first**, parallelism devices second: a worker may burn tens of thousands of tokens exploring but returns a condensed 1,000–2,000-token summary to the lead agent's clean window (`anthropic-2025-effective-context-engineering`).

| Question                    | Rule                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read or write?              | Read-heavy, parallelizable work (exploration, research, review, verification) fans out. Write paths stay single-threaded — parallel writes carry conflicting implicit decisions no merge step reconciles (`cognition-2026-multi-agents-whats-working`) |
| What returns?               | A condensed summary/report, never the raw exploration transcript                                                                                                                                                                                       |
| Shared context?             | Review/verification agents perform better with a clean slate than with the author's pre-shared context (`cognition-2026-multi-agents-whats-working`)                                                                                                   |
| Is fan-out actually better? | Under equal token budgets, single agents often match multi-agent quality — justify fan-out by context-isolation relief or wall-clock, not assumed quality (`single-agent-2026-token-budget-parity`)                                                    |
| Orchestration prompt        | Embed explicit effort-scaling rules in the lead agent so simple tasks don't fan out (`anthropic-2025-multi-agent-research-system`)                                                                                                                     |

### Context Compaction

Order of escalation as the window fills:

1. **Tool-result clearing first** — the safest, lightest-touch form: remove raw tool outputs deep in history, keep the calls (`anthropic-2025-effective-context-engineering`).
2. **Summarizing compaction** — tune for **recall first** (capture every architectural decision, unresolved bug, key output), then iterate on precision by cutting redundant tool outputs and stale messages.
3. **Provider-side compaction / context editing** where available — server-side clearing takes a `clear_at_least` parameter so each clear removes enough tokens to justify invalidating the cached prefix (`claude-docs-2026-context-editing`, `claude-docs-2026-server-side-compaction`). Keep a cross-provider local fallback.

**Compaction safety (mandatory)**: compaction silently erodes in-conversation governance. Measured: soft organization-specific policies decay by +50 points (0% → 50% violation) across one compaction versus +6 for hard alignment-trained norms — an 8.3× gap; verbatim pinning of the policy text eliminates the decay (50% → 0%) (`governance-decay-2026-compaction-safety`). Rules:

- Safety- and governance-relevant instructions live in the **system prompt or a pinned/memory channel**, never only in conversation history.
- The compaction pipeline must preserve pinned content (Tau: `keepContextTags`) verbatim, and a regression test must assert survival of `<safety>`-class instructions across a compaction cycle.

### Evolving Contexts (ACE Framework, Zhang 2025)

Treat context as an evolving playbook: generation → reflection → curation, preventing "context collapse" where repeated patterns degrade into noise (`zhang-2025-agentic-context-engineering`).

### Dynamic Context Discovery (Cursor, Jan 2026)

Instead of injecting all context upfront, let agents discover what they need via files and search (`cursor-2026-dynamic-context-discovery`):

| Static (old)                    | Dynamic (new)                                                |
| ------------------------------- | ------------------------------------------------------------ |
| Tool schemas in every request   | Tool descriptions as files, loaded on demand                 |
| Full terminal output in context | Terminal sessions as files, agent greps for relevant output  |
| Truncated long tool responses   | Tool output written to files, agent reads what it needs      |
| All MCP tools in prompt         | MCP tool descriptors as files, agent discovers relevant ones |
| Full chat history in context    | Chat history as files, searchable during summarization       |

**Key insight**: Files are the universal abstraction for dynamic context. Every agent already knows how to read, search, and navigate files. Convert any large or conditionally-useful context into files rather than injecting it statically. In Tau this includes kernel API references (`.tau/reference/{kernel}-api.d.ts` — see `docs/research/harness-skills-extraction-plan.md`).

### Progressive Disclosure at Scale

| Source                                              | Technique                                                             | Measured reduction |
| --------------------------------------------------- | --------------------------------------------------------------------- | ------------------ |
| `anthropic-2025-code-execution-with-mcp` (Nov 2025) | Present MCP tools as a code API; filter data in-sandbox               | 98.7%              |
| `cloudflare-2026-code-mode` (Feb 2026)              | 2,500+ endpoints behind `search()`/`execute()`: 1.17M → ~1,000 tokens | 99.9%              |
| `anthropic-2025-advanced-tool-use` (Nov 2025)       | Tool Search Tool: discover tools on demand                            | 85%                |
| `cursor-2026-dynamic-context-discovery` (Jan 2026)  | File-based MCP tool descriptors                                       | 46.9%              |

**Design principle**: Ask "what should the agent be able to _discover_?" rather than "what should I put into the prompt?"

### Model-Specific Harness Tuning

Different models need different harnesses; report capability and tune per **model-harness pair** (`harness-bench-2026-harness-effects`):

- **Edit formats differ per family** (patch-style vs string-replace) — match what the model saw in training (`cursor-2025-codex-model-harness`).
- **Reasoning-trace preservation**: removing reasoning traces between tool calls cost 30% on Codex-family models vs 3% on standard GPT-5 (`cursor-2025-codex-model-harness`). Know your model's trace dependence before trimming.
- **Instruction density tolerance varies**; some models degrade with verbose prompts, others need explicitness (`openai-2026-codex-prompting-guide`).
- **Context-window behavior varies** ("context anxiety": some models truncate their own effort as the window fills — adjust compaction thresholds per model, `cursor-2026-continually-improving-agent-harness`).
- **Test prompt changes against all supported models**, not just the primary one; maintain per-model section variants where measurement justifies them.

---

## Part 7: Anti-Patterns

### 1. Redundant Tool Documentation

- INCORRECT: Tool description + prompt section + inline mentions all explaining same tool
- CORRECT: Tool description = HOW, prompt = WHEN (reference only)

### 2. Verbose Inline Examples

- INCORRECT: Multiple code examples showing similar concepts in the always-on prompt
- CORRECT: One canonical example in-prompt; further examples in a skill or workspace reference file

### 3. Prescriptive Step Lists

- INCORRECT: "1. Analyze 2. Understand 3. Fix 4. Verify" (obvious sequence)
- CORRECT: "Fix incrementally, verify after changes"

### 4. Defensive Over-explanation

- INCORRECT: "IMPORTANT: You MUST always... NEVER forget to... CRITICAL:..."
- CORRECT: State once, trust model capability

### 5. Premature Tool Discovery

- INCORRECT: Adding retrieval/discovery machinery to a ≤15-tool belt "for scale"
- CORRECT: Static lean toolbelt until definitions reach dozens of tools or a meaningful window share; then Part 3 "On-Demand Tool Exposure"

### 6. Context Hoarding and History Rewriting

- INCORRECT: Keeping all raw tool outputs indefinitely, or rewriting older history in place by recency tier
- CORRECT: Tool-result clearing first, then recall-tuned summarizing compaction; history stays append-only within a session

### 7. Universal Negative Guidance

- INCORRECT: Adding `When NOT to use:` to every tool description "for safety"
- CORRECT: Reserve for high-overuse-risk tools (≤ 20% of the toolbelt; exemplar is 5%); use a single positive redirect for routine confusion zones

### 8. Safety Instructions Only In Conversation

- INCORRECT: Delivering governance/safety constraints mid-conversation and trusting them to survive
- CORRECT: Pin safety-class instructions in the system prompt or memory channel; compaction preserves pinned content verbatim (Part 6, compaction safety)

### 9. Unverified Numeric Citations

- INCORRECT: Quoting percentages or benchmarks from memory or secondary articles
- CORRECT: Every number cites a `docs/reference/<slug>.md` that contains it verbatim; numbers that don't grep clean don't ship

---

## Part 8: Audit Checklist

When reviewing prompts or tool descriptions:

| Question                                | If Yes                                                      |
| --------------------------------------- | ----------------------------------------------------------- |
| Is this explained elsewhere?            | Consolidate to single location                              |
| Would a senior dev need this?           | Remove if obvious                                           |
| Can this be an example instead?         | One example > paragraphs of rules                           |
| Is the altitude right?                  | Adjust brittle <-> vague balance                            |
| Are there prescriptive lists?           | Compress to sentences                                       |
| Is this defensive repetition?           | State once, remove emphasis                                 |
| Does this duplicate tool docs?          | Keep in tool description only                               |
| Does it change behavior every request?  | If not: move to skill / workspace file (Part 2 framework)   |
| Is this stable across requests?         | Move to cached portion; check prefix stability (Part 3)     |
| Could this bust the KV-cache?           | Apply the cache rules (stable prefix, append-only, masking) |
| Does every tool have negative guidance? | Most should not — ≤20% ceiling, high-overuse-risk only      |
| Are tool results token-efficient?       | Apply Part 5 result rules (format enum, caps, semantic IDs) |
| Would this survive compaction?          | Pin safety-class content; verify `keepContextTags` path     |
| Is every number citation-backed?        | Grep the cited reference; remove numbers that don't hit     |
| Does the change carry eval evidence?    | Part 11: no harness change without a benchmark run          |

---

## Part 9: Token Budget Guidelines

House budgets (calibrated July 2026 against measured Tau prompts and the reference corpus; no primary source prescribes a universal total — these are ours, enforced by telemetry):

| Component                                                               | Target                                  | Rationale                                                                          |
| ----------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| Role definition                                                         | <100 tokens                             | One paragraph establishes persona                                                  |
| Per-tool description                                                    | <150 words                              | Purpose + when + key behavior                                                      |
| Workflow section                                                        | <300 tokens                             | References tools, doesn't re-explain                                               |
| Error handling                                                          | <100 tokens                             | Trust model capability                                                             |
| **Behavioral core (all instruction sections)**                          | **≤3,000 tokens**                       | Instructions the model must follow every request                                   |
| **Domain reference in-prompt (canonical example + kernel cheat-sheet)** | **≤1,500 tokens**                       | The one example + curated API surface (Part 2 §4)                                  |
| **Total static prompt**                                                 | **≤4,500 tokens**                       | Sum of the two pools; everything else moves per the placement framework            |
| Skill metadata (always-on)                                              | name ≤64 chars, description ≤1024 chars | The only always-loaded skill content                                               |
| SKILL.md body                                                           | <500 lines                              | Split overflow into reference files                                                |
| Memory index (always-on)                                                | ≤200 lines / 25KB                       | Index + topic files; deterministic for cache hits (`claude-code-docs-2026-memory`) |

**Enforcement**: per-section budgets regress via the section-registry telemetry test (`onSectionResolved`; see `docs/research/harness-system-prompt-rewrite-spec.md` SP-11). Budget exceptions require an EVAL changelog entry with benchmark evidence (Part 11).

---

## Part 10: Untrusted Content and Injection Defense

An agent that (1) reads private/project data, (2) ingests untrusted content (web results, fetched pages, third-party files), and (3) can write files or communicate externally has all three legs of the **lethal trifecta** and is structurally exploitable (`willison-2025-lethal-trifecta`).

### Rules

1. **Mark untrusted content**: wrap web/tool-ingested third-party content in a dedicated delimiter with one standing prompt rule — content inside the delimiter is data, never instructions (spotlighting — `design-patterns-2025-prompt-injection`).
2. **Rule of Two**: within one session, do not combine more than two of {untrusted input, private-data access, external/state-changing action} without a human gate (`meta-2025-agents-rule-of-two`). Tau mapping: a turn that ingested web content requires confirmation before `delete_file`, mount writes, or artifact overwrites — enforced harness-side, not prompt-side.
3. **Context minimization**: drop untrusted raw content from context once it has served its purpose (e.g. after extraction/summarization), so later turns cannot be steered by it (`design-patterns-2025-prompt-injection`).
4. **Injection persists through compaction**: the compaction-safety regression (Part 6) doubles as the injection-persistence check — a "policy rescinded" notice ingested as a tool output must not survive as an instruction (`governance-decay-2026-compaction-safety`).

---

## Part 11: Harness Eval Discipline

Prompt and tool changes are falsifiable engineering changes, not wording preferences (`agentic-harness-engineering-2026-observability`, `cursor-2026-continually-improving-agent-harness`).

### Rules

1. **Every harness change carries eval evidence.** The `cad-agent.prompt.ts` EVAL changelog convention is policy: each change cites a benchmark case and before/after result. "Pending benchmark" entries are debt with an owner, not a norm.
2. **Report per model-harness pair.** Across 5,194 trajectories under a shared protocol, Harness-Bench observes substantial differences across model–harness configurations — a result quoted without its harness is meaningless (`harness-bench-2026-harness-effects`).
3. **Suites are small and real**: 20–50 tasks drawn from observed production failures, each manually reviewed for realism, solvability, and oracle-checkability (`anthropic-2026-demystifying-agent-evals`).
4. **Measure cost cache-aware**: token/turn and cache-hit rate together; a change that saves tokens by busting the cache is a regression (Part 3).
5. **Perturbation-test composed prompts**: format/structure perturbations reveal cross-section interference that content-only review misses (`instruction-bleed-2026-prompt-interference`).
6. **Test all supported models** before landing prompt changes (Part 6, model-specific tuning).

---

## Appendix: Research Sources

Canonical source list: `groups.agent-harness` (64 references) and `groups.agentic-cad-agents` (7 references) in `docs/reference/_index.yaml`. Each entry caches the PDF and a grep-verifiable markdown conversion; cite by slug.

Legacy citations retained without cached copies (no numeric claims rest on them): Jiang & Nam (Dec 2025, arXiv 2512.18925); Gartner Context Engineering as Strategic Priority (Oct 2025); Haseeb Multi-Agent LLM Code Assistants (Aug 2025 — superseded by Part 6 subagent criteria); Awesome-Context-Engineering repository.

Audit trail for this revision: `docs/research/agent-harness-overhaul-charter.md` (July 2026 adversarial audit; buckets A/B/C in the approved plan).
