# Layout apply: the arrangement record on Dockview

`LayoutApply.tla` models how the workbench arrangement record is applied to the two Dockview adapters. It is the spec for `workbench-layout.machine` (package A8a of the app state orchestration charter, decision D13, invariants I10 to I14, and the D18 claim about identical bytes). It lands before that machine, under formal verification policy rule 1.

The question it answers: with record publications, a person rearranging panes, pane intents, restore commands and Dockview mounting and unmounting, is the person's arrangement ever reverted, an intent ever lost or applied twice, a stale restore ever applied, or a revision acknowledged before it is on screen?

## Parties and abstraction

| Party       | State in the model                                                                                                                                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record      | The latest publication from `recordSync`: its bytes, its attributed origin (own or foreign), whether an edit was counted since it arrived (`fresh`) and whether its apply is done. Any bytes with any origin, so a misattributed echo of the store's own write is one of them. The applied revision is Unknown, `latest` or `older` |
| Arrangement | `shown`, one opaque value: what the attached adapters show. The edit count is kept through its comparisons (`fresh` on the record and on the apply in flight) and a ghost `edited` for the step that counts one. `sessions.writing`: a local edit is not yet written to the record                                                  |
| Adapters    | Workbench and viewer, each `detached`, `attaching` or `attached`, and the workbench lane (`wbOpen`). A phone has the viewer only                                                                                                                                                                                                    |
| Intents     | Per id: `unsent`, `queued` for a target adapter, then `applied` or dropped with `routeChanged`, `workbenchClosed` or `unavailable`                                                                                                                                                                                                  |
| Restore     | Commands `{id, expected, to}` from the arrange-workbench card, any number of them, with any expected arrangement (a repeated command is one whose arrangement moved); per id `applied` or `refused`                                                                                                                                 |
| Session     | Today only: stores started and not disposed, and disposed stores whose write is in flight                                                                                                                                                                                                                                           |

Actions: `Published`, `PersonEdited`, `ApplyComputed`, `ApplyLanded`, `ApplyDiscarded`, `Acknowledged`, `AdapterAttaching`, `AdapterAttached`, `AdapterDetached`, `IntentSent`, `IntentApplied`, `IntentDropped` (`DropUnavailable`, `DropClosed`), `RouteKeyChanged`, `WorkbenchClosed`, `RestoreAsked`, `RestoreSettled`, `EditWritten`, and in `today` configurations only `HostRemounted`, `OldStoreDisposed` and `OrphanWriteLanded`.

The model is untimed and its state is kept small on purpose. Only comparisons of the edit count and of revisions are observable, so the model keeps those comparisons instead of the numbers. `View` drops the ghosts and forgets how a settled apply, intent or restore ended, which no action reads. `Symmetry` permutes the arrangements, which actions and properties only compare for equality. Neither is used by the liveness configuration.

## Properties

| Property                    | Invariant               | Statement                                                                                                                                                      | Form                                                   |
| --------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `PersonEditNotReverted`     | I10                     | `ApplyLanded` never happens for an apply computed at an edit count lower than the current one                                                                  | action property: a landing apply is `fresh`            |
| `UnwrittenEditKept`         | I10 (A0.3 host I10 row) | While a local edit is unwritten, no apply lands that changes the arrangement, including one computed at the current edit count from a foreign publication      | action property                                        |
| `IntentAccounted`           | I11                     | Every intent id is `applied` at most once, and leaves `queued` only by `IntentApplied` or by `IntentDropped` with a reason                                     | action property; a settled intent also stays settled   |
| `RouteChangeDrops`          | I11                     | After `RouteKeyChanged`, every intent queued before it is `dropped{routeChanged}`                                                                              | action property on the step that changes the route key |
| `AckMeansApplied`           | I12                     | `Acknowledged(r)` only when an adapter is attached and the arrangement reflects `r`                                                                            | action property                                        |
| `UnknownWhileDetached`      | I12                     | While no adapter is attached, the applied revision is `unknown`                                                                                                | invariant                                              |
| `SingleSession`             | I13                     | The number of record sessions for a file is at most one                                                                                                        | invariant                                              |
| `StaleRestoreRefused`       | I14                     | `RestoreSettled(id, applied)` only if the arrangement equals the command's `expected` at that step; otherwise it is `refused` and the arrangement is unchanged | action property                                        |
| `IdenticalBytesHarmless`    | D18                     | A publication with the wrong `origin` and bytes equal to the current arrangement changes neither the arrangement nor the edit count                            | action property, checked for either origin             |
| `IntentEventuallyAccounted` | I11                     | Under weak fairness of the adapter, every intent becomes `applied` or `dropped` once an adapter stays attached and the route key stops changing                | liveness; quiescence predicate `IntentsSettled`        |

How three statements are read:

