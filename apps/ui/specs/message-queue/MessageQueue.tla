-------------------------- MODULE MessageQueue --------------------------
\* Reviews of code changes against this model: MessageQueue/reviews/ (formal verification policy rule 12).
EXTENDS Naturals, Sequences, FiniteSets, TLC
CONSTANTS Messages, Tabs, Durable, QuietSubmit, StableIdentity,
          ObserveBarrier, TargetedCancel, TerminalBeforeSend,
          RequireTerminalIntent, CaptureTerminalAtSubmit, HoldBehindWithdraw,
          RefuseOnlyUnapplied
VARIABLE s
vars == <<s>>
None == "none"
Original == "original"
Runs == Messages \cup {Original}
Live(p) == p \in {"running", "paused"}
Stopped(p) == p \in {"cancelled", "failed"}
Terminal(p) == p = "completed" \/ Stopped(p)
Members(q) == {q[i] : i \in 1..Len(q)}
Remove(q, m) == SelectSeq(q, LAMBDA x : x # m)
Accepted == {key[1] : key \in s.accepted}
Unheld(q) == SelectSeq(q, LAMBDA x : x \notin s.held)
NextUp == IF HoldBehindWithdraw /\ Len(Unheld(s.queue)) > 0 THEN Head(Unheld(s.queue)) ELSE Head(s.queue)
Chosen == IF s.steerItem # None THEN s.steerItem ELSE NextUp
BarrierSeen(t) == ~ObserveBarrier \/ s.after = None \/ s.after \in s.observed[t].known
Ready(t) == /\ BarrierSeen(t)
            /\ IF s.steerItem = None
                  THEN s.observed[t].phase = "completed"
                       \/ (Stopped(s.observed[t].phase) /\
                           (~RequireTerminalIntent \/ s.afterTerminal[Chosen] = s.observed[t].run))
                  ELSE ~TerminalBeforeSend \/ Terminal(s.observed[t].phase)
            /\ (~HoldBehindWithdraw \/ s.steerItem # None \/ Chosen \notin s.held)
Init == s = [queue |-> <<>>, saved |-> <<>>, submitted |-> {}, prepared |-> None,
             owner |-> None, alive |-> Tabs, after |-> None, active |-> Original,
             pending |-> None, pendingTab |-> None,
             capturedTerminal |-> [m \in Messages |-> None],
             afterTerminal |-> [m \in Messages |-> None],
             phase |-> [r \in Runs |-> IF r = Original THEN "running" ELSE "absent"],
             known |-> {Original}, accepted |-> {}, counts |-> [m \in Messages |-> 0],
             observed |-> [t \in Tabs |-> [run |-> Original, phase |-> "running", known |-> {Original}]],
             earlyDelivery |-> FALSE, earlySteer |-> FALSE, outOfOrder |-> FALSE,
             steerItem |-> None, target |-> None,
             cancelPending |-> {}, wrongCancellation |-> FALSE, submitInterrupted |-> FALSE,
             composer |-> {}, held |-> {}, heldDelivery |-> FALSE, takenBack |-> {}]
\* Capture authorization at UI submit entry before attachment promotion, then
\* forward the same intent through execution lookup and storage lock awaits.
Submit(t, m) == /\ t \in s.alive /\ m \notin s.submitted /\ s.pending = None
                /\ s' = [s EXCEPT !.pending = m, !.pendingTab = t,
                    !.capturedTerminal[m] = IF Stopped(s.observed[t].phase)
                                             THEN s.observed[t].run ELSE None,
                    !.submitInterrupted = @ \/ (~QuietSubmit /\ Live(s.phase[s.active])),
                    !.composer = @ \ {m},
                    !.phase[s.active] = IF QuietSubmit THEN @ ELSE "cancelled"]
Persist == LET m == s.pending IN
           /\ m # None
           /\ s' = [s EXCEPT !.queue = Append(@, m),
                     !.saved = IF Durable THEN Append(@, m) ELSE @,
                     !.submitted = @ \cup {m}, !.pending = None, !.pendingTab = None,
                     !.afterTerminal[m] = IF CaptureTerminalAtSubmit THEN s.capturedTerminal[m]
                       ELSE IF Stopped(s.observed[s.pendingTab].phase)
                              THEN s.observed[s.pendingTab].run ELSE None]
\* Explicit reorder changes only the durable sequence, never admission identity.
MoveBefore(q, m, n) == LET rest == Remove(q, m)
                           at == IF n = None THEN Len(rest) + 1
                                 ELSE CHOOSE i \in 1..Len(rest) : rest[i] = n
                       IN SubSeq(rest, 1, at - 1) \o <<m>> \o SubSeq(rest, at, Len(rest))
