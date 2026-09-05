# Adversarial Review Rubric

Use the core gates for every selected recommendation. Derive the relevant scope before selecting triggered checks; the absence of a known failure does not make an affected path irrelevant.

## Core gates

### 1. Outcome, invariant, and owner

- Establish the outcome, invariants, explicit non-goals and governing rulings from the review brief.
- Trace the current layer that owns the invariant; challenge an inherited mechanism when one shared owner can remove multiple symptoms.
- Preserve settled objectives, accepted risks and revisit conditions while testing their factual premises. Use the skill's continuation rules before reopening a decision.

### 2. Current evidence

- Verify load-bearing claims against current source, runtime evidence, active policy, or authoritative upstream behavior.
- Inspect materially distinct affected callers/consumers and decision-bearing companions, including a path revealed by a changed shared contract before a failure is demonstrated.
- Treat research and tests as evidence, not automatic authority; either can be stale or encode a defect.
- Reuse prior results only while their question, premises, method and dependencies remain applicable. New counterevidence can invalidate unchanged source.

### 3. Ponytail selection

Apply the active Ponytail ladder after understanding the flow:

1. Does the recommendation need to exist?
2. Does current code, a standard, the platform, or an installed dependency already satisfy it?
3. What can be deleted or narrowed?
4. What is the minimum candidate that preserves the invariant?

### 4. Correctness floor

Reject any candidate that weakens trust-boundary validation, authorization, security/privacy, accessibility, explicit user requirements, data-loss prevention, or the minimum semantic proof.

### 5. Scope and materiality

A material issue has relevant evidence of a defect, contradiction or acceptance gap inside the selected scope, and changes necessity, ownership, behavior, dependency order, deletion or semantic acceptance—or prevents a concrete correctness-floor failure. An unresolved experiment is an evidence gap, not a confirmed defect. Group counterexamples with the same owner and correction.

Then classify its effect separately:

| Disposition                                                                         | Effect on readiness                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Selected-design contradiction or unresolved correctness-floor failure               | Block until the design is corrected or the concern disproved, even when an existing helper makes the fix straightforward |
| Material evidence/coverage gap                                                      | Block until the exact evidence step and decision rule resolve it                                                         |
| Correct behavior already required; only ordinary implementation exploration remains | Hand a concrete acceptance obligation to the planning/execution owner; no invented architectural blocker                 |
| Explicit accepted exception with applicable premises/bounds                         | Preserve it; reopen only under the continuation rules                                                                    |

The need for a new architecture decision is not a prerequisite for reporting a concrete defect. Conversely, ordinary implementation detail and speculative hardening do not become review findings merely because they can be described.

### 6. Stop

Before readiness, account for every relevant obligation with supported acceptance, a reported issue, an explicit evidence gap or a justified exclusion. Verify affected interactions as well as individual paths. Material issues/gaps prevent readiness; fix or resolve them and recheck their dependents. A no-findings result is valid when this coverage is supported.

Keep the coverage account in the source trace or existing artifact notes, proportional to the selected breadth. Preserve useful negative evidence and revisit conditions, without a universal failed-attack catalogue or N/A display. Stop answered branches; neither elapsed time nor another worker's inability to find more issues establishes completeness.

## Finite relevant scope

Derive the review obligations from:

- Every selected recommendation, load-bearing claim and governing invariant.
- Current affected owners and materially distinct consumers/execution paths.
- Introduced or changed transitions, failure conditions and interactions.
- Directly governing policies/dependencies and decision-bearing companion documents.

Expand when source inspection reveals another affected boundary. One caller represents others only with evidence of equivalent relevant behavior. Explicit future compatibility or difficult-to-reverse boundaries belong in scope when the operator makes them objectives. Generic production certification, unrelated dirty files and merely imaginable future platforms do not.

Record a concrete reason for a material exclusion. An arbitrary time/model/worker budget cannot shrink the operator's selected scope.

## Triggered checks

| Trigger                                                        | Check only these consequences                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stateful, concurrent, durable, or retrying behavior            | Cancellation, interleaving, idempotency, partial commit, recovery, stale state, resource lifetime, and data loss that can affect the selected invariant |
| Trust, auth, private data, billing, or destructive action      | Authorization, confinement, replay, privacy, abuse, auditability, and failure-safe defaults                                                             |
| User-visible UI or editor behavior                             | Keyboard/screen-reader access, stable identity, interaction states, responsive layout, and visual/runtime verification affected by the recommendation   |
| CAD, numerical, conversion, or grading behavior                | Exactness/tolerance, degenerate inputs, provider parity, geometry-only evidence, and required round trips                                               |
| External dependency, package, build, WASM, or release boundary | Authoritative upstream capability, licensing, ABI/API compatibility, generated artifacts, supported platforms, and rollback only when changed           |
| Agent, prompt, tool, memory, or context behavior               | Canonical schema, tool ambiguity, context sufficiency/cost, decision continuity, compaction, trust, and relevant host/model handoff behavior            |
| Measured hot path or explicit performance/cost claim           | A direct measurement and threshold capable of selecting a different design                                                                              |
| Durable data or current consumer migration                     | Compatibility and migration steps necessary to avoid corrupting or stranding current data/consumers                                                     |

Do not list untriggered rows as `NOT APPLICABLE`.

## Evidence order

Prefer the strongest evidence appropriate to the claim:

1. reproducible behavior or measurement;
2. current implementation and its real callers;
3. semantic tests that distinguish the dangerous false positive;
4. authoritative upstream source or standard;
5. active policy and research;
6. an explicit assumption with a decision-changing resolution step.

Gather safe in-scope evidence during review. Do not ask the user to guess an empirical answer.

## Evidence and test sufficiency

Require the smallest semantic check that fails when the selected invariant breaks. Add negative, fault, parity, round-trip, runtime, visual, or measured evidence only when the triggered boundary needs it. Proxies and self-fulfilling assertions are not evidence.

## Finding shape

One material finding contains:

- review-local `AR#` when apply selection is needed;
- the shared root cause and owner;
- direct evidence;
- concrete consequence;
- the smallest coherent blueprint revision.

Material uncertainty contains the exact evidence step and outcome-to-decision rule. Ask for a missing governing objective, invariant or material trade-off only when evidence cannot decide it. Explain the consequences and recommendation; do not ask the operator to establish technical facts or silently select missing intent because it is reversible.

Omit non-material observations from the verdict. A useful rejected direction may merit a short preserved-decision note with its revisit condition; retain substantive experiment results through the existing artifact owner.
