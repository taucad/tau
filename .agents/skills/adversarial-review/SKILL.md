---
name: adversarial-review
description: Adversarially reviews Tau research blueprints against current source, active policies, companion research, production failure modes, and the Superplan handoff contract. Invoke only when the user explicitly names $adversarial-review or /adversarial-review.
disable-model-invocation: true
---

# Adversarial Review

Use this explicit repository-development skill as the evidence gate between `create-research` and `/superplan`. It reviews canonical `docs/research/*.md` blueprints; it is not a Tau UI/API product skill.

## Required resources

Before reviewing or applying findings:

1. Read [rubric.md](rubric.md) completely.
2. Read [report-template.md](report-template.md) completely.
3. Read [examples.md](examples.md) when a broad review or apply response would benefit from calibration.

The rubric owns attack lenses, taxonomies, and synthesis quality. The report template owns the human-first output order and audit-appendix fields. This file owns mutation authority and ledger lineage.

## Authority and boundaries

Use these authorities in the order appropriate to the claim:

| Claim                | Primary authority                                                      |
| -------------------- | ---------------------------------------------------------------------- |
| Intended outcome     | Current user direction and active policy                               |
| Current Tau behavior | Source, call sites, runtime behavior, and tests                        |
| External capability  | Upstream source or authoritative standard, then official documentation |
| Prior reasoning      | Active companion research, treated as dated evidence                   |
| Target design        | The blueprint, treated as a hypothesis until supported                 |

Classify conflicts instead of assuming one source automatically wins. A mismatch can mean stale research, defective implementation, an invalid test, missing policy, or changed intent.

This skill may revise only explicitly named research documents in apply mode. It never:

- implements product code, migrations, tests, or plan tasks;
- invokes `/superplan` or edits/executes a plan;
- performs PR review or post-implementation gap analysis;
- creates persistent per-blueprint review reports;
- adds product skills or changes `apps/ui`, `apps/api`, or `libs/chat` merely to expose this workflow;
- mines historical transcripts at runtime.

The chat response contains a semantic human action endcap and the complete review ledger. The canonical research blueprint remains the durable design source.

## Invocation grammar

### Review — default, read-only

```text
/adversarial-review @docs/research/<blueprint>.md
/adversarial-review @docs/research/<blueprint>.md R1-R6
/adversarial-review continuation ARL-<uuid> @<transcript>.jsonl @docs/research/<blueprint>.md
```

Inputs are exactly one canonical `docs/research/*.md` primary document, an optional recommendation/finding selector, and an optional user-supplied continuation transcript plus ledger ID.

### Apply — explicit mutation

```text
/adversarial-review apply @docs/research/<blueprint>.md
/adversarial-review apply ARL-<uuid> @docs/research/<blueprint>.md AR1,AR3
/adversarial-review apply ARL-<uuid> @docs/research/<primary>.md @docs/research/<companion>.md AR1,AR3
/adversarial-review apply @docs/research/<blueprint>.md all
```

Every document path is an explicit write target; the first is canonical. Apply selection has these exact semantics:

- Explicitly selecting a `CONFIRMED` finding records its user disposition as `ACCEPTED` and authorizes its document revision. A separate acceptance message is unnecessary.
- `apply all` and an omitted selector include every `CONFIRMED` `CLEAR_CUT` item whose disposition is `PENDING` or `ACCEPTED`, plus resolved `HUMAN_CHOICE` items; they exclude `DECLINED` items and unresolved choices.
- Explicitly naming a `DECLINED` confirmed item changes it to `ACCEPTED`, because the newest explicit command is authoritative.
- `NEEDS_EVIDENCE`, `FALSIFIED`, `OUT_OF_SCOPE`, and unresolved `HUMAN_CHOICE` items are never eligible for mutation, even when named.
- A selected item is writable only when its complete revision map is present in the explicit document write set.

### Choice response — read-only

```text
Q1 A, Q2 B, Q3 A
```

A choice response resolves the stable `Q#` records in the current unambiguous ledger but never changes files or accepts findings. Confirm the selected options concisely, then give the exact eligible `apply` invocation and complete write set. Unknown, duplicate, or omitted required answers remain unresolved.

## Review workflow

1. Read the primary document end-to-end. Inspect frontmatter, `superseded_by`, recommendation status, and any Implementation Status section.
2. Verify selected work against current source. If everything selected is implemented or superseded, emit the exact terminal token `NO IN-SCOPE WORK — IMPLEMENTED` or `NO IN-SCOPE WORK — SUPERSEDED`, give concise evidence, and stop. Do not append readiness, decisions, commands, or an audit appendix.
3. For a fresh primary-path + selector pair, create a unique opaque `ARL-<UUID>` ledger. Record canonical path, selector, intended downstream action, and excluded items as `OUT_OF_SCOPE`.
4. Build document and source manifests. Record SHA-256 for documents; repository revision and relevant dirty-diff fingerprint for code; authoritative identifiers for upstream evidence. Reading a file never grants write authority.
5. Inventory the objective, eigenquestion, invariants, findings, recommendations, non-goals, assumptions, open questions, affected files/symbols, tests, deletions, migrations, and claimed evidence.
6. Re-derive outcome → invariant → owner → minimum correct architecture. Resolve empirical questions through source, standards, experiments, or measurements rather than delegating them to the user.
7. Verify every load-bearing current-state or external-capability claim as `VERIFIED`, `CONTRADICTED`, `STALE`, `ASSUMPTION`, or `UNRESOLVED`.
8. Apply every mandatory rubric lens. Mark each conditional module `APPLIED` or `NOT APPLICABLE` with evidence. Sweep the declared failure class rather than silently sampling convenient files.
9. Emit stable `AR1`, `AR2`, … atomic records. Preserve attacks that did not land as `FALSIFIED`; do not reward finding count or manufacture blockers.
10. Map every recommendation exactly once to `PASS`, `AMEND`, `REPLACE`, `DROP`, or `OUT_OF_SCOPE`.
11. Synthesize related atomic records into root-cause rows and classify each row exactly once as `CLEAR_CUT`, `EVIDENCE_REQUIRED`, `HUMAN_CHOICE`, or `NO_ACTION`. This presentation class does not replace the atomic evidence, disposition, severity, or lifecycle fields.
12. Assign stable `Q1`, `Q2`, … records to irreducible human choices. Preserve them across ledger generations, never reuse resolved numbers, and record their member findings, options, recommendation, and selected answer separately from user disposition.
13. Apply the affirmative readiness gate and emit `READY FOR <selector>` or `NOT READY FOR <selector>`. “Ready after amendments” remains not ready until applied and rereviewed.
14. Render the report from the template, ending with the semantic `Action required from you` section after the complete audit appendix. Make no edits. Give an exact safe next response or command and await explicit user action.

