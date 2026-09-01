---
name: superplan
description: Generate a production-ready implementation plan from a research doc (and optionally a prior chat transcript) by switching into Cursor plan mode. Use when the user invokes `/superplan @docs/research/<name>.md`, `/superplan continuation @<transcript>.jsonl @docs/research/<name>.md`, or asks to "develop a plan to implement all recommendations from" a research doc. Pre-creates one todo per finding, cross-referenced to the source recommendation.
disable-model-invocation: true
---

# Superplan

Shortcut for the recurring "develop a plan to implement all recommendations from this research doc" workflow. Switch into Cursor plan mode and produce a single, complete plan that downstream "Implement the plan as specified" runs will execute without further user input. Cursor plan mode owns the plan file's location, filename, and on-disk format — do not specify a path or invent a filename.

## Invocation Shapes

The user invokes this skill in one of two shapes. Detect the shape from the prompt before doing anything else.

### Shape A — Fresh plan

```
/superplan @docs/research/<name>.md
/superplan @docs/research/<name>.md R1,R3,R6
/superplan @docs/research/<name>.md all except R14
```

Inputs:

- **Required**: one research doc path (`docs/research/*.md`).
- **Optional**: a subset selector (`R1-R5`, `R1,R3,R6`, `all except R14`). When absent, default to "all recommendations".

### Shape B — Continuation from a prior chat

```
/superplan continuation @<transcript>.jsonl @docs/research/<name>.md
/superplan continuation @<transcript>.jsonl @docs/research/<name>.md R1-R5
```

Inputs:

- **Required**: a transcript `.jsonl` path (under `/Users/rifont/.cursor/projects/.../agent-transcripts/<uuid>/<uuid>.jsonl`) AND a research doc path.
- The transcript path signals that a new chat was opened for fresh context. Recover context from the prior chat before planning.

If the user types `/superplan` with no arguments, or with only a transcript and no research doc, stop and ask which research doc to plan against — do not proceed without a research doc.

## Workflow

### Step 1 — Recover context (Shape B only)

If a transcript path is present:

1. Read the **last 5 user messages** from the transcript jsonl. Each line is a JSON record; filter `role === "user"` and slice the tail. Five is the canonical window — only widen if the user explicitly says "review the last N messages" with a larger N.
2. Skim assistant messages adjacent to the final user turn to understand the in-progress decision being handed off.
3. Note any constraints the prior chat surfaced (deferred questions, eigenquestion reframes, vetoed approaches) and honour them in the plan.

Do **not** dump the transcript back to the user. Internalize the context silently.

### Step 2 — Read the research doc end-to-end

Read the full research doc. Extract:

- The **complete list of numbered findings/recommendations** (`R1`, `R2`, … or `Finding 1`, `Finding 2`, …). If the user supplied a subset (`R1-R5`, `R1,R3,R6`, `all except R14`), filter the list accordingly; otherwise include every recommendation.
- Each recommendation's **priority** (P0/P1/P2), **affected files**, **scope notes**, and any **open questions** (`OQ1`, `OQ2`, …) referenced by that recommendation.
- Any **non-goals**, **scope boundaries**, or **deferred items** the doc calls out — these must not become todos.

If the doc does not number its findings, fall back to its `## Recommendations` table or the equivalent prioritized list.

### Step 3 — Deeply explore the codebase

Before drafting todos, build a concrete mental model of every change required. For each recommendation:

- Find the affected source files (Grep/Glob the symbols, file paths, and call sites the research doc cites).
- Identify code that must be **deleted** (vestigial paths, superseded utilities, dead exports). The plan must explicitly delete this code — never leave it for a follow-up.
- Identify tests that will need to be added, updated, or removed. Tests must comply with `docs/policy/testing-policy.md`.
- Identify cross-cutting concerns the recommendation surfaces but does not spell out (telemetry, migrations, docs, learned-rule bullets, .cursor/rules updates).

For sweeping refactors (cross-package, multi-phase), launch parallel `explore` subagents to map separate areas concurrently.

### Step 4 — Switch into plan mode and draft the plan

Call `SwitchMode` with `target_mode_id: "plan"` before drafting. Plan mode owns the file location, filename, and frontmatter schema — emit the plan content into plan mode and let it persist; never write to a hardcoded path.

Within plan mode, draft:

- A short kebab-case **name/title** derived from the research doc filename or recommendation set (e.g. `cost-explosion-r1-r3-r6`, `workspace-escape-cad-preview`).
- An **overview** paragraph naming every recommendation covered, the research doc, the testing-policy compliance commitment, and the "production-ready, no follow-ups" guarantee.
- A **todos list** where each item has a stable id, a content string that cites its R-number, and `pending` status.

Todo authoring rules:

1. **One todo per finding, minimum.** Systematically walk the recommendation list — every R# in scope must map to at least one todo. Large recommendations split into multiple phase-tagged todos (`phase3-token-usage-migration`, `phase3-snapshot-middleware`). The cross-reference to the R-number must appear in the `content` string itself so a reader of the todo alone knows which finding it satisfies.
2. **Always include cleanup todos.** Add explicit `phase<n>-delete-<thing>` and `phase<n>-dead-code-sweep` entries for any code the recommendations supersede. Cleanup is not optional and never deferred.
3. **Always include test todos.** Per recommendation, add at least one todo that creates or updates the tests. When the user's prompt mentions TDD, structure the test todo to land **before** the implementation todo for that recommendation. Reference `docs/policy/testing-policy.md` in a final `policy-compliance-pass` todo that runs the policy checklist over every new/changed test file.
4. **Always include a verification todo.** End with a `verification-checklist` (or equivalent) todo that asserts: `pnpm nx test/lint/typecheck` green for every touched project, integration suites green, zero greps for deleted symbols, and any kernel/runtime-specific smoke checks.
5. **Include doc-sync todos when applicable.** If the recommendations change behaviour the research doc describes, add a `phase<n>-research-doc-status` todo to append an "Implementation Status" subsection. If a durable learning emerges, add a `phase<n>-learned-bullet` todo to update the relevant `.cursor/rules/learned-<project>.mdc`.

