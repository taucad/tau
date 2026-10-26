--------------------------- MODULE ShellCustody ---------------------------
\* One execution, one launch, two competing recovery actors. Tokens are never
\* reused in this finite instance. Each action is a separate crash boundary.
EXTENDS Naturals, FiniteSets
CONSTANTS ConfirmStop, RespectOwner, FenceReply
Actors == {"host", "supervisor", "recovery1", "recovery2"}
Recoverers == {"recovery1", "recovery2"}
VARIABLES record, barrier, writer, owner, live, tokens, used, acknowledged,
          observed, roots, resource, inventoryComplete, answered, pending, budget, event
vars == <<record, barrier, writer, owner, live, tokens, used, acknowledged,
          observed, roots, resource, inventoryComplete, answered, pending, budget, event>>
Init == /\ record = "prepared" /\ barrier = "absent" /\ writer = FALSE
        /\ owner = "host" /\ live = Actors
        /\ tokens = [a \in Actors |-> IF a = "host" THEN "host" ELSE "none"]
        /\ used = {"host"} /\ acknowledged = FALSE /\ observed = "none"
        /\ roots = TRUE /\ resource = TRUE /\ inventoryComplete = FALSE /\ answered = FALSE /\ pending = "none" /\ budget = 0 /\ event = "init"
Current(a) == a \in live /\ owner = a /\ tokens[a] = owner
SpawnBlocked ==
  /\ Current("host") /\ record = "prepared" /\ barrier = "absent"
  /\ barrier' = "blocked" /\ event' = "spawn-blocked"
  /\ UNCHANGED <<record, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, resource, inventoryComplete, answered, pending, budget>>
PersistRegistration ==
  /\ Current("host") /\ barrier = "blocked" /\ record = "prepared"
  /\ record' = "armed" /\ event' = "persist-registration"
  /\ UNCHANGED <<barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, resource, inventoryComplete, answered, pending, budget>>
\* Transfer is an exclusive-lock handoff; the host token is now stale.
Handoff ==
  /\ Current("host") /\ "supervisor" \in live /\ record = "armed"
  /\ "supervisor" \notin used
  /\ owner' = "supervisor" /\ tokens' = [tokens EXCEPT !["supervisor"] = "supervisor"]
  /\ used' = used \cup {"supervisor"} /\ event' = "handoff"
  /\ UNCHANGED <<record, barrier, writer, live, acknowledged, observed,
                  roots, resource, inventoryComplete, answered, pending, budget>>
AcknowledgeRegistration ==
  /\ Current("supervisor") /\ "host" \in live /\ record = "armed"
  /\ acknowledged' = TRUE /\ event' = "ack-registration"
  /\ UNCHANGED <<record, barrier, writer, owner, live, tokens, used, observed,
                  roots, resource, inventoryComplete, answered, pending, budget>>
Start ==
  /\ Current("supervisor") /\ acknowledged /\ record = "armed" /\ barrier = "blocked"
  /\ barrier' = "open" /\ writer' = TRUE /\ event' = "start"
  /\ UNCHANGED <<record, owner, live, tokens, used, acknowledged, observed,
                  roots, resource, inventoryComplete, answered, pending, budget>>
Crash(a) ==
  /\ a \in live /\ live' = live \ {a}
  /\ owner' = IF owner = a THEN "none" ELSE owner
  /\ event' = "crash"
  /\ UNCHANGED <<record, barrier, writer, tokens, used, acknowledged, observed,
                  roots, resource, inventoryComplete, answered, pending, budget>>
Claim(a, selected) ==
  /\ a \in Recoverers /\ a \in live /\ a \notin used /\ selected
  /\ record # "released" /\ (~RespectOwner \/ owner = "none")
  /\ owner' = a /\ tokens' = [tokens EXCEPT ![a] = a] /\ used' = used \cup {a}
  /\ observed' = "none" /\ pending' = "none" /\ event' = "claim"
  /\ UNCHANGED <<record, barrier, writer, live, acknowledged,
                  roots, resource, inventoryComplete, answered, budget>>
\* Bounded unknown/survivor answers do not manufacture stopped evidence.
Failure(a) ==
  /\ Current(a) /\ pending = a /\ budget = 0 /\ record \in {"prepared", "armed"}
  /\ pending' = "none" /\ answered' = TRUE /\ record' = IF ConfirmStop THEN record ELSE "stopped"
  /\ event' = "failure"
  /\ UNCHANGED <<barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, resource, inventoryComplete, budget>>
