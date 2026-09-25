------------------------------- MODULE ChatLog -------------------------------
(***************************************************************************)
(* Trace validation of one chat's `events.jsonl` against the log's rules.  *)
(* Bridge C6 for I3, I8, I9 (promoted from S6 by W1; W3 owns the rules).   *)
(*                                                                         *)
(* The log is the sanitized copy named by the FORMAL_TRACE environment     *)
(* variable (FM-R8), read with `ndJsonDeserialize` and consumed            *)
(* row by row: `Write(e)` is enabled only when row `e` keeps every rule,  *)
(* so a log is accepted iff TLC finds a behaviour that consumes all of it. *)
(* A row that breaks a rule leaves no successor: TLC reports a deadlock,   *)
(* and the `Explain` alias names the broken rules and the row.             *)
(*                                                                         *)
(* Sources of the rules: the appender's identity and fencing               *)
(* (`packages/agent-host/src/log/event-sequence.ts`), the host's numbering *)
(* and ledger (`tau-agent-host.ts`: `appendRecords`, `isHostLifecycleLegal`,*)
(* `runSettlementLegality`, `chatRunOperationLegality.admit`).             *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, Json, IOUtils, TLC

Log == ndJsonDeserialize(IOEnv.FORMAL_TRACE)

Settlements == {"turn.finalized", "turn.conflicted", "turn.failed"}
Ended       == {"completed", "failed", "cancelled"}

VARIABLES
  i,         \* rows consumed
  epoch,     \* the active leader epoch; "" before the first row
  seq,       \* the last sequence written in the active epoch
  closed,    \* epochs that have ended; none may write again
  lifecycle, \* run id -> its last lifecycle state
  settled,   \* run id -> whether its current attempt is settled
  current    \* the chat's run: the last one with a lifecycle row; "" before any

vars == <<i, epoch, seq, closed, lifecycle, settled, current>>

StateOf(r)   == IF r \in DOMAIN lifecycle THEN lifecycle[r] ELSE "none"
IsSettled(r) == r \in DOMAIN settled /\ settled[r]
IsLifecycle(e) == e.type = "run.lifecycle"

(* Each rule, for the row about to be appended. *)
Holds(rule, e) ==
  CASE rule = "SequenceContiguous" -> e.leaderEpoch = epoch => e.sequence = seq + 1   \* EVENT_OUT_OF_ORDER
    [] rule = "EpochNotReopened"   -> e.leaderEpoch \notin closed                     \* a closed epoch cannot append
    [] rule = "EpochStartsAtZero"  -> e.leaderEpoch # epoch => e.sequence = 0         \* appendRecords' numbering
    [] rule = "AdmittedOnce"       -> IsLifecycle(e) /\ e.state = "admitted" => StateOf(e.runId) = "none"             \* RUN_ID_TAKEN
    [] rule = "OneRunAtATime"      -> IsLifecycle(e) /\ e.state = "admitted" => current = "" \/ StateOf(current) \in Ended \* CHAT_RUN_LIVE
    [] rule = "ReopenOnlyByRunning" -> IsLifecycle(e) /\ IsSettled(e.runId) /\ StateOf(e.runId) \in Ended => e.state = "running" \* I1
    [] rule = "SettlementNeedsRun" -> e.type \in Settlements => StateOf(e.runId) # "none"   \* SETTLEMENT_WITHOUT_RUN
    [] rule = "SettledOnce"        -> e.type \in Settlements => ~IsSettled(e.runId)        \* SETTLEMENT_CONFLICT (V10)
    [] rule = "RowsNeedRun"        -> StateOf(e.runId) = "none" => IsLifecycle(e) \/ e.type \in Settlements \* stricter than the host

Rules == {"SequenceContiguous", "EpochNotReopened", "EpochStartsAtZero", "AdmittedOnce", "OneRunAtATime",
          "ReopenOnlyByRunning", "SettlementNeedsRun", "SettledOnce", "RowsNeedRun"}

Init ==
  /\ i = 0 /\ epoch = "" /\ seq = -1 /\ closed = {}
  /\ lifecycle = [r \in {} |-> "none"] /\ settled = [r \in {} |-> FALSE] /\ current = ""

Write(e) ==
  /\ \A rule \in Rules : Holds(rule, e)
  /\ i' = i + 1
  /\ epoch' = e.leaderEpoch
  /\ seq' = e.sequence
  /\ closed' = IF e.leaderEpoch # epoch /\ epoch # "" THEN closed \cup {epoch} ELSE closed
  /\ lifecycle' = IF IsLifecycle(e) THEN (e.runId :> e.state) @@ lifecycle ELSE lifecycle
  /\ settled' = CASE e.type \in Settlements                     -> (e.runId :> TRUE) @@ settled
                  [] IsLifecycle(e) /\ e.state = "running"      -> (e.runId :> FALSE) @@ settled \* a reopening is a new attempt
                  [] OTHER                                       -> settled
  /\ current' = IF IsLifecycle(e) THEN e.runId ELSE current

Done == i = Len(Log) /\ UNCHANGED vars

Spec == Init /\ [][(i < Len(Log) /\ Write(Log[i + 1])) \/ Done]_vars

(* Shown for every state of an error trace: the next row and what it breaks. *)
Explain ==
  [row |-> i + 1,
   next |-> IF i < Len(Log) THEN [type |-> Log[i + 1].type, runId |-> Log[i + 1].runId,
                                   leaderEpoch |-> Log[i + 1].leaderEpoch, sequence |-> Log[i + 1].sequence]
            ELSE "end of log",
   broken |-> IF i < Len(Log) THEN {rule \in Rules : ~Holds(rule, Log[i + 1])} ELSE {}]

=============================================================================