Order rows by architecture dependency, severity, confidence, then stable ID. Use `AR#-P#` in the first column as a compact anchor, never as a substitute for the semantic question and context. Mixed-priority rows list every member, such as `AR3-P1, AR7-P2`; never collapse them to one severity. Include every independent human question in one response without a count limit, batching, queue, or omission.

## Apply workflow

1. Resolve the explicit ledger. If omitted, proceed only when the current task contains exactly one open ledger matching the canonical path and selector. Never infer “latest.” Import a ledger from another task through continuation review first.
2. Resolve the selector using the exact acceptance and choice semantics above. If any named item is mutation-ineligible, report why and do not partially reinterpret it.
3. Verify every selected finding's full revision map is inside the explicit write set. Omitted companions remain residual blockers.
4. Re-read and fingerprint every target plus its load-bearing evidence baseline. If a target was not reviewed, a report is missing, or drift changes the correction, make zero edits and return a human-first drift outcome requiring fresh read-only review and approval. Do not offer the stale apply command.
5. Load `create-research`. Rewrite accepted corrections into their canonical sections; do not append a review patch.
6. Delete stale claims and contradictions. Synchronize the executive summary, findings, architecture, recommendations, affected files, dependencies and sequencing, migration, tests and acceptance, references, and any companion document named in the write set.
7. Preserve unaffected non-goals and deferrals. Write durable design prose only: no `ARL`, `AR#`, priority/status codes, disposition jargon, or review bookkeeping may leak into the research document.
8. Write only as the lead agent, only to named targets, and only for selected findings. Do not implement product recommendations.
9. Update frontmatter dates, run `pnpm docs:validate`, and rerun the complete selected-scope review against the original read/write manifest.
10. Append a fingerprint generation to the ledger, preserve IDs and lineage, and mark applied items `VERIFIED` or still open.
11. Render the apply response from the template: outcome, semantic changes, validation, complete audit appendix, then the final `Action required from you` endcap with prioritized references for remaining work. Stop without invoking `/superplan`.

A limited selector or write set may correctly remain `NOT READY`. Apply output must be readable even when the ledger is long: tell the human what changed before showing hashes or lifecycle state.

## Ledger and continuation rules

- A fresh canonical-path + selector review creates one opaque `ARL-<UUID>`.
- Fingerprint changes create generations within that ledger; they do not change identity.
- Bare `AR#` is shorthand only inside one unambiguous ledger. Elsewhere use `ARL-<UUID>/AR#`.
- Existing IDs are never reassigned. New findings append after the maximum; resolved items remain tombstoned.
- Stable `Q#` records are scoped to the ledger, preserve their member `AR#` mappings and answers across generations, and are never reassigned or reused.
- Splits use `derived_from`; merges preserve the lowest ID and mark the others `duplicate_of`.
- Continuation resumes an explicit ledger, or an omitted ID only when the transcript contains exactly one matching ledger.
- A different primary path or selector creates a new ledger and may record `derived_from_ledger`.
- Continuation preserves IDs, seeks unresolved or genuinely new surfaces, and cannot override newer source evidence.

## Effort scaling and subagents

Review locally when the blueprint is narrow and one evidence domain contains the load-bearing claims.

Use two to four clean-slate, read-only subagents when the target spans multiple subsystems/documents, mixes distinct evidence domains, or has high-risk architecture, operations, security, numerical, or strategy surfaces. Choose among evidence/current-state, architecture/eigenquestion, failure/production, and policy/testing/Superplan challengers. A strategy-heavy review may replace one role with a commercial/strategy challenger; do not add a fifth default reviewer.

The lead must read the canonical blueprint, give bounded read-only briefs, require condensed evidence reports, independently verify load-bearing claims, deduplicate common causes, resolve contradictions, preserve failed attacks, own the ledger/verdict, and remain the sole writer.

## Missing or ambiguous inputs

- No research document: ask for one and stop.
- Multiple unranked primary documents: ask which is canonical; companions remain evidence-only.
- Unknown `R#`/`AR#`: report the mismatch and stop.
- Multiple matching ledgers without an explicit ledger ID: list candidates and stop.
- “Review and fix” without explicit `apply`: run review only and give the exact safe apply command.
- Purely empirical question: investigate it rather than asking the user to choose evidence.
- Irreducible product/commercial/value choices: present all independent questions with self-contained context, mutually exclusive options, evidence, and a recommended default.
