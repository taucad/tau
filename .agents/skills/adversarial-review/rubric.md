# Adversarial Review Rubric

Apply every mandatory lens. Apply each conditional module when triggered; otherwise record `NOT APPLICABLE` and why. A review is incomplete when a lens or triggered module is silently omitted.

## Mandatory lenses

| ID  | Lens                                       | Required attacks                                                                                                                                           |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Purpose, authority, and eigenquestion      | Re-derive outcome, invariant, and owner; challenge inherited framing; identify policy or current-intent conflicts.                                         |
| L2  | Evidence and currency                      | Verify material current-state claims; locate stale/tentative claims; require source, experiment, upstream evidence, or a concrete validation step.         |
| L3  | Architecture and source of truth           | Trace ownership, boundaries, data flow, lifecycle, public API, persistence, and duplicated authority.                                                      |
| L4  | Counterexamples and failure states         | Probe concurrency, cancellation, retries, idempotency, partial failure, recovery, stale data, abuse, trust boundaries, and resource exhaustion.            |
| L5  | Completeness and traceability              | Inventory sibling surfaces and consumers; map findings to recommendations, files/symbols, dependencies, tests, cleanup, migrations, and acceptance.        |
| L6  | Reuse, simplification, scope, and deletion | Check native facilities, standards, generators, and existing patterns; reject reinvention and correctness-reducing shortcuts; preserve explicit deferrals. |
| L7  | Testing and verification                   | Demand semantic, negative, fault, parity, round-trip, runtime, visual, and measured evidence where applicable; reject proxies and self-fulfilling tests.   |
| L8  | Production readiness                       | Evaluate observability, rollout/rollback, compatibility, platforms, performance, memory, storage/cost, security/privacy, and operational lifecycle.        |
| L9  | Consumer and Superplan determinism         | Model user/API/LLM ergonomics; ensure a weaker implementer can execute every in-scope recommendation without reconstructing decisions.                     |

## Human synthesis quality

The final action endcap is part of correctness, not optional formatting. Require all of the following:

- group atomic findings by the smallest root cause while retaining every independent ledger record;
- classify each row exactly once as `CLEAR_CUT`, `EVIDENCE_REQUIRED`, `HUMAN_CHOICE`, or `NO_ACTION`;
- reserve `HUMAN_CHOICE` for product, commercial, policy, or value judgments that evidence cannot decide;
- render every atomic reference with its authoritative priority as `AR#-P#`; list every member of mixed-priority rows;
- pair every clear-cut reference with the question, concrete defect and consequence, correction, and strongest basis so the human can sense-check it;
- pair every evidence reference with the uncertainty, exact evidence task, and decision rule; never delegate an empirical answer to the user;
- give each human choice a stable `Q#`, every related `AR#-P#`, self-contained context, two or three mutually exclusive options, and a recommended default with rationale;
- include all independent human questions in one response without a count limit, batching, queue, or omission;
- order prerequisites before dependent work, then severity, confidence, and stable ID;
- preserve validated directions as explicit `NO_ACTION` results and retain their `FALSIFIED` records in the appendix;
- give an exact copyable next response or invocation with eligible IDs and the complete write set;
- place the complete audit appendix before the final action endcap so the human finishes on an executable interface.

A short report that omits a blocker or question is incorrect. A complete report that exposes IDs without semantic context or asks the human to join audit tables before acting is also incorrect.

## Conditional modules

| Module                       | Trigger                                     | Additional attacks                                                                                                                |
| ---------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| UI/UX/accessibility          | User-visible or editor behavior             | Interaction states, keyboard/screen-reader behavior, responsive layout, flicker/stable identity, visual and runtime verification. |
| CAD/numerical                | Geometry, kernels, conversion, grading      | Tolerances, exactness, provider parity, geometry-only evidence, round trips, scale, degeneracy.                                   |
| AI/agent/context             | Prompts, tools, memory, model routing       | Tool ambiguity, canonical schemas, context cost, compaction, trust, provider parity, weaker-model handoff.                        |
| Dependency/build/release     | Upstream source, WASM, packages, deployment | Licensing, generated artifacts, ABI/API compatibility, platform builds, versioning, rollback.                                     |
| Billing/security/legal/abuse | Money, auth, sharing, private assets        | Authorization, replay/idempotency, privacy, fraud/abuse, regional/legal constraints, reconciliation.                              |
| Commercial/strategy          | Market, moat, pricing, data, partnerships   | Falsifiable demand, defensibility, adoption friction, monetization, dependency power, strategic forks.                            |

