-------------------------- MODULE MessageQueue --------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC
CONSTANTS Messages, Tabs, Durable, QuietSubmit, StableIdentity,
          ObserveBarrier, TargetedCancel, TerminalBeforeSend
VARIABLE s
vars == <<s>>
None == "none"
Original == "original"
Runs == Messages \cup {Original}
Live(p) == p \in {"running", "paused"}
Terminal(p) == p \in {"completed", "cancelled"}
Members(q) == {q[i] : i \in 1..Len(q)}
Remove(q, m) == SelectSeq(q, LAMBDA x : x # m)
Accepted == {key[1] : key \in s.accepted}
Chosen == IF s.steerItem # None THEN s.steerItem ELSE Head(s.queue)
BarrierSeen(t) == ~ObserveBarrier \/ s.after = None \/ s.after \in s.observed[t].known
Ready(t) == /\ BarrierSeen(t)
            /\ IF s.steerItem = None
                  THEN s.observed[t].phase = "completed"
                  ELSE ~TerminalBeforeSend \/ Terminal(s.observed[t].phase)
Init == s = [queue |-> <<>>, saved |-> <<>>, submitted |-> {}, prepared |-> None,
             owner |-> None, alive |-> Tabs, after |-> None, active |-> Original,
             phase |-> [r \in Runs |-> IF r = Original THEN "running" ELSE "absent"],
             known |-> {Original}, accepted |-> {}, counts |-> [m \in Messages |-> 0],
             observed |-> [t \in Tabs |-> [run |-> Original, phase |-> "running", known |-> {Original}]],
             sends |-> <<>>, steerItem |-> None, target |-> None,
             cancelPending |-> {}, cancellations |-> {}, submitInterrupted |-> FALSE]
Submit(m) == /\ m \notin s.submitted
             /\ s' = [s EXCEPT !.queue = Append(@, m),
                       !.saved = IF Durable THEN Append(@, m) ELSE @,
                       !.submitted = @ \cup {m},
                       !.submitInterrupted = @ \/ (~QuietSubmit /\ Live(s.phase[s.active])),
                       !.phase[s.active] = IF QuietSubmit THEN @ ELSE "cancelled"]
Observe(t) == /\ t \in s.alive
              /\ s.observed[t] # [run |-> s.active, phase |-> s.phase[s.active], known |-> s.known]
              /\ s' = [s EXCEPT !.observed[t] = [run |-> s.active, phase |-> s.phase[s.active], known |-> s.known]]
Complete == /\ s.phase[s.active] = "running"
            /\ s' = [s EXCEPT !.phase[s.active] = "completed"]
Pause == /\ s.phase[s.active] = "running"
         /\ s' = [s EXCEPT !.phase[s.active] = "paused"]
Resume == /\ s.phase[s.active] = "paused"
          /\ s' = [s EXCEPT !.phase[s.active] = "running"]
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
                       !.cancellations = @ \cup {[target |-> s.target, victim |-> victim]}]
FinishCancel(r) == /\ r \in s.cancelPending /\ Live(s.phase[r])
                   /\ s' = [s EXCEPT !.phase[r] = "cancelled"]
Prepare(t) == /\ t \in s.alive /\ s.owner = None /\ Len(s.queue) > 0
              /\ s.prepared = None /\ Ready(t)
              /\ s' = [s EXCEPT !.owner = t, !.prepared = Chosen]
Recover(t) == /\ t \in s.alive /\ s.owner = None /\ s.prepared # None
              /\ s' = [s EXCEPT !.owner = t]
Deliver(t) == LET m == s.prepared
                  key == <<m, IF StableIdentity THEN 1 ELSE s.counts[m] + 1>>
                  fresh == key \notin s.accepted
                  accept == fresh /\ Terminal(s.phase[s.active])
              IN /\ t = s.owner /\ m # None /\ s.counts[m] < 2
                 /\ s' = [s EXCEPT
                    !.counts[m] = @ + 1,
                    !.sends = Append(@, [item |-> m, first |-> m \notin Accepted,
                       phase |-> s.phase[s.active], steered |-> s.steerItem = m,
                       targetPhase |-> IF s.target = None THEN "completed" ELSE s.phase[s.target],
                       head |-> Head(s.queue)]),
                    !.accepted = IF accept THEN @ \cup {key} ELSE @,
                    !.active = IF accept THEN m ELSE @,
                    !.phase[m] = IF accept THEN "running" ELSE @,
                    !.known = IF accept THEN @ \cup {m} ELSE @]
