------------------------ MODULE TurnExecutionCustody ------------------------
\* Compose the actual turn protocol, including adopted leases, with one checkout
\* and one execution. Identity has two attempts: current and stale. No fake turn
\* is created for Terminal; its resource association is in ShellCustody.
EXTENDS Naturals, Sequences, FiniteSets
CONSTANT HonorCustody
VARIABLES turn, world, act, out, emits,
          executionIds, issued, stopped, closing, rootLive, checkoutLease,
          checkoutExists, returned, holdReply, releaseReply
Turn == INSTANCE TurnProtocol WITH
  CasRetryLimit <- 1, PortCodes <- {"NONE", "ENGINE_UNAVAILABLE"},
  CutBound <- FALSE, DeferRelease <- TRUE, LeaseFirst <- TRUE,
  AckRetire <- TRUE, PortVerbs <- TRUE, M1Host <- TRUE
custody == <<executionIds, issued, stopped, closing, rootLive, checkoutLease,
             checkoutExists, returned, holdReply, releaseReply>>
vars == <<turn, world, act, out, emits, custody>>
Init == /\ Turn!Init /\ executionIds = {} /\ issued = FALSE /\ stopped = FALSE /\ closing = FALSE
        /\ rootLive = TRUE /\ checkoutLease = world.leaseFile /\ checkoutExists = TRUE
        /\ returned = FALSE /\ holdReply = "none" /\ releaseReply = "none"
Hold(key) ==
  /\ ~issued
  /\ LET accepted == key = "current" /\ rootLive /\ ~closing
                     /\ turn.phase = "held" /\ world.leaseFile /\ checkoutLease
     IN /\ executionIds' = IF accepted THEN {"execution"} ELSE executionIds
        /\ issued' = accepted
        /\ holdReply' = IF accepted THEN "applied" ELSE "refused"
  /\ UNCHANGED <<turn, world, act, out, emits, stopped, closing, rootLive,
                  checkoutLease, checkoutExists, returned, releaseReply>>
Cleanup(ok) ==
  /\ issued /\ executionIds # {}
  /\ stopped' = (stopped \/ ok) /\ returned' = TRUE
  /\ UNCHANGED <<turn, world, act, out, emits, executionIds, issued, closing,
                  rootLive, checkoutLease, checkoutExists, holdReply, releaseReply>>
ReleaseExecution(key) ==
  /\ LET accepted == key = "current" /\ world.leaseFile /\ (stopped \/ executionIds = {})
     IN /\ executionIds' = IF accepted THEN {} ELSE executionIds
        /\ releaseReply' = IF ~accepted THEN "refused"
                           ELSE IF executionIds = {} THEN "replayed" ELSE "applied"
  /\ UNCHANGED <<turn, world, act, out, emits, issued, stopped, closing,
                  rootLive, checkoutLease, checkoutExists, returned, holdReply>>
\* Host closes admission under the same authority as hold; a concurrent hold
\* either wins before close and blocks completion, or is refused after close.
CloseAdmission ==
  /\ closing' = TRUE
  /\ UNCHANGED <<turn, world, act, out, emits, executionIds, issued, stopped,
                  rootLive, checkoutLease, checkoutExists, returned, holdReply, releaseReply>>
ProtocolStep ==
  /\ rootLive /\ checkoutExists /\ Turn!Next
  /\ (act'[1] \in {"Complete", "Release"} => closing)
  /\ (HonorCustody /\ executionIds # {}) =>
        /\ ~world'.cutAsked /\ ~world'.releaseAsked
        /\ turn'.phase = "held" /\ world'.leaseFile
  /\ checkoutLease' = (checkoutLease \/ (~world.leaseFile /\ world'.leaseFile))
  /\ UNCHANGED <<executionIds, issued, stopped, closing, rootLive,
                  checkoutExists, returned, holdReply, releaseReply>>
Crash ==
  /\ rootLive /\ rootLive' = FALSE /\ closing' = TRUE
  /\ UNCHANGED <<turn, world, act, out, emits, executionIds, issued, stopped,
                  checkoutLease, checkoutExists, returned, holdReply, releaseReply>>
\* Existing stale-root lease cleanup must obey the same durable execution set.
RecoverRetire ==
  /\ ~rootLive /\ world.leaseFile /\ (~HonorCustody \/ executionIds = {})
  /\ world' = [world EXCEPT !.leaseFile = FALSE]
  /\ UNCHANGED <<turn, act, out, emits, custody>>
\* Root turnEnded reaches checkout leaseRunIds only after lease retirement.
TurnEnded ==
  /\ ~world.leaseFile /\ (~HonorCustody \/ executionIds = {})
  /\ checkoutLease' = FALSE
  /\ UNCHANGED <<turn, world, act, out, emits, executionIds, issued, stopped,
                  closing, rootLive, checkoutExists, returned, holdReply, releaseReply>>
DiscardCheckout ==
  /\ ~checkoutLease /\ closing /\ (~rootLive \/ turn.phase \in Turn!Finals)
  /\ (~HonorCustody \/ executionIds = {})
  /\ checkoutExists' = FALSE
  /\ UNCHANGED <<turn, world, act, out, emits, executionIds, issued, stopped,
                  closing, rootLive, checkoutLease, returned, holdReply, releaseReply>>
Next == ProtocolStep \/ CloseAdmission \/ Crash \/ RecoverRetire \/ TurnEnded \/ DiscardCheckout
        \/ (\E key \in {"current", "stale"} : Hold(key) \/ ReleaseExecution(key))
        \/ (\E ok \in BOOLEAN : Cleanup(ok))
Spec == Init /\ [][Next]_vars
CustodyBeforeSettlement == executionIds # {} =>
  world.leaseFile /\ checkoutLease /\ checkoutExists /\ turn.phase = "held"
StoppedBeforeRelease == issued /\ executionIds = {} => stopped
NoCutUnderCustody == executionIds # {} => ~world.cutAsked /\ ~world.releaseAsked
NoLateAdmission == [][(~issued /\ issued') => ~closing /\ rootLive /\ turn.phase = "held"]_vars
StaleReleaseRefused == [][releaseReply' = "refused" /\ releaseReply # "refused" =>
  executionIds' = executionIds]_vars
=============================================================================
