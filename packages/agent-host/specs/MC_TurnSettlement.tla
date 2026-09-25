---------------------------- MODULE MC_TurnSettlement ----------------------------
(* Apalache instance of the target: two chats, both with a turn, the three design knobs on. *)
(* The crash, page-death and edit budgets are set far beyond any finite run: the induction  *)
(* step starts from an arbitrary IndInv state, which does not mention the counters.         *)
EXTENDS TurnSettlement

ConstInit ==
    /\ Chats = {"a", "b"}
    /\ TurnChats = {"a", "b"}
    /\ MaxCrashes = 1000000000
    /\ MaxPageDeaths = 1000000000
    /\ MaxEdits = 1000000000
    /\ IntentFirst = TRUE
    /\ LeaseUntilRow = TRUE
    /\ ReconcileOnView = FALSE

\* Mutants for a vacuity check: the same IndInv must fail to be inductive with a knob reverted.
ConstInitLeaseFirst ==
    /\ Chats = {"a", "b"} /\ TurnChats = {"a", "b"}
    /\ MaxCrashes = 1000000000 /\ MaxPageDeaths = 1000000000 /\ MaxEdits = 1000000000
    /\ IntentFirst = FALSE /\ LeaseUntilRow = TRUE /\ ReconcileOnView = FALSE
ConstInitRetireFirst ==
    /\ Chats = {"a", "b"} /\ TurnChats = {"a", "b"}
    /\ MaxCrashes = 1000000000 /\ MaxPageDeaths = 1000000000 /\ MaxEdits = 1000000000
    /\ IntentFirst = TRUE /\ LeaseUntilRow = FALSE /\ ReconcileOnView = FALSE
=====================================================================================
