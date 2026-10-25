-------------------------- MODULE QueuePlacement --------------------------
\* A bounded recovery slice: one prepared command, two independent host logs,
\* or one missing acknowledged predecessor and one unsent successor. The
\* single-host FIFO/terminal protocol remains in MessageQueue.tla.
EXTENDS Naturals, FiniteSets
CONSTANTS Hosts, Home, Cases, PinCommands, ScopedRebase
VARIABLE s
vars == <<s>>
None == "none"
Unknown == "unknown"
Unconfirmed == "unconfirmed"
PreparedCases == {"prepared", "legacy-prepared"}

Init == \E c \in Cases :
  s = [scenario |-> c, selected |-> Home, observed |-> Home,
       switched |-> FALSE, pendingGrant |-> None, granted |-> None,
       after |-> c \notin PreparedCases, afterPlacement |-> IF c = "receipt" THEN Home ELSE Unknown,
       rebased |-> None, known |-> {}, queued |-> c \notin PreparedCases,
       prepared |-> c \in PreparedCases,
       pin |-> IF c = "prepared" THEN Home ELSE IF c = "legacy-prepared" THEN Unconfirmed ELSE None,
       accepted |-> IF c \in PreparedCases THEN {Home} ELSE {},
       unsafeRelease |-> FALSE]

\* The initial prepared state is after A's durable acceptance and a lost ACK.
\* Acceptance sets are host-local; B cannot deduplicate A's command id.
\* A switch is any change of the host the chat's turns go to: the person's pick,
\* or this tab coming to reach a held placement or finding it cannot reach the
\* one it applied. Each takes the one persistence step that grants, rebinds the
\* observer and marks prepared commands; only a pick is written to the records.
Switch(h) == /\ ~s.switched /\ h \in Hosts \ {Home}
             /\ s' = [s EXCEPT !.selected = h, !.switched = TRUE,
                 !.pendingGrant = IF s.after /\ s.afterPlacement = Unknown /\ ~s.prepared
                                    THEN h ELSE None]
\* A second selection cancels the first effect while its queue write awaits.
\* The attachment still belongs to Home, so this selection needs no rebind.
CancelBack == /\ s.pendingGrant # None /\ s.selected # Home
              /\ s' = [s EXCEPT !.selected = Home]
CommitGrant == /\ s.pendingGrant # None
               /\ s' = [s EXCEPT !.granted = s.pendingGrant,
                   !.rebased = IF ScopedRebase THEN s.pendingGrant ELSE None,
                   !.after = IF ScopedRebase THEN @ ELSE FALSE,
                   !.pendingGrant = None]
\* Only a validated attachment supplies the destination used by the barrier.
Observe == /\ s.pendingGrant = None /\ s.observed # s.selected
           /\ s' = [s EXCEPT !.observed = s.selected]
SeePredecessor == /\ s.observed = Home /\ Home \notin s.known
                 /\ s' = [s EXCEPT !.known = @ \cup {Home}]

BarrierAllows == ~s.after \/ s.observed \in s.known
                 \/ (s.afterPlacement # Unknown /\ s.afterPlacement # s.observed)
                 \/ (s.afterPlacement = Unknown /\ s.rebased = s.observed)
DeliverNext == /\ s.queued /\ s.pendingGrant = None
               /\ s.selected = s.observed /\ BarrierAllows
               /\ s' = [s EXCEPT !.queued = FALSE,
                   !.unsafeRelease = @ \/
                     (s.observed \notin s.known /\
                       IF s.afterPlacement = Unknown THEN s.observed # s.granted
                       ELSE s.observed = s.afterPlacement)]
Retry == /\ s.prepared /\ s.pendingGrant = None /\ s.selected = s.observed
         /\ (~PinCommands \/ s.pin = s.selected)
         /\ s' = [s EXCEPT !.accepted = @ \cup {s.selected}]
\* The owner log can reconcile a retained command even without retransmission.
Acknowledge == /\ s.prepared /\ s.observed \in s.accepted
               /\ s' = [s EXCEPT !.prepared = FALSE, !.pin = None,
                   !.after = TRUE, !.afterPlacement = s.observed, !.rebased = None]
Next == (\E h \in Hosts : Switch(h)) \/ CancelBack \/ CommitGrant
        \/ Observe \/ SeePredecessor \/ DeliverNext \/ Retry \/ Acknowledge
Spec == Init /\ [][Next]_vars
TypeOK == /\ s.scenario \in Cases /\ s.selected \in Hosts /\ s.observed \in Hosts
          /\ s.pendingGrant \in Hosts \cup {None} /\ s.granted \in Hosts \cup {None}
          /\ s.afterPlacement \in Hosts \cup {Unknown} /\ s.rebased \in Hosts \cup {None}
          /\ s.pin \in Hosts \cup {None, Unconfirmed} /\ s.accepted \subseteq Hosts
          /\ s.known \subseteq Hosts
          /\ s.after \in BOOLEAN /\ s.queued \in BOOLEAN /\ s.prepared \in BOOLEAN
          /\ s.switched \in BOOLEAN /\ s.unsafeRelease \in BOOLEAN
AtMostOneAcceptingHost == Cardinality(s.accepted) <= 1
RebaseStaysAtDestination == ~s.unsafeRelease
\* State predicates check permission, not eventual delivery or fairness.
KnownForeignReceiptCanContinue ==
  (s.after /\ s.afterPlacement # Unknown /\ s.afterPlacement # s.observed) => BarrierAllows
UnseenSameHostReceiptWaits ==
  (s.after /\ s.afterPlacement = s.observed /\ s.observed \notin s.known) => ~BarrierAllows
PreparedReceiptSurvives == s.scenario \in PreparedCases => (s.prepared \/ s.after)
=============================================================================
