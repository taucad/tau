---
title: 'AGENTS.md Policy'
description: 'Internal reference for maintaining AGENTS.md and the agent context hierarchy. Covers file location, context tiers, size budget, required sections, and continual learning integration.'
status: active
created: '2026-03-09'
updated: '2026-05-13'
related:
  - docs/research/cursor-context-budget-audit.md
---

# AGENTS.md Policy

Internal reference for maintaining `AGENTS.md` and the agent context hierarchy.

## Rationale

`AGENTS.md` is the universal standard for AI coding agent instructions, adopted by 60,000+ open-source projects and supported natively by Cursor, Codex, Copilot, Windsurf, Amp, and others. Using a single canonical file avoids drift between tool-specific variants (`CLAUDE.md`, `.cursorrules`).

**Sources**: [AGENTS.md specification](https://agents.md/), [Codex guide](https://developers.openai.com/codex/guides/agents-md/), [Blake Crosley patterns analysis](https://blakecrosley.com/blog/agents-md-patterns), [GitHub lessons from 2,500 repos](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/), [Cursor dynamic context discovery](https://cursor.com/blog/dynamic-context-discovery)

## File Location

- Single file: `AGENTS.md` at the repository root
- No `CLAUDE.md`, `.cursorrules`, or other tool-specific duplicates

## Context Hierarchy

The agent context system has three artifact types with different discovery mechanics and token costs:

| Artifact                   | Purpose                       | Discovery                                      | Token Cost           |
| -------------------------- | ----------------------------- | ---------------------------------------------- | -------------------- |
| `AGENTS.md`                | Project-wide conventions      | Always loaded at session start                 | Fixed per session    |
| `.cursor/rules/*.mdc`      | Passive reference for editing | `alwaysApply`, `globs`, or description-matched | Varies by activation |
| `.agent/skills/*/SKILL.md` | Active multi-step workflows   | Description-matched on demand                  | Only when invoked    |

### Rules: what/when (passive)

Rules tell the agent what to know. They are loaded automatically and inform decisions without requiring action.

- **`alwaysApply: true`**: Loaded in every conversation. Reserve for universal conventions only (build commands, package manager). Each always-on rule consumes tokens before the user types anything.
- **`globs`**: Loaded when matching files are open. Use for policies that govern specific file types during editing (e.g., `*.test.ts` → testing patterns).
- **Description-matched** (no globs, `alwaysApply: false`): "Agent Decides" mode. The agent sees the description and loads the rule only when it judges it relevant. Near-zero cost when not needed.

### Skills: how (active)

Skills tell the agent what to do. They are invoked on demand via description matching or `/skill-name`. Use for multi-step workflows, file creation procedures, and complex operations.

### Separation principle

Rules = reference material (schemas, standards, constraints). Skills = procedures (step-by-step workflows that produce output). If it has step-by-step instructions, it's a skill. If it's reference, it's a rule.

## Policy Discoverability

Policy docs in `docs/policy/` are discoverable through a tiered system. Use the cheapest tier that provides adequate discoverability.

### Tier 1: AGENTS.md pointer (zero extra cost)

`AGENTS.md` states that policy docs live in `docs/policy/`. The agent can `Read` or `Grep` this directory on demand when working on a relevant task. This is progressive disclosure — context is pulled, not pushed.

Most policies (17 of 21) are adequately discoverable through this pointer alone.

### Tier 2: Description-matched rules (near-zero cost)

For policies that actively govern code patterns, create a `.cursor/rules/*.mdc` with a `description` field but no `globs` and `alwaysApply: false`. The agent loads the rule only when it judges it relevant based on the description.

### Tier 3: Glob-scoped rules (file-triggered cost)

For policies that must be enforced whenever certain file types are being edited, use `globs` to trigger loading. Good for: testing patterns (`*.test.ts`), React conventions (`*.tsx`), documentation (`*.mdx`).

### Tier 4: Always-apply rules (constant cost)

`alwaysApply: true` loads in every conversation. Reserve for the 1-2 most critical universal rules (e.g., package manager, build commands). Every always-on rule taxes the 200K context budget before the user types anything.

### When NOT to create a companion rule

Do not create a `.cursor/rules/*.mdc` companion for a policy when:

- The policy is reference/architecture documentation (kernel-architecture, rpc, rendering-pipeline)
- The agent can find it via `docs/policy/` search when relevant
- The rule would just be a lossy summary that duplicates the policy content
- The policy doesn't govern patterns during active code editing

## Size Budget

- **Total file**: under 150 lines
- **Per section**: under 50 lines
- Agents read this file at the start of every session; brevity preserves attention budget

## Required Sections

Organize content in this order (most critical first):

### 1. Commands

Exact command invocations with file-scoped variants. Commands are unambiguous and verifiable by exit code.

### 2. Architecture Overview

Terse description of the project structure. Pointers, not prose.

### 3. Skills

Table of project skills in `.agent/skills/` so the agent knows what guided workflows are available and when to use them. Keep the table updated when skills are added or removed.

### 4. Code Conventions

Specific do's and don'ts with version-locked library references. Write like rules, not documentation.

### 5. Learned Preferences (auto-maintained, fallback buffer only)

`AGENTS.md` keeps `## Learned User Preferences` and `## Learned Workspace Facts` as **fallback buffers** for truly cross-cutting bullets the `agents-memory-updater` subagent cannot route to a project. Plain bullet points only, capped at 12 bullets / 200 chars each.

Project-scoped learnings route into per-domain `.cursor/rules/learned-<project>.mdc` files (see Per-Project Learned Rules below). The buffer in `AGENTS.md` is for items with no project anchor — process/workflow notes, repo-wide reference lists, etc.

## Per-Project Learned Rules

Long-tail learned facts and preferences live in glob-scoped per-Nx-project rule files at `.cursor/rules/learned-<project>.mdc`. Each file:

- Is `alwaysApply: false` and globs to its project root (e.g. `apps/ui/**`, `packages/runtime/**`)
- Has only two H2 sections: `## Learned User Preferences`, `## Learned Workspace Facts`
- Is auto-maintained by the `agents-memory-updater` subagent — do not hand-edit
- Loads only when the agent is touching files matching the glob, so token cost is paid per-task, not per-session

Rationale: a single always-on `AGENTS.md` containing every learning grew to 147KB / ~37K tokens before the May 2026 cleanup, dominating the context budget. Splitting by project keeps the always-on layer minimal while preserving every learning where it is most relevant.

## Writing Principles

### Command-first, not prose

Every instruction should answer: "What command proves this was done correctly?" Prose paragraphs without actionable commands are ignored by agents.

```markdown
<!-- INCORRECT -->

We value clean, well-tested code with comprehensive coverage.

<!-- CORRECT -->

Run `pnpm nx test <project> --watch=false` after changes. All tests must pass.
```

### Specific over vague

```markdown
<!-- INCORRECT -->

Be careful with database migrations.

<!-- CORRECT -->

Run `pnpm db:generate` after schema changes. Never hand-edit migration files.
```

### No duplication across tiers

`AGENTS.md` holds project-wide conventions. `.cursor/rules/*.mdc` holds file-pattern-scoped enforcement. `docs/policy/` holds full policy detail. Never repeat the same content across tiers — reference, don't copy.

### No defensive repetition

State instructions once. Avoid `CRITICAL`, `MUST`, `NEVER`, `IMPORTANT` emphasis markers — they waste tokens and agents already follow clear instructions.

### No secrets or transient details

Never store tokens, credentials, branch names, commit hashes, or temporary errors.

## Doc Frontmatter

All policy (`docs/policy/`) and research (`docs/research/`) docs require YAML frontmatter validated by `pnpm docs:validate` in CI.

| Field           | Policy   | Research | Purpose                                                    |
| --------------- | -------- | -------- | ---------------------------------------------------------- |
| `title`         | Required | Required | Agent display name; must match H1                          |
| `description`   | Required | Required | Agent discoverability without reading full content         |
| `status`        | Required | Required | `active`, `draft`, `deprecated`, `superseded`              |
| `created`       | Required | Required | ISO 8601 date                                              |
| `updated`       | Required | Required | ISO 8601 date; CI warns if >180 days stale                 |
| `category`      | —        | Required | Research type: audit, investigation, comparison, etc.      |
| `related`       | Optional | Optional | Machine-parseable cross-references (paths validated by CI) |
| `superseded_by` | Optional | Optional | Path to successor doc                                      |

The `related` field is the source of truth for cross-references. A `## References` section in the body may still exist for external links.

## Continual Learning Integration

The `continual-learning` plugin's `agents-memory-updater` subagent maintains the learned sections by mining agent transcripts. The Tau workspace overrides the upstream subagent at `.cursor/agents/agents-memory-updater.md` with project-aware routing.

- Plain bullet points only
- **Per-bullet length cap: 200 chars.** Split long learnings into multiple short bullets rather than emitting one long one. This cap is policy — the absence of it is what allowed the prior 138KB regression.
- At most 12 bullets per section per file
- Include only items that are actionable, stable across sessions, repeated in multiple transcripts or explicitly stated as broad rules, and non-sensitive
- Update in place (merge, don't append-only)
- Index file at `.cursor/hooks/state/continual-learning-index.json` tracks processed transcripts

### Routing rules (single source of truth at `.cursor/agents/agents-memory-updater.md`)

Each new bullet routes to the most-specific match:

- **Project-scoped** (mentions a single project's directory, file path, or unambiguous component): write to `.cursor/rules/learned-<project>.mdc` (create with standard frontmatter if missing).
- **Cross-project domain cluster** (e.g. graphics stack spanning ui+runtime+react): write to `.cursor/rules/learned-<topic>.mdc` (e.g. `learned-graphics-stack.mdc`).
- **Truly cross-cutting** (no project anchor): write to the `AGENTS.md` fallback buffer.

The full routing table — Nx project name, target file, glob root, trigger keywords — lives at the bottom of `.cursor/agents/agents-memory-updater.md`. That file is the single source of truth for the routing logic; this policy describes the architecture, not the table.

## Audit Checklist

When editing `AGENTS.md`:

- [ ] Total file under 150 lines (excluding the auto-managed Nx block)
- [ ] Every instruction is verifiable by a command or concrete example
- [ ] No duplication across tiers (AGENTS.md, rules, policies)
- [ ] No prose paragraphs without actionable commands
- [ ] No secrets, tokens, or transient details
- [ ] Learned sections maintained only by `agents-memory-updater` (not hand-edited)
- [ ] Buffer sections respect the 12-bullet / 200-char-per-bullet cap
- [ ] Skills table reflects current `.agent/skills/` contents

When editing `.cursor/rules/learned-<project>.mdc`:

- [ ] File is `alwaysApply: false` with project-scoped globs
- [ ] Only H2 sections present: `## Learned User Preferences`, `## Learned Workspace Facts`
- [ ] Each section ≤12 bullets
- [ ] New bullets ≤200 chars
- [ ] No process/workflow notes (those belong in the AGENTS.md fallback buffer)
