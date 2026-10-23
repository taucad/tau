----------------------------- MODULE CrossDevice -----------------------------
(***************************************************************************)
(* One chat written on two devices (charter EQ3; formal-methods blueprint  *)
(* FM-S12). Each device appends to its own `events.jsonl`; the other       *)
(* device's log reaches it as a projected segment by sync, possibly twice  *)
(* (`segments.ts`: "a twice-projected segment"). Each device acts on its   *)
(* own merged view of the segments it holds, as the host's legality does.  *)
(*                                                                         *)
(* `MergeFixed` selects today's `mergeLogSegments` (`segments.ts`) or W3's *)
(* fix from S5 D5: the minimum start over all copies, one clamp per owner  *)
(* in its own file order, and ties broken by term identity, so the result  *)
(* is independent of segment order. `Repair` selects the candidate         *)
(* read-side rule: of concurrently live runs the one admitted first by     *)
(* (recordedAt, device) stays live and later ones read as superseded; the  *)
(* first settlement of a run wins.                                         *)
(*                                                                         *)
(* Devices are numbers so that ties order; a term is <<device, number>>,   *)
(* which also stands in for the random leader-epoch id's tie-break.        *)
(* Nightly only (S4's two-key leadership model reached 48 M states).       *)
(*                                                                         *)
(* Bounds: MaxRows = 3 and MaxSyncs = 2 for safety (MaxRows = 2 and        *)
(* MaxSyncs = 4 for liveness), against the blueprint's 6 rows and 3 syncs: *)
(* the fixed-merge safety run at 3 rows and 2 syncs already takes 218 s    *)
(* (590,815 states) of the nightly's 5-minute CrossDevice budget.          *)
(***************************************************************************)
EXTENDS Integers, Sequences, SequencesExt, FiniteSets, FiniteSetsExt, TLC

CONSTANTS
  NDevices,   \* devices 1..NDevices
  MaxRows,    \* rows per device file
  MaxTerms,   \* leadership terms per device
  MaxSyncs,   \* syncs in a behaviour
  ClockSkew,  \* whether one device's clock may step back once
  Copies,     \* whether one segment may be read twice
  MergeFixed, \* W3's merge (TRUE) or today's (FALSE)
  Repair,     \* the candidate read-side rule for concurrent runs and settlements
  Rehome,     \* XD1 handoff: a device opens a new term before admitting a turn another device's rows came before
  Handoff     \* whether to keep the ghost AdmittedAfterSeen reads (off where it is not checked: it only adds states)

Devices == 1..NDevices

VARIABLES
  file,    \* file[d]: the rows device d appended to its own events.jsonl
  got,     \* got[d][e]: how many of e's rows d's projected segment of e holds
  dup,     \* dup[d][e]: length of a second, stale copy of e's segment d reads (0: none)
  termNo,  \* termNo[d]: d's current leadership term
  seqNo,   \* seqNo[d]: the next sequence in that term
  clock,   \* clock[d]: d's wall clock, the rows' recordedAt
  stepped, \* whether the one backwards clock step has happened
  syncs,   \* syncs so far
  duped,   \* whether the one stale second copy exists
  seen,    \* seen[d]: the other devices' rows d's view held when d wrote its current term's first row
  admitted \* ghost: each admission row's key, with the keys of the other devices' rows its device saw when it admitted

vars == <<file, got, dup, termNo, seqNo, clock, stepped, syncs, duped, seen, admitted>>

Kinds == {"admit", "run", "complete", "settle"}

\* Run ids are minted on the device that admits them: device d's run is run d.
RunIds == Devices

TypeOK ==
  /\ file \in [Devices -> Seq([dev : Devices, tn : Nat, seq : Nat, run : RunIds, kind : Kinds, at : Int, out : Nat])]
  /\ got \in [Devices -> [Devices -> Nat]]
  /\ dup \in [Devices -> [Devices -> Nat]]
  /\ stepped \in BOOLEAN

(* ---------------- The segments a device reads, in directory order ----- *)

\* Its own file first, then each other device's projection, then any stale second copy.
Segments(d) ==
  <<[dev |-> d, rows |-> file[d]]>>
  \o [i \in 1..Cardinality(Devices \ {d}) |-> LET e == SetToSortSeq(Devices \ {d}, LAMBDA a, b : a < b)[i] IN [dev |-> e, rows |-> SubSeq(file[e], 1, got[d][e])]]
  \o [i \in 1..Cardinality({e \in Devices : dup[d][e] > 0}) |->
        LET e == SetToSortSeq({x \in Devices : dup[d][x] > 0}, LAMBDA a, b : a < b)[i] IN [dev |-> e, rows |-> SubSeq(file[e], 1, dup[d][e])]]

KeyOf(r) == <<r.dev, r.tn>>

(* ---------------- Today's merge (segments.ts:mergeLogSegments) ---------- *)

\* One row of a segment: a new term is introduced by this segment; a known one gains the row
\* unless its sequence is already held, and its start drops to the earliest record read.
AddRow(acc, r, segDev) ==
  LET k == KeyOf(r) IN
  IF k \notin DOMAIN acc.terms
  THEN [terms |-> (k :> [dev |-> segDev, order |-> Len(acc.intro), start |-> r.at, rows |-> {r}]) @@ acc.terms,
        intro |-> Append(acc.intro, k)]
  ELSE LET t == acc.terms[k] IN
       [terms |-> [acc.terms EXCEPT ![k] = [t EXCEPT !.rows = IF r.seq \in {x.seq : x \in t.rows} THEN @ ELSE @ \cup {r},
                                                   !.start = IF r.at < @ THEN r.at ELSE @]],
        intro |-> acc.intro]

\* holdFileOrder(introduced): the terms this segment introduced never start before an earlier one.
RECURSIVE Clamp(_, _, _, _)
Clamp(terms, intro, i, floor) ==
  IF i > Len(intro) THEN terms
  ELSE LET k == intro[i]
           s == IF terms[k].start > floor THEN terms[k].start ELSE floor
       IN Clamp([terms EXCEPT ![k].start = s], intro, i + 1, s)

MergeSegment(terms, seg) ==
  LET acc == FoldLeft(LAMBDA a, r : AddRow(a, r, seg.dev), [terms |-> terms, intro |-> <<>>], seg.rows)
  IN Clamp(acc.terms, acc.intro, 1, -1000)

\* Order: start, then the introducing segment's device, then its introduction order, then the term id.
TodayBefore(terms, a, b) ==
  LET x == terms[a]  y == terms[b] IN
  \/ x.start < y.start
  \/ x.start = y.start /\ x.dev < y.dev
  \/ x.start = y.start /\ x.dev = y.dev /\ x.order < y.order
  \/ x.start = y.start /\ x.dev = y.dev /\ x.order = y.order /\ (a[1] < b[1] \/ (a[1] = b[1] /\ a[2] < b[2]))

RowsInOrder(rows) == SetToSortSeq(rows, LAMBDA x, y : x.seq < y.seq)

TodayView(segs) ==
  LET terms == FoldLeft(MergeSegment, [k \in {} |-> 0], segs)
      order == SetToSortSeq(DOMAIN terms, LAMBDA a, b : TodayBefore(terms, a, b))
  IN FlattenSeq([i \in DOMAIN order |-> RowsInOrder(terms[order[i]].rows)])

(* ---------------- W3's merge (S5 D5) -------------------------------------- *)

FixedView(segs) ==
  LET rows    == UNION {ToSet(segs[i].rows) : i \in DOMAIN segs}
      keys    == {KeyOf(r) : r \in rows}
      rowsOf(k) == {r \in rows : KeyOf(r) = k}
      start(k)  == Min({r.at : r \in rowsOf(k)})
      \* One clamp per owner device, in the owner's own term order. A row carries its owner here; segments.ts and
      \* ChatLedger.lean read it as the writer, the first term of a segment holding the row, so every copy of one
      \* file (a projection, a stale prefix, a file left under an old id) names the same owner and ties break alike.
      clamped(k) == Max({start(j) : j \in {x \in keys : x[1] = k[1] /\ x[2] <= k[2]}})
      before(a, b) ==
        \/ clamped(a) < clamped(b)
        \/ clamped(a) = clamped(b) /\ (a[1] < b[1] \/ (a[1] = b[1] /\ a[2] < b[2]))
      order == SetToSortSeq(keys, before)
  IN FlattenSeq([i \in DOMAIN order |-> RowsInOrder(rowsOf(order[i]))])

View(d) == IF MergeFixed THEN FixedView(Segments(d)) ELSE TodayView(Segments(d))

(* ---------------- The ledger a view implies ------------------------------ *)

LastLife(v, r) ==
  LET idx == {i \in DOMAIN v : v[i].run = r /\ v[i].kind \in {"admit", "run", "complete"}}
  IN IF idx = {} THEN "none" ELSE v[Max(idx)].kind

Admission(v, r) == CHOOSE i \in DOMAIN v : v[i].run = r /\ v[i].kind = "admit"

LiveRaw(v) == {r \in RunIds : LastLife(v, r) \in {"admit", "run"}}

\* The candidate rule: of concurrently live runs, the one admitted first by (recordedAt, device) stays live.
Live(v) ==
  IF Repair /\ LiveRaw(v) # {}
  THEN {CHOOSE r \in LiveRaw(v) :
          \A s \in LiveRaw(v) : LET a == v[Admission(v, r)]  b == v[Admission(v, s)] IN
            a.at < b.at \/ (a.at = b.at /\ a.dev <= b.dev)}
  ELSE LiveRaw(v)

SettleRows(v, r) == {i \in DOMAIN v : v[i].run = r /\ v[i].kind = "settle"}

\* The settlements the ledger counts: all of them, or with Repair only the first.
Settlements(v, r) == IF Repair /\ SettleRows(v, r) # {} THEN {Min(SettleRows(v, r))} ELSE SettleRows(v, r)

UsedRuns == UNION {{file[d][i].run : i \in 1..Len(file[d])} : d \in Devices}

(* ---------------- Actions ------------------------------------------------- *)

RowKey(x) == <<x.dev, x.tn, x.seq>>

\* The other devices' rows d's view holds.
Foreign(d) == {x \in ToSet(View(d)) : x.dev # d}

\* The one clock assumption Rehome keeps is the merge's (`segments.ts` orders terms by their start): a term's first row
\* is stamped after every row its device has read (clocks agree within the staleness bound; ClockStep models the
\* exception). Deciding to rehome reads no clock (Stale).
Stamp(d) == IF Rehome /\ seqNo[d] = 0 THEN Max({clock[d]} \cup {x.at + 1 : x \in Foreign(d)}) ELSE clock[d]

\* A term's first row records what d had read of the other devices then: the frontier the term check compares.
\* Tracked only under Rehome, where it is read, so the other configurations keep their state spaces.
WriteRow(d, r, kind) ==
  /\ Len(file[d]) < MaxRows
  /\ file' = [file EXCEPT ![d] = Append(@, [dev |-> d, tn |-> termNo[d], seq |-> seqNo[d], run |-> r, kind |-> kind, at |-> Stamp(d), out |-> d])]
  /\ seqNo' = [seqNo EXCEPT ![d] = @ + 1]
  /\ clock' = [clock EXCEPT ![d] = Stamp(d) + 1]
  /\ seen' = IF Rehome /\ seqNo[d] = 0 THEN [seen EXCEPT ![d] = {RowKey(x) : x \in Foreign(d)}] ELSE seen
  /\ UNCHANGED <<got, dup, termNo, stepped, syncs, duped>>

Write(d, r, kind) == WriteRow(d, r, kind) /\ UNCHANGED admitted

\* XD1 (`foreignWroteSinceTermBegan`): d's view holds another device's row it had not read when its current term wrote
\* its first row, so a turn written under that term would merge first. It compares what d read, never two clocks; a
\* term with no row yet is never stale.
Stale(d) == seqNo[d] > 0 /\ \E x \in Foreign(d) : RowKey(x) \notin seen[d]

\* The host admits only when its own view shows no live run; the run id is minted on the device. With Rehome it
\* also admits only under a term that had read, at its first row, every other device's row it sees now.
Admit(d, r) ==
  /\ r = d /\ r \notin UsedRuns /\ Live(View(d)) = {}
  /\ Rehome => ~Stale(d)
  /\ WriteRow(d, r, "admit")
  /\ admitted' = IF Handoff
                 THEN admitted \cup {[key |-> <<d, termNo[d], seqNo[d]>>, saw |-> {RowKey(x) : x \in Foreign(d)}]}
                 ELSE admitted

\* Also a resume: a run admitted on the other device continues here.
Run(d, r) == LastLife(View(d), r) = "admit" /\ Write(d, r, "run")

Complete(d, r) == LastLife(View(d), r) = "run" /\ Write(d, r, "complete")

Settle(d, r) == LastLife(View(d), r) = "complete" /\ SettleRows(View(d), r) = {} /\ Write(d, r, "settle")

Sync(d, e) ==
  /\ d # e
  /\ syncs < MaxSyncs
  /\ got[d][e] < Len(file[e])
  /\ got' = [got EXCEPT ![d][e] = Len(file[e])]
  /\ syncs' = syncs + 1
  /\ UNCHANGED <<file, dup, termNo, seqNo, clock, stepped, duped, seen, admitted>>

\* A second, stale copy of a segment d already holds: its own file projected back, or an old projection.
Duplicate(d, e) ==
  /\ Copies
  /\ ~duped
  /\ LET n == IF d = e THEN Len(file[d]) ELSE got[d][e] IN
       /\ n > 0
       /\ dup' = [dup EXCEPT ![d][e] = n]
  /\ duped' = TRUE
  /\ UNCHANGED <<file, got, termNo, seqNo, clock, stepped, syncs, seen, admitted>>

ClockStep(d) ==
  /\ ClockSkew
  /\ ~stepped
  /\ clock' = [clock EXCEPT ![d] = @ - 2]
  /\ stepped' = TRUE
  /\ UNCHANGED <<file, got, dup, termNo, seqNo, syncs, duped, seen, admitted>>

\* XD1 (`rehomeStaleTerm`): a device whose term has rows and whose view has since gained another device's rows closes
\* its incarnation; the next one writes under a new term, its first row stamped after what it has read (Stamp).
RehomeTerm(d) ==
  /\ Rehome
  /\ Stale(d)
  /\ termNo[d] < MaxTerms
  /\ termNo' = [termNo EXCEPT ![d] = @ + 1]
  /\ seqNo' = [seqNo EXCEPT ![d] = 0]
  /\ UNCHANGED <<file, got, dup, clock, stepped, syncs, duped, seen, admitted>>

NewTerm(d) ==
  /\ termNo[d] < MaxTerms
  /\ seqNo[d] > 0
  /\ termNo' = [termNo EXCEPT ![d] = @ + 1]
  /\ seqNo' = [seqNo EXCEPT ![d] = 0]
  /\ UNCHANGED <<file, got, dup, clock, stepped, syncs, duped, seen, admitted>>

Init ==
  /\ file = [d \in Devices |-> <<>>]
  /\ got = [d \in Devices |-> [e \in Devices |-> 0]]
  /\ dup = [d \in Devices |-> [e \in Devices |-> 0]]
  /\ termNo = [d \in Devices |-> 1]
  /\ seqNo = [d \in Devices |-> 0]
  /\ clock = [d \in Devices |-> 10]
  /\ stepped = FALSE
  /\ syncs = 0
  /\ duped = FALSE
  /\ seen = [d \in Devices |-> {}]
  /\ admitted = {}

Next ==
  \E d \in Devices :
    \/ \E r \in RunIds : Admit(d, r) \/ Run(d, r) \/ Complete(d, r) \/ Settle(d, r)
    \/ \E e \in Devices : Sync(d, e) \/ Duplicate(d, e)
    \/ ClockStep(d)
    \/ NewTerm(d)
    \/ RehomeTerm(d)

Spec == Init /\ [][Next]_vars /\ \A d, e \in Devices : WF_vars(Sync(d, e))

(* ---------------- Properties --------------------------------------------- *)

\* Quiescence predicate of EventuallyConverged (FM-R17): every device holds every other's whole file.
Quiescent == \A d, e \in Devices : d # e => got[d][e] = Len(file[e])

ViewsConverge == Quiescent => \A d, e \in Devices : View(d) = View(e)

\* Every view keeps each device's rows in the order that device's own file holds them (I6).
OwnFileOrder ==
  \A d, e \in Devices :
    LET mine == SelectSeq(View(d), LAMBDA x : x.dev = e) IN mine = SubSeq(file[e], 1, Len(mine))

\* A view only grows at its end: violated by design (S5 t7_merge_not_prefix_stable).
MergedPrefixStable == [][\A d \in Devices : IsPrefix(View(d), View(d)')]_vars

OneLiveRunMerged == Quiescent => \A d \in Devices : Cardinality(Live(View(d))) <= 1

SettledOnceMerged == Quiescent => \A d \in Devices, r \in RunIds : Cardinality(Settlements(View(d), r)) <= 1

\* With Repair the ledger keeps I8 and I9, every device reads the same ledger, and no run that
\* was settled anywhere loses its settlement.
RepairHolds ==
  Quiescent =>
    /\ OneLiveRunMerged
    /\ SettledOnceMerged
    /\ \A d, e \in Devices : Live(View(d)) = Live(View(e))
    /\ \A d \in Devices, r \in RunIds :
         (\E x \in Devices : \E i \in 1..Len(file[x]) : file[x][i].run = r /\ file[x][i].kind = "settle")
           => Settlements(View(d), r) # {}

EventuallyConverged == <>[](\A d, e \in Devices : View(d) = View(e))

\* XD1 handoff: every view puts each admission after every row of another device its device had seen when it admitted.
AdmittedAfterSeen ==
  \A d \in Devices :
    LET v == View(d)
        at(k) == {i \in DOMAIN v : RowKey(v[i]) = k}
    IN \A a \in admitted :
         \A k \in a.saw :
           (at(a.key) # {} /\ at(k) # {}) => Min(at(k)) < Min(at(a.key))
=============================================================================