- **"Computed at an edit count."** An apply carries the edit count at which its publication arrived (rule 2). "Lower than the current one" means an edit was counted since: the apply is not `fresh`.
- **"Bytes equal to the current arrangement."** Current when the publication arrives (the ghost `same`). The property covers the step it arrives in and the step an apply of it lands in. It is checked for both origins, so for the wrong one.
- **"Once an adapter stays attached."** The intent's own adapter, or, for a workbench intent, a closed workbench lane (`CanSettle`). The route key changes at most `MaxRoutes` times, so it always stops changing.

## Rules for A8a (`workbench-layout.machine`)

The target passes only because it keeps these rules. The machine must keep each one; `no-edit-count`, `no-unwritten` and `no-expected` show that rules 2, 8 and 5 are necessary.

1. Every local change of the arrangement counts one edit: a person's edit, an applied intent and an applied restore.
2. An apply carries the edit count at the step its publication arrived, not at the step it is computed. It lands only while its publication is still the latest and the count is unchanged; otherwise it is discarded. A newer publication supersedes an apply in flight.
3. An own publication is never applied. It may be acknowledged when the arrangement holds its bytes.
4. A revision is acknowledged only while an adapter is attached, no apply is in flight and the arrangement holds its bytes. Any detach makes the applied revision unknown. When the last adapter detaches, an apply in flight is dropped and the latest publication's apply is computed again on the next attach.
5. A restore is a command `{id, expected}` that may repeat. It is settled against the arrangement at the step it settles: applied only if the arrangement equals `expected`, otherwise refused with nothing changed.
6. A route key change drops every queued intent with `routeChanged`, in the same step.
7. A workbench intent while the workbench lane is closed, or on a device with no workbench adapter, is dropped with `workbenchClosed`. Closing the lane drops the queued workbench intents the same way. An intent whose target does not open is dropped with `unavailable`.
8. While a local edit is unwritten, no apply lands: a publication that arrives then does not hold the edit, whatever edit count it arrived at. In the machine this means the apply is computed from the intended layout (the person's edit rebased on the publication), never from the publication's bytes alone.
9. The record session is a runtime child that outlives any mount: no mount count, no second store for the file (I13).

## Configurations

| Configuration          | Tier    | Expect                                 | Bounds                                                                                                                                                                                    |
| ---------------------- | ------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target`               | pr      | pass                                   | Both adapters, 2 publications, 2 person edits, 2 intents, 1 restore command, 1 attach cycle per adapter, 1 route key change                                                               |
| `target-detached`      | pr      | pass                                   | Both adapters, 2 publications, 1 person edit, 2 intents, 2 attach cycles per adapter, 1 route key change. Publications and intents arrive with no adapter attached, then one attaches     |
| `target-phone`         | pr      | pass                                   | The viewer adapter only, 3 publications, 2 person edits, 2 intents, 2 restore commands, 2 attach cycles, 1 route key change. Workbench intents settle as `workbenchClosed`                |
| `liveness`             | pr      | pass                                   | `IntentEventuallyAccounted` under `LiveSpec`: both adapters, 1 publication, 2 intents, 2 attach cycles per adapter, 1 route key change                                                    |
| `today-store-replaced` | pr      | `SingleSession` (defect, fixed by A8b) | Today: 1 publication, 1 person edit, 1 attach cycle, 1 host remount                                                                                                                       |
| `no-edit-count`        | pr      | `PersonEditNotReverted` (limit)        | 1 publication, 1 person edit, 1 attach cycle                                                                                                                                              |
| `no-unwritten`         | pr      | `UnwrittenEditKept` (limit)            | 1 publication, 1 person edit, 1 attach cycle                                                                                                                                              |
| `no-expected`          | pr      | `StaleRestoreRefused` (limit)          | 1 person edit, 2 restore commands, 1 attach cycle, 3 arrangements                                                                                                                         |
| `wide`                 | nightly | pass                                   | Both adapters, 3 publications, 2 person edits, 2 intents, 2 restore commands, 1 attach cycle per adapter, 1 route key change (about 5 million distinct states, about 250 s on four cores) |
| `export`               | pr      | pass                                   | The labelled graph export: viewer only, 1 publication, 1 person edit, 1 intent, 1 attach cycle, 1 route key change                                                                        |

Every other configuration uses two arrangements.

**Bounds.** The formal plan asked for `target` at 3 publications, 2 person edits, 2 intents, 2 restore commands and 2 attach cycles, and `wide` at 4, 3, 3, 3 and 3 with both adapters. Neither fits. Most of the state space is the product of independent parties (record, intents, restores, two adapters and their counters), and the runner gives TLC a 1 GB heap that also holds its in-memory queue; an earlier, wider encoding of this model ran out of memory at about 4 million distinct states. `target` is narrowed to fit the merge queue. The stated `target` bounds are split across `target` (both adapters) and `target-phone` (one adapter, all the stated bounds), and `wide` holds the widest bounds that fit the nightly watchdog and heap: the stated `target` bounds on both adapters with one attach cycle per adapter. With two attach cycles per adapter the run does not finish within the 900 s nightly watchdog.

## Verdicts

- **All target configurations pass.** That includes `IdenticalBytesHarmless`: given rules 2, 3 and 8, an apply is a function of a publication's bytes and the edit count, never of its origin, so a misattributed publication of the arrangement's own bytes changes nothing. The `RecordSync` target-rule-1 tightening is therefore not a dependency of A8b on this model's evidence.
- **`today-store-replaced` fails `SingleSession`, a defect (inventory Y3), fixed by A8b.** `workbench-record-host.tsx` creates the layout store in `useMemo`, and `createWorkbenchLayoutStore` starts its `recordSync` actor at once. A remounted host therefore runs a second store from its render until the old one is disposed in the microtask after the effect cleanup (`storeMounts`, `queueMicrotask`, lines 28 and 400 to 410). TLC's shortest counterexample needs no write in flight: `HostRemounted` alone gives two sessions. A write the old store had passed to `writeFileChecked` is not recalled by `dispose`, so it keeps a second writer of the file after the dispose too (`OldStoreDisposed` then `OrphanWriteLanded`; an ad hoc check of that state was violated after five steps).
- **`no-edit-count` fails `PersonEditNotReverted`.** A foreign publication's apply is computed, the person edits, and the apply lands over the edit.
- **`no-unwritten` fails `UnwrittenEditKept`.** The person edits; a foreign publication arrives after the edit, so at the current edit count, while the edit is still unwritten; its apply lands and the arrangement loses the edit. `PersonEditNotReverted` cannot see this, because the apply is `fresh`.
- **`no-expected` fails `StaleRestoreRefused`.** A restore command whose expected arrangement is not the one shown is applied over it.

## Correspondence to the code and to A0.3

| Model                                                          | Code today (inventory rows)                                                                                                   | A0.3 rows (`workbench-record-host.test.tsx`)                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Published`, `ApplyComputed`, `ApplyLanded`                    | `createWorkbenchLayoutStore` `onChange`: `viewer(next.viewer, …)`, `workbench(shown, …)` (Y1, Y2)                             |                                                                                                                                                                                                                                                |
| `UnwrittenEditKept`, rule 8                                    | `personWorkbenchRef` JSON compare and `staleWorkbench` (Y2)                                                                   | Row 3, "I10: should not show a foreign arrangement over an unwritten person edit" (`it.fails` on `main`): a foreign publication at the current edit count while the person's pane edit is unwritten. `no-unwritten` is that row's interleaving |
| `PersonEditNotReverted`, rule 2                                | `applicationRef` epoch (Y2)                                                                                                   |                                                                                                                                                                                                                                                |
| `Acknowledged`, `UnknownWhileDetached`                         | `acknowledge`, `setAppliedWorkbenchRevision(…, undefined)` on detach (Y3, lines 496 and 521)                                  |                                                                                                                                                                                                                                                |
| `RestoreAsked`, `RestoreSettled`                               | `restorePreviousArrangement(expected)` (Y1, lines 438 to 481)                                                                 | Row 4: restore written and acknowledged; a repeated command refused; a moved arrangement refused                                                                                                                                               |
| `RouteKeyChanged`                                              | `project-workspace-context.tsx` clears its pending refs on a route key change, with no recorded reason (Y5, lines 238 to 249) |                                                                                                                                                                                                                                                |
| `IntentSent`, `IntentApplied`, `DropClosed`, `DropUnavailable` | `fileOpened` and reveal listeners, pending placements cleared on `fileOpenFailed` (Y4, Y6, Y7, Y8)                            |                                                                                                                                                                                                                                                |
| `HostRemounted`, `OldStoreDisposed`, `OrphanWriteLanded`       | `storeMounts` and `queueMicrotask` dispose (Y3)                                                                               |                                                                                                                                                                                                                                                |

## Not modelled

- `recordSync` itself. `RecordSync.tla` is reused unchanged, and this model starts where its publications come out.
- The geometry of an arrangement, pane titles, the lanes, and what each adapter shows separately: an arrangement is one opaque value.
- The file-open dependency of a file pane: one "target available" flag, which the environment lowers at any step (`DropUnavailable`).
- The merge of an unwritten edit with a foreign publication: rule 8 holds the apply; the rebased arrangement comes back as a later publication.
- Restore is not in the graph export, which keeps the graph under 1 MB.

## Graph, suite and drift

`expected.json` has a `graphs` entry for `LayoutApply` with `export` and the phase `applied`. `LayoutApply/graph.json` is the reachable graph of `export`, and `LayoutApply/suite.json` the covering suite. `LayoutApply/drift.json` hashes this module only: `workbench-layout.machine` does not exist yet, so `layout-apply.drift.test.ts` checks the manifest with an empty alphabet. A8a's conformance test takes over that check and adds the machine's alphabet, version and `meta.tla` actions.

Regenerate with `node tools/formal/src/cli.ts update apps/ui`.

## Running

```bash
pnpm nx run ui:formal:tla
```
