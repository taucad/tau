------------------------------ MODULE LeaseSweep ------------------------------
(***************************************************************************)
(* Holders of one project's revision root (browser tabs, each a dedicated  *)
(* file-manager worker with its own per-page-load epoch) and the lease     *)
(* files they leave in `.tau/runs/`. W5 (RM-S1): today's record only; the  *)
(* sweep and this module go in W8's TS-S7. I25, "a lease is swept only    *)
(* when its holder provably can no longer append".                        *)
(*                                                                         *)
(* `mark` is the holder's own liveness lock (RM-R8). An append is a lease  *)
(* write or a mint that names the lease; `writing` is one in flight.       *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  Holders,             \* e.g. {"A", "B"}
  Mortal,              \* the one holder that may freeze, die or close
  SweepRule,           \* "epoch" (today: any other epoch) | "lock" (the mark is free)
  LockFirst,           \* TRUE: the mark is held before the holder's first append
  ReleaseAfterSettled  \* TRUE: the mark is released only after in-flight appends settle

VARIABLES
  life,     \* [Holders -> {"unborn", "alive", "frozen", "dead", "closed"}]
  mark,     \* [Holders -> BOOLEAN]
  lease,    \* [Holders -> BOOLEAN] a lease file carrying the holder's epoch
  writing,  \* [Holders -> BOOLEAN]
  bad       \* a lease was swept while its holder could still append

vars == <<life, mark, lease, writing, bad>>

Init ==
  /\ life = [h \in Holders |-> "unborn"]
  /\ mark = [h \in Holders |-> FALSE]
  /\ lease = [h \in Holders |-> FALSE]
  /\ writing = [h \in Holders |-> FALSE]
  /\ bad = FALSE

CanAppend(h) == life[h] \in {"alive", "frozen"} \/ writing[h]

Open(h) ==
  /\ life[h] = "unborn"
  /\ life' = [life EXCEPT ![h] = "alive"]
  /\ mark' = IF LockFirst THEN [mark EXCEPT ![h] = TRUE] ELSE mark
  /\ UNCHANGED <<lease, writing, bad>>

TakeMark(h) ==
  /\ life[h] = "alive" /\ ~mark[h]
  /\ mark' = [mark EXCEPT ![h] = TRUE]
  /\ UNCHANGED <<life, lease, writing, bad>>

StartAppend(h) ==
  /\ life[h] = "alive" /\ ~writing[h]
  /\ LockFirst => mark[h]
  /\ writing' = [writing EXCEPT ![h] = TRUE]
  /\ UNCHANGED <<life, mark, lease, bad>>

(* A started write lands even if its holder closed meanwhile. *)
FinishAppend(h) ==
  /\ writing[h] /\ life[h] \in {"alive", "closed"}
  /\ lease' = [lease EXCEPT ![h] = TRUE]
  /\ writing' = [writing EXCEPT ![h] = FALSE]
  /\ UNCHANGED <<life, mark, bad>>

Retire(h) ==
  /\ life[h] = "alive" /\ lease[h] /\ ~writing[h]
  /\ lease' = [lease EXCEPT ![h] = FALSE]
  /\ UNCHANGED <<life, mark, writing, bad>>

Freeze(h) ==
  /\ h = Mortal /\ life[h] = "alive"
  /\ life' = [life EXCEPT ![h] = "frozen"]
  /\ UNCHANGED <<mark, lease, writing, bad>>

Thaw(h) ==
  /\ life[h] = "frozen"
  /\ life' = [life EXCEPT ![h] = "alive"]
  /\ UNCHANGED <<mark, lease, writing, bad>>

(* The context ends: nothing it had in flight lands. *)
Die(h) ==
  /\ h = Mortal /\ life[h] \in {"alive", "frozen"}
  /\ life' = [life EXCEPT ![h] = "dead"]
  /\ writing' = [writing EXCEPT ![h] = FALSE]
  /\ UNCHANGED <<mark, lease, bad>>

(* The platform frees a dead context's lock, at some later time. *)
MarkGone(h) ==
  /\ life[h] = "dead" /\ mark[h]
  /\ mark' = [mark EXCEPT ![h] = FALSE]
  /\ UNCHANGED <<life, lease, writing, bad>>

Close(h) ==
  /\ h = Mortal /\ life[h] = "alive"
  /\ ReleaseAfterSettled => ~writing[h]
  /\ life' = [life EXCEPT ![h] = "closed"]
  /\ mark' = [mark EXCEPT ![h] = FALSE]
  /\ UNCHANGED <<lease, writing, bad>>

(* At open (`sweepLeases`) and at every prepare (`staleRunIds`). *)
Sweep(h, g) ==
  /\ h # g /\ life[h] = "alive" /\ lease[g]
  /\ SweepRule = "lock" => ~mark[g]
  /\ lease' = [lease EXCEPT ![g] = FALSE]
  /\ bad' = (bad \/ CanAppend(g))
  /\ UNCHANGED <<life, mark, writing>>

Next ==
  \E h \in Holders :
    \/ Open(h) \/ TakeMark(h) \/ StartAppend(h) \/ FinishAppend(h) \/ Retire(h)
    \/ Freeze(h) \/ Thaw(h) \/ Die(h) \/ MarkGone(h) \/ Close(h)
    \/ \E g \in Holders : Sweep(h, g)

Fairness ==
  \A h \in Holders :
    /\ WF_vars(Open(h)) /\ WF_vars(TakeMark(h)) /\ WF_vars(MarkGone(h))
    /\ \A g \in Holders : WF_vars(Sweep(h, g))

Spec == Init /\ [][Next]_vars /\ Fairness

(* I25. *)
SweptOnlyGone == ~bad

(* A lease whose holder is gone is eventually swept (or, after W8, reconciled). *)
GoneLeaseSwept == \A g \in Holders : (lease[g] /\ life[g] \in {"dead", "closed"} /\ ~writing[g]) ~> ~lease[g]

=============================================================================
