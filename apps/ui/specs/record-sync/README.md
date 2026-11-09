# Record sync: own-write attribution

`RecordSync.tla` models one record store and its file. It checks how the store attributes the bytes it reads back: as its own write, or as another party's. It is the spec for the `recordSync` machine of the graphics event-driven state charter (D6, D12, invariants I5 and I12) and it lands before that machine, under formal verification policy rule 1.

The three record stores (`view-store.ts`, `entries-store.ts`, `workbench-layout-controller.ts`) implement this protocol today with slots compared inside a race window. The model holds their attribution as switches beside the target, so the same properties are checked against what is built and against what `recordSync` will do.

## Parties and abstraction

| Party   | Model                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Writer  | One checked write at a time, expecting the bytes the store last published                                                                  |
| File    | The authority applies a checked write only while the file still holds the expected bytes. `file.ver` and `file.author` are ghost variables |
| Watch   | Every change emits a change event. An event is delivered after any delay and any number of times (`watch`, `echoes`)                       |
| Reads   | Started by a change event, by a conflict, or as the refresh of an overlapped write. Only the latest read reaches the store                 |
| Foreign | Another writer of the same file. Its bytes may equal bytes this store wrote                                                                |

The model is untimed. The edit debounce, the retry backoff and a flush are the one step `IssueWrite`, and a change event that is never delivered is an event delayed forever. Bytes are opaque values and a digest is its bytes, so the model assumes no hash collision. A write's bytes are any bytes other than the published ones: the model does not derive them from a patch.

A write whose reply is lost (`LoseReply`, bounded by `MaxLost`) may have been applied, may be applied at any later step, or may never be applied. That is the `potentially-applied` state the filesystem bridge reports for a dropped connection or an abort after sending.

## Properties

| Property                | Kind      | Meaning                                                                                                           |
| ----------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| `OwnWriteAttributed`    | invariant | I5. A snapshot that shows a version this store wrote has `origin` own                                             |
| `ForeignStaysForeign`   | invariant | I12. A version another party wrote has `origin` own only when its bytes are identical to an outstanding own write |
| `SnapshotMonotone`      | action    | The snapshot never steps back to an older version of the file                                                     |
| `FenceStopsWrites`      | action    | Once the view is fenced the store issues no write                                                                 |
| `EditEventuallySettled` | liveness  | Every edit is written or the view closes. Quiescence predicate: `Settled`                                         |
| `EventuallyCurrent`     | liveness  | Once writes stop, the snapshot shows the bytes the file holds. Quiescence predicate: `Current`                    |

An own write is **outstanding** while its reply is pending or lost. An acknowledged write stays outstanding until the store reads other bytes in a read that started after the acknowledgement, or acknowledges a later write. This is the store's knowledge, not the file's truth: the store cannot tell a foreign write of identical bytes from its own echo before it has seen the file move on. The ghost variable `superseded` records it independently of the map the store keeps (`kept`).

## Target rules

These are the rules the `target` configurations check. `recordSync` implements them. Each rule that goes beyond the record-sync blueprint has a witness that fails without it.

1. Every write adds an entry to the map when it is issued. A conflict reply removes the entry. A lost reply keeps it.
2. A read is attributed own when its bytes match an entry, in any state.
3. A completed read drops every acknowledged entry whose bytes differ from the bytes it read, whether the read was attributed own or foreign. It never drops an entry whose reply is pending or lost. Witnesses: `issued-before-read` (dropping entries by issue time loses the echo of a write in flight), `drop-on-foreign-only` and `foreign-identical-bytes`.
4. An acknowledged write drops the earlier acknowledged entries. Witness: `keep-earlier-acknowledged`.
5. A read overlaps a write when it starts or completes while the write is in flight. The reply of a write that no read overlapped publishes the write as own and supersedes any read still in flight. The reply of an overlapped write publishes nothing and starts a refresh read, which the map attributes. Witnesses: `publish-on-overlap`, `no-refresh`.
6. After a conflict or an overlapped reply the writer waits for the latest read, including a watch read that superseded the one its reply started.
7. The close fence stops new writes. Witness: `no-fence`.

Rules 3 and 4 refine the blueprint's "drops every entry older than the read's start". Rule 5 refines "published once as `origin: 'own'`" for the overlapped case. With rule 5, every read that completes started after the last acknowledgement, which is why rule 3 needs no timestamps.

## Configurations

All configurations run in the pull-request tier. Each violating configuration checks one property.

