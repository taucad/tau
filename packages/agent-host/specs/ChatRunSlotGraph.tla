---- MODULE ChatRunSlotGraph ----
(***************************************************************************)
(* The graph export of `ChatRunSlot` (W7 RA-S15, FM-R7): the same state    *)
(* and actions, with `act` naming each step and its argument, so `formal   *)
(* update` writes `ChatRunSlotGraph/{graph,suite}.json` for M1's generated *)
(* conformance replay (chat-run.conformance.test.ts). It adds no behaviour: *)
(* `GraphNext` is `ChatRunSlot!Next` with `act` set on every disjunct.     *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets
CONSTANTS
    Features, MaxCrashes,
    BoundaryExclusive, HoldUntilRows, ReleaseOnFailure, PayloadFirst,
    AtomicAbandon, KeyedCommands, AckAfterRow,
    SingleDecider, DurablePause, LazyClaim, SettlePerAttempt, StopFence,
    CloseBarrier, ResolveFirst, OrphanCoded
VARIABLES
    log, res, drivers, steerQ, ending, waiters, tools, pc, answered, alive, crashes,
    epoch, readLen, claimed, opened, ghost, revoked, lease, started, completes, acked,
    lockFree, gw, call, callState, lostCount, hostState, closeAt,
    act

S == INSTANCE ChatRunSlot

A(name, arg) == act' = <<name, arg>>

GraphInit == S!Init /\ act = <<"Init", "">>
GraphNext ==
    \/ \E k \in S!Sendable : (S!send(k) /\ A("send", k)) \/ (S!hostClosed(k) /\ A("hostClosed", k))
    \/ \E r \in S!Runs :
         \/ S!start(r) /\ A("start", r)
         \/ S!admissionPrepared(r) /\ A("admissionPrepared", r)
         \/ S!admissionRefused(r) /\ A("admissionRefused", r)
         \/ S!releaseEarly(r) /\ A("releaseEarly", r)
         \/ S!agentEnded(r) /\ A("agentEnded", r)
         \/ S!toolStart(r) /\ A("toolStart", r)
         \/ S!toolWrite(r) /\ A("toolWrite", r)
         \/ S!abandon(r) /\ A("abandon", r)
         \/ S!abandoned(r) /\ A("abandoned", r)
    \/ \E k \in {S!T, S!X, S!Resume, S!Steer} : S!rowsCommitted(k) /\ A("rowsCommitted", k)
    \/ \E k \in {S!T, S!X, S!Resume} : (S!placed(k) /\ A("placed", k)) \/ (S!placementRefused(k) /\ A("placementRefused", k))
    \/ S!commitRow /\ A("commitRow", "")
    \/ S!resume /\ A("resume", "")
    \/ S!rearmed /\ A("rearmed", "")
    \/ S!resumePrepared /\ A("resumePrepared", "")
    \/ S!resumeRefused /\ A("resumeRefused", "")
    \/ S!approvalRequested /\ A("approvalRequested", "")
    \/ S!steer /\ A("steer", "")
    \/ S!driverSteered /\ A("driverSteered", "")
    \/ S!cancel /\ A("cancel", "")
    \/ S!interrupt /\ A("interrupt", "")
    \/ S!pauseRecorded /\ A("pauseRecorded", "")
    \/ S!resolveInterrupt /\ A("resolveInterrupt", "")
    \/ S!attach /\ A("attach", "")
    \/ S!markAbandoned /\ A("markAbandoned", "")
    \/ S!logOpened /\ A("logOpened", "")
    \/ S!logFenced /\ A("logFenced", "")
    \/ S!crash /\ A("crash", "")
    \/ S!restart /\ A("restart", "")
    \/ S!freeze /\ A("freeze", "")
    \/ S!staleAppend /\ A("staleAppend", "")
    \/ S!relinquish /\ A("relinquish", "")
    \/ S!complete /\ A("complete", "")
    \/ S!settlementPublished /\ A("settlementPublished", "")
    \/ S!acknowledge /\ A("acknowledge", "")
    \/ S!quiescent /\ A("quiescent", "")
    \/ S!modelCall /\ A("modelCall", "")
    \/ S!gatewaySettles /\ A("gatewaySettles", "")
    \/ S!replyShown /\ A("replyShown", "")
    \/ S!replyLost /\ A("replyLost", "")
    \/ S!invocationResolved /\ A("invocationResolved", "")
    \/ S!close /\ A("close", "")
    \/ S!logClosed /\ A("logClosed", "")

GraphSpec == GraphInit /\ [][GraphNext]_<<S!vars, act>>

\* No reservation, driver, command, or settlement is still in flight.
Quiescent ==
    /\ res = S!None /\ drivers = {} /\ steerQ = {} /\ waiters = {} /\ tools = {}
    /\ \A r \in S!Runs : ending[r] = S!None
    /\ \A k \in S!Sendable : pc[k] \in {"idle", "done"}
    /\ lease = {} /\ callState = "idle" /\ hostState # "closing"
====
