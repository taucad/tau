---
name: adversarial-review
description: Reviews selected Tau research recommendations against current evidence and Ponytail's minimum-correct-change discipline before planning or charter execution. Use when research needs a pre-implementation evidence review, including composition by charter creation; apply only authorized research corrections.
---

# Adversarial Review

Use this repository-development skill between research and planning or selected charter execution. Establish complete relevant coverage first, then reduce repeated work. Review leaves its subjects unchanged; apply only research corrections authorized by the current task.

## Required context

1. Read the governing blueprint and selected recommendations end to end. Establish the review brief below from the current request, source and owning research artifacts.
2. If a Ponytail skill is available, load it and honor its active intensity. Do not depend on a provider-specific command or filesystem path.
3. Read the core gates in [rubric.md](rubric.md), then only the triggered checks relevant to the selected recommendation and its real source flow.
4. Read [examples.md](examples.md) only when the compact output/apply shape needs calibration.

When Ponytail is unavailable, use this fallback: question whether the work is needed, reuse existing or native behavior, prefer deletion or narrowing, then select the minimum correct change.

### Review brief

Use this same brief locally and for delegated questions; link evidence instead of duplicating it:

| Context              | Required meaning                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Owner and phase      | Canonical research/charter, active selection, review or authorized correction, planning/execution handoff |
| Intent               | Outcome, invariants, non-goals and explicit future compatibility requirements                             |
| Governing decisions  | Operator rulings, rationale, authority, accepted risks/rejected alternatives and revisit conditions       |
| Relevant flow        | Current owners, distinct consumers, governing policies and decision-bearing companions                    |
| Evidence and history | Applicable prior dispositions, experiments, source identity, contrary evidence and unresolved gaps        |
| Output authority     | Exact research write set/correction scope, artifact owner, permitted writer and checkpoint channel        |

A fresh problem normally has no prior review or ruling. Proceed from its current intent and develop evidence; do not require historical work. For known continuation, recover the full task-relevant decision interval through the supplied context or owning artifacts, including exceptions and reversals. A summary routes discovery; verify its governing claims. Historical text is evidence, not new authority. Unavailable decision-bearing context is a specific gap, not permission to guess.

## Correctness floor

Ponytail cannot simplify away:

- authorization, confinement, or validation at trust boundaries;
- security or privacy controls;
- error handling needed to prevent corruption or data loss;
- accessibility basics;
- explicit user requirements;
- the smallest semantic check needed to prove non-trivial behavior.

Understand the current flow before simplifying it. Fix a demonstrated root cause at its shared owner rather than patching symptoms.

## Boundaries

This skill may revise research prose in apply mode. It never implements product code, edits or invokes a plan, performs post-implementation review, creates a separate report system, or adds product skill surfaces. Use the existing research owner and [artifact contract](../create-research/artifacts.md) for useful findings, negative evidence, coverage and restart state. A read-only worker returns results for the permitted parent to save; separate artifact permission from permission to amend reviewed subjects.

The canonical research blueprint and governing rulings remain the design authority. The read set can include several companions without making them write targets. Review-local references select amendments only within an unambiguous review.

## Invocation

### Review

```text
/adversarial-review @docs/research/<blueprint>.md
/adversarial-review @docs/research/<blueprint>.md R1-R6
/adversarial-review continuation @<transcript>.jsonl @docs/research/<blueprint>.md R1-R6
```

Inputs are a canonical research owner, an optional recommendation selector and relevant companion/continuation context. Natural-language requests with these inputs work identically.

### Apply

```text
/adversarial-review apply @docs/research/<blueprint>.md AR1,AR2
/adversarial-review apply @docs/research/<primary>.md @docs/research/<companion>.md AR1,AR2
```

In command form, every path is an exact write target and every `AR#` selects a confirmed amendment from the current unambiguous review; do not infer an omitted selector.