## Finding taxonomy

### Severity

| Value | Meaning                                                              |
| ----- | -------------------------------------------------------------------- |
| P0    | Critical premise, security, data-loss, or destructive-scope failure. |
| P1    | Architecture, production, or release blocker.                        |
| P2    | Material quality, operability, evidence, or handoff defect.          |
| P3    | Non-blocking improvement.                                            |

### Evidence disposition

| Value          | Meaning                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| CONFIRMED      | Available evidence directly supports the attack.                        |
| NEEDS_EVIDENCE | Material attack remains unresolved and has an explicit resolution path. |
| FALSIFIED      | Evidence defeated the attack; retain it to prevent resurrection.        |

### User disposition

`PENDING`, `ACCEPTED`, or `DECLINED` records user authority separately from factual evidence.

### Resolution

`OPEN`, `APPLIED`, `VERIFIED`, or `TOMBSTONED` records lifecycle separately from evidence and user choice.

### Confidence

Use `High`, `Medium`, or `Low` based on directness, reproducibility, authority, and currency of evidence. Confidence never substitutes for an evidence disposition.

### Human action class

| Value             | Meaning                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| CLEAR_CUT         | Evidence determines the coherent blueprint correction; explicit apply still gates writes. |
| EVIDENCE_REQUIRED | An unresolved measurement or experiment has an exact decision rule.                       |
| HUMAN_CHOICE      | An irreducible product, commercial, policy, or value preference remains.                  |
| NO_ACTION         | The attacked direction survived or otherwise requires no human action.                    |

This is a derived presentation class. It never replaces severity, evidence disposition, user disposition, resolution, or confidence in the atomic ledger.

## Required attack patterns

For each in-scope surface, challenge both overengineering and underengineering:

- wrong eigenquestion or ownership layer;
- duplicated source of truth or lifecycle authority;
- wrapper/proxy/sidecar that masks a source defect;
- speculative abstraction or compatibility path without a real consumer;
- unproved claim that a native facility cannot meet the invariant;
- unproved reuse that merely moves the defect;
- missing sibling call sites, states, layers, platforms, documents, migrations, or cleanup;
- convenient proxy evidence standing in for the semantic contract;
- correctness without performance, security, cost, platform, or operational proof;
- ambiguous public paths or tool choices that force user/agent rediscovery;
- deferred in-scope production work disguised as a follow-up;
- scope expansion that violates explicit non-goals.

## Rationalization inoculation

These claims require evidence, not acceptance at face value:

- “The repository is too large, so sample only high-risk files.”
- “The current test passes, therefore the contract is correct.”
- “This proxy is easier for the model to assert.”
- “A compatibility path is safer than deleting superseded behavior.”
- “This wrapper avoids touching the architecture.”
- “The blueprint says it exists, so current source need not be checked.”
- “Correct output means performance can be deferred.”
- “Production hardening can be a later follow-up.”
- “The native capability probably cannot support this.”
- “The user should decide” when source, measurement, or standards can decide.

Each may be true in a specific case only after supporting evidence is recorded.

## Evidence quality

Prefer, in order appropriate to the claim:

1. reproducible runtime behavior or measurement;
2. current implementation and complete call-site/source-of-truth trace;
3. semantic tests that distinguish tempting false positives;
4. authoritative upstream source or standard;
5. official documentation;
6. active research and policy;
7. explicit, labeled assumption with a resolution step.

Do not treat stale comments, old assistant prose, passing proxy tests, or blueprint assertions as current-state proof.

## Failed attacks

A failed attack is a valid result when it names the attempted falsification, the evidence that defeated it, and the recommendation/lens it protects. Retain it as `FALSIFIED` so continuation and later reviews do not present it as a new defect.