Reorder(t, m, n) == /\ t \in s.alive /\ m \in Members(s.queue)
                    /\ n \in (Members(s.queue) \ {m}) \cup {None}
                    /\ s.owner = None /\ s.prepared = None /\ s.steerItem = None
                    /\ s' = [s EXCEPT !.queue = MoveBefore(@, m, n),
                              !.saved = IF Durable THEN MoveBefore(@, m, n) ELSE @]
Observe(t) == /\ t \in s.alive
              /\ s.observed[t] # [run |-> s.active, phase |-> s.phase[s.active], known |-> s.known]
              /\ s' = [s EXCEPT !.observed[t] = [run |-> s.active, phase |-> s.phase[s.active], known |-> s.known]]
Complete == /\ s.phase[s.active] = "running"
            /\ s' = [s EXCEPT !.phase[s.active] = "completed"]
Pause == /\ s.phase[s.active] = "running"
         /\ s' = [s EXCEPT !.phase[s.active] = "paused"]
\* Reattaching the SDK watch after ACP approval observes the same resumed run;
\* it changes no admission identity and cannot release queued work while paused.
Resume == /\ s.phase[s.active] = "paused"
          /\ s' = [s EXCEPT !.phase[s.active] = "running"]
Fail == /\ Live(s.phase[s.active])
        /\ s' = [s EXCEPT !.phase[s.active] = "failed"]
Stop == /\ Live(s.phase[s.active])
        /\ s' = [s EXCEPT !.phase[s.active] = "cancelled"]
Steer(t, m) == /\ t \in s.alive /\ m \in Members(s.queue)
               /\ s.owner = None /\ s.prepared = None /\ s.steerItem = None
               /\ s' = [s EXCEPT !.steerItem = m, !.target = s.observed[t].run]
