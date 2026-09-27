---------------------------- MODULE MC_TurnSettlement ----------------------------
(* Apalache instance of the target: two chats, both with a turn, the target's switches. The crash,   *)
(* page-death and edit budgets are set far beyond any finite run: the induction step starts from an  *)
(* arbitrary IndInv state, which does not mention the counters.                                       *)
EXTENDS TurnSettlement

Budgets ==
    /\ Chats = {"a", "b"} /\ TurnChats = {"a", "b"}
    /\ MaxCrashes = 1000000000 /\ MaxPageDeaths = 1000000000 /\ MaxEdits = 1000000000

\* The target with one switch reversed (an argument names the switch; all TRUE is the target).
Switches(intentFirst, leaseBeforeMint, cutEveryTerminal, ackBeforeRetire, fenceOldSession) ==
    /\ IntentFirst = intentFirst /\ ReconcileOnView = FALSE
    /\ LeaseBeforeMint = leaseBeforeMint /\ LeaseIndexed = TRUE
    /\ CutEveryTerminal = cutEveryTerminal /\ AckBeforeRetire = ackBeforeRetire
    /\ SplitAnchor = TRUE /\ FenceOldSession = fenceOldSession /\ DropOnFence = FALSE /\ Rebroker = TRUE

ConstInit == Budgets /\ Switches(TRUE, TRUE, TRUE, TRUE, TRUE)

\* Mutants for a vacuity check: the same IndInv must fail to be inductive with a switch reversed.
\* S4's two: placement before the intent row, and retirement before the row (W8's retire at the cut).
ConstInitLeaseFirst == Budgets /\ Switches(FALSE, TRUE, TRUE, TRUE, TRUE)
ConstInitRetireFirst == Budgets /\ Switches(TRUE, TRUE, TRUE, FALSE, TRUE)
\* W8's: the pre-mint before the lease, and the browser's discard.
ConstInitPremintFirst == Budgets /\ Switches(TRUE, FALSE, TRUE, TRUE, TRUE)
ConstInitNoCut == Budgets /\ Switches(TRUE, TRUE, FALSE, TRUE, TRUE)
=====================================================================================
