---
name: superplan
description: Creates a complete implementation plan from a Tau research document and optional prior-session evidence. Use when asked to plan selected recommendations, turn a blueprint into executable work, or continue an existing planning discussion.
---

# Superplan

Own plan authoring. [Work Charter](../work-charter/SKILL.md) owns authorized execution and its queue. Use [the durable artifact contract](../create-research/artifacts.md) for exploration, decisions and persistence. Native plan UI is optional; the plan must remain usable by Codex and Claude.

## Resolve the requested scope

Accept a research/charter path with optional IDs or an explicit exclusion list. `/superplan @docs/research/<subject>.md` selects its recommendations, subject to its non-goals and deferrals. `/superplan continuation @<transcript> @docs/research/<subject>.md` adds prior-session evidence. Natural-language requests with the same inputs work identically.

Use the supplied governing document and existing artifact owner. If the owner is missing, inspect the provided context, then ask for the specific missing input while continuing independent source inspection. Do not invent a research conclusion or select unrelated recommendations.

Read the whole governing document and selected rulings. Record its revision or content fingerprint, selected IDs, explicit exclusions, unresolved decisions and existing plan/queue. Preserve an approved or user-curated plan; revisions require the user's request. Execution progress belongs in its native todos and the coordinator queue, never silent edits to the plan body.

## Recover prior decisions

Read the task-relevant prior dialogue through the host's supported history tools or supplied local transcript. Preserve access to the full relevant session and its exact user rulings, exceptions, reversals and unfinished work. Do not impose a five-message window or a provider-specific path. Use bounded pages and inspected-range checkpoints for long sources. Compaction summaries and assistant claims are evidence to verify, not new user authority.

Resolve conflicting historical statements against the current request and current code. Record unavailable source ranges or ambiguity that changes the plan. Do not dump private transcripts into the plan; retain necessary redacted evidence with the existing artifact owner.

## Trace the implementation before writing tasks

For each selected recommendation, inspect its current owner, callers, dependencies, tests and existing helpers. Verify cited paths and identify superseded implementations to delete. Distinguish a local implementation defect from an architectural ownership defect. Include required docs, generator, migration and policy changes within the selected outcome.

Use independent native exploration lanes for genuinely separate areas of a large plan. Give each lane its question, source scope, exclusive artifact path and acceptance condition; one coordinator integrates shared contracts. Reuse existing mechanisms before adding abstractions, without weakening the approved architectural outcome.

## Write one reviewable plan

Use the existing plan location when provided. Otherwise write `plan.md` in `docs/research/artifacts/<subject>/` beside its index. A native plan tool may present the same plan, but must identify its durable canonical location. Never manufacture a provider-private plan path or require a specific mode-switch tool.

The plan contains:

- The selected outcome and governing IDs, with explicit non-goals, invariants and unresolved decisions.
- A current architecture snapshot; use a small Mermaid diagram when topology changes.
- Stable task IDs mapping every selected recommendation to concrete changes, files, dependencies and acceptance evidence. Split large recommendations into independently executable tasks; do not hide all work under one generic todo.
- Exclusive path ownership and one writer for shared contracts, plus the sequencing needed to avoid collisions. Worktrees still share external resources such as ports, databases and generated assets.
- Explicit deletion and cleanup of superseded paths within scope, with any required cutover gates.
- Meaningful verification per changed behavior using the applicable [testing policy](../../../docs/policy/testing-policy.md), plus the relevant Nx lint/typecheck/build/integration checks. Add semantic tests when needed; do not require wording-only tests for reversible prose.
- Recovery and completion criteria, durable checkpoints, relevant documentation status updates and source-backed candidates for [Update Agent Memory](../update-agent-memory/SKILL.md).

Use the smallest sufficient table and phase narrative. Every task needs an owner, dependency and observable acceptance result; narrative and tasks must agree. Use real Nx project names and supported commands. Include no credentials, developer-specific absolute paths, time estimates or speculative features. An authorized sweeping migration includes its full cleanup and completeness requirements; an explicitly scoped MVP retains its deferrals.

## Verify and hand off

Check the recommendation-to-task mapping, source paths, dependencies, disjoint ownership, acceptance commands and durable links. Surface the plan location, selected IDs, task count and any decision that actually blocks execution. An analysis-only or plan-only request ends here.

When the user has already authorized implementation, hand the same selected scope to [Work Charter](../work-charter/SKILL.md) without asking again. That coordinator freezes the plan fingerprint, records its queue and continues until the selected outcome passes semantic acceptance. Plan readiness by itself does not authorize unrelated implementation, publication or external messages.
