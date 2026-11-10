# Record sync: own-write attribution

`RecordSync.tla` models one record store and its file. It checks how the store attributes the bytes it reads back: as its own write, or as another party's. It is the spec for the `recordSync` machine of the graphics event-driven state charter (D6, D12, invariants I5 and I12) and it lands before that machine, under formal verification policy rule 1.

The three record stores (`view-store.ts`, `entries-store.ts`, `workbench-layout-controller.ts`) implement this protocol today with slots compared inside a race window. The model holds their attribution as switches beside the target, so the same properties are checked against what is built and against what `recordSync` will do.

## Parties and abstraction

| Party   | Model                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Writer  | One checked write at a time, expecting the bytes the store last published                                                                                                                                                                                                  |
| File    | The authority applies a checked write only while the file still holds the expected bytes. `file.ver` and `file.author` are ghost variables                                                                                                                                 |
| Watch   | Every change emits a change event. An event is delivered after any delay and any number of times (`watch`, `echoes`)                                                                                                                                                       |
| Reads   | Started by a change event, by a conflict, by the person's retry (`ForcedRead`, bounded by `MaxForced`), as the refresh of an overlapped write, or, in the slot modes, as the read-back of a write whose reply was lost (`Resolve`). Only the latest read reaches the store |
| Foreign | Another writer of the same file. Its bytes may equal bytes this store wrote                                                                                                                                                                                                |

The model is untimed. The edit debounce, the retry backoff and a flush are the one step `IssueWrite`, and a change event that is never delivered is an event delayed forever. Bytes are opaque values and a digest is its bytes, so the model assumes no hash collision. A write's bytes are any bytes other than the published ones: the model does not derive them from a patch.

A write whose reply is lost (`LoseReply`, bounded by `MaxLost`) may have been applied, may be applied at any later step, or may never be applied. That is the `potentially-applied` state the filesystem bridge reports for a dropped connection or an abort after sending. The fairness of `LiveSpec` keeps it that way: it makes the authority decide a write whose reply is pending, not one whose reply was lost, and makes the watch deliver a pending change event, not deliver one again.

## Properties

| Property                | Kind      | Meaning                                                                                                           |
| ----------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| `OwnWriteAttributed`    | invariant | I5. A snapshot that shows a version this store wrote has `origin` own                                             |
| `ForeignStaysForeign`   | invariant | I12. A version another party wrote has `origin` own only when its bytes are identical to an outstanding own write |
| `SnapshotMonotone`      | action    | The snapshot never steps back to an older version of the file                                                     |
| `FenceStopsWrites`      | action    | Once the view is fenced the store issues no write                                                                 |
| `EditEventuallySettled` | liveness  | Every edit is written or the view closes. Quiescence predicate: `Settled`                                         |
| `EventuallyCurrent`     | liveness  | Once writes stop, the snapshot shows the bytes the file holds. Quiescence predicate: `Current`                    |

The liveness pass is a bounded claim. `liveness-flush` passes at five writes, which is as many as two edits, one foreign write and one lost reply need. The same configuration violates `EditEventuallySettled` at four writes, and at five writes with a second foreign write, both times because `MaxWrites` is spent while an edit is still unwritten, not because the protocol is stuck. Those two runs were made for this review and no committed configuration records them. A liveness failure after a bound is widened is therefore first a bound artefact. The model makes no claim about unbounded retries.

An own write is **outstanding** while its reply is pending or lost. An acknowledged write stays outstanding until the store reads other bytes in a read that started after the acknowledgement, or acknowledges a later write. This is the store's knowledge, not the file's truth: the store cannot tell a foreign write of identical bytes from its own echo before it has seen the file move on. The ghost variable `superseded` records it independently of the map the store keeps (`kept`).

A lost write stays outstanding for good, and that is a limit of the model. No modelled rule ends the entry of a write whose reply was lost, so the model excuses a foreign write of a lost write's bytes without bound: `ForeignStaysForeign` holds for lost writes by definition, not because the store learns anything. The record-sync blueprint as written also drops such an entry at the first read attributed foreign that started after the write was issued (own-write identity rule 3, which `issued-before-read` models). Once target rule 3 replaces the blueprint's "drops every entry older than the read's start", the own-write time to live of `recordSync` (own-write identity rule 4) is the only thing left that ends such an entry, and expiring it reopens I5 for a lost write that lands later. The as-built stores have no time to live: they forget a lost write at its read-back, which the slot modes model.

## Target rules

