# Adversarial Review Examples

These synthetic examples calibrate report shape. They are not evaluation fixtures and use a notification-delivery domain distinct from the held-out corpus.

## Broad read-only review

### Input

```text
/adversarial-review @docs/research/synthetic-notification-blueprint.md R1-R5
```

### Condensed output

```text
Not ready for Superplan. The event-log direction survives, but delivery ownership needs correction, provider replay needs evidence, and one retention policy needs human confirmation.
NOT READY FOR R1-R5

## Review synthesis

Two related blockers have a clear architectural correction, one requires empirical evidence, one is a product-policy choice, and two attempted attacks were falsified. Keep the append-only event log and short fenced leases; neither requires action.

## Audit appendix

Ledger ARL-7d21c0b1, generation 1. The complete appendix contains document/source manifests, the claim ledger, AR1-AR6 fourteen-field records including two falsified attacks, R1-R5 coverage, stable Q1 mapping, revision map, and readiness checklist.

## Action required from you

One clear-cut correction, one evidence task, and one human choice remain.

P0 = critical premise/security/data loss · P1 = architecture/production/release blocker · P2 = material quality/operability/handoff defect · P3 = non-blocking improvement

### Clear-cut resolutions to sense-check

| Ref | Question and context | Architecturally correct resolution and basis |
| --- | --- | --- |
| AR1-P1, AR2-P1 | **Which component owns notification delivery state?** The blueprint lets both the API and worker mark delivery complete, so a timeout after provider acceptance can duplicate delivery or leave conflicting state. | Make the delivery-attempt record the sole state machine. The API appends intent; the worker alone owns provider calls and terminal transitions. Current retry call sites prove that split ownership is unsafe. |

### Evidence required, not human input

| Ref | Question and context | Evidence to gather | Decision rule |
| --- | --- | --- | --- |
| AR3-P1 | **Can the provider idempotency key safely cover disaster-recovery replay?** The blueprint assumes 30-day retention, but the checked-in adapter and cited contract do not establish it. | Verify the authoritative retention contract and replay a key older than the documented retry window. | Reuse the provider key only if retention exceeds the maximum replay window; otherwise require an internal durable delivery receipt. |

### Human input questions

Reply with `Q1 A`.

| Ref | Context and question | Options | Recommendation |
| --- | --- | --- | --- |
| Q1 · AR4-P2 | Delivery receipts must remain long enough for support and audit, but longer retention increases storage and privacy exposure. Architecture requires an explicit window but cannot determine the product promise. **Which default retention should the blueprint specify?** | **A. 90 days with export before expiry.** B. One year for every workspace. C. Retain indefinitely. | **A** — covers ordinary support investigations while bounding privacy and storage cost. |

### Next action

Reply `Q1 A` to resolve the remaining product choice. This response records the choice only; it does not change files. I will then return the exact eligible apply command.

No files were changed. No implementation or /superplan action was performed.
```

## Choice response

### Input

```text
Q1 A
```

### Condensed output

```text
Recorded Q1 = A: delivery receipts default to 90 days with export before expiry. No files were changed.

Apply the clear-cut ownership correction and resolved retention choice with the complete write set:

/adversarial-review apply ARL-7d21c0b1 @docs/research/synthetic-notification-blueprint.md AR1,AR2,AR4

AR3 remains mutation-ineligible until the provider replay evidence exists.
```

## Apply result

### Input

```text
/adversarial-review apply ARL-7d21c0b1 @docs/research/synthetic-notification-blueprint.md AR1,AR2,AR4
```

### Condensed output

```text
The delivery-ownership and retention corrections are applied coherently, but the blueprint is still not ready for Superplan until provider idempotency retention is verified.
NOT READY FOR R1-R5

## Changes made

- Made the delivery-attempt record the sole delivery state machine across architecture, R1/R2, migration, and fault tests.
- Set the selected 90-day receipt-retention policy consistently across lifecycle, privacy, and acceptance sections.
- Removed the stale API-owned sent flag and contradictory indefinite-retention text.

## Validation and rereview

- pnpm docs:validate — passed.
- R1-R5 rereview — AR1, AR2, and AR4 verified; AR3 remains open.

## Audit appendix

Changed path: docs/research/synthetic-notification-blueprint.md. Ledger ARL-7d21c0b1 generation 2 preserves every ID, Q1 = A, exact fingerprints, revision coverage, and the full readiness checklist.

## Action required from you

No human judgment is required. One empirical blocker remains.

P0 = critical premise/security/data loss · P1 = architecture/production/release blocker · P2 = material quality/operability/handoff defect · P3 = non-blocking improvement

### Evidence required, not human input

| Ref | Question and context | Evidence to gather | Decision rule |
| --- | --- | --- | --- |
| AR3-P1 | **Can the provider idempotency key safely cover disaster-recovery replay?** The architecture now depends only on the provider's actual retention guarantee. | Run the recorded provider replay experiment. | If retention exceeds the replay window, amend R3 with the proof; otherwise specify an internal durable receipt. |

### Next action

Run the provider replay experiment recorded under R3, then invoke:

/adversarial-review continuation ARL-7d21c0b1 @<current-transcript>.jsonl @docs/research/synthetic-notification-blueprint.md

No product implementation or /superplan action was performed.
```
