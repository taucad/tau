------------------------- MODULE ProjectTaskDispatch -------------------------
EXTENDS Naturals, TLC
CONSTANT EarlyStop
\* phase describes only the dispatch actor; reservation belongs to the durable task.
\* An ended actor with an error can still own an uncertain allocation and reservation.
VARIABLES phase, cancellation, resource, settled, reservation, error
vars == <<phase, cancellation, resource, settled, reservation, error>>
Init == /\ phase = "executing" /\ cancellation = FALSE /\ resource = TRUE
        /\ settled = FALSE /\ reservation = TRUE /\ error = FALSE
Cancel == /\ phase = "executing" /\ ~cancellation
          /\ cancellation' = TRUE
          /\ phase' = IF EarlyStop THEN "ended" ELSE phase
          /\ reservation' = IF EarlyStop THEN FALSE ELSE reservation
          /\ UNCHANGED <<resource, settled, error>>
Settled == /\ phase = "executing"
           /\ phase' = "ended" /\ resource' = FALSE /\ settled' = TRUE
           /\ reservation' = FALSE
           /\ UNCHANGED <<cancellation, error>>
Failed == /\ phase = "executing"
          /\ phase' = "ended" /\ error' = TRUE
          /\ UNCHANGED <<cancellation, resource, settled, reservation>>
\* The existing resource owner reconciles and acknowledges release outside the ended actor.
Recovered == /\ phase = "ended" /\ error /\ reservation
             /\ resource' = FALSE /\ settled' = TRUE /\ reservation' = FALSE
             /\ UNCHANGED <<phase, cancellation, error>>
Next == Cancel \/ Settled \/ Failed \/ Recovered
Spec == Init /\ [][Next]_vars
TypeOK == /\ phase \in {"executing", "ended"}
          /\ cancellation \in BOOLEAN /\ resource \in BOOLEAN /\ settled \in BOOLEAN
          /\ reservation \in BOOLEAN /\ error \in BOOLEAN
NoEarlyRelease == ~reservation => (~resource /\ settled)
=============================================================================
