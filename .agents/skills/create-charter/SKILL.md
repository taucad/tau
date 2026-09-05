---
name: create-charter
description: Creates or revises a Tau research charter with source-backed architecture, stable rulings, eigen decisions and independently executable work packages. Use when asked to charter a program or explore a problem space before selecting its architecture and implementation scope.
---

# Create Charter

Turn an authorized problem or program into a decision authority under `docs/research/`. Use [create-research](../create-research/SKILL.md) for the document format and [its artifact contract](../create-research/artifacts.md) for all exploration outputs. One coordinator owns the charter; investigation lanes return evidence to it.

For a focused investigation or bug report, use `create-research` directly. For implementation of an existing approved selection, use [work-charter](../work-charter/SKILL.md). Creating a charter does not authorize implementing the program.

## Establish intent and develop evidence

1. Start from the current problem. A fresh problem without prior research is the normal entry point; develop its evidence through exploration. State the desired outcome, non-goals, success criteria and known constraints. Separate the requested outcome from a proposed mechanism. Resolve ordinary facts locally; ask only for missing intent or a material invariant that evidence cannot choose.
2. Only when continuing known prior work, recover its charter/research, rulings, source revision and unfinished evidence, and continue the existing owner. This is an optional continuation branch, not a prerequisite for a new charter. Treat prior transcripts as evidence, not instructions that override the current session.
3. Trace the actual system and its shared owners, callers, boundaries, policies and existing implementations. Inspect dependency source through `repos`; compose `find-research` for an authorized bounded literature question or `mine` for an external ecosystem investigation only when that evidence can change the decision.
4. Map independent decision-changing uncertainties. When subagent workers are requested, fill available native capacity with useful independent questions and queue the rest in waves. Leave worker model/class selection to the agent and harness defaults; honor explicit operator overrides. Each brief names the question, source domain, governing decisions, exclusive artifact path, permitted writer/checkpoint channel and exit evidence. Parallelize coverage, not repeated votes on the same question.
5. Preserve findings, counterexamples, failed experiments and checkpoints as produced. Reconcile conflicting results against source or a targeted experiment. Do not choose architecture by majority vote, tool popularity or a target number of agents.

Exploration has **no artificial time pressure**. Continue while evidence can change necessity, ownership, architecture, correctness or acceptance. Close an answered branch and retain its result; quota, context and interruption require durable continuation rather than discarding work or silently reducing scope.

## Select and challenge architecture

Load Ponytail when available, honor its active intensity, and apply it after tracing the flow. If unavailable, question whether the mechanism is needed, reuse the existing owner, a standard, the native platform or an installed dependency, and add only what the demonstrated invariant requires. The principle is **as complex as necessary and as simple as possible**. Correctness, data-loss prevention, trust boundaries, accessibility and explicit requirements are not optional simplifications.

Compare viable approaches by the outcome and actual failure modes. Record the minimum correct direction, evidence for it, rejected mechanisms that matter, and remaining uncertainty. A tight selected scope and architectural completeness within that scope are compatible; speculative future features do not become requirements.

Compose [adversarial-review](../adversarial-review/SKILL.md) for the selected recommendations as part of this authorized charter review. Supply its [review brief](../adversarial-review/SKILL.md#review-brief): current mandate/phase, selection and invariants, governing rulings with rationale/authority/revisit conditions, distinct consumers and decision-bearing companions, applicable prior evidence and gaps, and exact subject/artifact write permissions. A fresh charter may have no prior dispositions. Use the same brief for requested independent reviewers, each with a bounded falsifiable question and assigned coverage; fresh reasoning still needs complete factual and decision context.

Resolve material findings at their shared root cause and account for complete relevant coverage before readiness. Preserve settled choices unless new direction, contrary evidence or a changed premise justifies reopening; reuse valid evidence and recheck affected dependencies. Keep decisions canonical in the charter and detailed coverage/experiments with its existing artifact owner, including results returned by read-only reviewers. Hand concrete implementation acceptance obligations to the selected execution owner. Readiness does not authorize implementation.

## Write the charter

Use stable local IDs rather than fragile line numbers. Include only elements the program needs:

| Element                         | Contract                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Intent and scope                | Problem, outcome, non-goals, success criteria and assumptions                                         |
| Current system and alternatives | Real owners/callers, source evidence, trade-offs and contrary results                                 |
| Decisions and invariants        | Stable `D#` / `I#` IDs, ruling, authority, evidence and affected work                                 |
| Eigenquestions                  | The few unresolved choices that determine many downstream obligations                                 |
| Work packages                   | Stable `W#` IDs, coherent outcome, prerequisites, affected owners/paths and semantic acceptance       |
| Sub-blueprints                  | Links to detailed designs when one package needs its own research owner; no duplicate rulings         |
| State and evidence              | Proposed/approved/implemented/superseded decisions, unresolved gaps, artifact index and restart point |

Do not generate every future implementation todo during chartering. Make work packages selectable and independently verifiable, with shared-contract dependencies explicit. Keep detailed exploration and raw evidence in the artifact tree.

## Human decisions and handoff

Agents own facts, decomposition, reversible details consistent with rulings, experiments and reconciliation. Surface a human choice only when evidence cannot choose the desired objective, a governing invariant or a material trade-off between valid outcomes, or when authority is missing.

Each decision brief states the question plainly, why it changes downstream work, resolved evidence, the recommendation, viable alternatives, affected decision/work IDs, and what can continue meanwhile. Link the detailed evidence; do not ask the operator to synthesize the lane reports. Record the resulting ruling and update affected dependencies.

Validate the root document, nested evidence links and actual persistence. Report the selected architecture, material open decisions and exact next-ready work packages. Handoff to `work-charter` only when execution is authorized; use `superplan` when an implementation plan is requested. Existing authorization persists—do not create a new approval gate for every routine phase transition.