Cancel(t) == LET victim == IF TargetedCancel THEN s.target ELSE s.observed[t].run IN
             /\ t \in s.alive /\ s.steerItem # None /\ s.prepared = None
             /\ s.owner = None /\ BarrierSeen(t) /\ Live(s.observed[t].phase)
             /\ (~TargetedCancel \/ s.observed[t].run = s.target)
             /\ victim \notin s.cancelPending
             /\ s' = [s EXCEPT !.cancelPending = @ \cup {victim},
                       !.wrongCancellation = @ \/ (victim # s.target)]
FinishCancel(r) == /\ r \in s.cancelPending /\ Live(s.phase[r])
                   /\ s' = [s EXCEPT !.phase[r] = "cancelled"]
Prepare(t) == /\ t \in s.alive /\ s.owner = None /\ Len(s.queue) > 0
              /\ s.prepared = None /\ Ready(t)
              /\ s' = [s EXCEPT !.owner = t, !.prepared = Chosen]
Recover(t) == /\ t \in s.alive /\ s.owner = None /\ s.prepared # None
              /\ s' = [s EXCEPT !.owner = t]
\* The host may refuse any delivery (`refused`, effect `not-applied`): it is counted and accepts nothing.
Deliver(t) == \E refused \in BOOLEAN :
              LET m == s.prepared
                  key == <<m, IF StableIdentity THEN 1 ELSE s.counts[m] + 1>>
                  fresh == key \notin s.accepted
                  accept == ~refused /\ fresh /\ Terminal(s.phase[s.active])
              IN /\ t = s.owner /\ m # None /\ s.counts[m] < 2
                 /\ s' = [s EXCEPT
                    !.counts[m] = @ + 1,
                    !.earlyDelivery = @ \/ (m \notin Accepted /\
                      IF s.steerItem = m THEN ~Terminal(s.phase[s.active])
                      ELSE ~(s.phase[s.active] = "completed" \/
                        (Stopped(s.phase[s.active]) /\ s.capturedTerminal[m] = s.active))),
                    !.earlySteer = @ \/ (m \notin Accepted /\ s.steerItem = m /\
                      s.target # None /\ ~Terminal(s.phase[s.target])),
                    !.outOfOrder = @ \/ (m \notin Accepted /\ s.steerItem # m /\ m # NextUp),
                    !.heldDelivery = @ \/ (m \notin Accepted /\ s.steerItem # m /\ m \in s.held),
                    !.accepted = IF accept THEN @ \cup {key} ELSE @,
                    !.active = IF accept THEN m ELSE @,
                    !.phase[m] = IF accept THEN "running" ELSE @,
                    !.known = IF accept THEN @ \cup {m} ELSE @]
\* Accepted means durable host acceptance, not merely an applied response.
\* A refused/not-applied response leaves the prepared item intact (stuttering), except `Refuse` below (H-1).
\* Local actor-live, abort and in-lock session guards further restrict runtime
\* sends; deletion and optional filesystem watch availability are outside this
\* retained-session safety model. See README for the runtime conformance slice.
Acknowledge(t) == /\ t = s.owner /\ s.prepared # None /\ s.prepared \in Accepted
                  /\ s' = [s EXCEPT !.queue = Remove(@, s.prepared),
                     !.saved = IF Durable THEN Remove(@, s.prepared) ELSE @,
                     !.after = s.prepared, !.prepared = None, !.owner = None,
                     !.capturedTerminal[s.prepared] = None, !.afterTerminal[s.prepared] = None,
                     !.counts[s.prepared] = 0, !.held = @ \ {s.prepared},
                     !.target = IF s.steerItem = s.prepared THEN None ELSE @,
                     !.steerItem = IF s.steerItem = s.prepared THEN None ELSE @]
\* A prepared send no delivery holds, which the host refused with a wait and never accepted, is withdrawn the same
\* way, and its command is dropped (PERF-5).
\* Withdrawing a send that was never prepared or accepted parks it, and every other unprepared, unsteered send
\* still queued, until the person sends it now; its spent steer is dropped. Then either an empty composer takes it,
\* and it leaves the queue, its saved copy and the submitted set with its per-message facts (the person may submit
\* it again), or the composer holds new text and it stays queued, parked. The store holds it first and removes it
\* only once the composer has it; the model takes both writes as one step.
Withdraw(t, m) == /\ t \in s.alive /\ m \in Members(s.queue)
                  /\ (m # s.prepared \/ s.owner = None) /\ m \notin Accepted
                  /\ \/ s' = [s EXCEPT !.queue = Remove(@, m),
                          !.prepared = IF @ = m THEN None ELSE @,
                          !.steerItem = IF @ = m THEN None ELSE @,
                          !.target = IF s.steerItem = m THEN None ELSE @,
                          !.saved = IF Durable THEN Remove(@, m) ELSE @,
                          !.submitted = @ \ {m}, !.counts[m] = 0,
                          !.capturedTerminal[m] = None, !.afterTerminal[m] = None,
                          !.composer = @ \cup {m},
                          !.held = (@ \ {m}) \cup (Members(s.queue) \ {m, s.prepared, s.steerItem})]
                     \/ s' = [s EXCEPT !.steerItem = IF @ = m THEN None ELSE @,
                          !.prepared = IF @ = m THEN None ELSE @, !.counts[m] = IF s.prepared = m THEN 0 ELSE @,
                          !.target = IF s.steerItem = m THEN None ELSE @,
                          !.held = @ \cup {m} \cup (Members(s.queue) \ {s.prepared, s.steerItem})]
\* The host takes back an accepted turn it had not kept: the run is cancelled and its request goes back to the
\* composer instead of the thread. A later send is a new request, so the message stays accepted and submitted.
\* Every unprepared, unsteered send queued behind it is held, as after a withdrawal. A composer holding new text
\* declines the request, and the store parks it as a new held send under a new identity, which this finite message
\* set does not model. The store writes the outbox and the composer separately; the model takes them as one step.
TakeBack(m) == /\ m \in Accepted /\ m = s.active /\ Live(s.phase[m]) /\ m \notin s.takenBack
               /\ s' = [s EXCEPT !.phase[m] = "cancelled", !.takenBack = @ \cup {m}, !.composer = @ \cup {m},
                    !.held = @ \cup (Members(s.queue) \ {s.prepared, s.steerItem})]
LoseAck(t) == /\ t = s.owner /\ s.prepared \in Accepted
              /\ s' = [s EXCEPT !.owner = None]
\* PERF-5: a delivery the host refused with an owner wait (RH-R17) lets go of the delivery lock and keeps the command;
\* Recover sends it again by the same key after the backoff.
Yield(t) == /\ t = s.owner /\ s.prepared # None /\ s.prepared \notin Accepted /\ s.counts[s.prepared] > 0
            /\ s' = [s EXCEPT !.owner = None]