ObserveStopped(a) ==
  /\ Current(a) /\ pending = a /\ record \in {"prepared", "armed"}
  /\ writer' = FALSE /\ barrier' = "closed" /\ observed' = a
  /\ event' = "observe-stopped"
  /\ UNCHANGED <<record, owner, live, tokens, used, acknowledged,
                  roots, resource, inventoryComplete, answered, pending, budget>>
PersistStopped(a) ==
  /\ Current(a) /\ pending = a /\ observed = a /\ barrier = "closed" /\ ~writer
  /\ record # "released" /\ record' = "stopped" /\ answered' = TRUE /\ pending' = "none"
  /\ event' = "persist-stopped"
  /\ UNCHANGED <<barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, resource, inventoryComplete, budget>>
Inventory ==
  /\ inventoryComplete' = TRUE /\ event' = "inventory"
  /\ UNCHANGED <<record, barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, resource, answered, pending, budget>>
DeleteRoots(a) ==
  /\ Current(a) /\ record = "stopped" /\ inventoryComplete
  /\ roots' = FALSE /\ event' = "delete-roots"
  /\ UNCHANGED <<record, barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, resource, inventoryComplete, answered, pending, budget>>
ReleaseResource(a) ==
  /\ Current(a) /\ record = "stopped" /\ ~roots /\ inventoryComplete
  /\ resource' = FALSE /\ event' = "release-resource"
  /\ UNCHANGED <<record, barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, inventoryComplete, answered, pending, budget>>
Release(a) ==
  /\ Current(a) /\ record = "stopped" /\ ~roots /\ ~resource
  /\ record' = "released" /\ owner' = "none" /\ event' = "release"
  /\ UNCHANGED <<barrier, writer, live, tokens, used, acknowledged,
                  observed, roots, resource, inventoryComplete, answered, pending, budget>>
\* Delayed callbacks carry the original actor/token, never read a fresh token.
StaleCallback(a) ==
  /\ tokens[a] # "none" /\ ~Current(a) /\ event' = "stale-refused"
  /\ UNCHANGED <<record, barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, resource, inventoryComplete, answered, pending, budget>>
BeginCleanup(a) ==
  /\ Current(a) /\ pending = "none" /\ record \in {"prepared", "armed"}
  /\ pending' = a /\ budget' = 2 /\ answered' = FALSE /\ event' = "begin-cleanup"
  /\ UNCHANGED <<record, barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, resource, inventoryComplete>>
RequestTick(a) ==
  /\ a \in live /\ pending = a /\ budget > 0
  /\ budget' = budget - 1 /\ event' = "request-tick"
  /\ UNCHANGED <<record, barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, resource, inventoryComplete, answered, pending>>
StaleRequestFailure(a) ==
  /\ FenceReply
  /\ a \in live /\ ~Current(a) /\ pending = a /\ budget = 0
  /\ pending' = "none" /\ answered' = TRUE /\ event' = "stale-request-failed"
  /\ UNCHANGED <<record, barrier, writer, owner, live, tokens, used, acknowledged,
                  observed, roots, resource, inventoryComplete, budget>>
Next == SpawnBlocked \/ PersistRegistration \/ Handoff \/ AcknowledgeRegistration \/ Start \/ Inventory
        \/ (\E a \in Actors : Crash(a) \/ BeginCleanup(a) \/ RequestTick(a) \/ Failure(a) \/ StaleRequestFailure(a) \/ ObserveStopped(a) \/ PersistStopped(a)
                              \/ DeleteRoots(a) \/ ReleaseResource(a) \/ Release(a) \/ StaleCallback(a))
        \/ (\E a \in Recoverers, selected \in BOOLEAN : Claim(a, selected))
Spec == Init /\ [][Next]_vars
        /\ (\A a \in Actors : WF_vars(RequestTick(a)) /\ WF_vars(Failure(a)) /\ WF_vars(StaleRequestFailure(a)))
RequestQuiescent == pending = "none" \/ pending \notin live
RequestsReturn == []<>RequestQuiescent
NoFalseStop == record \in {"stopped", "released"} => ~writer
NoEarlyDeletion == writer => record = "armed" /\ roots /\ resource
BarrierHasReceipt == writer => acknowledged /\ barrier = "open" /\ record = "armed"
ReleasedCannotStart == record = "released" => barrier = "closed"
NoLiveTakeover == [][(event' = "claim" /\ owner \in live) => FALSE]_vars
StaleCannotRelease == [][event' = "stale-refused" => UNCHANGED <<record, roots, resource, owner, pending, budget>>]_vars
=============================================================================