These are the rules the `target` configurations check. `recordSync` implements them. Rules 1, 3, 4, 5, 6 and 7 have witnesses that fail without them, and `no-digest` removes the map that rule 2 looks up. Rule 6 guards no safety property: with `WaitLatestRead = FALSE` at the scope of `target`, which has no lost reply, the safety properties pass. That run was made for this review and no committed configuration records it. Rule 6 keeps the writer from spending attempts on a base it already knows is stale, and its witness `no-wait-latest-read` violates `EditEventuallySettled` at three writes, a scope at which the target passes.

1. Every write adds an entry to the map when it is issued. Entries are per write and never merged by digest: two writes of the same bytes hold two entries, and a conflict reply removes only its own write's entry. A lost reply keeps the entry. Witness: `digest-keyed-entries` (a write lands and its reply is lost, the retry of the same bytes conflicts, and removing every entry with those bytes leaves the conflict read to publish the store's own bytes as foreign).
2. A read is attributed own when its bytes match an entry, in any state.
3. A completed read drops every acknowledged entry whose bytes differ from the bytes it read, whether the read was attributed own or foreign. It never drops an entry whose reply is pending or lost. Witnesses: `issued-before-read` (dropping entries by issue time loses the echo of a write in flight), `drop-on-foreign-only` and `foreign-identical-bytes`.
4. An acknowledged write drops the earlier acknowledged entries. Witness: `keep-earlier-acknowledged`.
5. A read overlaps a write when it starts or completes while the write is in flight. The reply of a write that no read overlapped publishes the write as own and supersedes any read still in flight. The reply of an overlapped write publishes nothing and starts a refresh read, which the map attributes. Witnesses: `publish-on-overlap`, `no-refresh` and `overlap-on-start-only` (a read that started before the write was issued and completes while it is in flight publishes a newer foreign version, and the reply then publishes the older own version over it).
6. After a conflict or an overlapped reply the writer waits for the latest read, including a watch or forced read that superseded the one its reply started. Witness: `no-wait-latest-read` (a watch read supersedes the refresh read of an overlapped write, the writer issues its next write on the base it already knows is stale, and that write conflicts with the write bound then spent, so the second edit is never written).
7. The close fence stops new writes. Witness: `no-fence`.

Rule 1 refines the blueprint's `Map<digest, ...>`: the map is looked up by digest, but its entries belong to writes. Rules 3 and 4 refine the blueprint's "drops every entry older than the read's start". Rule 5 refines "published once as `origin: 'own'`" for the overlapped case. With rule 5, every read that completes started after the last acknowledgement, which is why rule 3 needs no timestamps. The spec contradicts the blueprint's own-write identity rule 4, which calls the own-write time to live "a leak guard only. Correctness never depends on it." With rule 3 in place the time to live is the only thing left that ends the entry of a write whose reply was lost, and expiring that entry reopens I5 if the write lands later, so G1 must not treat the time to live as correctness-neutral for lost writes.

## Configurations

All configurations run in the pull-request tier. Each violating configuration checks one property.

| Configuration                     | Expect                           | Meaning                                                                                                                      |
| --------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `target`                          | pass                             | The target over a reliable reply channel, with one forced read                                                               |
| `target-lost-reply`               | pass                             | The target with one lost reply                                                                                               |
| `liveness-flush`                  | pass                             | Both liveness properties under `LiveSpec`                                                                                    |
| `today-slots`                     | violates `OwnWriteAttributed`    | Defect. The two-slot stores: the sibling-store race, the #1602 counterexample                                                |
| `today-slots-ForeignStaysForeign` | pass                             | The two-slot stores keep I12, also with a lost reply and a forced read                                                       |
| `post-1602-slots`                 | pass                             | The three-slot view store keeps I5 over a reliable reply channel when no read is forced and one write is in flight at a time |
| `post-1602-lost-reply`            | violates `OwnWriteAttributed`    | Defect. The three-slot view store with one lost reply                                                                        |
| `post-1602-forced-read`           | violates `OwnWriteAttributed`    | Defect. A forced read publishes bytes already shown, after the slots forgot them                                             |
| `post-1602-ForeignStaysForeign`   | violates `ForeignStaysForeign`   | Defect. A reply no read overlapped leaves the acknowledged slot of an earlier write                                          |
| `post-1602-SnapshotMonotone`      | violates `SnapshotMonotone`      | Defect. A reply publishes over a newer version a read already published                                                      |
| `no-digest`                       | violates `OwnWriteAttributed`    | Witness. No map                                                                                                              |
| `issued-before-read`              | violates `OwnWriteAttributed`    | Witness. A foreign read drops entries by issue time                                                                          |
| `drop-on-foreign-only`            | violates `ForeignStaysForeign`   | Witness. Only a foreign read drops acknowledged entries                                                                      |
| `foreign-identical-bytes`         | violates `ForeignStaysForeign`   | Witness. A read never drops an entry                                                                                         |
| `keep-earlier-acknowledged`       | violates `ForeignStaysForeign`   | Witness. A later acknowledgement drops nothing                                                                               |
| `digest-keyed-entries`            | violates `OwnWriteAttributed`    | Witness. A conflict removes every entry with its bytes                                                                       |
| `publish-on-overlap`              | violates `SnapshotMonotone`      | Witness. Every applied reply publishes at once                                                                               |
| `overlap-on-start-only`           | violates `SnapshotMonotone`      | Witness. Only a read's start overlaps a write                                                                                |
| `no-refresh`                      | violates `EventuallyCurrent`     | Witness. No refresh read after an overlapped write                                                                           |
| `no-wait-latest-read`             | violates `EditEventuallySettled` | Witness. The writer waits only for the read its reply started                                                                |
| `no-fence`                        | violates `FenceStopsWrites`      | Witness. The fence does not stop writes                                                                                      |

