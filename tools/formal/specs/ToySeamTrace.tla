---------------------------- MODULE ToySeamTrace ----------------------------
(***************************************************************************)
(* The trace template (FM-S11), instantiated for ToySeam: a simulator      *)
(* trace, named by FORMAL_TRACE, is consumed line by line, each line the   *)
(* ToySeam action its `kind` names. A line no action allows leaves no      *)
(* successor, so TLC reports a deadlock and `Explain` names the row. A     *)
(* `done` line, which the simulator writes when its run ends `done`, is    *)
(* accepted only in a `Quiescent` state (FM-R17).                          *)
(***************************************************************************)
EXTENDS ToySeam, Sequences, Json, IOUtils, TLC

Trace == ndJsonDeserialize(IOEnv.FORMAL_TRACE)

TraceIds == {Trace[k].id : k \in {k \in DOMAIN Trace : "id" \in DOMAIN Trace[k]}}

VARIABLE i \* lines consumed

traceVars == <<i, vars>>

Step(l) ==
  CASE l.kind = "send"    -> Send(l.id)
    [] l.kind = "retry"   -> Retry(l.id)
    [] l.kind = "serve"   -> Serve(l.id, l.effect)
    [] l.kind = "receive" -> Receive(l.id)
    [] l.kind = "done"    -> Quiescent /\ UNCHANGED vars
    [] OTHER              -> FALSE

TraceInit == i = 0 /\ Init

Consume == i < Len(Trace) /\ Step(Trace[i + 1]) /\ i' = i + 1

Done == i = Len(Trace) /\ UNCHANGED traceVars

TraceSpec == TraceInit /\ [][Consume \/ Done]_traceVars

Explain == [row |-> i + 1, broken |-> IF i < Len(Trace) THEN {Trace[i + 1].kind} ELSE {}]
=============================================================================