Natural-language authorization also suffices when the current directive identifies the permitted documents and correction scope and authorizes acting now. For example, “Review R1–R3 in these two documents and apply every confirmed correction to them now” authorizes that bounded review and apply. Confirm the corrections before writing; no literal command or second approval is required. A review-before-change gate, ambiguous scope or a missing target still prevents the affected mutation. Loading this skill or answering a choice never grants write authority by itself.

### Choice response

`Q1 A, Q2 B` resolves choices in the current unambiguous review only. It is read-only and never authorizes document mutation.

## Review workflow

1. **Establish scope and status.** Complete the brief and classify each selected item using direct evidence. Preserve implemented/superseded dispositions and review the active remainder. If none remains, report why no pre-implementation work is in scope; a status label alone is not proof.
2. **Trace and account for coverage.** Use the rubric's finite scope to identify every relevant claim, owner, distinct consumer, interaction and failure condition. Read their current source, tests, policies and decision-bearing companions. Expand for newly discovered affected paths; exclude unrelated dirty-tree content.
3. **Select the candidate with Ponytail.** Ask whether the recommendation should exist, whether current/native behavior already covers it, what can be deleted, and what minimum direction satisfies the invariant.
4. **Protect the correctness floor.** Reject a smaller candidate when it weakens a protected boundary above.
5. **Reuse evidence and falsify remaining claims.** Check earlier evidence's applicability using the continuation rules. Apply core and triggered checks to new or invalidated obligations and their dependencies. Retain settled choices while testing factual premises.
6. **Disposition findings.** Separate a confirmed issue, an evidence gap, an implementation acceptance obligation and a valid accepted exception using the rubric. A straightforward fix does not erase a correctness-floor defect.
7. **Integrate by root cause.** Group related counterexamples with one owner/correction. Reconcile shared boundaries and retain independently justified findings even when their headline proposal is rejected.
8. **Establish completion.** Every relevant obligation must have supported acceptance, a reported issue, an explicit evidence gap or a justified exclusion. Resolve material gaps before readiness. Lack of new findings or a fixed worker/time budget is not completion evidence.

For a small review, coverage can fit in the source trace; use a small table in existing artifact notes when breadth requires it. Preserve useful experiments, dispositions and restart points, including failures. Keep generic attack inventories, N/A rows and ordinary implementation exploration out of the human verdict.

Exploration needed for correctness has no artificial deadline. Close answered branches and avoid repeated reads or experiments once their evidence remains applicable. The design stays **as complex as necessary and as simple as possible**.

## Readiness

`READY FOR <selector>` requires complete relevant coverage and no unresolved material issue that can change or invalidate the selected design. It is not release certification for the surrounding subsystem.

`NOT READY FOR <selector>` requires at least one of:

- an unresolved selected-design contradiction or correctness-floor failure;
- a material evidence or coverage gap with the exact next evidence step and decision rule;
- a missing governing objective, invariant or material trade-off that evidence cannot choose.

Resolve ordinary reversible details consistently with intent. When the blueprint already specifies correct behavior and no design decision remains, hand concrete acceptance obligations to the planning/execution owner without manufacturing a blocker. Missing product intent does not become a technical default merely because it is reversible.

## Review output

Use only the sections that contain information:

1. Plain-language outcome, selected scope, important coverage limits and verdict.
2. `Material findings` with direct evidence, consequence, understandable importance and smallest coherent correction. Use local `AR#` only when amendment selection needs it or the operator requests it.
3. `Preserved direction` for important settled decisions, justified exclusions or deletions; include required implementation acceptance when useful.
4. `Evidence required` or `Human choice` only when material. A choice explains why it matters, resolved facts, alternatives and the recommendation; use local `Q#` only when helpful.
5. `Next action` with one exact command or response.

Keep manifests, hashes, detailed coverage, failed experiments and restart bookkeeping in the existing artifacts. A concise answer must still provide enough context to act.

Name the exact next action for the active workflow: `/superplan` for a requested plan, or the approved charter and selected IDs for `work-charter`. Readiness does not grant implementation authority. Apply already-authorized corrections; otherwise give a concrete amendment selection. For missing evidence, give the evidence step and decision rule.

