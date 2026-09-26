------------------------- MODULE MC_GatewayInvocation -------------------------
(* Apalache instance of GatewayInvocation (GI-S7): two keys, two sweep       *)
(* workers that may crash, refund holds, every design knob on. IndInv's     *)
(* induction step starts from an arbitrary IndInv state; each mutant must   *)
(* fail it.                                                                  *)
EXTENDS GatewayInvocation

\* @type: (Bool, Bool) => Bool;
Knobs(fence, defer) ==
    /\ Keys = {"a", "b"} /\ Workers = 2 /\ Crashes = TRUE
    /\ MaxTime = 3 /\ Due = 1 /\ Grace = 1 /\ MaxRecovery = 2 /\ LostReplyRetries = 1
    /\ VoidOnLookup = TRUE /\ LookupFailed = TRUE /\ Reconcile = TRUE /\ AutoProceed = TRUE
    /\ KeepCompleted = TRUE /\ RefundHolds = TRUE
    /\ FenceGen = fence /\ DeferGrace = defer /\ CountRetries = TRUE

ConstInit == Knobs(TRUE, TRUE)
\* Mutants: finish without the generation predicate; the sweep without deferRecovery.
ConstInitUnfenced == Knobs(FALSE, TRUE)
ConstInitNoDefer == Knobs(TRUE, FALSE)

\* @type: (Bool, Str, Str, Int, Int, Int, Int, Int, Int, Set(Str), Int, Int, Bool, Int, Int) => {ex: Bool, cust: Str, disp: Str, gen: Int, lease: Int, due: Int, intent: Int, igen: Int, cancel: Int, ev: Set(Str), tgen: Int, charged: Int, ttl: Bool, rat: Int, fails: Int};
Row(ex, cust, disp, gen, lease, due, intent, igen, cancel, ev, tgen, charged, ttl, rat, fails) ==
    [ex |-> ex, cust |-> cust, disp |-> disp, gen |-> gen, lease |-> lease, due |-> due, intent |-> intent,
     igen |-> igen, cancel |-> cancel, ev |-> ev, tgen |-> tgen, charged |-> charged, ttl |-> ttl, rat |-> rat,
     fails |-> fails]

\* @type: (Str, Int, Int) => {k: Str, gen: Int, t: Int};
Claim(k, g, t) == [k |-> k, gen |-> g, t |-> t]

\* An arbitrary state of the two-key instance: integers unbounded, then constrained by IndInv.
\* No EXTENDS Apalache (its Gen): the runner's SANY pass has no Apalache library.
IndInit ==
    /\ \E exA, exB, ttlA, ttlB \in BOOLEAN, cA, cB \in CustStates, dA, dB \in DispStates,
          eA, eB \in SUBSET Evidence,
          gA, gB, lA, lB, duA, duB, iA, iB, igA, igB, caA, caB, tgA, tgB, chA, chB, rA, rB, fA, fB \in Int :
         row = [k \in Keys |-> IF k = "a"
                                THEN Row(exA, cA, dA, gA, lA, duA, iA, igA, caA, eA, tgA, chA, ttlA, rA, fA)
                                ELSE Row(exB, cB, dB, gB, lB, duB, iB, igB, caB, eB, tgB, chB, ttlB, rB, fB)]
    /\ now \in 0..MaxTime
    /\ \E held, again \in Int : acctHeld = held /\ reprepares = again
    /\ refundHeld \in 0..1
    /\ voided \in SUBSET Keys
    /\ req \in [Keys -> ReqStates]
    /\ fin \in [Keys -> FinStates]
    /\ conn \in [Keys -> ConnStates]
    /\ sup \in [Keys -> SupStates]
    /\ dispatches \in [Keys -> 0..1]
    /\ \E k1, k2 \in Keys, g1, g2, t1, t2 \in Int, n \in 0..2 :
         claims = IF n = 0 THEN {} ELSE IF n = 1 THEN {Claim(k1, g1, t1)} ELSE {Claim(k1, g1, t1), Claim(k2, g2, t2)}
    /\ host \in [ph: Phases, key: Keys \cup {None}]
    /\ prepared \in SUBSET Keys
    /\ bound \in SUBSET Keys
    /\ shown \in SUBSET Keys
    /\ marker \in SUBSET Keys
    /\ settledRow \in SUBSET Keys
    /\ runRetries \in 0..LostReplyRetries
    /\ runLosses \in 0..(LostReplyRetries + 1)
    /\ unrecorded \in [Keys -> SUBSET Keys]
    /\ IndInv

\* The vacuity mutant's arbitrary state: IndInv with L7 F14's hold statement.
IndInitWithoutRefunds == IndInit /\ AccountHoldWithoutRefunds
===============================================================================
