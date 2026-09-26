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
(* Sources of the rules: the appender's term rules (CL-R5, CL-R11) and the *)
(* chat ledger's fold and append gate (`src/log/chat-ledger.ts`: CL-R9,    *)
(* CL-R15 to CL-R17, `gateRows`). The lifecycle table and the resumable    *)
(* failure codes are read from `src/log/*.json`, which TypeScript imports  *)
(* too (CL-R10); TLC runs in this directory, so the paths are relative.    *)
(*                                                                         *)
(* OpaqueSkipped (CL-R1): a row whose version is above 1, whose type this  *)
(* build does not know, or whose lifecycle state, interrupt phase or       *)
(* invocation purpose is not in its enum, is consumed without effect: only *)
(* the envelope rules (term, sequence and epoch) apply to it.              *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, Json, IOUtils, TLC

Log == ndJsonDeserialize(IOEnv.FORMAL_TRACE)

LifecycleLegality == JsonDeserialize("../src/log/run-lifecycle.legality.json")
ResumableCodes ==
  LET codes == JsonDeserialize("../src/log/resumable-failure-codes.json") IN {codes[k] : k \in DOMAIN codes}
\* The external-stop predicate (`externalStopIsResumable`) is TypeScript-only; these codes over-approximate it.
ReopenCodes == ResumableCodes \cup {"EXTERNAL_AGENT_LIMIT_REACHED", "EXTERNAL_AGENT_FAILED"}

KnownTypes ==
  {"message.appended", "message.envelope-replaced", "history.compacted", "history.rewound",
   "snapshot-context.refreshed", "safeguard.recorded", "interrupt.recorded", "turn.finalized", "turn.conflicted",
   "turn.failed", "run.lifecycle", "model.invocation-prepared", "model.invocation-bound",
   "model.invocation-settled", "turn.history-projection-committed"}
Settlements == {"turn.finalized", "turn.conflicted", "turn.failed"}
Ended       == {"completed", "failed", "cancelled"}
Rested      == Ended \cup {"paused"}   \* an attempt that is no longer running

VARIABLES
  i,         \* rows consumed
  epoch,     \* the active leader epoch (term id); "" before the first row
  seq,       \* the last sequence written in the active term
  closed,    \* terms that have ended; none may write again
  maxEpoch,  \* the highest integer epoch seen; legacy rows count 0
  termEpoch, \* the active term's integer epoch (its first row's; 0 when it had none)
  lifecycle, \* run id -> its last lifecycle state
  att,       \* run id -> its current attempt
  code,      \* run id -> its last lifecycle row's failure code ("" when none)
  settled,   \* <<run id, attempt>> pairs with a settlement row
  current,   \* the chat's run: the last one with a lifecycle row; "" before any
  pending,   \* <<run id, interrupt id>> requested and not resolved
  inv,       \* model attempt id -> [run, attempt, purpose, settled, shown]
  open,      \* run id -> its last prepared attempt id until shown or settled ("" when none): `openInvocation`
  opened     \* command ids that opened an effect

vars == <<i, epoch, seq, closed, maxEpoch, termEpoch, lifecycle, att, code, settled, current, pending, inv, open, opened>>

Has(r, f) == f \in DOMAIN r
Known(e) ==
  /\ e.version <= 1
  /\ e.type \in KnownTypes
  /\ e.type = "run.lifecycle" => e.state \in DOMAIN LifecycleLegality.table.unadmitted
  /\ e.type = "interrupt.recorded" => e.phase \in {"requested", "resolved"}
  /\ e.type = "model.invocation-prepared" => e.purpose \in {"generation", "compaction"}
IsLifecycle(e) == Known(e) /\ e.type = "run.lifecycle"
IsSettlement(e) == Known(e) /\ e.type \in Settlements

HasRun(r)     == r \in DOMAIN lifecycle
AttemptOf(r)  == IF r \in DOMAIN att THEN att[r] ELSE 0
CodeOf(r)     == IF r \in DOMAIN code THEN code[r] ELSE ""
SettledNow(r) == <<r, AttemptOf(r)>> \in settled
Reopenable(r) ==
  \/ lifecycle[r] = "failed" /\ CodeOf(r) \in ReopenCodes
  \/ lifecycle[r] = "paused" /\ ~\E p \in pending : p[1] = r

(* CL-R9: a `running` row opens the next attempt (`reopens`), settled or not (ChatRunSlot's Att(T)+1; W7.r1). *)
Reopens(e) ==
  /\ IsLifecycle(e) /\ e.state = "running" /\ HasRun(e.runId)
  /\ ~Has(e, "attempt") \/ e.attempt = AttemptOf(e.runId) + 1
  /\ lifecycle[e.runId] \in Rested /\ Reopenable(e.runId)

(* The run's state in `run-lifecycle.legality.json`'s domain; "open" and "ended" have one row. *)
LegalityState(r) ==
  IF ~HasRun(r) THEN "unadmitted"
  ELSE IF SettledNow(r)
    THEN IF lifecycle[r] \notin Rested THEN "settled-open"
         ELSE IF Reopenable(r) THEN "reopenable" ELSE "settled"
  ELSE IF lifecycle[r] \in Rested THEN "ended" ELSE "open"

OpensRun(e) == IsLifecycle(e) /\ (e.state = "admitted" \/ Reopens(e))
OpensEffect(e) == OpensRun(e) \/ (Known(e) /\ e.type = "interrupt.recorded" /\ e.phase = "resolved")
SettlementAttempt(e) == IF Has(e, "attempt") THEN e.attempt ELSE AttemptOf(e.runId)

(* Model invocations (CL-R17, GI-R5). *)
Unresolved(id) == ~inv[id].settled /\ ~inv[id].shown
OpenOf(r) == IF r \in DOMAIN open THEN open[r] ELSE ""
FirstOfAttempt(e) == ~\E id \in DOMAIN inv : inv[id].run = e.runId /\ inv[id].attempt = AttemptOf(e.runId)
IsGeneration(e) == Known(e) /\ e.type = "model.invocation-prepared" /\ e.purpose = "generation"
\* The assistant message a row shows, if any: an appended message or an envelope replacement.
Shown(e) ==
  LET m == IF e.type = "message.appended" THEN e.message ELSE e.replacement
      meta == m.metadata
  IN /\ Known(e) /\ e.type \in {"message.appended", "message.envelope-replaced"}
     /\ m.role = "assistant" /\ Has(m, "metadata") /\ Has(meta, "tauInternal")
     /\ meta.tauInternal.kind = "billing-invocation" /\ Has(meta.tauInternal, "attemptId")
     /\ ~(Has(meta, "stopReason") /\ meta.stopReason \in {"error", "aborted"})
ShownIdOf(e) ==
  IF ~Shown(e) THEN ""
  ELSE IF e.type = "message.appended" THEN e.message.metadata.tauInternal.attemptId
  ELSE e.replacement.metadata.tauInternal.attemptId

(* Each rule, for the row about to be appended. *)
Holds(rule, e) ==
  CASE rule = "SequenceContiguous" -> e.leaderEpoch = epoch => e.sequence = seq + 1   \* EVENT_OUT_OF_ORDER
    [] rule = "EpochNotReopened"   -> e.leaderEpoch \notin closed                     \* a closed term cannot append
    [] rule = "EpochStartsAtZero"  -> e.leaderEpoch # epoch => e.sequence = 0         \* CL-R5
    [] rule = "EpochsIncrease"     ->                                                 \* CL-R5, CL-R11
         (IF e.leaderEpoch # epoch
            THEN IF Has(e, "epoch") THEN e.epoch > maxEpoch ELSE maxEpoch = 0
            ELSE Has(e, "epoch") => e.epoch = termEpoch)
    [] rule = "AdmittedOnce"       -> IsLifecycle(e) /\ e.state = "admitted" => ~HasRun(e.runId)          \* RUN_ID_TAKEN
    [] rule = "OneRunAtATime"      -> OpensRun(e) =>                                                     \* CHAT_RUN_LIVE (RV1-F4)
                                        current \in {"", e.runId} \/ lifecycle[current] \in Ended
    [] rule = "ReopenOnlyByRunning" -> IsLifecycle(e) /\ e.state # "admitted" =>                          \* CL-R9, CL-R10
                                        LifecycleLegality.table[LegalityState(e.runId)][e.state] = "ok"
    [] rule = "SettlementNeedsRun" -> IsSettlement(e) => HasRun(e.runId)                                  \* SETTLEMENT_WITHOUT_RUN
    [] rule = "SettledOnce"        -> IsSettlement(e) => <<e.runId, SettlementAttempt(e)>> \notin settled \* SETTLEMENT_CONFLICT
    [] rule = "RowsNeedRun"        -> Known(e) /\ ~HasRun(e.runId) => IsLifecycle(e) \/ IsSettlement(e)   \* stricter than the host
    [] rule = "InvocationSettledOnce" -> Known(e) /\ e.type = "model.invocation-settled" =>               \* CL-R17 (W11)
                                        e.attemptId \in DOMAIN inv /\ ~inv[e.attemptId].settled
    [] rule = "CommandOpensOnce"   -> OpensEffect(e) /\ Has(e, "commandId") => e.commandId \notin opened \* FM-Q11, D15
    [] rule = "PrepareOnlyWhenResolved" -> IsGeneration(e) =>                                            \* INVOCATION_UNRESOLVED (RV1-F3)
                                        IF FirstOfAttempt(e) THEN ~\E id \in DOMAIN inv : Unresolved(id)  \* gateCode
                                        ELSE ~\E id \in DOMAIN inv : Unresolved(id) /\ inv[id].run = e.runId  \* EQ1: any,
                                                                     /\ inv[id].purpose = "generation"   \* not the last

Rules == {"SequenceContiguous", "EpochNotReopened", "EpochStartsAtZero", "EpochsIncrease", "AdmittedOnce",
          "OneRunAtATime", "ReopenOnlyByRunning", "SettlementNeedsRun", "SettledOnce", "RowsNeedRun",
          "InvocationSettledOnce", "CommandOpensOnce", "PrepareOnlyWhenResolved"}

\* Evaluated as a value: in an action TLC branches on both sides of a disjunction, and some rules
\* read a map only where a left disjunct fails (`lifecycle[current]`, `e.attempt`).
\* `formal logs` waives a rule a known host defect breaks (FORMAL_WAIVE_<rule> set), so the rows after it are
\* still checked to the end; a spec run sets none.
Waived == {rule \in Rules : ("FORMAL_WAIVE_" \o rule) \in DOMAIN IOEnv}
Broken(e) == {rule \in Rules \ Waived : ~Holds(rule, e)}

Init ==
  /\ i = 0 /\ epoch = "" /\ seq = -1 /\ closed = {} /\ maxEpoch = 0 /\ termEpoch = 0
  /\ lifecycle = [r \in {} |-> "none"] /\ att = [r \in {} |-> 0] /\ code = [r \in {} |-> ""]
  /\ settled = {} /\ current = "" /\ pending = {} /\ inv = [a \in {} |-> {}] /\ open = [r \in {} |-> ""]
  /\ opened = {}

NextInv(e) ==
  CASE Known(e) /\ e.type = "model.invocation-prepared" /\ e.attemptId \notin DOMAIN inv ->
         (e.attemptId :> [run |-> e.runId, attempt |-> AttemptOf(e.runId), purpose |-> e.purpose,
                          settled |-> FALSE, shown |-> FALSE]) @@ inv
    [] Known(e) /\ e.type = "model.invocation-settled" -> [inv EXCEPT ![e.attemptId].settled = TRUE]
    [] ShownIdOf(e) \in DOMAIN inv ->   \* any purpose, as the fold's markShown
         [inv EXCEPT ![ShownIdOf(e)].shown = TRUE]
    [] Known(e) /\ e.type = "history.compacted" ->   \* closes every compaction invocation of its run
         [id \in DOMAIN inv |-> IF inv[id].run = e.runId /\ inv[id].purpose = "compaction"
                                  THEN [inv[id] EXCEPT !.shown = TRUE] ELSE inv[id]]
    [] OTHER -> inv

\* `openInvocation`: set by every prepared row, cleared by its attempt's settled row or shown reply.
Closes(r, id) == IF OpenOf(r) = id THEN (r :> "") @@ open ELSE open
NextOpen(e) ==
  CASE Known(e) /\ e.type = "model.invocation-prepared" /\ e.attemptId \notin DOMAIN inv ->
         (e.runId :> e.attemptId) @@ open
    [] Known(e) /\ e.type = "model.invocation-settled" -> Closes(inv[e.attemptId].run, e.attemptId)
    [] ShownIdOf(e) \in DOMAIN inv -> Closes(inv[ShownIdOf(e)].run, ShownIdOf(e))
    [] Known(e) /\ e.type = "history.compacted" /\ OpenOf(e.runId) \in DOMAIN inv ->
         IF inv[OpenOf(e.runId)].purpose = "compaction" THEN Closes(e.runId, OpenOf(e.runId)) ELSE open
    [] OTHER -> open

Write(e) ==
  /\ Broken(e) = {}
  /\ i' = i + 1
  /\ epoch' = e.leaderEpoch
  /\ seq' = e.sequence
  /\ closed' = IF e.leaderEpoch # epoch /\ epoch # "" THEN closed \cup {epoch} ELSE closed
  /\ maxEpoch' = IF e.leaderEpoch # epoch /\ Has(e, "epoch") THEN e.epoch ELSE maxEpoch
  /\ termEpoch' = IF e.leaderEpoch # epoch THEN (IF Has(e, "epoch") THEN e.epoch ELSE 0) ELSE termEpoch
  /\ lifecycle' = IF IsLifecycle(e) THEN (e.runId :> e.state) @@ lifecycle ELSE lifecycle
  /\ att' = CASE IsLifecycle(e) /\ e.state = "admitted" -> (e.runId :> 1) @@ att
              [] Reopens(e)                            -> (e.runId :> AttemptOf(e.runId) + 1) @@ att
              [] OTHER                                 -> att
  /\ code' = IF ~IsLifecycle(e) THEN code
             ELSE (e.runId :> IF e.state = "failed" /\ Has(e, "detail") /\ Has(e.detail, "code")
                              THEN e.detail.code ELSE "") @@ code
  /\ settled' = IF IsSettlement(e) THEN settled \cup {<<e.runId, SettlementAttempt(e)>>} ELSE settled
  /\ current' = IF IsLifecycle(e) THEN e.runId ELSE current
  /\ pending' = CASE Known(e) /\ e.type = "interrupt.recorded" /\ e.phase = "requested" ->
                       pending \cup {<<e.runId, e.interruptId>>}
                  [] Known(e) /\ e.type = "interrupt.recorded" ->
                       {p \in pending : p[2] # e.interruptId}   \* resolved, whatever its payload (CL-R16)
                  [] OTHER -> pending
  /\ inv' = NextInv(e)
  /\ open' = NextOpen(e)
  /\ opened' = IF OpensEffect(e) /\ Has(e, "commandId") THEN opened \cup {e.commandId} ELSE opened

Done == i = Len(Log) /\ UNCHANGED vars

Spec == Init /\ [][(i < Len(Log) /\ Write(Log[i + 1])) \/ Done]_vars

(* Shown for every state of an error trace: the next row and what it breaks. *)
Explain ==
  [row |-> i + 1,
   next |-> IF i < Len(Log) THEN [type |-> Log[i + 1].type, runId |-> Log[i + 1].runId,
                                   leaderEpoch |-> Log[i + 1].leaderEpoch, sequence |-> Log[i + 1].sequence]
            ELSE "end of log",
   broken |-> IF i < Len(Log) THEN Broken(Log[i + 1]) ELSE {}]

=============================================================================
