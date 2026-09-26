---------------------------- MODULE AcpSessions ----------------------------
(***************************************************************************)
(* M3: the ACP sessions of one ACP port (external-agents blueprint, W10).   *)
(* I33, split into its named parts, at the grain of M3's events.           *)
(*                                                                         *)
(* The parent `acpSessions` (one child per key, a closing child keeps its *)
(* key, eviction after every `opened` and `turnEnded`) plus the MCP        *)
(* binding lease (a bound turn keeps its capability). The as-built port's  *)
(* branch (TARGET = FALSE) was deleted at EA-S7, once the parent landed.   *)
(*                                                                         *)
(* ONE_RUN = FALSE lets two runs reach one key, which the host allowed     *)
(* through the external admission gap (L2a D2) until W0.6. The target must *)
(* hold I33 even then: M3 refuses the second acquire with CHAT_RUN_LIVE.   *)
(*                                                                         *)
(* Six knobs each switch one mechanism off (a `witness`                    *)
(* configuration turns exactly one of them FALSE):                         *)
(*   LEASE        the endpoint admits a bound turn past token expiry       *)
(*   EVICT_ON_END eviction also runs when a turn ends, not only on open    *)
(*   KEEP_KEY     a closing child keeps its key; one acquire queues on it  *)
(*   BUSY_GUARD   idle expiry, closeChat and a reopen skip a lent child    *)
(*   HARD_CLOSE   every close escalates to SIGKILL (no SIGTERM-only path)  *)
(*   QUEUED_CANCEL a cancel reaches a lend queued behind a presentation   *)
(*                write (W10.r1 finding 1: the child ignored it)           *)
(*                                                                         *)
(* Action names are M3's events (MC-R27): Acquire, Opened, Dequeued,       *)
(* PromptAnswered, TurnEnded, IdleExpired, CloseChat, AdapterExited,       *)
(* Cancel, CancelQueued, CancelSettled and CancelTimedOut; Tick is the     *)
(* environment, and SoftCloseDone exists only for the HARD_CLOSE witness.  *)
(* `act` labels the step for the graph export.                             *)
(*                                                                         *)
(* Success-path labels: one machine transition carries one `meta.tla`, so  *)
(* a transition with several branches is labelled by the action its        *)
(* success path refines. Its failure branches (an abandoned open, a        *)
(* restore-ladder step, a refused write) are either another action's       *)
(* effect at this grain or Unmodelled; the label does not name them. The   *)
(* parent's `cancel` is labelled Cancel, and its branch that settles a     *)
(* queued acquire refines CancelQueued.                                    *)
(*                                                                         *)
(* Abstractions: LRU order is "any idle victim"; time is three capability  *)
(* buckets and one idle flag; a cwd change folds into the reopen branch;   *)
(* the adapter's process group is one process; the lease ceiling, crashes  *)
(* and vendor semantics are not modelled.                                  *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS Keys, Runs, Limit, MaxProcs, ONE_RUN,
          LEASE, EVICT_ON_END, KEEP_KEY, BUSY_GUARD, HARD_CLOSE, QUEUED_CANCEL

Procs == 1..MaxProcs
NoProc == 0
AKey == CHOOSE k \in Keys : TRUE

VARIABLES
  proc,   \* [Procs -> [key, st, cap, bound, soft]]: one adapter process group and vendor session
  ent,    \* [Keys -> [pid, st]]: the parent's slot
  timer,  \* [Keys -> BOOLEAN]: an idle timer (target: the delayed raise idle:<key>) is armed
  run,    \* [Runs -> [pc, key, pid, cx]]: one external turn inside the port; cx = a cancel was dropped
  next,   \* next unused process id
  act     \* the label of the step that produced this state

vars == <<proc, ent, timer, run, next, act>>

Free(k) == [pc |-> "free", key |-> k, pid |-> NoProc, cx |-> FALSE]

Init ==
  /\ proc = [p \in Procs |-> [key |-> AKey, st |-> "unused", cap |-> "fresh", bound |-> FALSE, soft |-> FALSE]]
  /\ ent = [k \in Keys |-> [pid |-> NoProc, st |-> "none"]]
  /\ timer = [k \in Keys |-> FALSE]
  /\ run = [r \in Runs |-> Free(AKey)]
  /\ next = 1
  /\ act = "Init"

TypeOK ==
  /\ \A p \in Procs : proc[p].st \in {"unused", "open", "closing", "closed"}
                      /\ proc[p].cap \in {"fresh", "margin", "expired"}
  /\ \A k \in Keys : ent[k].st \in {"none", "busy", "idle", "closing"} /\ ent[k].pid \in Procs \cup {NoProc}
  /\ \A r \in Runs : run[r].pc \in {"free", "opening", "waitClose", "queued", "prompting", "cancelling", "finishing"}
                    /\ run[r].cx \in BOOLEAN
  /\ next \in 1..(MaxProcs + 1)

Max(a, b) == IF a > b THEN a ELSE b
Min(a, b) == IF a < b THEN a ELSE b
(* Live and busy count open children only; a slot still opening has no     *)
(* process yet.                                                             *)
LiveIn(e) == {k \in Keys : e[k].st \in {"busy", "idle"} /\ e[k].pid # NoProc}
Live == LiveIn(ent)
Busy == {k \in Keys : ent[k].st = "busy" /\ ent[k].pid # NoProc}
ActiveOn(k) == {r \in Runs : run[r].pc # "free" /\ run[r].key = k}
Waiting(k) == {r \in Runs : run[r].pc = "waitClose" /\ run[r].key = k}
None == [pid |-> NoProc, st |-> "none"]
(* The slot a close leaves behind: the parent keeps the key while the       *)
(* process closes; the KEEP_KEY witness frees it at once.                   *)
ClosingOf(p) == IF KEEP_KEY THEN [pid |-> p, st |-> "closing"] ELSE None

(* Evict idle children until at most Limit are live or none is idle.        *)
EvictSets(e) ==
  LET live == LiveIn(e)
      idle == {k \in Keys : e[k].st = "idle" /\ e[k].pid # NoProc}
      n == Min(Cardinality(idle), Max(0, Cardinality(live) - Limit))
  IN {V \in SUBSET idle : Cardinality(V) = n}

(* Close a process: the slot naming it goes with the child's `closed`      *)
(* report, and a turn queued on it (in `rs`, the runs after this step's    *)
(* own change) reopens; the parent keeps the key occupied for that turn.   *)
CloseProc(p, rs) ==
  LET k == proc[p].key IN
  /\ proc' = [proc EXCEPT ![p].st = "closed", ![p].bound = FALSE]
  /\ ent' = IF ent[k].pid = p
              THEN [ent EXCEPT ![k] = IF KEEP_KEY /\ Waiting(k) # {} THEN [pid |-> NoProc, st |-> "busy"] ELSE None]
              ELSE ent
  /\ run' = [r \in Runs |-> IF rs[r].pc = "waitClose" /\ rs[r].pid = p
                              THEN [rs[r] EXCEPT !.pc = "opening", !.pid = NoProc] ELSE rs[r]]

-----------------------------------------------------------------------------
(* `acquire`: a turn arrives for key k (M1 calls port.run).                  *)
Acquire(r, k) ==
  /\ run[r].pc = "free"
  /\ ONE_RUN => ActiveOn(k) = {}
  /\ act' = "Acquire"
  /\ LET e == ent[k] IN
     \/ /\ e.st = "none"
        /\ run' = [run EXCEPT ![r] = [Free(k) EXCEPT !.pc = "opening"]]
        /\ ent' = [ent EXCEPT ![k] = [pid |-> NoProc, st |-> "busy"]]
        /\ timer' = [timer EXCEPT ![k] = FALSE]
        /\ UNCHANGED <<proc, next>>
     \* A lent child with a fresh capability has no branch: the parent refuses CHAT_RUN_LIVE.
     \/ /\ e.st = "idle"                         \* a resting child is lent at once, or the
        /\ e.pid # NoProc                         \* lend queues behind a presentation write
        /\ proc[e.pid].cap = "fresh"
        /\ ent' = [ent EXCEPT ![k].st = "busy"]
        /\ timer' = [timer EXCEPT ![k] = FALSE]
        /\ UNCHANGED next
        /\ \/ /\ run' = [run EXCEPT ![r] = [Free(k) EXCEPT !.pc = "prompting", !.pid = e.pid]]
              /\ proc' = [proc EXCEPT ![e.pid].bound = TRUE]
           \/ /\ run' = [run EXCEPT ![r] = [Free(k) EXCEPT !.pc = "queued", !.pid = e.pid]]
              /\ UNCHANGED proc
     \/ /\ e.st \in {"idle", "busy"}
        /\ e.pid # NoProc
        /\ BUSY_GUARD => e.st = "idle"
        /\ proc[e.pid].cap # "fresh"
        \* reopen for a lapsing capability (or a changed cwd)
        /\ run' = [run EXCEPT ![r] = [Free(k) EXCEPT !.pc = "waitClose", !.pid = e.pid]]
        /\ ent' = [ent EXCEPT ![k] = ClosingOf(e.pid)]
        /\ proc' = [proc EXCEPT ![e.pid].st = "closing"]
        /\ timer' = [timer EXCEPT ![k] = FALSE]
        /\ UNCHANGED next
     \/ /\ KEEP_KEY
        /\ e.st = "closing"
        /\ Waiting(k) = {}                         \* one queued acquire per key
        /\ run' = [run EXCEPT ![r] = [Free(k) EXCEPT !.pc = "waitClose", !.pid = e.pid]]
        /\ UNCHANGED <<proc, ent, timer, next>>

(* `opened`: the adapter is initialized and the session restored or        *)
(* created; the parent evicts in the same step.                             *)
Opened(r) ==
  /\ run[r].pc = "opening"
  /\ next <= MaxProcs
  /\ act' = "Opened"
  /\ LET k == run[r].key
         n == next
         p2 == [proc EXCEPT ![n] = [key |-> k, st |-> "open", cap |-> "fresh", bound |-> TRUE, soft |-> FALSE]]
         e2 == [ent EXCEPT ![k] = [pid |-> n, st |-> "busy"]]
     IN /\ next' = next + 1
        /\ \E V \in EvictSets(e2) :
             /\ ent' = [j \in Keys |-> IF j \in V THEN ClosingOf(e2[j].pid) ELSE e2[j]]
             /\ proc' = [q \in Procs |-> IF \E j \in V : e2[j].pid = q THEN [p2[q] EXCEPT !.st = "closing"] ELSE p2[q]]
             /\ timer' = [j \in Keys |-> IF j \in V THEN FALSE ELSE timer[j]]
             /\ run' = [run EXCEPT ![r].pc = "prompting", ![r].pid = n]

(* The presentation write lands: the queued lend is lent and prompts.       *)
Dequeued(r) ==
  /\ run[r].pc = "queued"
  /\ run' = [run EXCEPT ![r].pc = "prompting"]
  /\ proc' = [proc EXCEPT ![run[r].pid].bound = TRUE]
  /\ act' = "Dequeued"
  /\ UNCHANGED <<ent, timer, next>>

(* Environment: wall-clock time passes for an open session's capability.    *)
Tick(p) ==
  /\ proc[p].st = "open"
  /\ proc[p].cap # "expired"
  /\ proc' = [proc EXCEPT ![p].cap = IF proc[p].cap = "fresh" THEN "margin" ELSE "expired"]
  /\ act' = "Tick"
  /\ UNCHANGED <<ent, timer, run, next>>

(* The answer to `session/prompt`: the child enters `busy.flushing`.        *)
PromptAnswered(r) ==
  /\ run[r].pc = "prompting"
  /\ run' = [run EXCEPT ![r].pc = "finishing"]
  /\ act' = "PromptAnswered"
  /\ UNCHANGED <<proc, ent, timer, next>>

(* `turnEnded` resting: the binding is released; the parent evicts and     *)
(* arms idle.                                                               *)
EndResting(r) ==
  LET k == run[r].key
         p == run[r].pid
         p2 == [proc EXCEPT ![p].bound = FALSE]
         e2 == IF ent[k].pid = p /\ ent[k].st = "busy" THEN [ent EXCEPT ![k].st = "idle"] ELSE ent
     IN \E V \in (IF EVICT_ON_END THEN EvictSets(e2) ELSE {{}}) :
          /\ ent' = [j \in Keys |-> IF j \in V THEN ClosingOf(e2[j].pid) ELSE e2[j]]
          /\ proc' = [q \in Procs |-> IF \E j \in V : e2[j].pid = q THEN [p2[q] EXCEPT !.st = "closing"] ELSE p2[q]]
          /\ timer' = [j \in Keys |-> IF j \in V THEN FALSE
                                      ELSE IF j = k /\ e2[k].st = "idle" THEN TRUE ELSE timer[j]]
          /\ run' = [run EXCEPT ![r] = Free(k)]
          /\ UNCHANGED next

TurnEnded(r) ==
  /\ run[r].pc = "finishing"
  /\ EndResting(r)
  /\ act' = "TurnEnded"

(* `idleExpired`: the delayed raise idle:<key> is delivered.                *)
IdleExpired(k) ==
  /\ timer[k]
  /\ ent[k].pid # NoProc
  /\ ent[k].st \in {"busy", "idle"}
  /\ BUSY_GUARD => ent[k].st = "idle"
  /\ proc' = [proc EXCEPT ![ent[k].pid].st = "closing"]
  /\ ent' = [ent EXCEPT ![k] = ClosingOf(ent[k].pid)]
  /\ timer' = [timer EXCEPT ![k] = FALSE]
  /\ act' = "IdleExpired"
  /\ UNCHANGED <<run, next>>

(* `closeChat`: rewind, relinquish, host close.                              *)
CloseChat(k) ==
  /\ ONE_RUN => ActiveOn(k) = {}
  /\ ent[k].st \in {"busy", "idle"}
  /\ ent[k].pid # NoProc
  /\ BUSY_GUARD => ent[k].st = "idle"             \* a lent child refuses CHAT_RUN_LIVE
  /\ proc' = [proc EXCEPT ![ent[k].pid].st = "closing"]
  /\ ent' = [ent EXCEPT ![k] = ClosingOf(ent[k].pid)]
  /\ timer' = [timer EXCEPT ![k] = FALSE]
  /\ act' = "CloseChat"
  /\ UNCHANGED <<run, next>>

(* `adapterExited` after the close ladder (session/close, SIGTERM to the    *)
(* group, SIGKILL after E17, the E18 backstop); the child reports `closed`. *)
AdapterExited(p) ==
  /\ proc[p].st = "closing"
  /\ ~proc[p].soft
  /\ CloseProc(p, run)
  /\ act' = "AdapterExited"
  /\ UNCHANGED <<timer, next>>

(* HARD_CLOSE witness only: a SIGTERM-only close may or may not end.        *)
SoftCloseDone(p) ==
  /\ proc[p].st = "closing"
  /\ proc[p].soft
  /\ CloseProc(p, run)
  /\ act' = "SoftCloseDone"
  /\ UNCHANGED <<timer, next>>

(* `cancel` while the session is opening: the child answers the turn at    *)
(* once and closes the adapter it spawned at acquire (the ladder).         *)
CancelOpening(r) ==
  /\ run[r].pc = "opening"
  /\ next <= MaxProcs
  /\ LET k == run[r].key IN
     /\ next' = next + 1
     /\ proc' = [proc EXCEPT ![next] = [key |-> k, st |-> "closing", cap |-> "fresh", bound |-> FALSE,
                                        soft |-> ~HARD_CLOSE]]
     /\ run' = [run EXCEPT ![r].pc = "free"]
     /\ ent' = IF ent[k].pid = NoProc THEN [ent EXCEPT ![k] = ClosingOf(next)] ELSE ent
     /\ UNCHANGED timer

(* `cancel` while prompting: `session/cancel` is notified; the child waits. *)
CancelPrompting(r) ==
  /\ run[r].pc = "prompting"
  /\ run' = [run EXCEPT ![r].pc = "cancelling"]
  /\ UNCHANGED <<proc, ent, timer, next>>

(* `cancel` of a lend queued behind a presentation write: the child ends   *)
(* the turn resting before it prompts. The QUEUED_CANCEL witness drops     *)
(* the cancel (as the child did before W10.r1) and marks the run.          *)
CancelQueuedLend(r) ==
  /\ run[r].pc = "queued"
  /\ IF QUEUED_CANCEL
       THEN EndResting(r)
       ELSE /\ run' = [run EXCEPT ![r].cx = TRUE]
            /\ UNCHANGED <<proc, ent, timer, next>>

Cancel(r) == (CancelOpening(r) \/ CancelPrompting(r) \/ CancelQueuedLend(r)) /\ act' = "Cancel"

(* The parent's `cancel` of an acquire queued on a closing key: it is     *)
(* answered at once, and the key frees when the old process exits.         *)
CancelQueued(r) ==
  /\ run[r].pc = "waitClose"
  /\ run' = [run EXCEPT ![r] = Free(run[r].key)]
  /\ act' = "CancelQueued"
  /\ UNCHANGED <<proc, ent, timer, next>>

(* The prompt settles after `session/cancel`.                               *)
CancelSettled(r) ==
  /\ run[r].pc = "cancelling"
  /\ run' = [run EXCEPT ![r].pc = "finishing"]
  /\ act' = "CancelSettled"
  /\ UNCHANGED <<proc, ent, timer, next>>

(* The 2 s cancel-settlement bound expires: the ladder kills the process,  *)
(* and the child reports the deferred `turnEnded` and `closed` from        *)
(* `closed`, in one step of the parent.                                    *)
CancelTimedOut(r) ==
  /\ run[r].pc = "cancelling"
  /\ LET p == run[r].pid IN
     /\ proc[p].st # "closed"
     /\ CloseProc(p, [run EXCEPT ![r] = Free(run[r].key)])
     /\ act' = "CancelTimedOut"
     /\ UNCHANGED <<timer, next>>

Next ==
  \/ \E r \in Runs, k \in Keys : Acquire(r, k)
  \/ \E r \in Runs : Opened(r) \/ Dequeued(r) \/ PromptAnswered(r) \/ TurnEnded(r) \/ Cancel(r)
                     \/ CancelQueued(r) \/ CancelSettled(r) \/ CancelTimedOut(r)
  \/ \E p \in Procs : Tick(p) \/ AdapterExited(p) \/ SoftCloseDone(p)
  \/ \E k \in Keys : IdleExpired(k) \/ CloseChat(k)

Fairness ==
  /\ \A r \in Runs : WF_vars(CancelTimedOut(r)) /\ WF_vars(TurnEnded(r)) /\ WF_vars(Dequeued(r))
  /\ \A p \in Procs : WF_vars(AdapterExited(p))

Spec == Init /\ [][Next]_vars /\ Fairness

(* Names for the machines' `meta.tla` (MC-R27), neither in Next: a transition that leaves this        *)
(* abstraction unchanged refines Stutter; one outside the model's scope (either machine's root       *)
(* onError, an adapter crash, a vendor refusal or failure) names Unmodelled.                          *)
Stutter == UNCHANGED vars
Unmodelled == FALSE

-----------------------------------------------------------------------------
(* I33, split into its named parts.                                          *)

(* No busy session is closed: a turn never prompts a closing or closed session. *)
NoEvictBusy == \A r \in Runs : run[r].pc = "prompting" => proc[run[r].pid].st = "open"

(* At most the limit open unless more are lent (hence at most `limit` idle). *)
AtMostLimitIdle == Cardinality(Live) <= Max(Limit, Cardinality(Busy))

(* One session per key: at most one adapter process per key that has not exited. *)
OneSessionPerKey ==
  \A k \in Keys : Cardinality({p \in Procs : proc[p].key = k /\ proc[p].st \in {"open", "closing"}}) <= 1

(* A cancelled turn never prompts. *)
NoPromptAfterCancel == \A r \in Runs : run[r].pc = "prompting" => ~run[r].cx

(* No prompt while the endpoint would refuse its tool calls. *)
Admits(p) == proc[p].cap # "expired" \/ (LEASE /\ proc[p].bound)
NoPromptPastCapability == \A r \in Runs : run[r].pc = "prompting" => Admits(run[r].pid)

(* Close is final: a live slot never names a closing or closed session, and a closing one never reopens. *)
CloseIsFinal ==
  \A k \in Keys : (ent[k].st \in {"busy", "idle"} /\ ent[k].pid # NoProc) => proc[ent[k].pid].st = "open"
CloseIsFinalStep ==
  [][\A p \in Procs : proc[p].st \in {"closing", "closed"} => proc'[p].st \in {"closing", "closed"}]_vars

(* Quiescence: no run in flight and no process closing (the nightly's simulated behaviours end here). *)
Quiescent == (\A r \in Runs : run[r].pc = "free") /\ (\A p \in Procs : proc[p].st # "closing")

(* Cancel settles, and every close ends. *)
CancelSettles == \A r \in Runs : (run[r].pc = "cancelling") ~> (run[r].pc = "free")
Terminates == \A p \in Procs : (proc[p].st = "closing") ~> (proc[p].st = "closed")
=============================================================================