`target-lost-reply` runs at the scope of `target` without its forced read, which is also the scope of the safety witnesses (three writes, three edits, two foreign writes and two repeated change events), with one lost reply, and passes in about a minute on two workers. No configuration checks the target with a lost reply together with a forced read in the pull-request tier: that combined scope exceeds the 300 s watchdog. Only `today-slots-ForeignStaysForeign` combines them, for the two-slot stores at two writes and two edits.

## What the as-built configurations show

- **`today-slots`** is the incident's counterexample. A change event starts a read while the write is in flight. The reply sees that read and starts a refresh read. A second change event starts a read after the reply, which supersedes the refresh. The in-flight set is empty by then, so the store publishes its own bytes as a foreign read. The entries and layout stores still do this; G2 moves them onto `recordSync`.
- **`post-1602-slots`** answers handoff review R17 for a reliable reply channel, no forced read and one write at a time: the acknowledged slot closes the race at this scope. The pass rests on `publish` returning early for bytes already shown, which a forced read skips (`post-1602-forced-read`).
- **`post-1602-lost-reply`**: the store forgets a write whose reply was lost as soon as the read-back returns, also when a watch read superseded that read-back. TLC prints either of two shortest traces. In one, the superseding read returns the lost write's bytes while a write of other bytes is in flight, and they are published as foreign. The retried write has other bytes only when an edit arrived in between. Without one, the retry is issued before any read has published the landed bytes (the read-back was superseded, or the write lands after it); the retry then conflicts and its conflict read publishes them as foreign. In the other trace no write is in flight: the lost write lands after the read-back starts, a watch read supersedes the read-back, the writer forgets the lost write and finds nothing left to write (`Forget`), and the watch read then publishes the lost write's bytes as foreign. As built, nothing is left to write when an edit reverts the pending patch: the merged record serializes to the shown record, and `write` returns `'saved'` right after `unresolved = undefined`.
- **`post-1602-forced-read`** (R17): `retryRead()` calls `read(true)`, and the first successful read after a failed one passes `recovered`; either way `publish` runs although the bytes are the ones already shown. After the reply of a write that no read overlapped publishes it as own, no slot holds the write any more, so a forced read of the same bytes publishes them as foreign. The entries and layout stores have the same forced path. The model's `ForcedRead` stands for both kinds of forced read; read failures themselves are not modelled.
- **`post-1602-ForeignStaysForeign`** needs one foreign write. A read overlaps the first write; its reply sets the acknowledged slot and starts a refresh read, which a change event supersedes, so the slot stays. No read overlaps the second write, and its reply publishes it without clearing the slot. A foreign write of the first write's bytes is then read as the store's own. With the same single foreign write the model also finds the slot surviving a read matched to the write in flight. Both are recorded because the model finds them, not because they are likely.
- **`post-1602-SnapshotMonotone`**: a read that started before the write was issued is not an overlap as built, so it can publish a newer foreign version and the reply then publishes the older own version over it. The next change event corrects the snapshot.

The four `post-1602-*` defects name G1 as their fix. The as-built side of every finding here comes from reading the code of the three stores, not from a browser reproduction, so under R17 they are no reason for a change outside G1.

## Correspondence to implementation

Names are from `apps/ui/app/workbench-records/view-store.ts`. The entries and layout stores have the same shape without the acknowledged slot.

