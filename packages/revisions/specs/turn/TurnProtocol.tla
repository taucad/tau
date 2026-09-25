---------------------------- MODULE TurnProtocol ----------------------------
(***************************************************************************)
(* The observable protocol of one turn, written from `turn.machine`'s      *)
(* documented contract -- the numbered path table in                       *)
(* `turn.machine.test.ts`, the file header and the D17, D24, R6, R7, R21,  *)
(* P4 and E5 notes -- and not from its code.                               *)
(*                                                                         *)
(* The environment is everything the turn talks to: the five promise       *)
(* effects and the lease callback, the parent that routes `cut` to the     *)
(* checkout, the host that completes or releases the turn, and the clock.  *)
(* `world` holds facts the turn cannot see -- the lease file, an effect it *)
(* stopped listening to, a cut it stopped waiting for -- so that design    *)
(* properties can be stated; the conformance replay compares only `turn`,  *)
(* `out` and `emits`.                                                      *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  CasRetryLimit, \* D24 and `turnCasRetryLimit` say 1; path-table rows 13 and 21 read as 0
  PortCodes      \* codes a rejected effect may carry; "NONE" is an unclassified failure (E5)

Finals     == {"finalized", "conflicted", "released", "failed"}
Preparing  == {"resolving", "basing", "writingLease"}
Leased     == {"acquiring", "held"}
Finalizing == {"capturing", "merging", "requesting"}
Phases     == Preparing \cup Leased \cup Finalizing \cup {"retiring"} \cup Finals
Promises   == {"prepare", "writeLease", "capture", "merge", "retireLease"}
Answers    == {"revisionMinted", "nothingToSave", "cutFailed", "casLost"}

(* The effects the turn holds while in each phase; the lease for all of `leased` (F6). *)
Invoked(p) ==
  CASE p = "resolving"    -> {"prepare"}
    [] p = "writingLease" -> {"writeLease"}
    [] p \in Leased       -> {"lease"}
    [] p = "capturing"    -> {"capture"}
    [] p = "merging"      -> {"merge"}
    [] p = "retiring"     -> {"retireLease"}
    [] OTHER              -> {}

VARIABLES
  turn,  \* what the turn is: phase and the data the protocol names
  world, \* what the environment is: facts the turn cannot observe
  act,   \* the label of the step that produced this state
  out,   \* the messages that step sent to the parent, in order
  emits  \* the facts that step emitted to observers

vars == <<turn, world, act, out, emits>>

(* The settlement fact a final state announces (A4, R12, P4). *)
Announce(t) ==
  CASE t.outcome = "finalized"  -> <<"turnFinalized:" \o t.revision>>
    [] t.outcome = "conflicted" -> <<"turnConflicted:" \o t.revision>>
    [] OTHER                    -> <<"turnReleased:" \o t.outcome \o ":" \o t.code>>

(* A step's messages, plus the announcement when it lands in a final state. *)
Outputs(msgs) ==
  LET landed == turn'.phase \in Finals /\ turn.phase \notin Finals
  IN /\ out' = msgs \o (IF landed THEN Announce(turn') ELSE <<>>)
     /\ emits' = IF landed /\ turn'.phase \in {"finalized", "conflicted"} THEN Announce(turn') ELSE <<>>

(* The world after a step: `w` with every promise the turn stopped holding, *)
(* other than the ones that settled this step, still running as an orphan. *)
Strand(settled, w) ==
  world' = [w EXCEPT !.orphans = @ \cup ((Invoked(turn.phase) \cap Promises) \ (Invoked(turn'.phase) \cup settled))]

Fail(t, c)    == [t EXCEPT !.phase = "failed", !.outcome = "failed", !.code = c]
Retire(t, o, c) == [t EXCEPT !.phase = "retiring", !.outcome = o, !.code = c]

Init ==
  /\ turn = [phase |-> "resolving", retries |-> 0, completion |-> FALSE, outcome |-> "none",
             code |-> "NONE", base |-> "none", revision |-> "none"]
  /\ world = [orphans |-> {}, cutOpen |-> FALSE, leaseFile |-> FALSE,
              retireFailed |-> FALSE, lateMint |-> FALSE]
  /\ act = <<"Init">>
  /\ out = <<>>
  /\ emits = <<>>

-----------------------------------------------------------------------------
(* Placement (rows 1-5, 20, 21). *)

PrepareOk(dirty, stale) ==
  /\ turn.phase = "resolving"
  /\ turn' = [turn EXCEPT !.phase = IF dirty THEN "basing" ELSE "writingLease", !.base = "rev-1"]
  /\ Strand({"prepare"}, [world EXCEPT !.cutOpen = dirty])
  /\ Outputs(<<"turnPrepared">> \o (IF stale THEN <<"leaseStale">> ELSE <<>>)
                                \o (IF dirty THEN <<"cut">> ELSE <<>>))
  /\ act' = <<"PrepareOk", dirty, stale>>

