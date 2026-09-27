---------------------------- MODULE TurnProtocol ----------------------------
(***************************************************************************)
(* The observable protocol of one turn attempt, written from               *)
(* `turn.machine`'s documented contract -- the numbered path table in      *)
(* `turn.machine.test.ts`, the file header and the D17, D24, R6, R7, R21,  *)
(* P4 and E5 notes -- and not from its code.                               *)
(*                                                                         *)
(* The environment is everything the turn talks to: the promise effects    *)
(* and the lease callback, the parent that routes `cut` to the checkout,   *)
(* the host that completes, releases, acknowledges or fences the turn, and *)
(* the clock. `world` holds facts the turn cannot see -- the lease file,   *)
(* an effect it stopped listening to, a cut it stopped waiting for -- so   *)
(* that design properties can be stated; the conformance replay compares   *)
(* only `turn`, `out` and `emits`.                                         *)
(*                                                                         *)
(* W5 (RM-S1), promoted from the charter draft, revision 2.                *)
(* Six knobs, today's value first. With all six at today's value this is  *)
(* S6's spec: the new fields stay constant and the state space is S6's.    *)
(*   CutBound     TRUE  | FALSE  the 30 s cut bounds (RM-R3)               *)
(*   DeferRelease FALSE | TRUE   a release waits for its effect (RM-R4)    *)
(*   LeaseFirst   FALSE | TRUE   lease record, live-tree lease, then the   *)
(*                               base pre-mint (RM-R12, TS-R13)            *)
(*   AckRetire    FALSE | TRUE   settled until acknowledged (RM-R10)       *)
(*   PortVerbs    FALSE | TRUE   the root's side of W8's verbs: refusals   *)
(*                               retire the lease, CUT_FAILED keeps it,    *)
(*                               find-or-cut, adoption (RM-R13, RM-R14)    *)
(*   M1Host       FALSE | TRUE   the host is W8's M1: it completes only a  *)
(*                               placed attempt, never releases after a    *)
(*                               cut (TS-R11). No host sweeps leases by   *)
(*                               epoch (TS-S7), whatever this knob says.  *)
(*                               FALSE with the other four TRUE is the     *)
(*                               interim, while today's page and daemon    *)
(*                               commands still drive the root.            *)
(* A session fence is not modelled: the turn actor survives it (TS-R6).    *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  CasRetryLimit, \* D24 and `turnCasRetryLimit` say 1; path-table rows 13 and 21 read as 0
  PortCodes,     \* codes a rejected effect may carry; "NONE" is an unclassified failure (E5)
  CutBound, DeferRelease, LeaseFirst, AckRetire, PortVerbs, M1Host

(* A design knob is on: record the history the design properties read. *)
Tracking == LeaseFirst \/ AckRetire \/ PortVerbs

OldFinals  == {"finalized", "conflicted", "released", "failed"}
Finals     == OldFinals \cup {"retired", "refused"}
Placing    == {"resolving", "basing", "writingLease", "acquiring"}
Finalizing == {"capturing", "merging", "requesting", "finding"}
Phases     == Placing \cup Finalizing \cup
              {"held", "adopting", "settled", "retiring", "refusing"} \cup Finals
(* The phases in which the turn has not yet written its lease record. *)
Unleased   == {"resolving", "writingLease"} \cup (IF LeaseFirst THEN {} ELSE {"basing"})
Outcomes   == {"none", "refused"} \cup OldFinals
Promises   == {"prepare", "writeLease", "capture", "merge", "retireLease", "find"}
Answers    == {"revisionMinted", "nothingToSave", "cutFailed", "casLost", "cutCancelled"}
EffectPhases == {"resolving", "writingLease", "capturing", "merging", "adopting", "finding"}
CutPhases    == {"basing", "requesting"}
ReleaseEvents == IF M1Host THEN {"completeNoCut"} ELSE {"release", "turnAbandoned"}
(* The phases whose entry announces the outcome. With AckRetire, `retiring` *)
(* is a child of `settled`, so a failed retirement does not announce again. *)
Announcing == (IF AckRetire THEN {"settled", "retiring"} ELSE OldFinals) \cup (IF PortVerbs THEN {"refused"} ELSE {})

(* The effects the turn holds while in each phase; the lease callback for all of `leased` (F6). *)
Invoked(p) ==
  CASE p = "resolving"                -> {"prepare"}
    [] p = "writingLease"             -> {"writeLease"}
    [] p \in {"acquiring", "held"}    -> {"lease"}
    [] p = "capturing"                -> {"capture"}
    [] p = "merging"                  -> {"merge"}
    [] p \in {"retiring", "refusing"} -> {"retireLease"}
    [] p \in {"adopting", "finding"}  -> {"find"}
    [] OTHER                          -> {}

VARIABLES
  turn,  \* what the turn is: phase and the data the protocol names
  world, \* what the environment is: facts the turn cannot observe
  act,   \* the label of the step that produced this state
  out,   \* the messages that step sent to the parent, in order
  emits  \* the facts that step emitted to observers

vars == <<turn, world, act, out, emits>>

(* The settlement fact an announcing phase carries (A4, R12, P4). *)
Announce(t) ==
  CASE t.outcome = "finalized"  -> <<"turnFinalized:" \o t.revision>>
    [] t.outcome = "conflicted" -> <<"turnConflicted:" \o t.revision>>
    [] t.outcome = "refused"    -> <<"turnRefused:" \o t.code>>
    [] OTHER                    -> <<"turnReleased:" \o t.outcome \o ":" \o t.code>>

Landed == turn'.phase \in Announcing /\ turn.phase \notin Announcing

(* A step's messages, plus the announcement when it lands in an announcing phase. *)
Outputs(msgs) ==
  /\ out' = msgs \o (IF Landed THEN Announce(turn') ELSE <<>>)
                 \o (IF turn'.phase = "retired" /\ turn.phase # "retired" THEN <<"turnRetired">> ELSE <<>>)
  /\ emits' = IF Landed /\ turn'.outcome \in {"finalized", "conflicted"} THEN Announce(turn') ELSE <<>>

(* The world after a step: `w` with every promise the turn stopped holding, *)
(* other than the ones that settled this step, still running as an orphan. *)
Strand(settled, w) ==
  world' = [w EXCEPT !.orphans = @ \cup ((Invoked(turn.phase) \cap Promises) \ (Invoked(turn'.phase) \cup settled)),
                     !.announced = @ + (IF Landed THEN 1 ELSE 0)]

Retire(t, o, c) == [t EXCEPT !.phase = "retiring", !.outcome = o, !.code = c]
Settle(t, o, c) == [t EXCEPT !.phase = "settled", !.outcome = o, !.code = c]
Fail(t, c)      == IF AckRetire THEN Settle(t, "failed", c)
                   ELSE [t EXCEPT !.phase = "failed", !.outcome = "failed", !.code = c]
(* An outcome once the lease is written: today retire, then announce; RM-R10 the reverse. *)
End(t, o, c) == IF AckRetire THEN Settle(t, o, c) ELSE Retire(t, o, c)
(* An end before any lease was written. *)
EndUnleased(t, o) == IF AckRetire THEN Settle(t, o, t.code) ELSE [t EXCEPT !.phase = o, !.outcome = o]
(* A release after a refused cut gives up on the cut: the attempt failed. *)
Released(t) == CASE t.phase \in Unleased -> EndUnleased(t, "released")
                 [] t.cutRefused        -> End(t, "failed", t.code)
                 [] OTHER               -> End(t, "released", t.code)
(* TS-R1: an admission refused after its lease retires the lease before answering. *)
Refuse(t, c) == [t EXCEPT !.phase = IF t.phase \in Unleased THEN "refused" ELSE "refusing",
                          !.outcome = "refused", !.code = c]
(* A failed placement step: today a failure; with PortVerbs a refusal. *)
BaseFail(t, c) == CASE PortVerbs            -> Refuse(t, "BASE_CUT_FAILED")
                    [] t.phase \in Unleased -> Fail(t, c)
                    [] OTHER                -> End(t, "failed", c)
(* The attempt holds its lease and may be completed (the root answers `turnPlaced`). *)
Place(t) == [t EXCEPT !.phase = IF t.completion THEN "capturing" ELSE "held", !.placed = Tracking \/ @]
(* RM-R13: a cut that cannot land answers CUT_FAILED and keeps the lease. *)
CutRefused(t, c) == [t EXCEPT !.phase = "held", !.code = c, !.completion = FALSE, !.retries = 0, !.cutRefused = TRUE]
FailPlaced(t, c) == IF PortVerbs THEN CutRefused(t, c) ELSE End(t, "failed", c)
(* RM-R14: an attempt whose result was found settles from it without a cut. *)
CompleteHeld(t) == IF t.found THEN [End(t, "finalized", t.code) EXCEPT !.revision = "rev-found"]
                   ELSE [t EXCEPT !.phase = "capturing"]

Fresh == [phase |-> "resolving", retries |-> 0, completion |-> FALSE, outcome |-> "none",
          code |-> "NONE", base |-> "none", revision |-> "none", releasing |-> FALSE,
          dirty |-> FALSE, placed |-> FALSE, found |-> FALSE, leased |-> FALSE, cutRefused |-> FALSE]
(* A lease record adopted by a new session's root (RM-R14). *)
Adopted == [Fresh EXCEPT !.phase = "adopting", !.placed = TRUE, !.leased = AckRetire]

Init ==
  /\ turn \in IF PortVerbs THEN {Fresh, Adopted} ELSE {Fresh}
  /\ world = [orphans |-> {}, cutOpen |-> FALSE, leaseFile |-> turn.phase = "adopting",
              retireFailed |-> FALSE, lateMint |-> FALSE, announced |-> 0, acked |-> FALSE,
              mintNoLease |-> FALSE, retiredUnacked |-> FALSE, cutAsked |-> FALSE,
              releaseAsked |-> FALSE]
  /\ act = <<"Init">>
  /\ out = <<>>
  /\ emits = <<>>

-----------------------------------------------------------------------------
(* Placement (rows 1-5, 20, 21). Today: prepare, base cut, lease record,   *)
(* live-tree lease. LeaseFirst: prepare, lease record, live-tree lease,    *)
(* base cut; every refusal then precedes the pre-mint or is its failure.   *)

PrepareOk(dirty) ==
  /\ turn.phase = "resolving"
  /\ IF turn.releasing
       THEN /\ turn' = EndUnleased(turn, "released")
            /\ Strand({"prepare"}, world)
            /\ Outputs(<<>>)
       ELSE LET base == dirty /\ ~LeaseFirst
            IN /\ turn' = [turn EXCEPT !.phase = IF base THEN "basing" ELSE "writingLease",
                                       !.base = "rev-1", !.dirty = dirty /\ LeaseFirst]
               /\ Strand({"prepare"}, [world EXCEPT !.cutOpen = base])
               /\ Outputs(<<"turnPrepared">> \o (IF base THEN <<"cut">> ELSE <<>>))
  /\ act' = <<"PrepareOk", dirty>>

PrepareErr(c) ==
  /\ turn.phase = "resolving"
  /\ turn' = IF PortVerbs THEN Refuse(turn, c) ELSE Fail(turn, c)
  /\ Strand({"prepare"}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"PrepareErr", c>>

WriteLeaseOk ==
  /\ turn.phase = "writingLease"
  /\ turn' = IF turn.releasing THEN [End(turn, "released", turn.code) EXCEPT !.leased = AckRetire]
             ELSE [turn EXCEPT !.phase = "acquiring", !.leased = AckRetire]
  /\ Strand({"writeLease"}, [world EXCEPT !.leaseFile = TRUE])
  /\ Outputs(<<"leaseWritten">>)
  /\ act' = <<"WriteLeaseOk">>

WriteLeaseErr(c) ==
  /\ turn.phase = "writingLease"
  /\ turn' = IF PortVerbs THEN Refuse(turn, c) ELSE Fail(turn, c)
  /\ Strand({"writeLease"}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"WriteLeaseErr", c>>

(* The live-tree lease (rows 6-8): a callback whose refusal is an event (F6). *)
LeaseGranted ==
  /\ turn.phase \in {"acquiring", "held"}
  /\ LET base == LeaseFirst /\ turn.dirty /\ turn.phase = "acquiring"
     IN /\ turn' = CASE turn.phase = "held" -> turn
                     [] base                -> [turn EXCEPT !.phase = "basing"]
                     [] OTHER               -> Place(turn)
        /\ Strand({}, [world EXCEPT !.cutOpen = IF base THEN TRUE ELSE @])
        /\ Outputs(CASE base                                    -> <<"cut">>
                     [] turn.phase = "acquiring" /\ PortVerbs -> <<"turnPlaced">>
                     [] OTHER                                   -> <<>>)
  /\ act' = <<"LeaseGranted">>

(* The shipped callback grants on sight; with PortVerbs a refusal can come *)
(* only before placement, and today once held it is on the allow-list gap. *)
LeaseRefused ==
  /\ turn.phase \in (IF PortVerbs THEN {"acquiring"} ELSE {"acquiring", "held"})
  /\ turn' = IF PortVerbs THEN Refuse(turn, "LEASE_UNAVAILABLE") ELSE End(turn, "failed", "LEASE_UNAVAILABLE")
  /\ Strand({}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"LeaseRefused">>

(* D17: the dirty base is minted through the checkout. *)
BaseAnswer(k) ==
  /\ turn.phase = "basing"
  /\ (k = "cutCancelled") => turn.releasing
  /\ LET minted == k = "revisionMinted"
         landed == minted \/ k = "nothingToSave"
         retry  == k = "casLost" /\ turn.retries < CasRetryLimit /\ ~turn.releasing
         t0     == [turn EXCEPT !.base = IF minted THEN "rev-base" ELSE @]
     IN /\ turn' = CASE turn.releasing       -> Released(t0)
                     [] landed /\ LeaseFirst -> Place(t0)
                     [] landed               -> [t0 EXCEPT !.phase = "writingLease"]
                     [] retry                -> [turn EXCEPT !.retries = @ + 1]
                     [] k = "cutFailed"      -> BaseFail(turn, "NONE")
                     [] OTHER                -> BaseFail(turn, "CAS_LOST")
        /\ Strand({}, [world EXCEPT !.cutOpen = retry,
                                    !.mintNoLease = @ \/ (Tracking /\ minted /\ ~world.leaseFile)])
        /\ Outputs(CASE retry                                                       -> <<"cut">>
                     [] landed /\ LeaseFirst /\ PortVerbs /\ ~turn.releasing        -> <<"turnPlaced">>
                     [] OTHER                                                       -> <<>>)
  /\ act' = <<"BaseAnswer", k>>

(* R21: the settlement bound; the cut itself stays open in the world. *)
BaseTimeout ==
  /\ CutBound
  /\ turn.phase = "basing"
  /\ turn' = BaseFail(turn, "BASE_CUT_TIMED_OUT")
  /\ Strand({}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"BaseTimeout">>

(* RM-R14: an actor adopted from a lease record looks back to the lease's *)
(* head for its revisions before it serves `complete` (find-or-cut); a   *)
(* cut that lost its compare-and-swap looks again before re-cutting.     *)
FindDone(found) ==
  /\ turn.phase \in {"adopting", "finding"}
  /\ IF turn.phase = "adopting"
       THEN /\ turn' = IF turn.releasing THEN End(turn, "released", turn.code)
                       ELSE LET t == [turn EXCEPT !.phase = "held", !.found = found, !.completion = FALSE]
                            IN IF turn.completion THEN CompleteHeld(t) ELSE t
            /\ Strand({"find"}, world)
            /\ Outputs(<<>>)
       ELSE LET retry == ~found /\ turn.retries < CasRetryLimit
            IN /\ turn' = CASE found -> [End(turn, "finalized", turn.code) EXCEPT !.revision = "rev-found"]
                            [] retry -> [turn EXCEPT !.phase = "requesting", !.retries = @ + 1]
                            [] OTHER -> CutRefused(turn, "CAS_LOST")
               /\ Strand({"find"}, [world EXCEPT !.cutOpen = retry])
               /\ Outputs(CASE found -> <<>> [] retry -> <<"cut">> [] OTHER -> <<"cutRefused">>)
  /\ act' = <<"FindDone", found>>

-----------------------------------------------------------------------------
(* The host (rows 8, 9, 16, 17, 21). Completion is buffered until the     *)
(* lease is held (R6); an end before the lease retires nothing (R21).     *)
(* With M1Host the host completes only a placed attempt, and             *)
(* `complete{cut: false}` is a release it never sends after a cut.       *)

Complete ==
  /\ turn.phase \notin Finals
  /\ M1Host => turn.placed /\ ~world.releaseAsked
  /\ turn' = CASE turn.phase \in Placing \cup {"adopting"} -> [turn EXCEPT !.completion = TRUE]
               [] turn.phase = "held" -> CompleteHeld(IF PortVerbs THEN [turn EXCEPT !.retries = 0] ELSE turn)
               [] OTHER               -> turn
  /\ Strand({}, [world EXCEPT !.cutAsked = @ \/ Tracking])
  /\ Outputs(<<>>)
  /\ act' = IF M1Host THEN <<"Complete", TRUE>> ELSE <<"TurnCompleted">>

Release(e) ==
  /\ turn.phase \notin Finals
  /\ M1Host => turn.placed /\ ~world.cutAsked
  /\ IF DeferRelease /\ turn.phase \in EffectPhases \cup CutPhases
       (* RM-R4: record the release; leave only when the effect or the cut answers. *)
       THEN /\ turn' = [turn EXCEPT !.releasing = TRUE]
            /\ Strand({}, [world EXCEPT !.releaseAsked = @ \/ Tracking])
            /\ Outputs(IF turn.phase \in CutPhases /\ ~turn.releasing THEN <<"cancelCut">> ELSE <<>>)
       ELSE /\ turn' = IF turn.phase \in {"retiring", "settled", "refusing"} THEN turn ELSE Released(turn)
            /\ Strand({}, [world EXCEPT !.releaseAsked = @ \/ Tracking])
            /\ Outputs(<<>>)
  /\ act' = <<"Release", e>>

(* D9, RM-R10: the host acknowledges once the settlement row is durable. *)
Acknowledge ==
  /\ AckRetire
  /\ turn.phase = "settled"
  /\ turn' = [turn EXCEPT !.phase = IF turn.leased THEN "retiring" ELSE "retired"]
  /\ Strand({}, [world EXCEPT !.acked = TRUE])
  /\ Outputs(<<>>)
  /\ act' = <<"Acknowledge">>

-----------------------------------------------------------------------------
(* Finalizing (rows 9-15, 18): capture, merge, then ask the parent to cut. *)

CaptureOk ==
  /\ turn.phase = "capturing"
  /\ turn' = IF turn.releasing THEN End(turn, "released", turn.code)
             ELSE [turn EXCEPT !.phase = "merging"]
  /\ Strand({"capture"}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"CaptureOk">>

CaptureErr(c) ==
  /\ turn.phase = "capturing"
  /\ turn' = FailPlaced(turn, c)
  /\ Strand({"capture"}, world)
  /\ Outputs(IF PortVerbs THEN <<"cutRefused">> ELSE <<>>)
  /\ act' = <<"CaptureErr", c>>

MergeOk(status) ==
  /\ turn.phase = "merging"
  /\ LET ask == status = "recorded" /\ ~turn.releasing
     IN /\ turn' = CASE ask                -> [turn EXCEPT !.phase = "requesting"]
                     [] status = "recorded" -> End(turn, "released", turn.code)
                     [] OTHER              -> [End(turn, "conflicted", turn.code) EXCEPT !.revision = "rev-conflict"]
        /\ Strand({"merge"}, [world EXCEPT !.cutOpen = ask])
        /\ Outputs(IF ask THEN <<"cut">> ELSE <<>>)
  /\ act' = <<"MergeOk", status>>

MergeErr(c) ==
  /\ turn.phase = "merging"
  /\ turn' = FailPlaced(turn, c)
  /\ Strand({"merge"}, world)
  /\ Outputs(IF PortVerbs THEN <<"cutRefused">> ELSE <<>>)
  /\ act' = <<"MergeErr", c>>

CutAnswer(k) ==
  /\ turn.phase = "requesting"
  /\ (k = "cutCancelled") => turn.releasing
  /\ LET minted == k = "revisionMinted"
         find   == PortVerbs /\ k = "casLost" /\ ~turn.releasing
         retry  == ~PortVerbs /\ k = "casLost" /\ turn.retries < CasRetryLimit /\ ~turn.releasing
         refuse == PortVerbs /\ k = "cutFailed" /\ ~turn.releasing
     IN /\ turn' = CASE minted              -> [End(turn, "finalized", turn.code) EXCEPT !.revision = "rev-turn"]
                     [] turn.releasing      -> End(turn, "released", turn.code)
                     [] k = "nothingToSave" -> End(turn, "finalized", turn.code)
                     [] k = "cutFailed"     -> FailPlaced(turn, "NONE")
                     [] find                -> [turn EXCEPT !.phase = "finding"]
                     [] retry               -> [turn EXCEPT !.retries = @ + 1]
                     [] OTHER               -> End(turn, "failed", "CAS_LOST")
        /\ Strand({}, [world EXCEPT !.cutOpen = retry,
                                    !.mintNoLease = @ \/ (Tracking /\ minted /\ ~world.leaseFile)])
        /\ Outputs((IF retry THEN <<"cut">> ELSE <<>>) \o (IF refuse THEN <<"cutRefused">> ELSE <<>>))
  /\ act' = <<"CutAnswer", k>>

CutTimeout ==
  /\ CutBound
  /\ turn.phase = "requesting"
  /\ turn' = End(turn, "failed", "CUT_TIMED_OUT")
  /\ Strand({}, world)
  /\ Outputs(<<>>)
  /\ act' = <<"CutTimeout">>

(* R7 today: the outcome is settled whether or not the retirement succeeds. *)
(* RM-R10: a failed retirement answers the acknowledgement with a refusal   *)
(* and stays `settled`, so no lease is orphaned by `onError`.               *)
RetireDone(ok) ==
  /\ turn.phase \in {"retiring", "refusing"}
  /\ LET back == AckRetire /\ turn.phase = "retiring" /\ ~ok
     IN /\ turn' = [turn EXCEPT !.phase = CASE turn.phase = "refusing" -> "refused"
                                         [] back                    -> "settled"
                                         [] AckRetire               -> "retired"
                                         [] turn.outcome = "none"   -> "finalized"
                                         [] OTHER                   -> turn.outcome]
        /\ Strand({"retireLease"},
                  [world EXCEPT !.leaseFile = IF ok THEN FALSE ELSE @,
                                !.retireFailed = @ \/ (~ok /\ ~back),
                                !.retiredUnacked = @ \/ (ok /\ turn.phase = "retiring" /\ turn.placed /\ ~world.acked)])
        /\ Outputs(IF back THEN <<"acknowledgeRefused">> ELSE <<>>)
  /\ act' = <<"RetireDone", ok>>

-----------------------------------------------------------------------------
(* The world moving on without the turn: an effect the turn stopped holding *)
(* finishes anyway, and a cut the turn stopped waiting for is answered.     *)

OrphanDone(e, ok) ==
  /\ e \in world.orphans
  /\ turn' = turn
  /\ world' = [world EXCEPT !.orphans = @ \ {e},
                            !.leaseFile = CASE e = "writeLease" /\ ok  -> TRUE
                                            [] e = "retireLease" /\ ok -> FALSE
                                            [] OTHER                   -> @]
  /\ out' = <<>>
  /\ emits' = <<>>
  /\ act' = <<"OrphanDone", e, ok>>

LateAnswer(k) ==
  /\ k # "cutCancelled"   \* only a cancelled request is answered so, and the canceller waits
  /\ world.cutOpen
  /\ turn.phase \notin CutPhases
  /\ turn' = turn
  /\ world' = [world EXCEPT !.cutOpen = FALSE, !.lateMint = @ \/ k = "revisionMinted",
                            !.mintNoLease = @ \/ (Tracking /\ k = "revisionMinted" /\ ~world.leaseFile)]
  /\ out' = <<>>
  /\ emits' = <<>>
  /\ act' = <<"LateAnswer", k>>

-----------------------------------------------------------------------------

Next ==
  \/ \E dirty \in BOOLEAN : PrepareOk(dirty)
  \/ \E c \in PortCodes : PrepareErr(c) \/ WriteLeaseErr(c) \/ CaptureErr(c) \/ MergeErr(c)
  \/ \E k \in Answers : BaseAnswer(k) \/ CutAnswer(k) \/ LateAnswer(k)
  \/ BaseTimeout \/ CutTimeout \/ WriteLeaseOk \/ LeaseGranted \/ LeaseRefused
  \/ Complete \/ \E e \in ReleaseEvents : Release(e)
  \/ Acknowledge
  \/ \E found \in BOOLEAN : FindDone(found)
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
  /\ turn.outcome \in Outcomes
  /\ turn.releasing \in BOOLEAN
  /\ world.orphans \subseteq Promises

(* RM-R10: the outcome is announced once, and every final state follows it. *)
AnnouncedOnce == world.announced <= 1 /\ (Terminal => world.announced = 1)

(* The protocol only stops once everything the turn started has answered. *)
DeadlockOnlyWhenQuiescent == ~Quiescent => ENABLED Next

(* A retirement is only ever asked of a lease that was written (R21). *)
RetireOnlyWhatWasLeased ==
  turn.phase \in {"retiring", "refusing"} => world.leaseFile \/ "writeLease" \in world.orphans

(* RM-R4: the turn never stops holding an effect it started. *)
NoOrphans == world.orphans = {}

(* I22: once everything has settled, no lease file is left unless its     *)
(* retirement failed (the next reconcile retires it, TS-S7).             *)
NoUnretiredLease == Quiescent /\ world.leaseFile => world.retireFailed

(* I22: no revision is minted for an attempt after it ended without one. *)
NoMintBehindUnsettledTurn ==
  Quiescent /\ turn.outcome \in {"failed", "released", "refused"} => ~world.lateMint

(* I21, TS-R13: every mint of the attempt happens while its lease record exists. *)
MintOnlyUnderLease == ~world.mintNoLease

(* I19 (machine side): a placed attempt's lease retires only after acknowledgement. *)
RetireAfterAck == ~world.retiredUnacked

(* D10, TS-R11: an attempt asked to cut settles with the cut or keeps its lease. *)
CompleteCuts == world.cutAsked => turn.outcome \in {"none", "finalized", "conflicted"}

=============================================================================
