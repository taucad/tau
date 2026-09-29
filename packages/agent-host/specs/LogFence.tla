------------------------------ MODULE LogFence ------------------------------
(***************************************************************************)
(* W3 draft: the chat log's storage fence on its own, for the inductive     *)
(* invariant of I1 (one writer per epoch) and I2 (epochs never go back).    *)
(*                                                                         *)
(* A writer reads the log; the read fixes its term's epoch as one above    *)
(* every epoch it saw. It appends only while the log is exactly what it    *)
(* read (length check inside the binding's lock, so check and append are   *)
(* one step here); the term's first append is its claim. Any refusal,      *)
(* notice, steal or crash drops the claim, and the writer must read again. *)
(* Nothing else constrains the writers: the election is left fully         *)
(* nondeterministic, so the invariant holds for every election that writes *)
(* only through this append. LogStorageFence (S4's LogLeadership with the  *)
(* fences) refines this module; see FenceRefined there.                    *)
(*                                                                         *)
(* Conditional = FALSE is the mutant without the check (a witness).        *)
(***************************************************************************)
EXTENDS Integers, Sequences

CONSTANTS
    \* @type: Set(Str);
    Writers,
    \* @type: Bool;
    Conditional

VARIABLES
    \* @type: Seq({e: Int, w: Str});
    log,
    \* @type: Str -> Int;
    vlen,
    \* @type: Str -> Int;
    mine,
    \* @type: Str -> Bool;
    claimed

vars == <<log, vlen, mine, claimed>>

\* @type: (Str) => {e: Int, w: Str};
Row(w) == [e |-> mine[w], w |-> w]

Init ==
    /\ log = <<>>
    /\ vlen = [w \in Writers |-> 0]
    /\ mine = [w \in Writers |-> 0]
    /\ claimed = [w \in Writers |-> FALSE]

\* The read that fixes a term: epoch = one above every epoch in the log.
Read(w) ==
    /\ \/ /\ Len(log) = 0
          /\ mine' = [mine EXCEPT ![w] = 1]
       \/ \E i \in DOMAIN log :
            /\ \A j \in DOMAIN log : log[j].e <= log[i].e
            /\ mine' = [mine EXCEPT ![w] = log[i].e + 1]
    /\ vlen' = [vlen EXCEPT ![w] = Len(log)]
    /\ claimed' = [claimed EXCEPT ![w] = TRUE]
    /\ UNCHANGED log

\* One conditional append of one or two rows of the writer's term.
Write(w) ==
    /\ claimed[w]
    /\ Conditional => vlen[w] = Len(log)
    /\ \/ /\ log' = Append(log, Row(w))
          /\ vlen' = [vlen EXCEPT ![w] = vlen[w] + 1]
       \/ /\ log' = Append(Append(log, Row(w)), Row(w))
          /\ vlen' = [vlen EXCEPT ![w] = vlen[w] + 2]
    /\ UNCHANGED <<mine, claimed>>

\* A read and a claiming append in one locked step (S4's follower SelfLead).
ReadAppend(w) ==
    /\ \E t \in {0} \cup {log[i].e : i \in DOMAIN log} :
         /\ \A j \in DOMAIN log : log[j].e <= t
         /\ \/ log' = Append(log, [e |-> t + 1, w |-> w])
            \/ log' = Append(Append(log, [e |-> t + 1, w |-> w]), [e |-> t + 1, w |-> w])
    /\ UNCHANGED <<vlen, mine, claimed>>

\* A refused append, a notice, a steal or a crash: the claim is gone.
Drop(w) ==
    /\ claimed' = [claimed EXCEPT ![w] = FALSE]
    /\ UNCHANGED <<log, vlen, mine>>

Next == \E w \in Writers : Read(w) \/ Write(w) \/ ReadAppend(w) \/ Drop(w)

Spec == Init /\ [][Next]_vars

\* ---------------- properties ----------------
EpochsMonotone == \A i, j \in DOMAIN log : i < j => log[i].e <= log[j].e
OneWriterPerEpoch == \A i, j \in DOMAIN log : log[i].e = log[j].e => log[i].w = log[j].w
Safety == EpochsMonotone /\ OneWriterPerEpoch

TypeOK ==
    /\ \A i \in DOMAIN log : log[i].e >= 1 /\ log[i].w \in Writers
    /\ DOMAIN vlen = Writers /\ DOMAIN mine = Writers /\ DOMAIN claimed = Writers
    /\ \A w \in Writers : vlen[w] >= 0 /\ mine[w] >= 0

\* A writer is current when its claim stands and nobody appended since its read.
Current(w) == claimed[w] /\ vlen[w] = Len(log)

IndInv ==
    /\ TypeOK
    /\ EpochsMonotone
    /\ OneWriterPerEpoch
    /\ \A w \in Writers : vlen[w] <= Len(log)
    /\ \A w \in Writers : claimed[w] => mine[w] >= 1
    /\ \A w \in Writers : Current(w) =>
          \/ \A i \in DOMAIN log : log[i].e < mine[w]
          \/ /\ Len(log) > 0
             /\ log[Len(log)].e = mine[w]
             /\ \A i \in DOMAIN log : log[i].e = mine[w] => log[i].w = w
=============================================================================
