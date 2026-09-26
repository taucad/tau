-------------------------- MODULE SeamDeliveryTrace --------------------------
(***************************************************************************)
(* The trace template (W1 FM-S11), instantiated for SeamDelivery (W4 T15). *)
(* A trace named by FORMAL_TRACE is consumed line by line, depth-first;    *)
(* each W1 TraceLine v1 `{t, kind, commandId?, status?, effect?, cursor?,  *)
(* generation?}` is the SeamDelivery action its `kind` names:              *)
(*                                                                         *)
(*   send     the client sends a command, or re-sends it by key when it    *)
(*            reconnects (Send, Connect)                                   *)
(*   append   the owner appends the command's row (Handle)                 *)
(*   answer   the owner answers (Ack, Handle); with `actor` "client", the  *)
(*            client receives the answer (Receive)                         *)
(*   refusal  `reason` "owner-fenced": a fenced owner's answer, sent or,   *)
(*            with `actor` "client", received; "cursor-ahead": the read is *)
(*            refused and the reader resets (Read)                         *)
(*   read     the client reads from `cursor`, connecting first when it has *)
(*            no connection (Connect)                                      *)
(*   batch    the read's rows reach the projection, `cursor` after (Read)  *)
(*   close    the client observes its connection end (SuspectDead,        *)
(*            SuspectFalsely)                                              *)
(*   claim    a generation fences the store and reads the log (Claim)      *)
(*   crash    a generation dies (Crash)                                    *)
(*   done     the simulator's run ended `done`: only in Quiescent (FM-R17) *)
(*                                                                         *)
(* An `effect` on an answer must match its status. The implementation      *)
(* claims every switch. A line no action allows ends the search, and the   *)
(* TraceAccepted postcondition prints the row that was not consumed.       *)
(***************************************************************************)
EXTENDS SeamDelivery, Json, IOUtils, TLC

Trace == ndJsonDeserialize(IOEnv.FORMAL_TRACE)

TraceKeys == {Trace[n].commandId : n \in {n \in DOMAIN Trace : "commandId" \in DOMAIN Trace[n]}}

VARIABLE l \* the next line to consume

traceVars == <<vars, l>>

Get(line, field) == IF field \in DOMAIN line THEN line[field] ELSE "absent"
ByClient(line) == Get(line, "actor") = "client"
EffectOf(s) == IF s \in {"applied", "replayed"} THEN "durable" ELSE "not-applied"
EffectMatches(line) == Get(line, "effect") \in {"absent", EffectOf(line.status)}

\* The owner puts answer s for k on the wire: Ack for "applied", otherwise the Handle branch that leaves the log alone.
OwnerAnswers(g, k, s) ==
  IF s = "applied"
    THEN Ack(g, k)
    ELSE Handle(g, Cmd(k, g)) /\ log' = log /\ Ans(k, s, g) \in net'

Step(line) ==
  LET k == line.commandId
      g == line.generation
  IN CASE line.kind = "send" ->
            \/ target = 0 /\ k \in outbox /\ Connect(g)
            \/ target = g /\ Send(k)
            \/ target = g /\ k \in outbox /\ Cmd(k, g) \in net /\ UNCHANGED vars
       [] line.kind = "append" -> Handle(g, Cmd(k, g)) /\ Len(log') = Len(log) + 1
       [] line.kind = "answer" ->
            /\ line.status \in Final
            /\ EffectMatches(line)
            /\ IF ByClient(line) THEN Receive(Ans(k, line.status, g)) ELSE OwnerAnswers(g, k, line.status)
       [] line.kind = "refusal" /\ Get(line, "reason") = "owner-fenced" ->
            IF ByClient(line) THEN Receive(Ans(k, "fenced", g)) ELSE OwnerAnswers(g, k, "fenced")
       [] line.kind = "refusal" /\ Get(line, "reason") = "cursor-ahead" ->
            target = g /\ cursor > Len(view[g]) /\ Read
       [] line.kind = "read" ->
            /\ cursor = line.cursor
            /\ IF target = 0 THEN Connect(g) ELSE target = g /\ UNCHANGED vars
       [] line.kind = "batch" -> target = g /\ cursor <= Len(view[g]) /\ Read /\ cursor' = line.cursor
       [] line.kind = "close" -> target = g /\ (SuspectDead \/ SuspectFalsely)
       [] line.kind = "claim" -> Claim(g)
       [] line.kind = "crash" -> Crash(g)
       [] line.kind = "done" -> Quiescent /\ UNCHANGED vars
       [] OTHER -> FALSE

TraceInit == Init /\ l = 1

TraceNext == l <= Len(Trace) /\ Step(Trace[l]) /\ l' = l + 1

TraceView == traceVars

\* The deepest state consumed d - 1 lines; any shorter search stopped at row d. The printed tuple
\* stays short so TLC prints it on one line, where the runner reads the row.
TraceAccepted ==
  LET d == TLCGet("stats").diameter
  IN IF d - 1 = Len(Trace) THEN TRUE ELSE Print(<<"rejected at", d, Trace[d].kind>>, FALSE)
=============================================================================