\* Accepted means durable host acceptance, not merely an applied response.
\* A refused/not-applied response leaves the prepared item intact (stuttering).
\* Local actor-live, abort and in-lock session guards further restrict runtime
\* sends; deletion and optional filesystem watch availability are outside this
\* retained-session safety model. See README for the runtime conformance slice.
Acknowledge(t) == /\ t = s.owner /\ s.prepared # None /\ s.prepared \in Accepted
                  /\ s' = [s EXCEPT !.queue = Remove(@, s.prepared),
                     !.saved = IF Durable THEN Remove(@, s.prepared) ELSE @,
                     !.after = s.prepared, !.prepared = None, !.owner = None,
                     !.target = IF s.steerItem = s.prepared THEN None ELSE @,
                     !.steerItem = IF s.steerItem = s.prepared THEN None ELSE @]
LoseAck(t) == /\ t = s.owner /\ s.prepared \in Accepted
              /\ s' = [s EXCEPT !.owner = None]
Crash(t) == /\ t \in s.alive
            /\ s' = [s EXCEPT !.alive = @ \ {t},
                 !.owner = IF @ = t THEN None ELSE @,
                 !.queue = IF Durable THEN @ ELSE s.saved,
                 !.prepared = IF Durable THEN @ ELSE None]
Reopen(t) == /\ t \notin s.alive /\ s' = [s EXCEPT !.alive = @ \cup {t}]
Next == (\E m \in Messages : Submit(m)) \/ Complete \/ Pause \/ Resume \/ Stop
        \/ (\E t \in Tabs : Observe(t) \/ Prepare(t) \/ Recover(t) \/ Deliver(t)
             \/ Acknowledge(t) \/ LoseAck(t) \/ Crash(t) \/ Reopen(t) \/ Cancel(t)
             \/ (\E m \in Messages : Steer(t, m)))
        \/ (\E r \in Runs : FinishCancel(r))
Spec == Init /\ [][Next]_vars
TypeOK == /\ s.queue \in Seq(Messages) /\ s.saved \in Seq(Messages)
          /\ s.submitted \subseteq Messages /\ s.active \in Runs
          /\ s.owner \in Tabs \cup {None} /\ s.prepared \in Messages \cup {None}
          /\ s.after \in Runs \cup {None} /\ s.alive \subseteq Tabs
          /\ s.phase \in [Runs -> {"absent", "running", "paused", "completed", "cancelled"}]
          /\ s.counts \in [Messages -> 0..2]
          /\ Len(s.queue) = Cardinality(Members(s.queue))
PayloadSurvives == s.submitted \subseteq Members(s.queue) \cup Accepted
PreparedPayloadSurvives == s.prepared = None \/ s.prepared \in Members(s.queue)
AtMostOnceCharge == \A m \in Messages : Cardinality({key \in s.accepted : key[1] = m}) <= 1
SubmitPreservesRun == ~s.submitInterrupted
NoEarlyDelivery == \A i \in 1..Len(s.sends) : s.sends[i].first =>
                     IF s.sends[i].steered THEN Terminal(s.sends[i].phase)
                     ELSE s.sends[i].phase = "completed"
SteerWaitsForTerminal == \A i \in 1..Len(s.sends) :
  s.sends[i].first /\ s.sends[i].steered => Terminal(s.sends[i].targetPhase)
CancelTargetsObservedRun == \A c \in s.cancellations : c.victim = c.target
FIFOExceptExplicitSteer == \A i \in 1..Len(s.sends) :
  s.sends[i].first /\ ~s.sends[i].steered => s.sends[i].item = s.sends[i].head
Quiescent == s.queue = <<>> /\ s.prepared = None /\ s.owner = None
=============================================================================
