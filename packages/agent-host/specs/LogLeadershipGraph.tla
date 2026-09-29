---- MODULE LogLeadershipGraph ----
(***************************************************************************)
(* The graph export of `LogLeadership` (W6.r1 finding 13, FM-R7): the same *)
(* state and actions, with `act` naming each step and its worker, and `m2` *)
(* each worker's M2 phase (the refinement mapping), so `formal update`     *)
(* writes `LogLeadershipGraph/{graph,suite}.json` for M2's generated       *)
(* conformance replay and walk (leadership.machine.conformance.test.ts).   *)
(* It adds no behaviour: `GraphNext` is `LogLeadership!Next` restricted to *)
(* the export's scope, with `act` and `m2` set on every step. `Heartbeat`  *)
(* is left out: it moves only `heard`, which no step of this scope reads    *)
(* (no follower keys, `HeardRule` FALSE), and it would triple the graph.   *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets
CONSTANTS Workers, Keys, MaxEpoch, MaxCrashes, MaxSends, Steal, Fence, IdemKeys, MustAnswer, WaitOnAnyHeartbeat
VARIABLES
    lock, lockEpoch, epochs, alive, lead, claimed, view, vlen, mine, pending, fence, handle, log, lockNotFence,
    frames, done, status, latest, refused, heard, tries, crashes, sends,
    frozen, freezes, reading, noticeDue, queued, nqueues, want, wants, drives, run, nruns, zombie,
    act, m2

L == INSTANCE LogLeadership

\* The export cfg's W6 knobs, substituted into `LogLeadership` (`Scope <- [LogLeadership] RunScope`).
RunScope == "run"
SilentRule == "silent"
One == 1

\* Each worker's M2 phase: holding the lock with a claimed term, holding it before the read, queued, or neither.
M2View == [w \in Workers |->
    IF lead[w] > 0 THEN (IF claimed[w] THEN "leading" ELSE "claiming")
    ELSE IF queued[w] THEN "queued" ELSE "idle"]

A(name, w) == act' = <<name, w>>

GraphInit == L!Init /\ act = <<"Init", "">> /\ m2 = M2View
Steps ==
    \E w \in Workers :
        \/ L!Acquire(w) /\ A("Acquire", w)
        \/ L!StealLock(w) /\ A("StealLock", w)
        \/ L!Notice(w) /\ A("Notice", w)
        \/ L!Crash(w) /\ A("Crash", w)
        \/ L!ReleaseDead(w) /\ A("ReleaseDead", w)
        \/ L!Restart(w) /\ A("Restart", w)
        \/ L!ReadStart(w) /\ A("ReadStart", w)
        \/ L!Read(w) /\ A("Read", w)
        \/ L!Want(w) /\ A("Want", w)
        \/ \E x \in Workers : L!Start(w, x) /\ act' = <<"Start", w, x>>
        \/ L!End(w) /\ A("End", w)
        \/ L!Abandon(w) /\ A("Abandon", w)
        \/ L!Refused(w) /\ A("Refused", w)
        \/ L!Release(w) /\ A("Release", w)
        \/ L!QueueReconcile(w) /\ A("QueueReconcile", w)
        \/ L!GrantQueued(w) /\ A("GrantQueued", w)
        \/ L!Freeze(w) /\ A("Freeze", w)
        \/ L!Thaw(w) /\ A("Thaw", w)
GraphNext == Steps /\ m2' = M2View'

GraphSpec == GraphInit /\ [][GraphNext]_<<L!vars, act, m2>>

\* The run and every writer request have settled, and the chat lock is released.
Quiescent ==
    /\ lock = L!None /\ run.s # "live"
    /\ \A w \in Workers :
         ~want[w] /\ drives[w] = 0 /\ ~queued[w] /\ pending[w] = 0
         /\ lead[w] = 0 /\ ~reading[w] /\ ~noticeDue[w]
    /\ \A k \in Keys : status[k] # "waiting"
====
