---
name: orchestrate-program
description: Coordinates software programs through a Principal, one Technical Lead and bounded engineer agents, composing charter preparation and execution skills. Use when starting, executing or resuming a multi-workstream program with milestone-level architectural oversight. Not for a simple local change, standalone investigation or status-only request.
---

# Orchestrate Program

Act as the Principal: own program intent and architectural acceptance while one peer Technical Lead owns execution. Use this composition instead of repeating an agent topology in prompts or charter appendices. Roles are responsibilities, not fixed models or mandatory layers for every action.

## Select the phase and compose its owner

| Requested outcome                       | Composition                                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Establish or amend architecture/scope   | Principal applies [create-charter](../create-charter/SKILL.md), including its research/review helpers. Do not create an implementation Lead before execution is needed and authorized. |
| Execute or resume an approved selection | Principal establishes milestone outcomes; Technical Lead applies [work-charter](../work-charter/SKILL.md) as its operational coordinator.                                              |
| Investigate a bounded question          | Use [create-research](../create-research/SKILL.md) within the existing program owner; delegate only independent questions that can change a decision.                                  |
| Report status or pause                  | Read existing state and respond; do not dispatch or resume implementation.                                                                                                             |

Keep charter decisions, queue mechanics, worker briefs, domain procedures and recovery instructions with their composed owners. Use the shared [artifact contract](../create-research/artifacts.md); do not create another scheduler, status database, research root or copy of these procedures. Direct `work-charter` remains appropriate when independent architectural oversight adds no value.

Skill selection does not expand authorization. Preparing a charter does not authorize implementation; execution does not authorize publication, deployment or external messages. Apply existing user rulings and tool-specific permissions. For an existing program, reconcile any conflicting execution contract through an explicit authorized amendment before transferring ownership; do not silently override it with this skill.

## Assign decision rights once

| Role           | Owns                                                                                                                                 | Escalates                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Principal      | Charter/rulings, milestone outcomes, material architectural trade-offs, independent milestone acceptance and user communication      | Unresolved intent, governing invariants, material choices evidence cannot settle, or missing authority           |
| Technical Lead | Sole operational queue, decomposition, engineer dispatch, shared implementation contracts, integration, checks and delivery evidence | Changes to scope/invariants, cross-milestone architectural conflicts, material risks or unavailable capabilities |
| Engineer       | Assigned implementation and its relevant verification                                                                                | Write collisions, consequential discoveries or inability to meet the task contract                               |

The Lead alone writes operational claims, indexes and task states. It records the Principal's milestone acceptance with attribution; it cannot self-approve that acceptance. The Principal issues rulings/review findings and does not edit the queue concurrently, dispatch the Lead's workers or mediate routine worker messages. An unavailable Lead requires an explicit, recorded ownership transfer before another writer takes over.

Use native delegation to create or resume one Lead for authorized program execution, respecting the available tools' initiation requirements. The Lead delegates directly to engineer agents; engineers do not create more coordinator layers. Leave model selection to native defaults unless the user specifies assignments. Verify required source/worktree and artifact access before dispatch. If the topology or requested model is unavailable, disclose the limitation, recover existing work and continue useful nondependent work; do not substitute silently or manufacture a transport.

## Delegate milestones, not commands

Choose the next dependency-complete milestone as a coherent, reviewable outcome: for example, one installed consumer path exercising a real implementation. Keep tightly coupled changes with one implementor. The Lead may implement directly and use no engineers when that is simpler; available capacity is a ceiling, not a utilization target.

Give the Lead one concise handoff referencing:

- The selected work IDs/outcome, charter rulings and current source baseline, including relevant uncommitted bytes.
- Implementation ownership, excluded scope, required semantic acceptance and the existing evidence/queue locations.
- The decisions it may make independently and the specific conditions requiring escalation.

Delegate routine design choices, worker briefs, test registration, build commands, evidence collection and retries within those boundaries. None needs a separate Principal approval. The Lead reserves disjoint work through `work-charter`; the Principal does not recreate those reservations. Use native goal support only when authorized and available; otherwise use milestone prompts. Verify initial transport, recover surviving jobs and never replace an unfinished goal merely to send the next chunk.

The Principal can resolve upcoming architecture or review completed independent evidence while execution proceeds. Communicate meaningful findings, changed risks and milestone outcomes; do not busy-poll quiet workers or send ceremonial approvals. A user pause stops new dispatch, preserves checkpoints and returns control without treating the program as complete.

## Keep evidence proportional and decision-bearing

- Reuse the existing conformance, build and benchmark harnesses. Avoid bespoke scripts, targets and approval receipts per command when a reusable driver and milestone evidence bundle suffice.
- Bind evidence to actual relevant source, inputs, dependencies and artifacts. Reuse immutable snapshots/content hashes; unrelated workspace changes do not invalidate a result unless they affect its dependency closure. Preserve required dirty-file snapshots and reconcile real ownership collisions.
- Assign each check one execution owner. The Principal independently inspects the diff and evidence and investigates material gaps; it does not automatically duplicate the Lead's tests. Recheck affected behavior after changes, not the entire program by reflex.
- Before extended discrepancy research, establish matching inputs, dependency versions, API layers and trustworthy expectations. Distinguish reference compatibility, mathematical correctness and deterministic serialization. Preserve counterexamples; an inherited behavior is not automatically the desired contract. Escalate a needed semantic amendment instead of changing fixtures or tolerances to pass.
- Measure relevant performance early on comparable supported workloads, with provisional results and correctness differences explicit. Correctness gates promotion, not diagnostic measurement. Define coverage denominators and acceptance thresholds before claiming them met; revising an approved criterion requires an explicit ruling.
- Close answered questions. Do not widen a solved investigation, add speculative abstractions or commission duplicate reviewers for confidence by vote. Preserve all selected obligations and required security, safety and release checks.

Use one milestone bundle with the attributable diff/source identity, observed checks and semantic results, material limitations and next-ready work. Keep raw evidence with its existing owner. Distinguish source-ready, verified behavior, installed-product validation and release qualification; a worker success message, test count or build alone cannot substitute for the promised outcome.

## Accept, continue and recover

At a milestone boundary, the Principal reviews the actual outcome against its agreed contract. Focus independent review on consequential correctness, trust boundaries, regressions and unmet requirements. Return either acceptance or one consolidated, focused rework brief; do not prescribe every engineering step. The Lead records the decision in its queue and integrates the rework.

After acceptance, continue with the next ready milestone within existing authorization, without asking the user to reapprove routine transitions. Keep attributable accepted changes in reviewable chunks and commit when authorized; do not accumulate an avoidably untraceable dirty program. Overall completion requires the selected program's integration and acceptance, not merely the last worker's completion.

On interruption, reuse `work-charter` recovery and the artifact contract. Recover the same Lead, queue, jobs and saved results before new dispatch; send only changed context plus authoritative references. Report quota, transport and permission failures as execution limitations, not algorithmic failures. Never bypass a denial, discard partial work or mark an unfinished program complete to clear its goal.

## Invocation examples

- `/orchestrate-program Charter a native analysis engine.` — prepare the charter; no implementation dispatch.
- `/orchestrate-program Execute docs/research/example-charter.md, W0–W4.` — establish Principal/Lead responsibilities and execute only the authorized selection and necessary authorized prerequisites.
- `Resume the approved multi-workstream migration through its remaining milestones.` — natural selection when program context establishes the scope; recover rather than restart.
- `What is the program status?` or `Fix this typo.` — status/local workflow, without creating this topology.
