# Adversarial Review Example

This single synthetic notification-delivery example calibrates scope, materiality, Ponytail selection, correctness, and explicit apply.

## Input

```text
/adversarial-review @docs/research/synthetic-notification-blueprint.md R1-R3
```

The synthetic blueprint proposes:

- R1: add a `DeliveryCoordinator` beside the existing delivery-attempt record;
- R2: let both the API and worker mark delivery terminal after provider acceptance;
- R3: add per-provider retry queues and configuration before any provider needs distinct behavior.

Current-source evidence shows:

- the delivery-attempt record already owns intent, retry state, and terminal status;
- the API and worker can race terminal writes after an ambiguous provider timeout;
- every current provider uses the same retry policy;
- the selected recommendations do not change regions, dashboards, retention policy, or deployment topology.

## Review output

```text
Not ready for Superplan. The proposed design duplicates the existing delivery authority, splits terminal ownership, and adds a retry layer with no current consumer.
NOT READY FOR R1-R3

## Material findings

### AR1: The proposed coordinator duplicates delivery authority and leaves two terminal-state owners

Evidence: the delivery-attempt record already owns coordination, while R1 adds a second coordinator and R2 lets both the API and worker update terminal state after provider acceptance. A timeout can let one retry while the other records success.

Smallest correct revision: drop R1 and keep the delivery-attempt record as the sole state machine. The API appends intent; only the worker calls providers and writes terminal state. Amend R2 and delete the second-owner path.

### AR2: Provider-specific retry infrastructure has no consumer

Evidence: every current provider uses the same retry policy and no selected requirement needs provider-specific behavior.

Smallest correct revision: drop R3 and keep the existing shared retry path. Revisit only when a real provider requires different semantics.

## Preserved direction

- Keep the existing retry default. Naming and tuning remain reversible and do not block planning.

Skipped: multi-region replication, dashboards, retention, and deployment rollback do not enter the selected recommendations or current failure. Revisit only if a later recommendation changes those boundaries.

## Next action

/adversarial-review apply @docs/research/synthetic-notification-blueprint.md AR1,AR2

No files were changed.
```

## Why this is the target behavior

- The real correctness defect blocks readiness.
- Ponytail deletes two speculative abstractions instead of designing them more completely.
- One shared owner groups the race symptoms under one amendment.
- Unrelated production dimensions fail the scope and materiality gates.
- A reversible preference takes the existing default without a question.
- The output contains no ledger, hashes, failed-attack catalogue, N/A table, or audit appendix.

## Apply input

```text
/adversarial-review apply @docs/research/synthetic-notification-blueprint.md AR1,AR2
```

## Apply output

```text
Updated the notification blueprint so the delivery-attempt record is the sole state machine and the worker is the sole provider/terminal-state owner. Removed the proposed coordinator, provider-specific retry layer, and contradictory API terminal-write path.

Validation: pnpm docs:validate passed. R2 and the shared delivery-ownership invariant were rereviewed; no unrelated production audit was repeated.

READY FOR R1-R3

Next action:
/superplan @docs/research/synthetic-notification-blueprint.md R1-R3

No product implementation or Superplan action was performed.
```

Apply changes only the named research document and the coherent revisions selected by `AR1` and `AR2`. If source or document drift changes either revision, it writes nothing and returns a fresh concise review instead.