| Model                           | Runtime seam                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IssueWrite`, `wr[w].expected`  | `write` → `writeFileChecked` with `preconditions: [{ path, expected }]`; `inFlightWriteBytes.add`                                                                                      |
| `FsDecide`                      | The authority's checked precondition on the file's bytes                                                                                                                               |
| `ReplyApplied`, `overlap`       | `generation === generationAtWrite` publishes `'write'`; otherwise `acknowledged` is set (view store) and a refresh read runs                                                           |
| `ReplyConflict`                 | `result.status === 'conflict'` → `read()`, then the next attempt                                                                                                                       |
| `LoseReply`, `Lost`             | `isPotentiallyApplied(error)` → `unresolved = attempted`                                                                                                                               |
| `Resolve`, `readBack`, `Forget` | `(!observed \|\| unresolved) && !(await read())`, then `unresolved = undefined` in the same task                                                                                       |
| `WatchRead`                     | `watchRecordFile` → `store.read()`; `++generation` supersedes the read in flight                                                                                                       |
| `ForcedRead`, `rd.forced`       | `retryRead()` → `read(true)`; also the first successful read after a failed one (`recovered`)                                                                                          |
| `ServeLater`                    | `exists` and `readFile` answered at any point before the read returns                                                                                                                  |
| `CompleteRead`, `kept`          | `current === generation`, the lookup over `inFlightWriteBytes`, `unresolved` and `acknowledged`, then `publish`                                                                        |
| `Unchanged`                     | `publish` returns early when `sameBytes(state.bytes, bytes)` and not `notify`                                                                                                          |
| `CloseFence`                    | `fenceClosedView`, `dispose`, `closed()`. The target publishes nothing after the close; as built, a write reply that arrives after it still publishes, which the model does not follow |
| `st.origin`                     | `onChange(state, source, locallyAuthored)`: `'write'` is own, `'read'` is foreign                                                                                                      |

In the slot modes a read that returns the bytes already shown publishes nothing, as built, unless it is forced: `retryRead()` and the first successful read after a failed one publish anyway (`notify || recovered`). In the target every completed read is attributed, so the target properties do not rest on that early return.

## Not modelled

- Refusals (`INVALID_RECORD`, `NEWER_RECORD`), `ensure`, `reset` and health reporting. They do not take part in attribution.
- Read failures. A failure takes part only through the read after it, which publishes like a forced read (`recovered`); `ForcedRead` stands for it.
- The patch algebra (`diff`, `combine`, `merge`). The record-sync blueprint covers it with property tests.
- A `known-not-applied` write failure. Nothing reached the authority, so it is a write that was never issued.
- The own-write time to live of the blueprint's `recordSync` (own-write identity rule 4). Once target rule 3 replaces the blueprint's "drops every entry older than the read's start", it is the only thing left that ends the entry of a lost write. The as-built stores have none, and the model has no rule that does, so the model excuses a foreign write of a lost write's bytes without bound. Expiring an entry reopens I5 for a lost write that lands later. See the paragraph on outstanding writes.
- A second write in flight. The model's writer issues one checked write at a time. As built, `flush()` awaits `pending` and then calls `write()` without chaining that call onto `pending` (`view-store.ts:647`, `entries-store.ts:540` and `:554`, `workbench-layout-controller.ts:517`), while an edit's write is queued on `pending` (`queueWrite`), so an edit that arrives during the flush write puts a second checked write in flight. The `post-1602-slots` pass therefore also assumes one write at a time. Reasoning from the code, not a model result, and it needs replies to arrive out of apply order: in the three-slot view store the flush write of `b` is applied and a read publishes `b` as own; the edit's write of `c`, expecting `b`, is applied and a read that starts while it is in flight overlaps it; the reply for `c` arrives first and sets the acknowledged slot to `c`, the late reply for `b` overwrites it with `b`, and `b`'s refresh reads `c`, which differs from `b`, and publishes `c` as foreign. That is an I5 violation with no lost reply and no forced read. The record-sync blueprint's `write` region has one `writing` state that invokes one `checkedWrite`, so the target's one write at a time is the blueprint's rule, and G1 must keep it, `flush` included.
- `invalidateRead`. It is a read that never completes.
- The file's absence. A missing file is one more byte value.

## Bridge to the machine

This change is the spec only. G1 adds the conformance side against this module: `meta.tla` action names on the machine's transitions, a `graphs` entry and step label for the covering suite, `record-sync.machine.conformance.test.ts`, and `RecordSync/drift.json`.

## Running

```bash
pnpm nx run ui:formal
```

The record-sync configurations take about 80 seconds in total on two workers, most of it `target-lost-reply`. The whole `apps/ui` run takes about 95 seconds.
