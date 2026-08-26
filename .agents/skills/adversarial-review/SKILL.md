---
name: adversarial-review
description: Reviews selected Tau research recommendations against current evidence and Ponytail's minimum-correct-change discipline before Superplan. Use only when explicitly invoked to challenge or apply corrections to docs/research blueprints.
disable-model-invocation: true
---

# Adversarial Review

Use this repository-development skill as a concise evidence gate between `create-research` and `/superplan`. Review is read-only. Apply changes only explicitly named research documents.

## Required context

1. Read the selected blueprint and recommendations end to end.
2. If a Ponytail skill is available, load it and honor its active intensity. Do not depend on a provider-specific command or filesystem path.
3. Read the core gates in [rubric.md](rubric.md), then only the triggered checks relevant to the selected recommendation and its real source flow.
4. Read [examples.md](examples.md) only when the compact output/apply shape needs calibration.

When Ponytail is unavailable, use this fallback: question whether the work is needed, reuse existing or native behavior, prefer deletion or narrowing, then select the minimum correct change.

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

This skill may revise research prose in apply mode. It never implements product code, edits or invokes a plan, performs post-implementation review, creates a persistent review report, or adds product skill surfaces.

The canonical research blueprint is the durable design source. Review-local references exist only to select amendments in the current review or an unambiguous supplied transcript.

## Invocation

### Review

```text
/adversarial-review @docs/research/<blueprint>.md
/adversarial-review @docs/research/<blueprint>.md R1-R6
/adversarial-review continuation @<transcript>.jsonl @docs/research/<blueprint>.md R1-R6
```

Inputs are one canonical research document, an optional recommendation selector, and an optional user-supplied continuation transcript.

### Apply

```text
/adversarial-review apply @docs/research/<blueprint>.md AR1,AR2
/adversarial-review apply @docs/research/<primary>.md @docs/research/<companion>.md AR1,AR2
```

Every document path is an exact write target. Every `AR#` must be a confirmed amendment from the current unambiguous review. There is no implicit selector or `apply all`.

### Choice response

`Q1 A, Q2 B` resolves choices in the current unambiguous review only. It is read-only and never authorizes document mutation.

## Review workflow

1. **Preflight status.** If all selected work is implemented or superseded, emit `NO IN-SCOPE WORK — IMPLEMENTED` or `NO IN-SCOPE WORK — SUPERSEDED`, cite direct evidence, and stop.
2. **Trace the real flow.** Read the current owner, current callers, relevant tests, directly governing policy, and any load-bearing companion claim. Do not inventory the repository.
3. **Select the candidate with Ponytail.** Ask whether the recommendation should exist, whether current/native behavior already covers it, what can be deleted, and what minimum direction satisfies the invariant.
4. **Protect the correctness floor.** Reject a smaller candidate when it weakens a protected boundary above.
5. **Falsify only the candidate.** Apply the core rubric and only condition-triggered attacks inside the scope cone.
6. **Apply the materiality gate.** Admit a finding only when evidence shows that it changes necessity, owner, algorithm, public contract, dependency order, deletion, or semantic acceptance—or prevents a concrete correctness-floor failure.
7. **Group by root cause.** Related counterexamples sharing one owner become one finding and one minimum revision.
8. **Stop.** When the minimum correct direction survives and remaining plausible attacks cannot change it, declare the selected scope ready.

Do not record failed attacks, N/A modules, speculative hardening, ordinary Superplan exploration, or P3 polish. A short `Skipped` line is allowed only when it names a concrete revisit trigger that prevents an easy regression.

## Readiness

`READY FOR <selector>` means no unresolved material issue can change or invalidate the selected plan. It is not release certification for the surrounding subsystem.

`NOT READY FOR <selector>` requires at least one of:

- a confirmed in-scope amendment;
- an architecture-changing evidence gap with an exact decision rule;
- an irreversible architecture-changing product or policy choice that cannot safely take the recommended default.

Default reversible choices to the evidence-backed recommendation. Non-load-bearing observations do not block.

## Review output

Use only the sections that contain information:

1. Plain-language outcome and formal verdict.
2. `Material findings` with review-local `AR#`, direct evidence, consequence, and smallest correct blueprint revision.
3. `Preserved direction` for important decisions or deletions that survived.
4. `Evidence required` or `Human choice` only when it blocks readiness. Use local `Q#` for choices.
5. `Next action` with one exact command or response.

Do not emit manifests, hashes, lineage, lifecycle fields, severity legends, failed-attack inventories, recommendation-coverage bureaucracy, or an audit appendix.

When ready, the next action is the exact `/superplan` command. When amendments are clear, it is the exact apply command. When evidence is missing, it is the exact evidence step and decision rule.

End review mode with: `No files were changed.`

## Apply workflow

1. Resolve every selected `AR#` from the current review or supplied transcript. If ambiguous, rerun review rather than infer history.
2. Treat every document path as the complete write set. A finding is ineligible when its coherent revision needs an omitted document.
3. Re-read every write target and the load-bearing source evidence. If drift changes the correction, write nothing and return a fresh review outcome.
4. Load `create-research`. Rewrite accepted corrections into canonical sections, delete stale contradictions, and preserve unaffected non-goals.
5. Keep review-control jargon out of durable research prose.
6. Update frontmatter dates and run `pnpm docs:validate`.
7. Recheck only the changed recommendations and shared invariants. Do not repeat unrelated attacks.
8. Report changed documents, validation, remaining scoped verdict, and one exact next action. Stop without implementing product work or invoking Superplan.

## Continuation and choices

Continuation uses the supplied transcript, canonical document, and selector. Review-local IDs are valid only when that context is unambiguous. Source evidence always overrides stale review state.

Ask the user only about an irreducible, materially architecture-changing preference. Resolve empirical questions through safe source inspection, measurement, or standards. Reversible choices take the recommended default and do not block.

## Delegation

Review locally by default. Use at most two clean-slate, read-only subagents only when separate evidence domains independently control the selected architecture. Give each one falsifiable question, named evidence, and an explicit scope boundary. Never delegate a generic “find issues,” completeness, or production-hardening sweep.

The lead owns source verification, root-cause deduplication, verdict, and every write.

## Missing or ambiguous input

- No canonical research document: ask for one and stop.
- Unknown recommendation or review-local ID: report it and stop.
- Multiple plausible primary documents or ambiguous continuation state: rerun or ask which document is canonical.
- “Review and fix” without explicit apply: review only and return the exact apply command.
