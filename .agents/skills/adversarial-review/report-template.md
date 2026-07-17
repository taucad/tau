# Adversarial Review Report Template

The response has a concise synthesis, a complete audit appendix, and a final semantic action endcap. The appendix preserves machine traceability without leaving the human at a wall of ledger data.

## Terminal no-work output

When preflight proves no selected work remains, emit exactly one token first:

- `NO IN-SCOPE WORK — IMPLEMENTED`
- `NO IN-SCOPE WORK — SUPERSEDED`

Then give only the direct source evidence and, for supersession, the canonical successor. Stop. Do not emit readiness, an action endcap, commands, or an appendix.

## Review output order

### 1. Outcome

Start with a plain-language readiness outcome and the formal verdict:

```text
Not ready for Superplan. The core direction survives, but two architecture decisions and one evidence gap still block implementation planning.
NOT READY FOR R1-R12
```

For a whole active document use `ALL UNIMPLEMENTED RECOMMENDATIONS`. Do not lead with ledger IDs, fingerprints, counts, or a blocker list.

### 2. Review synthesis

State how many root-cause rows are `CLEAR_CUT`, `EVIDENCE_REQUIRED`, `HUMAN_CHOICE`, and `NO_ACTION`. Summarize the architectural direction and the strongest validated directions in plain language. Do not duplicate the action tables here.

### 3. Audit appendix

Use the exact appendix below. It may be dense because it is for traceability and continuation, but it remains complete.

### 4. Action required from you

This is the final section. Open with a one-sentence count summary and this compact legend:

- `P0`: critical premise, security, data-loss, or destructive-scope failure;
- `P1`: architecture, production, or release blocker;
- `P2`: material quality, operability, evidence, or handoff defect;
- `P3`: non-blocking improvement.

Order rows by architecture dependency, severity, confidence, then stable ID. The first column is a narrow reference anchor; the adjacent columns carry the meaning.

#### Clear-cut resolutions to sense-check

| Ref    | Question and context                                           | Architecturally correct resolution and basis               |
| ------ | -------------------------------------------------------------- | ---------------------------------------------------------- |
| AR1-P1 | Human-readable architectural question, defect, and consequence | Complete correction and why current evidence determines it |

Use `AR#-P#` for every member. A combined row lists all members, such as `AR3-P1, AR7-P2`; never collapse mixed severity. An identifier and resolution without the motivating question and context is invalid.

#### Evidence required, not human input

| Ref    | Question and context                                      | Evidence to gather                     | Decision rule                     |
| ------ | --------------------------------------------------------- | -------------------------------------- | --------------------------------- |
| AR2-P1 | Empirical uncertainty and why it changes the architecture | Exact experiment, command, or artifact | What each possible result selects |

Do not ask the user to guess an empirical answer. If safe in-scope evidence could have been gathered during review, gather it instead of listing it here.

#### Human input questions

Start with a copyable response such as `Q1 A, Q2 B, Q3 A`.

| Ref                  | Context and question                                                                                                      | Options                                 | Recommendation                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------- |
| Q1 · AR6-P1, AR10-P2 | Current behavior, evidence-determined constraints, practical consequence, remaining preference, and the explicit question | Two or three mutually exclusive choices | Recommended option with rationale |

List every related `AR#-P#`; do not invent aggregate `Q#` severity. Context must make the question answerable without the appendix. Include every independent question in one response without a count limit, batching, queue, or omission. Preserve `Q#` across ledger generations and never reuse resolved numbers.

#### Next action

- With open human choices, make the copyable `Q#` response the exact next action. Explain that it resolves choices but never mutates files; after the response, confirm it and give the exact eligible `apply` invocation and complete write set.
- With no human choices, say `No human judgment is required.` and give the exact apply, evidence, rereview, or `/superplan` command.
- Never put a mutation-ineligible ID in an apply command. Recommend one default when more than one safe path exists.
- End review mode with `No files were changed. No implementation or /superplan action was performed.`

## Apply output order

Apply responses use the same final-endcap shape:

1. **Outcome:** readiness after mutation, including any drift/no-write outcome.
2. **Changes made:** semantic design changes grouped by document, not a list of lifecycle codes.
3. **Validation and rereview:** commands run, result, and what was rechecked.
4. **Audit appendix:** changed paths, generations, hashes, per-ID lifecycle, and full traceability.
5. **Action required from you:** remaining clear-cut work, evidence, and human choices using the same prioritized reference tables, followed by the exact next action. Do not offer a stale apply command after drift.

