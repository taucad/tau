--------------------------- MODULE ShellCustody ---------------------------
\* I7 approved API revision 3: native evidence, start barrier, and exclusive recovery.
EXTENDS Naturals, FiniteSets
CONSTANTS ConfirmStop, RespectOwner
VARIABLES state, writer, owner, holderLive, hostLive, receipt, roots, answered
vars == <<state, writer, owner, holderLive, hostLive, receipt, roots, answered>>
Init == /\ state = "prepared" /\ ~writer /\ owner = "launch"
        /\ holderLive /\ hostLive /\ receipt /\ roots /\ ~answered
Arm == /\ state = "prepared" /\ hostLive /\ owner = "launch"
       /\ state' = "armed" /\ writer' = TRUE
       /\ UNCHANGED <<owner, holderLive, hostLive, receipt, roots, answered>>
HostCrash == /\ hostLive /\ hostLive' = FALSE
             /\ UNCHANGED <<state, writer, owner, holderLive, receipt, roots, answered>>
OwnerCrash == /\ holderLive /\ holderLive' = FALSE /\ owner' = "none"
              /\ UNCHANGED <<state, writer, hostLive, receipt, roots, answered>>
Claim == /\ receipt /\ owner # "recovery"
         /\ (~RespectOwner \/ (~holderLive /\ owner = "none"))
         /\ owner' = "recovery" /\ holderLive' = TRUE
         /\ UNCHANGED <<state, writer, hostLive, receipt, roots, answered>>
Stop == /\ owner # "none" /\ receipt
        /\ writer' = FALSE /\ state' = "stopped" /\ answered' = TRUE
        /\ UNCHANGED <<owner, holderLive, hostLive, receipt, roots>>
Failure == /\ state = "armed" /\ owner # "none"
           /\ answered' = TRUE
           /\ state' = IF ConfirmStop THEN "armed" ELSE "stopped"
           /\ UNCHANGED <<writer, owner, holderLive, hostLive, receipt, roots>>
DeleteRoots == /\ state = "stopped" /\ owner # "none"
               /\ roots' = FALSE
               /\ UNCHANGED <<state, writer, owner, holderLive, hostLive, receipt, answered>>
Release == /\ state = "stopped" /\ ~roots /\ owner # "none"
           /\ receipt' = FALSE /\ owner' = "none" /\ holderLive' = FALSE
           /\ UNCHANGED <<state, writer, hostLive, roots, answered>>
Next == Arm \/ HostCrash \/ OwnerCrash \/ Claim \/ Stop \/ Failure \/ DeleteRoots \/ Release
Spec == Init /\ [][Next]_vars
NoFalseStop == state = "stopped" => ~writer
NoEarlyDeletion == writer => receipt /\ roots
\* A recovery claim cannot replace a still-live launch owner. The action is checked directly.
NoLiveTakeover == [][(owner = "launch" /\ holderLive /\ owner' = "recovery") => FALSE]_vars
=============================================================================
