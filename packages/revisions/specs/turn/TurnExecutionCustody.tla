------------------------ MODULE TurnExecutionCustody ------------------------
\* I7 extends the turn protocol: completion and every retirement consult durable execution custody.
EXTENDS Naturals, FiniteSets
CONSTANT HonorCustody
VARIABLES held, stopped, settled, lease, rootLive, returned
vars == <<held, stopped, settled, lease, rootLive, returned>>
Init == /\ held /\ ~stopped /\ ~settled /\ lease /\ rootLive /\ ~returned
Crash == /\ rootLive /\ rootLive' = FALSE
         /\ UNCHANGED <<held, stopped, settled, lease, returned>>
CleanupFailed == /\ ~stopped /\ returned' = TRUE
                 /\ UNCHANGED <<held, stopped, settled, lease, rootLive>>
ConfirmStopped == /\ stopped' = TRUE /\ returned' = TRUE
                  /\ UNCHANGED <<held, settled, lease, rootLive>>
ReleaseExecution == /\ stopped /\ held' = FALSE
                    /\ UNCHANGED <<stopped, settled, lease, rootLive, returned>>
Complete == /\ (~HonorCustody \/ ~held) /\ settled' = TRUE /\ returned' = TRUE
            /\ UNCHANGED <<held, stopped, lease, rootLive>>
Retire == /\ (~HonorCustody \/ ~held) /\ (settled \/ ~rootLive)
          /\ lease' = FALSE
          /\ UNCHANGED <<held, stopped, settled, rootLive, returned>>
Next == Crash \/ CleanupFailed \/ ConfirmStopped \/ ReleaseExecution \/ Complete \/ Retire
Spec == Init /\ [][Next]_vars
CustodyBeforeSettlement == held => ~settled /\ lease
StoppedBeforeRelease == ~held => stopped
=============================================================================