| Configuration                     | Expect                         | Meaning                                                                       |
| --------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `target`                          | pass                           | The target over a reliable reply channel                                      |
| `target-lost-reply`               | pass                           | The target with one lost reply                                                |
| `liveness-flush`                  | pass                           | Both liveness properties under `LiveSpec`                                     |
| `today-slots`                     | violates `OwnWriteAttributed`  | Defect. The two-slot stores: the sibling-store race, the #1602 counterexample |
| `today-slots-ForeignStaysForeign` | pass                           | The two-slot stores keep I12                                                  |
| `post-1602-slots`                 | pass                           | The three-slot view store keeps I5 over a reliable reply channel              |
| `post-1602-lost-reply`            | violates `OwnWriteAttributed`  | Defect. The three-slot view store with one lost reply                         |
| `post-1602-ForeignStaysForeign`   | violates `ForeignStaysForeign` | Defect. The acknowledged slot survives a read matched to the write in flight  |
| `post-1602-SnapshotMonotone`      | violates `SnapshotMonotone`    | Defect. A reply publishes over a newer version a read already published       |
| `no-digest`                       | violates `OwnWriteAttributed`  | Witness. No map                                                               |
| `issued-before-read`              | violates `OwnWriteAttributed`  | Witness. A foreign read drops entries by issue time                           |
| `drop-on-foreign-only`            | violates `ForeignStaysForeign` | Witness. Only a foreign read drops acknowledged entries                       |
| `foreign-identical-bytes`         | violates `ForeignStaysForeign` | Witness. A read never drops an entry                                          |
| `keep-earlier-acknowledged`       | violates `ForeignStaysForeign` | Witness. A later acknowledgement drops nothing                                |
| `publish-on-overlap`              | violates `SnapshotMonotone`    | Witness. Every applied reply publishes at once                                |
| `no-refresh`                      | violates `EventuallyCurrent`   | Witness. No refresh read after an overlapped write                            |
| `no-fence`                        | violates `FenceStopsWrites`    | Witness. The fence does not stop writes                                       |

The widest target scope tried, three writes with one lost reply, two foreign writes and two repeated change events, passes in about five minutes. That is over the pull-request watchdog, and `apps/ui` has no `formal:nightly` target yet, so it is not committed.

## What the as-built configurations show

- **`today-slots`** is the incident's counterexample. A change event starts a read while the write is in flight. The reply sees that read and starts a refresh read. A second change event starts a read after the reply, which supersedes the refresh. The in-flight set is empty by then, so the store publishes its own bytes as a foreign read. The entries and layout stores still do this; G2 moves them onto `recordSync`.
- **`post-1602-slots`** answers handoff review R17 for a reliable reply channel: the acknowledged slot closes the race at this scope.
- **`post-1602-lost-reply`**: the store forgets a write whose reply was lost as soon as the read-back returns, also when a watch read superseded that read-back. In the trace the superseding read then returns the lost write's bytes while a write of other bytes is in flight, and they are published as foreign. The retried write has other bytes only when an edit arrived in between. Without one, the same verdict needs the lost write to land after the read-back: the retry then conflicts and its conflict read publishes the landed bytes as foreign.
- **`post-1602-ForeignStaysForeign`** needs two foreign writes inside one write and refresh window, the first with the bytes of the store's next write and the second with the bytes of its last one. It is recorded because the model finds it, not because it is likely.
- **`post-1602-SnapshotMonotone`**: a read that started before the write was issued is not an overlap as built, so it can publish a newer foreign version and the reply then publishes the older own version over it. The next change event corrects the snapshot.

The three `post-1602-*` defects name G1 as their fix. None is reproduced in a browser, so under R17 they are no reason for a change outside G1.

## Correspondence to implementation

Names are from `apps/ui/app/workbench-records/view-store.ts`. The entries and layout stores have the same shape without the acknowledged slot.

| Model                           | Runtime seam                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `IssueWrite`, `wr[w].expected`  | `write` → `writeFileChecked` with `preconditions: [{ path, expected }]`; `inFlightWriteBytes.add`                            |
| `FsDecide`                      | The authority's checked precondition on the file's bytes                                                                     |
| `ReplyApplied`, `overlap`       | `generation === generationAtWrite` publishes `'write'`; otherwise `acknowledged` is set (view store) and a refresh read runs |
| `ReplyConflict`                 | `result.status === 'conflict'` → `read()`, then the next attempt                                                             |
| `LoseReply`, `Lost`             | `isPotentiallyApplied(error)` → `unresolved = attempted`                                                                     |
| `Resolve`, `readBack`, `Forget` | `(!observed \|\| unresolved) && !(await read())`, then `unresolved = undefined` in the same task                             |
| `WatchRead`                     | `watchRecordFile` → `store.read()`; `++generation` supersedes the read in flight                                             |
| `ServeLater`                    | `exists` and `readFile` answered at any point before the read returns                                                        |
| `CompleteRead`, `kept`          | `current === generation`, the lookup over `inFlightWriteBytes`, `unresolved` and `acknowledged`, then `publish`              |
| `Unchanged`                     | `publish` returns early when `sameBytes(state.bytes, bytes)`                                                                 |
| `CloseFence`                    | `fenceClosedView`, `dispose`, `closed()`                                                                                     |
| `st.origin`                     | `onChange(state, source, locallyAuthored)`: `'write'` is own, `'read'` is foreign                                            |

In the slot modes a read that returns the bytes already shown publishes nothing, as built. In the target every completed read is attributed, so the target properties do not rest on that early return.

## Not modelled

- Refusals (`INVALID_RECORD`, `NEWER_RECORD`), `ensure`, `reset`, health reporting and read failures. They do not take part in attribution.
- The patch algebra (`diff`, `combine`, `merge`). The record-sync blueprint covers it with property tests.
- A `known-not-applied` write failure. Nothing reached the authority, so it is a write that was never issued.
- The own-write time to live. It is a leak guard; the target properties hold without it.
- `invalidateRead`. It is a read that never completes.
- The file's absence. A missing file is one more byte value.

## Bridge to the machine

This change is the spec only. G1 adds the conformance side against this module: `meta.tla` action names on the machine's transitions, a `graphs` entry and step label for the covering suite, `record-sync.machine.conformance.test.ts`, and `RecordSync/drift.json`.

## Running

```bash
pnpm nx run ui:formal
```

The record-sync configurations take about a minute in total on two workers.
