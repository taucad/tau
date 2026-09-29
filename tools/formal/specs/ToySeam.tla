------------------------------- MODULE ToySeam -------------------------------
(***************************************************************************)
(* The seam simulator's own fixture (W1, FM-S11), not a Tau protocol: a    *)
(* client sends each request and retries it on a timer until it is         *)
(* answered; the server applies the request's effect and answers; the     *)
(* network delivers a request any number of times (retries, `duplicate`).  *)
(* With `Dedupe` the server applies each effect once.                      *)
(*                                                                         *)
(* `Quiescent` is the quiescence predicate of `EveryRequestAnswered`       *)
(* (FM-R17): a simulator scenario's `done()` is this predicate, and the    *)
(* trace spec checks it on a trace the simulator marks complete.           *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
  Ids,    \* request ids
  Dedupe  \* the server applies an effect only for a request it has not served

VARIABLES
  sent,      \* requests the client has sent
  requests,  \* requests in flight (a set: delivery may repeat)
  answers,   \* answers in flight
  effects,   \* id -> times its effect was applied
  received   \* answers the client has received

vars == <<sent, requests, answers, effects, received>>

TypeOK ==
  /\ sent \subseteq Ids
  /\ requests \subseteq Ids
  /\ answers \subseteq Ids
  /\ effects \in [Ids -> Nat]
  /\ received \subseteq Ids

Init ==
  /\ sent = {}
  /\ requests = {}
  /\ answers = {}
  /\ effects = [id \in Ids |-> 0]
  /\ received = {}

Send(id) ==
  /\ id \notin sent
  /\ sent' = sent \cup {id}
  /\ requests' = requests \cup {id}
  /\ UNCHANGED <<answers, effects, received>>

\* The client's timer re-sends a request that is still in flight.
Retry(id) ==
  /\ id \in sent \ received
  /\ UNCHANGED vars

\* `effect` says whether this delivery applied the request's effect.
Serve(id, effect) ==
  /\ id \in requests
  /\ effect = (~Dedupe \/ effects[id] = 0)
  /\ effects' = IF effect THEN [effects EXCEPT ![id] = @ + 1] ELSE effects
  /\ answers' = answers \cup {id}
  /\ UNCHANGED <<sent, requests, received>>

Receive(id) ==
  /\ id \in answers
  /\ received' = received \cup {id}
  /\ UNCHANGED <<sent, requests, answers, effects>>

Next ==
  \E id \in Ids :
    \/ Send(id)
    \/ Retry(id)
    \/ \E effect \in BOOLEAN : Serve(id, effect)
    \/ Receive(id)

Fairness ==
  \A id \in Ids :
    /\ WF_vars(Send(id))
    /\ WF_vars(\E effect \in BOOLEAN : Serve(id, effect))
    /\ WF_vars(Receive(id))

Spec == Init /\ [][Next]_vars /\ Fairness

EffectAtMostOnce == \A id \in Ids : effects[id] <= 1

Quiescent == received = Ids

EveryRequestAnswered == <>Quiescent

\* Keeps the state space finite when `Dedupe` is off.
Bounded == \A id \in Ids : effects[id] <= 2
=============================================================================