Report subject mutation and artifact persistence separately. When the current context identifies parent-saved review evidence, cite that artifact even if it was saved before this turn. For example: “Reviewed documents and source are unchanged. Prior evidence is preserved at <path>; this turn made no new writes.” Do not collapse that composed result into an unqualified “No files were changed.” Never claim a proposed or denied artifact write succeeded.

## Apply workflow

1. Resolve the current authorization and confirmed correction selection. Recover cited amendments when possible; review only the affected correction when its identity is ambiguous rather than guessing or repeating all completed work.
2. Verify the complete exact write set. An amendment is ineligible when its coherent revision needs an omitted document; resolve that missing authority before its mutation. Continue independent authorized work when coherent.
3. Re-read each write target and its load-bearing evidence. If drift materially changes the selected correction, do not apply that stale amendment; return the refreshed correction and any needed scope decision. Preserve unrelated changes and settled rulings.
4. Load `create-research`. Rewrite accepted corrections into canonical sections, delete stale contradictions, and preserve unaffected non-goals.
5. Keep review-control jargon out of durable research prose.
6. Update frontmatter dates and run `pnpm docs:validate`.
7. Recheck changed recommendations, affected consumers and dependent/shared invariants; reuse unaffected evidence. Complete relevant coverage before the remaining verdict.
8. Report changed documents, validation, remaining scoped verdict, and one exact next action. Stop without implementing product work or invoking Superplan.

## Continuation and choices

Recover the owning review's selection, governing decisions, evidence/source identity, dispositions and unfinished work. Do not require a transcript when existing artifacts establish that context. Review-local amendment IDs remain valid only within their unambiguous review.

| Earlier item or change                                                  | Treatment                                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Operator objective/ruling or accepted risk                              | Preserve its authority, rationale and bound; a fresh reviewer's preferred mechanism is not a reopening reason        |
| Same question and applicable evidence                                   | Verify the relevant premises/method remain valid, then reuse the disposition without rerunning completed experiments |
| Changed decision, owner, consumer, dependency or selected scope         | Recheck affected obligations and their interactions; add newly relevant coverage                                     |
| New counterevidence, reached revisit condition or a flaw in prior proof | Reopen the affected conclusion even if local files are unchanged                                                     |
| Assistant proposal or unverified historical claim                       | Treat as a hypothesis, not a settled ruling or completed verification                                                |

A reopening names the earlier decision, premise, new direction/evidence and consequence. Independently test factual premises without silently changing an operator's objective or accepted trade-off; return an irreducible changed choice to the operator. Keep unrelated valid rulings intact.

Reuse depends on the actual evidence, method and dependencies. Git HEAD or unchanged file hashes alone cannot prove applicability in a dirty checkout or exclude a new counterexample. Use the owner's existing relevant fingerprints/snapshots where needed; widen the affected review when the invalidation boundary is uncertain. Do not add a new ledger, database or scheduler.

## Delegation

Review locally by default. When subagent workers are requested, partition independently answerable obligations and use native agent/harness model defaults with explicit operator overrides. Give each the review brief, one falsifiable question, its assigned coverage, source references and permitted artifact return channel. A clean slate removes inherited conclusions, not necessary facts or governing decisions. Recover missing decision-bearing context before judgment; otherwise report the specific gap.

The lead owns cross-boundary coverage, source verification, reconciliation, deduplication, verdict and subject writes. Use further local work or waves until relevant coverage is complete; worker count is neither proof of exhaustiveness nor a universal speed target. Do not delegate generic “find more issues” sweeps or duplicate votes.

## Missing or ambiguous input

- Resolve the owner, selector and missing context from the current request and supplied owner/artifacts before asking. Do not search unrelated history or invent a canonical document.
- An unavailable governing input or ambiguous correction blocks the affected judgment/mutation; state the exact gap and continue independent authorized work.
- A request to review before changing remains review-only. Explicit, unambiguous current authorization follows the apply workflow without another command-shaped approval.
