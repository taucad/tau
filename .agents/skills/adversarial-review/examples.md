# Adversarial Review Example

This synthetic notification-delivery example calibrates concise output and explicit amendment selection. The boundary cases below exercise coverage, continuity and authority without a separate report protocol.

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

Scope: inspected the API, worker, delivery-attempt owner and each distinct provider path. Their shared terminal transition remains unsafe. The selected requirements do not alter deployment or retention.

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

The reviewed blueprint and source are unchanged; no artifacts were saved.
```

## Why this is the target behavior

- The real correctness defect blocks readiness.
- Ponytail deletes two speculative abstractions instead of designing them more completely.
- One shared owner groups the race symptoms under one amendment.
- Unrelated production dimensions fail the scope and materiality gates.
- An ordinary reversible detail consistent with intent takes the existing default without a question; a missing product objective would still need resolution.
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

Apply changes only the named research document and the coherent revisions selected by `AR1` and `AR2`. Material drift leaves the affected stale amendment unapplied and returns its refreshed correction; valid unrelated evidence remains reusable.

## Continuation and boundary cases

These are synthetic behavioral probes, not claims that a native host has passed them. Use concrete source/decision inputs and inspect the actual verdict, evidence and writes. Keep expected outcomes outside a subject reviewer's input when evaluating a skill revision.

| Input and evidence                                                                                                                    | Required behavior                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh focused proposal with current intent/source and no prior charter or transcript                                                  | Review from the current problem; do not require historical evidence                                                                                              |
| Selected shared-contract change reaches several distinct consumers; a governing companion contradicts one recommendation              | Inspect all relevant paths and resolve/report the contradiction before readiness; one passing caller cannot represent distinct behavior                          |
| Operator rejected provider-specific queues; all providers still use the shared semantics                                              | Carry the ruling and rationale forward without asking the preference again                                                                                       |
| A new provider demonstrably requires different retry semantics, reaching that ruling's stated revisit condition                       | Name the changed premise and consequence; reopen only the affected conclusion/dependencies, not unrelated operator choices                                       |
| Operator rejects a proposed coordinator, but its investigation also found an independent terminal-write race                          | Drop the rejected mechanism while retaining the independently evidenced race                                                                                     |
| Blueprint omits required private-field redaction; an existing helper supplies the correction                                          | Report the privacy defect and block readiness until the design is correct; “no new architecture needed” does not suppress it                                     |
| Blueprint already requires redaction at the correct owner; implementation must select ordinary helper arguments                       | Hand off a concrete semantic acceptance obligation without inventing an architectural choice                                                                     |
| Same selected question, source/premises and valid prior experiment                                                                    | Reuse the supported disposition after checking applicability; no extra attacks or rerun just to fill a fresh answer                                              |
| Owner bytes are unchanged, but a newly discovered consumer invalidates the earlier experiment's assumptions                           | Inspect that consumer and affected shared invariants; a file hash is insufficient proof                                                                          |
| Delegated question depends on a governing ruling omitted from the brief                                                               | Recover the ruling from the cited owner or report a specific evidence gap before judgment; clean-slate does not mean context-free                                |
| Selection includes directly evidenced implemented/superseded items and a still-active recommendation                                  | Preserve the former dispositions and review the active remainder; do not stop the whole mixed selection                                                          |
| Current correction authorization cites an ambiguous/stale amendment or omits a companion needed for coherence                         | Recover or re-review the affected correction and resolve its missing authority before writing; never infer an omitted target or replay all unrelated review work |
| Reviewer has read-only subject access and current context names a parent-saved evidence artifact, including on an unchanged follow-up | Cite that saved artifact and distinguish unchanged subjects and no new writes this turn from prior evidence persistence                                          |

## Plain-language authorization and output

```text
Review R1–R3 in @docs/research/synthetic-notification-blueprint.md and apply every confirmed correction to that document now. Give me a plain-language result.
```

This explicitly names the correction scope and write target and authorizes acting now. Review, establish coherent current corrections, apply them and validate without requiring an `apply` command or AR-numbered presentation. A direction to “show proposed refinements before changing anything” instead keeps the same work read-only. Reading a companion never authorizes its mutation.

An appropriate final result after permitted artifact saving is:

```text
The selected design is ready for planning. The worker remains the sole terminal-state owner; its acceptance check must demonstrate that an ambiguous provider timeout cannot produce conflicting terminal writes.

The blueprint is unchanged. Saved the reviewed evidence and preserved retry-policy ruling under the notification research artifacts.

Next action: /superplan @docs/research/synthetic-notification-blueprint.md R2
```

## Comparing revisions

Use the same frozen case inputs and subject model/harness for old and revised instructions. Exercise initial review, unchanged follow-up and changed-scope follow-up separately. Check known material defects, preserved rulings, coverage gaps and actual writes before comparing time, repeated reads/experiments or operator interventions. Observe source access and results rather than accepting a claim of completeness.

Record available host/model/version, source/instruction identity, input/output volume, first useful finding and complete-verdict times. Label unavailable metrics and distinguish runtime/tool failures or human waiting from reasoning time. A faster run that misses a relevant material defect fails; a small passing probe set does not establish universal recall or a latency improvement. Repeat only when variability or a specific changed concern requires it. Use the existing research artifacts, not new evaluator infrastructure.