Plan body (the narrative plan mode renders alongside the todos):

- Opening paragraph: list every recommendation by R-number with a one-line summary, link to the research doc, and restate the production-ready + testing-policy commitments.
- `## Architectural snapshot` with a Mermaid `flowchart` when the recommendations reshape data flow or module topology.
- `## Sequencing & deliverable boundaries` describing PR splitting, ordering constraints between phases, and any inseparable groupings.
- One `## Phase <n>: <name>` section per phase named in the todos, each documenting: files touched, the exact change, the R-reference, test plan, and explicit deletions.
- `## Test plan` cross-referencing each test todo back to its R-number and naming the file path of the new/updated test.
- `## Final verification` enumerating the commands and assertions the verification todo will run.

Plan authoring constraints:

- Match every todo id with a `## Phase` (or equivalent) section in the body. No orphan todos, no orphan sections.
- Use kernel/package-specific NX commands (`pnpm nx test <project> --watch=false`) — never bare jest/vitest.
- Do not embed credentials, env values, or developer home-directory paths into the plan body.
- Do not include time estimates or developer-day calendars — sequencing is captured by phase ordering only.
- Do not hand-pick or invent a filename, hash, or output directory — plan mode handles persistence.

### Step 5 — Hand off

After plan mode persists the plan, surface to the user:

1. The total todo count.
2. A one-line confirmation that every in-scope R# has at least one todo and that cleanup + testing-policy + verification todos exist.

Then **stop**. Do not begin implementation. The user will resume in a separate prompt with "Implement the plan as specified" — at which point the agent must NEVER edit the plan itself (per the learned `pickup-from-prior-transcript` rule); only the todo statuses move via the todo tool.

## Required Coverage Checklist

Before writing the plan file, mentally tick every box. If any is missing, draft additional todos to cover it.

- [ ] Every in-scope `R#` has ≥1 todo whose `content` cites the R-number.
- [ ] Every recommendation that supersedes existing code has a matching `delete-<thing>` todo.
- [ ] There is a `dead-code-sweep` todo that greps for the deleted symbols.
- [ ] Every recommendation has a test todo; tests reference `docs/policy/testing-policy.md`.
- [ ] A final `policy-compliance-pass` todo applies the testing-policy checklist to every new/changed test file.
- [ ] A final `verification-checklist` todo runs `nx test/lint/typecheck` + integration suites + zero-grep assertions.
- [ ] If the research doc tracks status, a `research-doc-status` todo appends the implementation status.
- [ ] If a durable learning emerges, a `learned-<project>-bullet` todo updates the relevant `.cursor/rules/learned-*.mdc`.
- [ ] Plan body has one `## Phase` section per todo phase, and a Mermaid `flowchart` when topology changes.

## Examples of Invocation Handling

### Example 1 — Shape A, all recommendations

User: `/superplan @docs/research/chat-multi-provider-cost-explosion.md`

Action: read the doc, extract R1…R6, deeply explore `apps/api/app/api/chat/`, switch into plan mode, and draft a plan with one phase per recommendation cluster plus cleanup + testing + verification todos. Plan mode persists it.

### Example 2 — Shape A, subset

User: `/superplan @docs/research/X.md R1,R3,R6`

Action: same as above but filter the recommendation list to R1, R3, R6. The plan's `overview` and opening paragraph must explicitly state R2/R4/R5 are out of scope.

### Example 3 — Shape B, continuation

User: `/superplan continuation @/Users/rifont/.cursor/projects/Users-rifont-git-tau/agent-transcripts/<uuid>/<uuid>.jsonl @docs/research/opencascadejs-production-dx-readiness.md`

Action: read the last 5 user messages from the transcript to recover the in-progress thread (e.g. which recommendations the prior chat already vetted, which open questions were resolved), then proceed as Shape A. Mention in the plan overview that the plan is a continuation of the prior chat.

### Example 4 — Ambiguous invocation

User: `/superplan @<uuid>.jsonl` (no research doc)

Action: stop and ask which research doc to plan against. Do not invent one.

## Canonical Wording the Plan Must Reflect

These phrases are the user's house style for planning prompts and should appear (paraphrased, not verbatim) in the plan's overview and body:

- "implement all recommendations from `<doc>`"
- "tidy up completely and remove all old code"
- "systematically cover every finding, cross-referencing back to the recommendation"
- "production ready without any steps skipped — deployable without follow-ups"
- "all tests comply with `docs/policy/testing-policy.md`"
- For continuation invocations: "continued from `<prior-transcript-uuid>`; last 5 user messages reviewed for context"

## Anti-Patterns

- Generating a plan that lumps multiple recommendations into a single vague `implement-recommendations` todo. Every R# must be individually addressable.
- Deferring cleanup with todos like "consider deleting X later". Cleanup ships with the plan or not at all.
- Skipping the test todos because "the code is straightforward". Tests are non-negotiable.
- Editing the research doc during the planning step. The skill writes a plan; research-doc updates only happen as a todo executed during implementation.
- Beginning implementation in the same turn as plan generation. The skill ends at the plan file — implementation is a separate user-driven step.
- Writing the plan body before the `todos:` block is finalized — the body must mirror the todos one-to-one.
