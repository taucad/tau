----------------------------- MODULE SeamCatchUp -----------------------------
(* T6: catch-up pages are provisional until an authoritative final proof.     *)
(* Immutable captured rows/end belong to one source incarnation. A source     *)
(* replacement, writer claim or abort cannot validate the retired capture.    *)
(* This model supplements SeamDelivery's atomic Read; it does not model byte  *)
(* acquisition cost, decoded-memory budgets or RPC credit (tested separately).*)
\* Refinement: Validate commits the captured prefix as SeamDelivery.Read.
\* Page, Refuse and Abort leave the visible projection unchanged (stutter).
EXTENDS Naturals, Sequences
CONSTANTS GuardValidation, GuardPublication, GuardPrefix,
          GuardCapturedHealth, GuardReadHealth
PriorVisible == <<9>>
PriorHealth == TRUE
\* Raw execution-only changes can project to the same visible fact.
ProjectRow(row) == IF row = 3 THEN 1 ELSE row
Project(rows) == [index \in 1..Len(rows) |-> ProjectRow(rows[index])]

VARIABLES source, epoch, writer, phase, captured, capturedEpoch, staged,
          committed, lease, validatedOK, sourceHealth, capturedHealth,
          committedHealth, expectedHealth
vars == <<source, epoch, writer, phase, captured, capturedEpoch, staged,
          committed, lease, validatedOK, sourceHealth, capturedHealth,
          committedHealth, expectedHealth>>

Init ==
  /\ source = <<1, 2>> /\ epoch = 1 /\ writer = FALSE
  /\ phase = "idle" /\ captured = <<>> /\ capturedEpoch = 0
  /\ staged = <<>> /\ committed = PriorVisible /\ lease = FALSE
  /\ validatedOK = TRUE
  /\ sourceHealth \in BOOLEAN /\ capturedHealth = TRUE
  /\ committedHealth = PriorHealth /\ expectedHealth = PriorHealth

Capture ==
  /\ phase = "idle" /\ ~writer
  /\ captured' = source /\ capturedEpoch' = epoch
  /\ capturedHealth' = sourceHealth
  /\ lease' = TRUE /\ phase' = "captured"
  /\ UNCHANGED <<source, epoch, writer, staged, committed, validatedOK,
                 sourceHealth, committedHealth, expectedHealth>>

Page ==
  /\ phase = "captured" /\ lease /\ Len(staged) < Len(captured)
  /\ staged' = Append(staged, ProjectRow(captured[Len(staged) + 1]))
  /\ committed' = IF GuardPublication THEN committed ELSE staged'
  /\ UNCHANGED <<source, epoch, writer, phase, captured, capturedEpoch,
                 lease, validatedOK, sourceHealth, capturedHealth,
                 committedHealth, expectedHealth>>

AppendSource ==
  /\ epoch = 1 /\ source = <<1, 2>>
  /\ source' = <<1, 2, 3>>
  /\ UNCHANGED <<epoch, writer, phase, captured, capturedEpoch, staged,
                 committed, lease, validatedOK, sourceHealth, capturedHealth,
                 committedHealth, expectedHealth>>

ReplaceSource ==
  /\ epoch = 1
  /\ source' = <<3>> /\ epoch' = 2
  /\ UNCHANGED <<writer, phase, captured, capturedEpoch, staged,
                 committed, lease, validatedOK, sourceHealth, capturedHealth,
                 committedHealth, expectedHealth>>

ClaimWriter ==
  /\ ~writer /\ writer' = TRUE
  /\ UNCHANGED <<source, epoch, phase, captured, capturedEpoch, staged,
                 committed, lease, validatedOK, sourceHealth, capturedHealth,
                 committedHealth, expectedHealth>>

ReplaceBytes ==
  /\ epoch = 1 /\ source = <<1, 2>>
  /\ source' = <<2, 1>>
  /\ UNCHANGED <<epoch, writer, phase, captured, capturedEpoch, staged,
                 committed, lease, validatedOK, sourceHealth, capturedHealth,
                 committedHealth, expectedHealth>>

\* Same source generation, row count and projected facts; exact raw proof must still fail.
ReplaceContext ==
  /\ epoch = 1 /\ source = <<1, 2>>
  /\ source' = <<3, 2>>
  /\ UNCHANGED <<epoch, writer, phase, captured, capturedEpoch, staged,
                 committed, lease, validatedOK, sourceHealth, capturedHealth,
                 committedHealth, expectedHealth>>

\* A complete malformed line is appended: no kept row or source-generation change.
AppendQuarantine ==
  /\ sourceHealth
  /\ sourceHealth' = FALSE
  /\ UNCHANGED <<source, epoch, writer, phase, captured, capturedEpoch, staged,
                 committed, lease, validatedOK, capturedHealth,
                 committedHealth, expectedHealth>>

OwnerOK == lease /\ ~writer /\ epoch = capturedEpoch
PrefixOK == Len(source) >= Len(captured)
            /\ SubSeq(source, 1, Len(captured)) = captured
ProofOK == OwnerOK /\ PrefixOK

Validate ==
  /\ phase = "captured" /\ Len(staged) = Len(captured)
  /\ (~GuardValidation \/ OwnerOK) /\ (~GuardPrefix \/ PrefixOK)
  /\ committed' = staged /\ validatedOK' = ProofOK
  /\ expectedHealth' = capturedHealth
  /\ committedHealth' = IF GuardCapturedHealth THEN capturedHealth ELSE TRUE
  /\ phase' = "validated" /\ lease' = FALSE
  /\ UNCHANGED <<source, epoch, writer, captured, capturedEpoch, staged,
                 sourceHealth, capturedHealth>>

Refuse ==
  /\ phase = "captured" /\ ~ProofOK
  /\ phase' = "refused" /\ lease' = FALSE /\ staged' = <<>>
  /\ UNCHANGED <<source, epoch, writer, captured, capturedEpoch,
                 committed, validatedOK, sourceHealth, capturedHealth,
                 committedHealth, expectedHealth>>

Abort ==
  /\ phase = "captured"
  /\ phase' = "aborted" /\ lease' = FALSE /\ staged' = <<>>
  /\ UNCHANGED <<source, epoch, writer, captured, capturedEpoch,
                 committed, validatedOK, sourceHealth, capturedHealth,
                 committedHealth, expectedHealth>>

\* A following read returns health-only when its echoed host health differs.
ReadHealth ==
  /\ phase = "validated" /\ expectedHealth # sourceHealth
  /\ ~writer /\ epoch = capturedEpoch /\ PrefixOK
  /\ expectedHealth' = sourceHealth
  /\ committedHealth' = IF GuardReadHealth THEN sourceHealth ELSE committedHealth
  /\ UNCHANGED <<source, epoch, writer, phase, captured, capturedEpoch, staged,
                 committed, lease, validatedOK, sourceHealth, capturedHealth>>

\* Safety-only terminal states explicitly stutter; no liveness is claimed.
TerminalStutter ==
  /\ (phase \in {"validated", "refused", "aborted"} \/ (phase = "idle" /\ writer))
  /\ UNCHANGED vars
Next == Capture \/ Page \/ AppendSource \/ ReplaceSource \/ ReplaceBytes \/ ReplaceContext \/ ClaimWriter
        \/ AppendQuarantine \/ Validate \/ Refuse \/ Abort \/ ReadHealth \/ TerminalStutter
Spec == Init /\ [][Next]_vars

ValidatedSource == phase = "validated" => validatedOK
NoPartialCommit == phase # "validated" =>
                     committed = PriorVisible /\ committedHealth = PriorHealth
CapturedPages == staged = Project(SubSeq(captured, 1, Len(staged)))
SourceHealthTruth == committedHealth = expectedHealth
Released == phase \in {"validated", "refused", "aborted"} => ~lease
=============================================================================
