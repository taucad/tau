------------------------- MODULE ProjectTaskAdmission -------------------------
EXTENDS Naturals, FiniteSets, TLC
\* This source-linked model projects reservations, durable child lineage and
\* resource ownership. A child may be admitted before its chat metadata is
\* repaired, but it cannot allocate or start until that lineage is projected.
\* Mailbox delivery and per-attempt receipts remain outside this finite
\* projection; semantic tests cover rendered prompt bytes and receipt identity.
\* ModelResolved includes non-Tau tasks and Tau tasks whose selected catalog row
\* resolved. Admission may precede this check, but a failed selection cannot
\* allocate a revision checkout or attach a model to the private candidate.
\* Task identifiers are opaque here; browser-safe UUID generation changes no
\* reservation, lineage or resource transition.
CONSTANTS Tasks, Root, Requests, Cap, Depth, ModelResolved
VARIABLES phase, parent, depth, source, closed, resources, admitted, lineage
vars == <<phase, parent, depth, source, closed, resources, admitted, lineage>>
Active == {t \in Tasks : phase[t] \in {"allocating", "running", "cancelling"}}
Children(t) == {c \in Tasks : parent[c] = t}
Descendants(t) == {t} \cup Children(t) \cup UNION {Children(c) : c \in Children(t)}
Init == /\ phase = [t \in Tasks |-> IF t = Root THEN "running" ELSE "absent"]
        /\ parent = [t \in Tasks |-> Root]
        /\ depth = [t \in Tasks |-> 0]
        /\ source = [t \in Tasks |-> "immutable-base"]
        /\ closed = {} /\ resources = {} /\ admitted = [r \in Requests |-> Root]
        /\ lineage = {Root}
Spawn(p, t, r) == /\ p \in Active /\ p \notin closed
                  /\ phase[t] = "absent" /\ admitted[r] = Root
                  /\ Cardinality(Active) < Cap /\ depth[p] < Depth
                  /\ phase' = [phase EXCEPT ![t] = "allocating"]
                  /\ parent' = [parent EXCEPT ![t] = p]
                  /\ depth' = [depth EXCEPT ![t] = @ + depth[p] + 1]
                  /\ source' = [source EXCEPT ![t] = source[p]]
                  /\ admitted' = [admitted EXCEPT ![r] = t]
                  /\ UNCHANGED <<closed, resources, lineage>>
ProjectLineage(t) == /\ phase[t] # "absent" /\ t \notin lineage /\ parent[t] \in lineage
                     /\ lineage' = lineage \cup {t}
                     /\ UNCHANGED <<phase, parent, depth, source, closed, resources, admitted>>
Allocate(t) == /\ phase[t] \in {"allocating", "cancelling"} /\ t \in ModelResolved
               /\ t \in lineage /\ t \notin resources
               /\ resources' = resources \cup {t}
               /\ UNCHANGED <<phase, parent, depth, source, closed, admitted, lineage>>
Start(t) == /\ phase[t] = "allocating" /\ t \in resources /\ t \notin closed
            /\ phase' = [phase EXCEPT ![t] = "running"]
            /\ UNCHANGED <<parent, depth, source, closed, resources, admitted, lineage>>
Cancel(t) == /\ t \in Tasks /\ phase[t] # "absent"
             /\ closed' = closed \cup Descendants(t)
             /\ phase' = [c \in Tasks |-> IF c \in Descendants(t) /\ c \in Active THEN "cancelling" ELSE phase[c]]
             /\ UNCHANGED <<parent, depth, source, resources, admitted, lineage>>
Release(t) == /\ t \in Active
              /\ phase' = [phase EXCEPT ![t] = "terminal"]
              /\ resources' = resources \ {t}
              /\ UNCHANGED <<parent, depth, source, closed, admitted, lineage>>
Next == (\E p, t \in Tasks, r \in Requests : Spawn(p,t,r))
        \/ (\E t \in Tasks : ProjectLineage(t) \/ Allocate(t) \/ Start(t) \/ Cancel(t) \/ Release(t))
Spec == Init /\ [][Next]_vars
Bounded == Cardinality(Active) <= Cap
Nested == \A t \in Tasks : depth[t] <= Depth
ImmutableSource == \A t \in Tasks : phase[t] # "absent" => source[t] = "immutable-base"
NoTerminalResources == resources \subseteq Active
UnresolvedNoResources == resources \subseteq ModelResolved
NoResourceWithoutLineage == resources \subseteq lineage
NoRunningWithoutLineage == \A t \in Tasks : phase[t] = "running" => t \in lineage
CancelledNeverStarts == \A t \in closed : phase[t] # "running"
=============================================================================