PrepareErr(c) ==
  /\ turn.phase = "resolving"
  /\ turn' = Fail(turn, c)
  /\ Strand({"prepare"}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"PrepareErr", c>>

(* D17: the base is minted through the checkout before the lease is written. *)
BaseAnswer(k) ==
  /\ turn.phase = "basing"
  /\ LET retry == k = "casLost" /\ turn.retries < CasRetryLimit
     IN /\ turn' = CASE k = "revisionMinted" -> [turn EXCEPT !.phase = "writingLease", !.base = "rev-base"]
                     [] k = "nothingToSave"  -> [turn EXCEPT !.phase = "writingLease"]
                     [] k = "cutFailed"      -> Fail(turn, "NONE")
                     [] retry                -> [turn EXCEPT !.retries = @ + 1]
                     [] OTHER                -> Fail(turn, "CAS_LOST")
        /\ Strand({}, [world EXCEPT !.cutOpen = retry])
        /\ Outputs(IF retry THEN <<"cut">> ELSE <<>>)
  /\ act' = <<"BaseAnswer", k>>

(* R21: the settlement bound; the cut itself stays open in the world. *)
BaseTimeout ==
  /\ turn.phase = "basing"
  /\ turn' = Fail(turn, "BASE_CUT_TIMED_OUT")
  /\ Strand({}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"BaseTimeout">>

WriteLeaseOk ==
  /\ turn.phase = "writingLease"
  /\ turn' = [turn EXCEPT !.phase = "acquiring"]
  /\ Strand({"writeLease"}, [world EXCEPT !.leaseFile = TRUE])
  /\ Outputs(<<"leaseWritten">>)
  /\ act' = <<"WriteLeaseOk">>

WriteLeaseErr(c) ==
  /\ turn.phase = "writingLease"
  /\ turn' = Fail(turn, c)
  /\ Strand({"writeLease"}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"WriteLeaseErr", c>>

-----------------------------------------------------------------------------
(* The live-tree lease (rows 6-8): a callback whose refusal is an event (F6). *)

LeaseGranted ==
  /\ turn.phase \in Leased
  /\ turn' = IF turn.phase = "held" THEN turn
             ELSE [turn EXCEPT !.phase = IF turn.completion THEN "capturing" ELSE "held"]
  /\ Strand({}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"LeaseGranted">>

LeaseRefused ==
  /\ turn.phase \in Leased
  /\ turn' = Retire(turn, "failed", "LEASE_UNAVAILABLE")
  /\ Strand({}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"LeaseRefused">>

-----------------------------------------------------------------------------
(* The host (rows 8, 9, 16, 17, 21): completion is buffered until the lease *)
(* is held (R6); an end before the lease retires nothing (R21).            *)

TurnCompleted ==
  /\ turn.phase \notin Finals
  /\ turn' = CASE turn.phase \in Preparing \cup {"acquiring"} -> [turn EXCEPT !.completion = TRUE]
               [] turn.phase = "held"                        -> [turn EXCEPT !.phase = "capturing"]
               [] OTHER                                      -> turn
  /\ Strand({}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"TurnCompleted">>

Release(e) ==
  /\ turn.phase \notin Finals
  /\ turn' = CASE turn.phase \in Preparing -> [turn EXCEPT !.phase = "released", !.outcome = "released"]
               [] turn.phase = "retiring"  -> turn
               [] OTHER                    -> Retire(turn, "released", turn.code)
  /\ Strand({}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"Release", e>>

-----------------------------------------------------------------------------
(* Finalizing (rows 9-15, 18): capture, merge, then ask the parent to cut. *)

CaptureOk ==
  /\ turn.phase = "capturing"
  /\ turn' = [turn EXCEPT !.phase = "merging"]
  /\ Strand({"capture"}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"CaptureOk">>

CaptureErr(c) ==
  /\ turn.phase = "capturing"
  /\ turn' = Retire(turn, "failed", c)
  /\ Strand({"capture"}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"CaptureErr", c>>

MergeOk(status) ==
  /\ turn.phase = "merging"
  /\ turn' = IF status = "recorded" THEN [turn EXCEPT !.phase = "requesting"]
             ELSE [Retire(turn, "conflicted", turn.code) EXCEPT !.revision = "rev-conflict"]
  /\ Strand({"merge"}, [world EXCEPT !.cutOpen = (status = "recorded")])
  /\ Outputs(IF status = "recorded" THEN <<"cut">> ELSE <<>>)
  /\ act' = <<"MergeOk", status>>

MergeErr(c) ==
  /\ turn.phase = "merging"
  /\ turn' = Retire(turn, "failed", c)
  /\ Strand({"merge"}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"MergeErr", c>>

CutAnswer(k) ==
  /\ turn.phase = "requesting"
  /\ LET retry == k = "casLost" /\ turn.retries < CasRetryLimit
     IN /\ turn' = CASE k = "revisionMinted" -> [Retire(turn, "finalized", turn.code) EXCEPT !.revision = "rev-turn"]
                     [] k = "nothingToSave"  -> Retire(turn, "finalized", turn.code)
                     [] k = "cutFailed"      -> Retire(turn, "failed", "NONE")
                     [] retry                -> [turn EXCEPT !.retries = @ + 1]
                     [] OTHER                -> Retire(turn, "failed", "CAS_LOST")
        /\ Strand({}, [world EXCEPT !.cutOpen = retry])
        /\ Outputs(IF retry THEN <<"cut">> ELSE <<>>)
  /\ act' = <<"CutAnswer", k>>

CutTimeout ==
  /\ turn.phase = "requesting"
  /\ turn' = Retire(turn, "failed", "CUT_TIMED_OUT")
  /\ Strand({}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"CutTimeout">>

(* R7: the outcome is settled whether or not the lease retirement succeeds. *)
RetireDone(ok) ==
  /\ turn.phase = "retiring"
  /\ turn' = [turn EXCEPT !.phase = IF turn.outcome = "none" THEN "finalized" ELSE turn.outcome]
  /\ Strand({"retireLease"}, [world EXCEPT !.leaseFile = IF ok THEN FALSE ELSE @, !.retireFailed = ~ok])
  /\ Outputs(<<>>)
  /\ act' = <<"RetireDone", ok>>

-----------------------------------------------------------------------------
(* The world moving on without the turn: an effect the turn stopped holding *)
(* finishes anyway, and a cut the turn stopped waiting for is answered.     *)

OrphanDone(e, ok) ==
  /\ e \in world.orphans
  /\ turn' = turn
  /\ world' = [world EXCEPT !.orphans = @ \ {e},
                            !.leaseFile = IF e = "writeLease" /\ ok THEN TRUE ELSE @]
  /\ out' = <<>>
  /\ emits' = <<>>
  /\ act' = <<"OrphanDone", e, ok>>

LateAnswer(k) ==
  /\ world.cutOpen
  /\ turn.phase \notin {"basing", "requesting"}
  /\ turn' = turn
  /\ world' = [world EXCEPT !.cutOpen = FALSE, !.lateMint = @ \/ k = "revisionMinted"]
  /\ out' = <<>>
  /\ emits' = <<>>
  /\ act' = <<"LateAnswer", k>>

-----------------------------------------------------------------------------

Next ==
  \/ \E dirty, stale \in BOOLEAN : PrepareOk(dirty, stale)
  \/ \E c \in PortCodes : PrepareErr(c) \/ WriteLeaseErr(c) \/ CaptureErr(c) \/ MergeErr(c)
  \/ \E k \in Answers : BaseAnswer(k) \/ CutAnswer(k) \/ LateAnswer(k)
  \/ BaseTimeout \/ CutTimeout \/ WriteLeaseOk \/ LeaseGranted \/ LeaseRefused
  \/ TurnCompleted \/ \E e \in {"release", "turnAbandoned"} : Release(e)
  \/ CaptureOk \/ \E s \in {"recorded", "conflicted"} : MergeOk(s)
  \/ \E ok \in BOOLEAN : RetireDone(ok)
  \/ \E e \in Promises, ok \in BOOLEAN : OrphanDone(e, ok)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties. *)

Terminal  == turn.phase \in Finals
Quiescent == Terminal /\ world.orphans = {} /\ ~world.cutOpen

TypeOK ==
  /\ turn.phase \in Phases
  /\ turn.retries \in 0..CasRetryLimit
  /\ turn.outcome \in {"none"} \cup Finals
  /\ world.orphans \subseteq Promises

(* Every final state announces exactly what its outcome says (P4, R12). *)
SettledOnce == Terminal => turn.outcome = turn.phase

(* The protocol only stops once everything the turn started has answered. *)
DeadlockOnlyWhenQuiescent == ~Quiescent => ENABLED Next

(* A retirement is only ever asked of a lease that was written (R21). *)
RetireOnlyWhatWasLeased == turn.phase = "retiring" => world.leaseFile \/ "writeLease" \in world.orphans

(* Design: once everything has settled, no lease file is left unless its  *)
(* retirement failed (R7 leaves that one to `sweepLeases`, F13).           *)
NoUnretiredLease == Quiescent /\ world.leaseFile => world.retireFailed

(* Design: a turn that ended failed or released has no revision minted in *)
(* its name after it stopped waiting (the in-process bound hazard, NS10).  *)
NoMintBehindUnsettledTurn == Quiescent /\ turn.outcome \in {"failed", "released"} => ~world.lateMint

=============================================================================
