----------------------------- MODULE RecordSync -----------------------------
(***************************************************************************)
(* One record store and its file: how the store attributes the bytes it    *)
(* reads back, as its own write or as another party's (graphics            *)
(* event-driven state charter D6, I5, I12).                                *)
(*                                                                         *)
(* Parties:                                                                *)
(*   writer    the store's checked writes, one at a time                   *)
(*   file      the authority applies a checked write only while the file   *)
(*             still holds the bytes the write expects                     *)
(*   watch     every change emits a change event; an event is delivered    *)
(*             after any delay, and any number of times                    *)
(*   reads     started by a change event, by a conflict, by the person's   *)
(*             retry, or as the refresh of an overlapped write; only the   *)
(*             latest read reaches the store                               *)
(*   foreign   another writer of the same file (a second window, an agent, *)
(*             sync)                                                       *)
(*                                                                         *)
(* The model is untimed. The edit debounce, the retry backoff and a flush  *)
(* are the one step `IssueWrite`. Bytes are opaque values and a digest is  *)
(* its bytes: the model assumes no hash collision.                         *)
(*                                                                         *)
(* Entries are per write, never merged by digest: two writes of the same   *)
(* bytes hold two entries, and a conflict removes only its own write's     *)
(* entry (`EntryKey`).                                                     *)
(*                                                                         *)
(* Limit. No modelled rule ends the entry of a write whose reply was lost, *)
(* so the model excuses a foreign write of a lost write's bytes without    *)
(* bound. The record-sync blueprint as written also drops such an entry at *)
(* the first read attributed foreign that started after the write was      *)
(* issued (own-write identity rule 3, which DropOnRead                     *)
(* "issued-before-read" models). Once target rule 3 of README.md replaces  *)
(* the blueprint's "drops every entry older than the read's start", the    *)
(* own-write time to live of `recordSync` (own-write identity rule 4),     *)
(* which is not modelled, is the only thing left that ends such an entry,  *)
(* and expiring it reopens I5 for a lost write that lands later. The       *)
(* as-built stores have no time to live.                                   *)
(*                                                                         *)
(* Switches. The first value of each is the target.                        *)
(*   Attribution   "digest": the map of the store's own writes.            *)
(*                 "slots2": as built in the entries and layout stores,    *)
(*                   and in the view store before taucad/tau#1602 (the     *)
(*                   in-flight set and the unresolved slot).               *)
(*                 "slots3": as built in the view store since #1602 (adds  *)
(*                   the acknowledged slot).                               *)
(*                 "none": no map; only the write reply attributes.        *)
(*   DropOnRead    which entries a completed read drops ("digest" only).   *)
(*                 "other-bytes": an acknowledged entry is dropped by a    *)
(*                   read that returns other bytes.                        *)
(*                 "foreign-only": acknowledged entries are dropped only   *)
(*                   by a read attributed foreign.                         *)
(*                 "issued-before-read": a read attributed foreign drops   *)
(*                   every entry issued before the read started.           *)
(*                 "never": a read drops nothing.                          *)
(*   DropOnAck     TRUE: an acknowledged write drops the earlier           *)
(*                 acknowledged entries ("digest" only).                   *)
(*   EntryKey      "write": one entry per write; a conflict removes only   *)
(*                   its own write's entry.                                *)
(*                 "digest": entries keyed by bytes; a conflict removes    *)
(*                   every entry with the conflicted write's bytes         *)
(*                   ("digest" only).                                      *)
(*   ReplyPublish  "quiet": the reply of a write that a read overlapped    *)
(*                   publishes nothing; its refresh read does.             *)
(*                 "always": every applied reply publishes at once.        *)
(*   Refresh       TRUE: a write that a read overlapped is followed by a   *)
(*                 refresh read. As built it always is.                    *)
(*   OverlapOnComplete  TRUE: a read that completes while a write is in   *)
(*                 flight overlaps it, as a read that starts then does.    *)
(*                 FALSE: only a read's start overlaps. The slot modes are *)
(*                 start only, as built, and ignore it.                    *)
(*   WaitLatestRead  TRUE: after a conflict or an overlapped reply the     *)
(*                 writer waits for the latest read, also a read that      *)
(*                 superseded the read its reply started. The slot modes   *)
(*                 wait for the read their reply started, as built, and    *)
(*                 ignore it.                                              *)
(*   Fence         TRUE: the close fence stops new writes.                 *)
(*   MaxLost       how many write replies may be lost; 0 is a reliable     *)
(*                 channel. A write whose reply was lost may still be      *)
(*                 applied at any later step, or never.                    *)
(*   MaxForced     how many forced reads the person may start. As built,   *)
(*                 a forced read publishes even when its bytes are the     *)
(*                 ones already shown.                                     *)
(*                                                                         *)
(* Correspondence, as built (`view-store.ts`; README.md has the table):    *)
(*   IssueWrite     `write` -> `writeFileChecked` with `expected`          *)
(*   FsDecide       the authority's checked precondition                   *)
(*   ReplyApplied   `result.status !== 'conflict'`: publish, or refresh    *)
(*   ReplyConflict  `result.status === 'conflict'` -> `read()`             *)
(*   LoseReply      `isPotentiallyApplied(error)` -> `unresolved`          *)
(*   Resolve        `(!observed || unresolved) && !(await read())`         *)
(*   Forget         `unresolved = undefined`, then nothing left to write   *)
(*   WatchRead      `watchRecordFile` callback -> `store.read()`           *)
(*   ForcedRead     `retryRead()` -> `read(true)`                          *)
(*   ServeLater     `exists` and `readFile` answered by the authority      *)
(*   CompleteRead   `read`: `current === generation`, the own-write        *)
(*                  lookup, `publish`                                      *)
(*   CloseFence     `fenceClosedView`, `dispose`                           *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Bytes,         \* the contents the file can hold
          InitialBytes,  \* what the file holds before any modelled write
          MaxWrites,     \* checked writes the store may issue
          MaxEdits,      \* edits the person may make
          MaxForeign,    \* writes by another party
          MaxEcho,       \* reads started with no new change: an event delivered again, or late
          MaxLost,       \* write replies that may be lost
          MaxForced,     \* forced reads the person may start
          Attribution, DropOnRead, DropOnAck, ReplyPublish, Refresh, Fence, EntryKey, OverlapOnComplete,
          WaitLatestRead

ASSUME /\ InitialBytes \in Bytes
       /\ MaxWrites \in Nat /\ MaxEdits \in Nat /\ MaxForeign \in Nat
       /\ MaxEcho \in Nat /\ MaxLost \in Nat /\ MaxForced \in Nat
       /\ Attribution \in {"digest", "slots2", "slots3", "none"}
       /\ DropOnRead \in {"other-bytes", "foreign-only", "issued-before-read", "never"}
       /\ DropOnAck \in BOOLEAN
       /\ ReplyPublish \in {"quiet", "always"}
       /\ Refresh \in BOOLEAN
       /\ Fence \in BOOLEAN
       /\ EntryKey \in {"write", "digest"}
       /\ OverlapOnComplete \in BOOLEAN
       /\ WaitLatestRead \in BOOLEAN

VARIABLES
  file,        \* the record file: its bytes; ghost: its version and who wrote that version
  wr,          \* the store's checked writes, by id
  nextId,      \* the id of the next write
  watch,       \* a change event is emitted and not yet delivered
  echoes,      \* change events delivered again, or late: a read with no new change
  rd,          \* the latest read, if it has not completed or been superseded
  st,          \* the published snapshot; ghost: the version it shows, its true author, and whether
               \* a foreign version was attributed own on identical bytes of an outstanding write
  kept,        \* the own writes the store still holds for attribution
  overlap,     \* a read overlapped the write in flight
  dirty,       \* an edit waits to be written (the deferred patch)
  readBack,    \* as built: the read-back of an unresolved write returned and the writer continues
  phase,       \* "open" or "fenced"
  edits, foreign, lost, forced,  \* bounds
  superseded   \* ghost: acknowledged writes the store has seen replaced

vars == <<file, wr, nextId, watch, echoes, rd, st, kept, overlap, dirty, readBack, phase, edits, foreign, lost, forced,
          superseded>>

Writes == 1..MaxWrites
MaxVersion == MaxWrites + MaxForeign
Slots == Attribution \in {"slots2", "slots3"}

NoWrite == [status |-> "unused", bytes |-> InitialBytes, expected |-> InitialBytes, fs |-> "pending", ver |-> 0]
NoRead == [active |-> FALSE, purpose |-> "none", w |-> 0, bytes |-> InitialBytes, ver |-> 0,
           author |-> "init", after |-> {}, mark |-> 1, forced |-> FALSE]

WithStatus(s) == {w \in Writes : wr[w].status = s}
InFlight == WithStatus("inFlight")
Acked == WithStatus("acked")
Lost == WithStatus("lost")

Observed == st.origin # "none"

\* The writer runs one write at a time and waits for the read its last reply or read-back started.
WriterBusy == InFlight # {} \/ (rd.active /\ rd.purpose \in {"refresh", "conflict", "resolve"})

\* An own write whose bytes the store may still read back as its own: its reply is pending or lost,
\* or it was acknowledged and the store has since neither read other bytes nor acknowledged a later write.
Outstanding == InFlight \cup Lost \cup (Acked \ superseded)

\* A read captures the file when the authority serves it: at its start here, or later in `ServeLater`.
\* `after`, `mark` and `forced` stay as they were when the store started the read.
Capture(purpose, w) ==
  [active |-> TRUE, purpose |-> purpose, w |-> w, bytes |-> file.bytes, ver |-> file.ver,
   author |-> file.author, after |-> Acked, mark |-> nextId, forced |-> FALSE]

Snapshot(origin, bytes, ver, author, excused) ==
  [origin |-> origin, bytes |-> bytes, ver |-> ver, author |-> author, excused |-> excused]

\* As built, `publish` returns early when the bytes are the ones already shown. A forced read
\* (`notify`) skips this in `CompleteRead`.
Unchanged(bytes) == Slots /\ Observed /\ st.bytes = bytes

TypeOK ==
  /\ file \in [bytes : Bytes, ver : 0..MaxVersion, author : {"init", "own", "foreign"}]
  /\ wr \in [Writes -> [status : {"unused", "inFlight", "acked", "conflict", "lost"},
                        bytes : Bytes, expected : Bytes,
                        fs : {"pending", "applied", "refused"}, ver : 0..MaxVersion]]
  /\ nextId \in 1..(MaxWrites + 1)
  /\ watch \in BOOLEAN
  /\ echoes \in 0..MaxEcho
  /\ rd \in [active : BOOLEAN, purpose : {"none", "watch", "refresh", "conflict", "resolve"},
             w : 0..MaxWrites, bytes : Bytes, ver : 0..MaxVersion,
             author : {"init", "own", "foreign"}, after : SUBSET Writes, mark : 1..(MaxWrites + 1),
             forced : BOOLEAN]
  /\ st \in [origin : {"none", "own", "foreign"}, bytes : Bytes, ver : 0..MaxVersion,
             author : {"init", "own", "foreign"}, excused : BOOLEAN]
  /\ kept \subseteq Writes
  /\ overlap \in BOOLEAN
  /\ dirty \in BOOLEAN
  /\ readBack \in BOOLEAN
  /\ phase \in {"open", "fenced"}
  /\ edits \in 0..MaxEdits
  /\ foreign \in 0..MaxForeign
  /\ lost \in 0..MaxLost
  /\ forced \in 0..MaxForced
  /\ superseded \subseteq Writes

Init ==
  /\ file = [bytes |-> InitialBytes, ver |-> 0, author |-> "init"]
  /\ wr = [w \in Writes |-> NoWrite]
  /\ nextId = 1
  /\ watch = TRUE  \* the store's first read
  /\ echoes = 0
  /\ rd = NoRead
  /\ st = Snapshot("none", InitialBytes, 0, "init", FALSE)
  /\ kept = {}
  /\ overlap = FALSE
  /\ dirty = FALSE
  /\ readBack = FALSE
  /\ phase = "open"
  /\ edits = 0
  /\ foreign = 0
  /\ lost = 0
  /\ forced = 0
  /\ superseded = {}

\* The person changes the record; the change waits for the debounce.
Edit ==
  /\ phase = "open"
  /\ ~readBack
  /\ ~dirty
  /\ edits < MaxEdits
  /\ dirty' = TRUE
  /\ edits' = edits + 1
  /\ UNCHANGED <<file, wr, nextId, watch, echoes, rd, st, kept, overlap, readBack, phase, foreign, lost, forced, superseded>>

\* The writer sends a checked write of new bytes, expecting the bytes it last published.
IssueWrite(b) ==
  /\ dirty
  /\ Observed
  /\ ~WriterBusy
  /\ Fence => phase # "fenced"
  /\ nextId <= MaxWrites
  /\ b # st.bytes
  /\ kept \cap Lost # {} => (~Slots \/ readBack)  \* as built, an unresolved write is read back first
  /\ wr' = [wr EXCEPT ![nextId] = [status |-> "inFlight", bytes |-> b, expected |-> st.bytes,
                                   fs |-> "pending", ver |-> 0]]
  /\ nextId' = nextId + 1
  /\ kept' = CASE Attribution = "none" -> kept
               [] Attribution = "digest" -> kept \cup {nextId}
               [] OTHER -> (kept \ Lost) \cup {nextId}  \* as built: `unresolved = undefined`
  /\ overlap' = FALSE
  /\ dirty' = FALSE
  /\ readBack' = FALSE
  /\ UNCHANGED <<file, watch, echoes, rd, st, phase, edits, foreign, lost, forced, superseded>>

\* As built, a write whose reply was lost is read back before the next write.
Resolve ==
  /\ Slots
  /\ dirty
  /\ Observed
  /\ ~WriterBusy
  /\ ~readBack
  /\ phase = "open"
  /\ kept \cap Lost # {}
  /\ rd' = Capture("resolve", 0)
  /\ UNCHANGED <<file, wr, nextId, watch, echoes, st, kept, overlap, dirty, readBack, phase,
                 edits, foreign, lost, forced, superseded>>

\* As built, the read-back returned and the writer forgets the unresolved write in the same task. It
\* then issues the next write (`IssueWrite`) or finds nothing left to write, which is this step.
Forget ==
  /\ readBack
  /\ ~WriterBusy
  /\ phase = "open"
  /\ kept' = kept \ Lost
  /\ readBack' = FALSE
  /\ dirty' = FALSE
  /\ UNCHANGED <<file, wr, nextId, watch, echoes, rd, st, overlap, phase, edits, foreign, lost, forced, superseded>>

\* The authority decides a checked write: applied when the file still holds the expected bytes.
\* A write whose reply was lost can be decided at any later step, or never.
FsDecide(w) ==
  /\ wr[w].status \in {"inFlight", "lost"}
  /\ wr[w].fs = "pending"
  /\ IF file.bytes = wr[w].expected
       THEN /\ file' = [bytes |-> wr[w].bytes, ver |-> file.ver + 1, author |-> "own"]
            /\ wr' = [wr EXCEPT ![w].fs = "applied", ![w].ver = file.ver + 1]
            /\ watch' = TRUE
       ELSE /\ wr' = [wr EXCEPT ![w].fs = "refused"]
            /\ UNCHANGED <<file, watch, echoes>>
  /\ UNCHANGED <<nextId, echoes, rd, st, kept, overlap, dirty, readBack, phase, edits, foreign, lost, forced, superseded>>

\* The applied reply arrives. Any read still in flight is superseded. When no read overlapped the
\* write, the reply publishes the write as the store's own; otherwise a refresh read starts.
ReplyApplied(w) ==
  /\ phase = "open"
  /\ wr[w].status = "inFlight"
  /\ wr[w].fs = "applied"
  /\ wr' = [wr EXCEPT ![w].status = "acked"]
  /\ superseded' = superseded \cup Acked
  /\ kept' = CASE Attribution = "digest" -> IF DropOnAck THEN (kept \ Acked) \cup {w} ELSE kept
               [] Attribution = "none" -> kept
               [] Attribution = "slots2" -> kept \ {w}
               [] Attribution = "slots3" -> IF overlap THEN (kept \ Acked) \cup {w} ELSE kept \ {w}
  /\ st' = IF (overlap /\ (Slots \/ ReplyPublish = "quiet")) \/ Unchanged(wr[w].bytes)
             THEN st
             ELSE Snapshot("own", wr[w].bytes, wr[w].ver, "own", FALSE)
  \* The refresh read starts after this acknowledgement: other bytes in it supersede `w` too.
  /\ rd' = IF overlap /\ (Slots \/ Refresh) THEN [Capture("refresh", w) EXCEPT !.after = @ \cup {w}] ELSE NoRead
  /\ UNCHANGED <<file, nextId, watch, echoes, overlap, dirty, readBack, phase, edits, foreign, lost, forced>>

\* The conflict reply arrives: nothing was written, so the entry goes and the store reads again.
\* Keyed by digest, the entries of other writes of the same bytes go with it.
ReplyConflict(w) ==
  /\ phase = "open"
  /\ wr[w].status = "inFlight"
  /\ wr[w].fs = "refused"
  /\ wr' = [wr EXCEPT ![w].status = "conflict"]
  /\ kept' = IF Attribution = "digest" /\ EntryKey = "digest"
               THEN kept \ {x \in kept : wr[x].bytes = wr[w].bytes}
               ELSE kept \ {w}
  /\ dirty' = TRUE
  /\ rd' = Capture("conflict", w)
  /\ UNCHANGED <<file, nextId, watch, echoes, st, overlap, readBack, phase, edits, foreign, lost, forced, superseded>>

\* The reply is lost (a dropped connection, an abort after sending): the write may or may not land.
LoseReply(w) ==
  /\ phase = "open"
  /\ lost < MaxLost
  /\ wr[w].status = "inFlight"
  /\ wr' = [wr EXCEPT ![w].status = "lost"]
  /\ lost' = lost + 1
  /\ dirty' = TRUE
  /\ UNCHANGED <<file, nextId, watch, echoes, rd, st, kept, overlap, readBack, phase, edits, foreign, forced, superseded>>

\* Another party writes the file. Its bytes may equal bytes this store wrote.
ForeignWrite(b) ==
  /\ foreign < MaxForeign
  /\ b # file.bytes
  /\ file' = [bytes |-> b, ver |-> file.ver + 1, author |-> "foreign"]
  /\ watch' = TRUE
  /\ foreign' = foreign + 1
  /\ UNCHANGED <<wr, nextId, echoes, rd, st, kept, overlap, dirty, readBack, phase, edits, lost, forced, superseded>>

\* A read starts and supersedes the read in flight. A forced read differs only when it completes.
StartRead(isForced) ==
  /\ phase = "open"
  /\ ~readBack
  \* As built, a superseded `read()` still returns to the write that awaited it.
  /\ readBack' = (Slots /\ rd.active /\ rd.purpose = "resolve")
  \* Target rule 6: the writer waits for the latest read, not only for the read its reply started.
  /\ LET next == IF WaitLatestRead /\ ~Slots /\ rd.active /\ rd.purpose \in {"refresh", "conflict"}
                    THEN Capture(rd.purpose, rd.w)
                    ELSE Capture("watch", 0)
     IN rd' = [next EXCEPT !.forced = isForced]
  /\ overlap' = (overlap \/ InFlight # {})
  /\ UNCHANGED <<file, wr, nextId, st, kept, dirty, phase, edits, foreign, lost, superseded>>

\* A change event is delivered, once or again, and starts a read.
WatchRead ==
  /\ \/ watch /\ watch' = FALSE /\ UNCHANGED echoes
     \/ echoes < MaxEcho /\ echoes' = echoes + 1 /\ UNCHANGED watch
  /\ StartRead(FALSE)
  /\ UNCHANGED forced

\* The person retries the read (`retryRead`). As built, its completion publishes even when the
\* bytes are the ones already shown.
ForcedRead ==
  /\ forced < MaxForced
  /\ forced' = forced + 1
  /\ StartRead(TRUE)
  /\ UNCHANGED <<watch, echoes>>

\* The authority serves a read at any point between its start and its completion.
ServeLater ==
  /\ rd.active
  /\ <<rd.bytes, rd.ver>> # <<file.bytes, file.ver>>
  /\ rd' = [rd EXCEPT !.bytes = file.bytes, !.ver = file.ver, !.author = file.author]
  /\ UNCHANGED <<file, wr, nextId, watch, echoes, st, kept, overlap, dirty, readBack, phase,
                 edits, foreign, lost, forced, superseded>>

\* The latest read completes: the store attributes its bytes and publishes them.
CompleteRead ==
  /\ phase = "open"
  /\ ~readBack
  /\ rd.active
  /\ LET b == rd.bytes
         refresh == Slots /\ rd.purpose = "refresh"
         hits == {w \in kept : wr[w].bytes = b}
         \* As built, the refresh read compares with its own write only.
         own == IF refresh THEN b = wr[rd.w].bytes ELSE hits # {}
         excused == rd.author # "own" /\ \E w \in Outstanding : wr[w].bytes = b
         stale == {w \in kept \cap Acked : wr[w].bytes # b}
         dropped ==
           CASE Attribution = "none" -> kept
             [] Attribution = "digest" ->
                  (CASE DropOnRead = "other-bytes" -> stale
                     [] DropOnRead = "foreign-only" -> IF own THEN {} ELSE kept \cap Acked
                     [] DropOnRead = "issued-before-read" -> IF own THEN {} ELSE {w \in kept : w < rd.mark}
                     [] DropOnRead = "never" -> {})
             [] Attribution = "slots2" -> {}
             \* As built: `if (!ownWrite || ownWrite === acknowledged) acknowledged = undefined`.
             [] Attribution = "slots3" ->
                  IF refresh \/ ~(\E w \in hits : wr[w].status # "acked") THEN kept \cap Acked ELSE {}
     IN
     /\ kept' = kept \ dropped
     /\ st' = IF Unchanged(b) /\ ~rd.forced
                THEN st
                ELSE Snapshot(IF own THEN "own" ELSE "foreign", b, rd.ver, rd.author, own /\ excused)
     /\ superseded' = superseded \cup {w \in rd.after : wr[w].bytes # b}
  /\ readBack' = (Slots /\ rd.purpose = "resolve")
  /\ rd' = NoRead
  \* Target: a read that completes while a write is in flight overlaps it too. As built, only a read's start does.
  /\ overlap' = (overlap \/ (~Slots /\ OverlapOnComplete /\ InFlight # {}))
  /\ UNCHANGED <<file, wr, nextId, watch, echoes, dirty, phase, edits, foreign, lost, forced>>

\* The view closes: in the target the store publishes nothing more and, with the fence, writes nothing
\* more. As built, a write reply that arrives after the close still publishes, which the model does not follow.
CloseFence ==
  /\ phase = "open"
  /\ ~readBack
  /\ phase' = "fenced"
  /\ rd' = NoRead
  /\ UNCHANGED <<file, wr, nextId, watch, echoes, st, kept, overlap, dirty, readBack,
                 edits, foreign, lost, forced, superseded>>

Next ==
  \/ Edit
  \/ \E b \in Bytes : IssueWrite(b)
  \/ Resolve
  \/ Forget
  \/ \E w \in Writes : FsDecide(w)
  \/ \E w \in Writes : ReplyApplied(w) \/ ReplyConflict(w) \/ LoseReply(w)
  \/ \E b \in Bytes : ForeignWrite(b)
  \/ WatchRead
  \/ ForcedRead
  \/ ServeLater
  \/ CompleteRead
  \/ CloseFence

Spec == Init /\ [][Next]_vars

\* The authority, the watch and the open store keep working. The person, another party, the loss of
\* a reply, a forced read and the close are not fair: none of them has to happen. Fairness covers the
\* decision of a write whose reply is pending, not of a lost one, which may never be applied, and the
\* delivery of a pending change event, not a repeated or late delivery.
Fairness ==
  /\ WF_vars(\E b \in Bytes : IssueWrite(b))
  /\ WF_vars(watch /\ WatchRead /\ ~watch')
  /\ WF_vars(CompleteRead)
  /\ \A w \in Writes :
       /\ WF_vars(wr[w].status = "inFlight" /\ FsDecide(w))
       /\ WF_vars(ReplyApplied(w))
       /\ WF_vars(ReplyConflict(w))

LiveSpec == Spec /\ Fairness

\* I5. A snapshot that shows a version this store wrote is attributed to this store.
OwnWriteAttributed == st.author = "own" => st.origin = "own"

\* I12. A version another party wrote is attributed to this store only on bytes identical to an
\* outstanding own write.
ForeignStaysForeign == (st.origin = "own" /\ st.author # "own") => st.excused

\* The snapshot never steps back to an older version of the file.
SnapshotMonotone == [][st'.ver >= st.ver]_vars

\* Once the view is fenced the store issues no write.
FenceStopsWrites == [][phase = "fenced" => nextId' = nextId]_vars

\* Quiescence predicate of EditEventuallySettled: nothing waits to be written and no write awaits its
\* reply, or the view closed.
Settled == phase = "fenced" \/ (~dirty /\ InFlight = {})

\* Every edit is written or the view closes.
EditEventuallySettled == <>[]Settled

\* Quiescence predicate of EventuallyCurrent: the snapshot shows the bytes the file holds, or the view closed.
Current == phase = "fenced" \/ (Observed /\ st.bytes = file.bytes)

\* Once writes stop, the snapshot settles on the file's bytes.
EventuallyCurrent == <>[]Current

=============================================================================