\* H-1 (2026-11-27): a fresh command its host refused on its only try, with a code that never clears by itself
\* (`not-applied`, retry class not `wait`), wrote nothing. The send is no longer pinned to that command: the delivery
\* lets go of the lock and drops it. A lone send goes back to the composer, as an admission refusal's does; otherwise
\* it keeps its place, unprepared, and a later preparation mints a new command for it.
Refuse(t) == LET m == s.prepared
             IN /\ t = s.owner /\ m # None /\ (~RefuseOnlyUnapplied \/ m \notin Accepted) /\ s.counts[m] = 1
                /\ \/ /\ Len(s.queue) = 1
                      /\ s' = [s EXCEPT !.queue = Remove(@, m), !.prepared = None, !.owner = None,
                           !.steerItem = IF @ = m THEN None ELSE @,
                           !.target = IF s.steerItem = m THEN None ELSE @,
                           !.saved = IF Durable THEN Remove(@, m) ELSE @,
                           !.submitted = @ \ {m}, !.counts[m] = 0,
                           !.capturedTerminal[m] = None, !.afterTerminal[m] = None,
                           !.composer = @ \cup {m}, !.held = @ \ {m}]
                   \/ s' = [s EXCEPT !.prepared = None, !.owner = None, !.counts[m] = 0,
                        !.steerItem = IF @ = m THEN None ELSE @,
                        !.target = IF s.steerItem = m THEN None ELSE @]
\* The finite crash scenario begins only after a queue save has answered.
Crash(t) == /\ t \in s.alive /\ s.pending = None
            /\ s' = [s EXCEPT !.alive = @ \ {t},
                 !.owner = IF @ = t THEN None ELSE @,
                 !.queue = IF Durable THEN @ ELSE s.saved,
                 !.prepared = IF Durable THEN @ ELSE None]
Reopen(t) == /\ t \notin s.alive /\ s' = [s EXCEPT !.alive = @ \cup {t}]
Next == Persist \/ Complete \/ Pause \/ Resume \/ Stop \/ Fail
        \/ (\E t \in Tabs : Observe(t) \/ Prepare(t) \/ Recover(t) \/ Deliver(t)
             \/ Acknowledge(t) \/ LoseAck(t) \/ Yield(t) \/ Refuse(t) \/ Crash(t) \/ Reopen(t) \/ Cancel(t)
             \/ (\E m \in Messages : Submit(t, m) \/ Steer(t, m) \/ Withdraw(t, m)
                 \/ (\E n \in Messages \cup {None} : Reorder(t, m, n))))
        \/ (\E r \in Runs : FinishCancel(r))
        \/ (\E m \in Messages : TakeBack(m))
Spec == Init /\ [][Next]_vars
TypeOK == /\ s.queue \in Seq(Messages) /\ s.saved \in Seq(Messages)
          /\ s.submitted \subseteq Messages /\ s.active \in Runs
          /\ s.owner \in Tabs \cup {None} /\ s.prepared \in Messages \cup {None}
          /\ s.after \in Runs \cup {None} /\ s.alive \subseteq Tabs
          /\ s.phase \in [Runs -> {"absent", "running", "paused", "completed", "cancelled", "failed"}]
          /\ s.counts \in [Messages -> 0..2]
          /\ s.pending \in Messages \cup {None}
          /\ s.pendingTab \in Tabs \cup {None}
          /\ s.capturedTerminal \in [Messages -> Runs \cup {None}]
          /\ s.afterTerminal \in [Messages -> Runs \cup {None}]
          /\ Len(s.queue) = Cardinality(Members(s.queue))
          /\ s.composer \subseteq Messages /\ s.held \subseteq Messages /\ s.takenBack \subseteq Messages
PayloadSurvives == s.submitted \subseteq Members(s.queue) \cup Accepted
PreparedPayloadSurvives == s.prepared = None \/ s.prepared \in Members(s.queue)
AtMostOnceCharge == \A m \in Messages : Cardinality({key \in s.accepted : key[1] = m}) <= 1
SubmitPreservesRun == ~s.submitInterrupted
\* Permission is the immutable gesture-time observation, not a fact learned later.
\* Monotone monitors are equivalent to requiring the predicate of every prior
\* first delivery. They merge histories with identical safety outcomes without
\* restricting any protocol action, including accepted-command retransmission.
NoEarlyDelivery == ~s.earlyDelivery
SteerWaitsForTerminal == ~s.earlySteer
CancelTargetsObservedRun == ~s.wrongCancellation
FIFOExceptExplicitSteer == ~s.outOfOrder
\* A request is in one place: a send in the composer is neither deliverable from the outbox nor a kept turn. (An
\* accepted entry the host took back may wait for its acknowledgement, but it can never start a turn again.)
ComposerExclusive == s.composer \cap (((Members(s.queue) \cup {s.prepared}) \ Accepted)
                                      \cup (Accepted \ s.takenBack) \cup {s.pending}) = {}
\* Work queued behind a taken-back send leaves only when the person sends it now.
HeldWaitsForPerson == ~s.heldDelivery
Quiescent == s.pending = None /\ s.queue = <<>> /\ s.prepared = None /\ s.owner = None
Symmetry == {messages @@ tabs : messages \in Permutations(Messages), tabs \in Permutations(Tabs)}
=============================================================================
