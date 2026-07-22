# Adversarial Review Rubric

Use the core gates for every selected recommendation. Use a triggered check only when its trigger is present in the selected recommendation, current caller graph, governing policy, or demonstrated failure.

## Core gates

### 1. Outcome, invariant, and owner

- Restate the user outcome and explicit non-goals.
- Re-derive the invariant and the current layer that should own it.
- Reject inherited framing when one shared owner can remove multiple symptoms.

### 2. Current evidence

- Verify load-bearing claims against current source, runtime evidence, active policy, or authoritative upstream behavior.
- Read current callers of the owner and siblings sharing the demonstrated failure mode.
- Treat research and tests as evidence, not automatic authority; either can be stale or encode a defect.

### 3. Ponytail selection

Apply the active Ponytail ladder after understanding the flow:

1. Does the recommendation need to exist?
2. Does current code, a standard, the platform, or an installed dependency already satisfy it?
3. What can be deleted or narrowed?
4. What is the minimum candidate that preserves the invariant?

### 4. Correctness floor

Reject any candidate that weakens trust-boundary validation, authorization, security/privacy, accessibility, explicit user requirements, data-loss prevention, or the minimum semantic proof.

### 5. Scope and materiality

A candidate finding enters the review only when all are true:

1. direct evidence or an exact unresolved experiment supports it;
2. it lies inside the selected recommendation's scope cone or correctness floor;
3. it changes the plan or prevents concrete harm;
4. Superplan cannot resolve it through ordinary implementation exploration without making a new design decision.

Group all qualifying counterexamples with the same owner and correction into one finding.

### 6. Stop

Stop when the minimum correct direction survives every triggered check and remaining plausible attacks cannot change the plan. Omit failed attacks and irrelevant dimensions.

## Scope cone

Review may expand only to:

- current callers of the changed owner;
- sibling callers sharing the same evidenced failure mode;
- active policies directly governing the selected behavior;
- companion research with a load-bearing contradiction;
- external evidence needed to choose the minimum architecture.

Repository size, generic production readiness, or the existence of another platform is not itself a trigger.

## Triggered checks

| Trigger                                                        | Check only these consequences                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stateful, concurrent, durable, or retrying behavior            | Cancellation, interleaving, idempotency, partial commit, recovery, stale state, resource lifetime, and data loss that can affect the selected invariant |
| Trust, auth, private data, billing, or destructive action      | Authorization, confinement, replay, privacy, abuse, auditability, and failure-safe defaults                                                             |
| User-visible UI or editor behavior                             | Keyboard/screen-reader access, stable identity, interaction states, responsive layout, and visual/runtime verification affected by the recommendation   |
| CAD, numerical, conversion, or grading behavior                | Exactness/tolerance, degenerate inputs, provider parity, geometry-only evidence, and required round trips                                               |
| External dependency, package, build, WASM, or release boundary | Authoritative upstream capability, licensing, ABI/API compatibility, generated artifacts, supported platforms, and rollback only when changed           |
| Agent, prompt, tool, memory, or context behavior               | Canonical schema, tool ambiguity, context cost, compaction, trust, provider parity, and weaker-model handoff only when architecture-changing            |
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

Architecture-changing uncertainty contains the exact evidence step and outcome-to-decision rule. A human choice is allowed only when evidence cannot decide an irreversible architecture-changing preference.

Everything else is omitted. A failed attack is worth one optional `Skipped` line only when it protects a tempting rejected direction and names a concrete revisit trigger.