The durable research prose must read as if it had always contained the corrected architecture. An append-only review section, stale contradictory text, or ledger jargon in the document is an apply failure.

## Audit appendix contract

### A. Ledger, scope, and document manifest

Include:

- ledger `ARL-<UUID>` and fingerprint generation;
- canonical path, selector, intended downstream action, and optional parent ledger;
- every selected recommendation and excluded item marked `OUT_OF_SCOPE` with reason;
- document read-set paths and SHA-256 fingerprints;
- review write set, always empty in review mode, or exact explicit write set in apply mode.

### B. Source manifest

List source, policies, companion research, upstream sources, experiments, and commands. For repositories record revision plus relevant dirty-diff fingerprint. Name inaccessible evidence explicitly.

### C. Claim ledger

| Claim          | Classification                                            | Evidence      | Consequence                        |
| -------------- | --------------------------------------------------------- | ------------- | ---------------------------------- |
| Material claim | VERIFIED / CONTRADICTED / STALE / ASSUMPTION / UNRESOLVED | Direct source | Impact on recommendation/readiness |

Every load-bearing unresolved claim requires a concrete resolution step.

### D. Atomic findings and failed attacks

Retain all records, including `FALSIFIED` attacks. Every record contains all fourteen fields:

| Field                | Required content                                                              |
| -------------------- | ----------------------------------------------------------------------------- |
| Ledger               | Stable `ARL-<UUID>` namespace.                                                |
| ID                   | `AR1`, `AR2`, … unique inside the ledger.                                     |
| Severity             | P0, P1, P2, or P3.                                                            |
| Confidence           | High, Medium, or Low.                                                         |
| Evidence disposition | CONFIRMED, NEEDS_EVIDENCE, or FALSIFIED.                                      |
| User disposition     | PENDING, ACCEPTED, or DECLINED.                                               |
| Resolution           | OPEN, APPLIED, VERIFIED, or TOMBSTONED.                                       |
| Lineage              | Optional `derived_from` or `duplicate_of`.                                    |
| Lens and scope       | Rubric lens/module plus affected recommendation/section.                      |
| Evidence             | File/line, runtime result, test, standard, or upstream source.                |
| Attack               | Counterexample, failed condition, contradiction, or invalid premise.          |
| Consequence          | What breaks or stays ambiguous.                                               |
| Required revision    | Exact research-document amendment, never product implementation.              |
| Superplan impact     | Changed/missing todo, order, deletion, test, migration, or acceptance detail. |

### E. Recommendation coverage

Map every recommendation exactly once:

| Recommendation | Disposition                                  | Evidence       | Blocking IDs / reason      |
| -------------- | -------------------------------------------- | -------------- | -------------------------- |
| R1             | PASS / AMEND / REPLACE / DROP / OUT_OF_SCOPE | Direct support | Qualified AR IDs or reason |

`PASS` means the direction survived its attacks; it is not permission to plan around unresolved cross-cutting blockers.

### F. Contradictions, assumptions, and questions

Separate technical contradictions resolved by evidence, assumptions with empirical resolution steps, and irreducible product/commercial/value choices with evidence plus a recommended default. Do not ask the user to decide an empirical question. For every human choice, retain stable `Q#`, open/resolved state, related `AR#-P#`, complete options, recommendation, and any selected answer.

### G. Revision map

For every confirmed finding, name the exact target path, canonical section, amendment, and whether it is inside the current write set. Related documents stay read-only unless explicitly named in apply.

### H. Readiness checklist

`READY` requires affirmative evidence for every applicable item:

- coherent eigenquestion and every in-scope invariant;
- every architecture-changing experiment already run;
- deferred validation cannot change architecture, owner, API, dependency, or sequence;
- no open confirmed P0/P1 or load-bearing P2/`NEEDS_EVIDENCE` item;
- every recommendation has one evidence-backed disposition;
- concrete files/symbols, owners, dependencies, and ordering;
- semantic tests, fixtures, experiments, and acceptance criteria;
- complete migrations, compatibility decision, cleanup, and explicit deletions;
- production, platform, security, performance, observability, and cost addressed or evidenced N/A;
- no load-bearing cross-document contradiction;
- no unresolved technical decision delegated to the implementer;
- product/value questions resolved, non-load-bearing, or user-approved;
- coherent frontmatter, numbering, references, and `pnpm docs:validate`.

The final action endcap, not the appendix, owns the stop statement. Apply mode names exact changed paths and ends with `No product implementation or /superplan action was performed.`
