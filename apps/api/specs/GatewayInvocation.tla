---------------------------- MODULE GatewayInvocation ----------------------------
(***************************************************************************)
(* W11 draft, promoted by W1 (FM-S3): one funded model step of one chat.   *)
(* W11 owns the content: GI-S1 strengthens ChargeAfterRecordedLoss to     *)
(* "the settled row precedes the step's next prepared row", bounds        *)
(* AutoProceed by lostReplyRetries, and adds HostDiscard, the voided      *)
(* settled row, MODEL_ATTEMPT_PENDING and IndInv for Apalache.            *)
(*                                                                         *)
(* Processes: the host's attempt journal (prepare, send, bind, complete,   *)
(* network drop, crash, resume with lookup); the API live path per attempt *)
(* key (admit, abort check, dispatch intent, supplier call, eager          *)
(* observation, client cancel, finish); the supplier; the recovery sweep   *)
(* (claim, defer, resolve, transient failure) with Workers claimers; a     *)
(* refund intent that also holds account atoms. The credit_operation row   *)
(* per key is the durable state; each SQL statement is one atomic action.  *)
(*                                                                         *)
(* Clocks: `now` is clock_timestamp(); a sweep transaction reads           *)
(* transaction_timestamp(), modelled as t \in {now-1, now}.                *)
(*                                                                         *)
(* Knobs (FALSE = code at 6f8b77392, TRUE = W11 target):                   *)
(*   VoidOnLookup   a not_found lookup fences the key against admission    *)
(*   LookupFailed   an attempt whose log shows only a failure marker is    *)
(*                  looked up instead of counting as completed             *)
(*   Reconcile      a terminal lookup appends model.invocation-settled and *)
(*                  a charged, unshown attempt stops with a coded refusal  *)
(*                  (pending: a coded wait) instead of an uncoded error    *)
(*   AutoProceed    EQ1 (charge and proceed, ruled 2026-09-25): after a    *)
(*                  charged loss is recorded the step re-prepares under a  *)
(*                  new key with no gesture                                *)
(***************************************************************************)
EXTENDS Integers, FiniteSets

CONSTANTS Keys, Workers, Crashes, MaxTime, Due, Grace, MaxRecovery,
          VoidOnLookup, LookupFailed, Reconcile, AutoProceed, RefundHolds,
          FenceGen, DeferGrace   \* mutation knobs: TRUE is the code as written

None == "none"

VARIABLES
    now,
    \* durable: billing.credit_operation, one row per attempt key (unique index)
    row, acctHeld, refundHeld, voided,
    \* API live path and supplier, per key (volatile)
    req, fin, conn, sup, dispatches,
    \* sweep claims in flight (volatile): a set of [k, gen]
    claims,
    \* host: volatile phase plus the durable chat log
    host, prepared, bound, shown, marker, settledRow, reprepares

vars == <<now, row, acctHeld, refundHeld, voided, req, fin, conn, sup, dispatches, claims,
          host, prepared, bound, shown, marker, settledRow, reprepares>>
apiVars == <<req, fin, conn, sup, dispatches>>
logVars == <<prepared, bound, shown, marker, settledRow, reprepares>>

NoRow == [ex |-> FALSE, cust |-> None, disp |-> None, gen |-> 0, lease |-> -1, due |-> 0,
          intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0,
          ttl |-> FALSE, rat |-> -1, fails |-> 0]

Init ==
    /\ now = 0
    /\ row = [k \in Keys |-> NoRow]
    /\ acctHeld = 0
    /\ refundHeld = 0
    /\ voided = {}
    /\ req = [k \in Keys |-> "idle"]
    /\ fin = [k \in Keys |-> None]
    /\ conn = [k \in Keys |-> None]
    /\ sup = [k \in Keys |-> None]
    /\ dispatches = [k \in Keys |-> 0]
    /\ claims = {}
    /\ host = [ph |-> "ready", key |-> None]
    /\ prepared = {}
    /\ bound = {}
    /\ shown = {}
    /\ marker = {}
    /\ settledRow = {}
    /\ reprepares = 0

Pending(k) == row[k].ex /\ row[k].cust = "pending"
PendingCount == Cardinality({k \in Keys : Pending(k)})
Cap(x) == IF x > MaxTime THEN MaxTime ELSE x   \* scope artifact: a lease past the clock bound

\* Every terminalizer: one transition out of pending that releases the row's hold.
Terminal(k, cust, charged, ev, ttl, g) ==
    /\ row' = [row EXCEPT ![k] = [@ EXCEPT !.cust = cust, !.charged = charged, !.ev = @ \cup ev,
                                   !.ttl = ttl, !.rat = now, !.tgen = g]]
    /\ acctHeld' = acctHeld - 1

-----------------------------------------------------------------------------
(* Environment: the DB clock, the refund intent. *)

Tick == /\ now < MaxTime
        /\ now' = now + 1
        /\ UNCHANGED <<row, acctHeld, refundHeld, voided, apiVars, claims, host, logVars>>

RefundHold == /\ RefundHolds /\ refundHeld = 0
              /\ refundHeld' = 1 /\ acctHeld' = acctHeld + 1
              /\ UNCHANGED <<now, row, voided, apiVars, claims, host, logVars>>
RefundRelease == /\ refundHeld = 1
                 /\ refundHeld' = 0 /\ acctHeld' = acctHeld - 1
                 /\ UNCHANGED <<now, row, voided, apiVars, claims, host, logVars>>

-----------------------------------------------------------------------------
(* Host: the attempt journal (session.ts prepareInvocation / bindInvocation). *)

HostPrepare ==
    /\ host.ph = "ready"
    /\ Keys \ prepared # {}
    /\ LET k == CHOOSE x \in Keys \ prepared : TRUE IN
         /\ prepared' = prepared \cup {k}
         /\ host' = [ph |-> "prepared", key |-> k]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, bound, shown, marker, settledRow, reprepares>>

HostSend ==
    /\ host.ph = "prepared"
    /\ req[host.key] = "idle"
    /\ req' = [req EXCEPT ![host.key] = "sent"]
    /\ conn' = [conn EXCEPT ![host.key] = "open"]
    /\ host' = [host EXCEPT !.ph = "inflight"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, fin, sup, dispatches, claims, logVars>>

\* Response headers (x-tau-operation-id) reach the host: model.invocation-bound.
HostBind ==
    /\ host.ph = "inflight"
    /\ LET k == host.key IN
         /\ k \notin bound
         /\ req[k] \in {"streaming", "finishing", "done"}
         /\ row[k].ex
         /\ conn[k] = "open"
         /\ bound' = bound \cup {k}
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, host, prepared, shown, marker, settledRow, reprepares>>

\* The whole reply arrived: the assistant message with the billing marker is durable.
HostComplete ==
    /\ host.ph = "inflight"
    /\ LET k == host.key IN
         /\ k \in bound
         /\ req[k] \in {"finishing", "done"}
         /\ fin[k] = "final"
         /\ conn[k] = "open"
         /\ shown' = shown \cup {k}
         /\ host' = [host EXCEPT !.ph = "done"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, bound, marker, settledRow, reprepares>>

\* The stream ended without a reply: the harness appends a failure message that carries the
\* billing marker when bound (session.ts metadataFor on the error path).
HostSeesFailure ==
    /\ host.ph = "inflight"
    /\ LET k == host.key IN
         /\ conn[k] = "open"
         /\ \/ req[k] \in {"finishing", "done"} /\ fin[k] # "final"
            \/ req[k] \in {"gone", "refused"}
         /\ marker' = IF k \in bound THEN marker \cup {k} ELSE marker
         /\ host' = [host EXCEPT !.ph = "failed"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, bound, shown, settledRow, reprepares>>

\* Laptop sleep, Wi-Fi loss: the host stays up and appends a failure message; the API may not
\* notice for a while (half-open socket), so the request keeps running.
HostNetworkDrop ==
    /\ host.ph = "inflight"
    /\ LET k == host.key IN
         /\ conn[k] = "open"
         /\ conn' = [conn EXCEPT ![k] = "dropped"]
         /\ marker' = IF k \in bound THEN marker \cup {k} ELSE marker
         /\ host' = [host EXCEPT !.ph = "failed"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, req, fin, sup, dispatches, claims, prepared, bound, shown, settledRow, reprepares>>

\* Tab closed or process killed: volatile state is lost, the log keeps what was appended.
HostCrash ==
    /\ host.ph \in {"prepared", "inflight"}
    /\ LET k == host.key IN
         conn' = IF conn[k] = "open" THEN [conn EXCEPT ![k] = "dropped"] ELSE conn
    /\ host' = [host EXCEPT !.ph = "down"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, req, fin, sup, dispatches, claims, logVars>>

\* The attempt counts as resolved in the log.
Resolved(k) ==
    \/ k \in shown
    \/ k \in settledRow
    \/ (~LookupFailed /\ k \in marker)   \* today: a bound failure message counts as completed

\* Resume or attach: prepareInvocation's recovery branch plus the W11 lookup.
HostResume ==
    /\ host.ph \in {"failed", "down", "waiting"}
    /\ LET k == host.key IN
       IF Resolved(k)
       THEN /\ host' = [host EXCEPT !.ph = IF k \in shown THEN "done" ELSE "ready"]
            /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, logVars>>
       ELSE IF ~row[k].ex
       THEN \* not_found: today a fresh attempt at once; target: fence the key first
            /\ voided' = IF VoidOnLookup THEN voided \cup {k} ELSE voided
            /\ host' = [host EXCEPT !.ph = "ready"]
            /\ UNCHANGED <<now, row, acctHeld, refundHeld, apiVars, claims, logVars>>
       ELSE IF ~Reconcile
       THEN \* today: "has no durable result; it will not be sent again" (uncoded Error)
            /\ host' = [host EXCEPT !.ph = "stuck"]
            /\ bound' = bound \cup {k}
            /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, shown, marker, settledRow, reprepares>>
       ELSE IF row[k].cust = "pending"
       THEN \* target: INVOCATION_PENDING, retry class wait
            /\ host' = [host EXCEPT !.ph = "waiting"]
            /\ bound' = bound \cup {k}
            /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, shown, marker, settledRow, reprepares>>
       ELSE \* target: append model.invocation-settled; charged and unshown stops (INVOCATION_REPLY_LOST)
            /\ settledRow' = settledRow \cup {k}
            /\ bound' = bound \cup {k}
            /\ host' = [host EXCEPT !.ph = IF row[k].charged > 0 /\ k \notin shown THEN "lost" ELSE "ready"]
            /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, shown, marker, reprepares>>

\* EQ1: after the charged loss is recorded, the step starts a new attempt, charged again, with no gesture.
HostReprepare ==
    /\ AutoProceed
    /\ host.ph = "lost"
    /\ reprepares' = reprepares + 1
    /\ host' = [host EXCEPT !.ph = "ready"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, bound, shown, marker, settledRow>>

-----------------------------------------------------------------------------
(* API live path (billable-model-invocation.service.ts) and the supplier. *)

ApiNotice(k) ==
    /\ conn[k] = "dropped"
    /\ conn' = [conn EXCEPT ![k] = "noticed"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, req, fin, sup, dispatches, claims, host, logVars>>

\* intent.signal.throwIfAborted() before admitOperation.
ApiAbortBeforeAdmission(k) ==
    /\ req[k] = "sent"
    /\ conn[k] = "noticed"
    /\ req' = [req EXCEPT ![k] = "gone"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, fin, conn, sup, dispatches, claims, host, logVars>>

\* admitOperation: a replay, a refusal of a voided key, or a new row with its hold.
ApiAdmit(k) ==
    /\ req[k] = "sent"
    /\ now + Due + Grace <= MaxTime   \* scope: the row can resolve inside the clock bound
    /\ IF row[k].ex
       THEN /\ req' = [req EXCEPT ![k] = "done"]
            /\ fin' = [fin EXCEPT ![k] = "replay"]
            /\ UNCHANGED <<row, acctHeld>>
       ELSE IF k \in voided
       THEN /\ req' = [req EXCEPT ![k] = "refused"]
            /\ UNCHANGED <<row, acctHeld, fin>>
       ELSE /\ row' = [row EXCEPT ![k] = [NoRow EXCEPT !.ex = TRUE, !.cust = "pending", !.disp = "admitted",
                                                !.gen = 1, !.due = now + Due]]
            /\ acctHeld' = acctHeld + 1
            /\ req' = [req EXCEPT ![k] = "admitted"]
            /\ UNCHANGED fin
    /\ UNCHANGED <<now, refundHeld, voided, conn, sup, dispatches, claims, host, logVars>>

\* The abort check after admission (recordCancellation), then markDispatchIntent (CAS, clock).
ApiMarkIntent(k) ==
    /\ req[k] = "admitted"
    /\ IF conn[k] = "noticed"
       THEN /\ row' = [row EXCEPT ![k].cancel = IF row[k].cust = "pending" /\ @ < 0 THEN now ELSE @]
            /\ req' = [req EXCEPT ![k] = "gone"]
       ELSE IF /\ row[k].gen = 1 /\ row[k].cust = "pending" /\ row[k].disp = "admitted"
               /\ row[k].cancel < 0 /\ row[k].due > now
       THEN /\ row' = [row EXCEPT ![k].disp = "intent_recorded", ![k].intent = now, ![k].igen = row[k].gen]
            /\ req' = [req EXCEPT ![k] = "intent"]
       ELSE /\ req' = [req EXCEPT ![k] = "gone"]
            /\ UNCHANGED row
    /\ UNCHANGED <<now, acctHeld, refundHeld, voided, fin, conn, sup, dispatches, claims, host, logVars>>

\* getDispatchTimeRemaining (CAS, clock), executeOnce, markDispatchAccepted.
ApiDispatch(k) ==
    /\ req[k] = "intent"
    /\ IF /\ row[k].gen = 1 /\ row[k].cust = "pending" /\ row[k].disp = "intent_recorded"
          /\ row[k].cancel < 0 /\ row[k].due > now
       THEN /\ sup' = [sup EXCEPT ![k] = "generating"]
            /\ dispatches' = [dispatches EXCEPT ![k] = @ + 1]
            /\ row' = [row EXCEPT ![k].disp = "accepted"]
            /\ req' = [req EXCEPT ![k] = "streaming"]
       ELSE /\ req' = [req EXCEPT ![k] = "gone"]
            /\ UNCHANGED <<sup, dispatches, row>>
    /\ UNCHANGED <<now, acctHeld, refundHeld, voided, fin, conn, claims, host, logVars>>

SupplierEnd(k) ==
    /\ sup[k] = "generating"
    /\ \E s \in {"completed", "failed"} : sup' = [sup EXCEPT ![k] = s]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, req, fin, conn, dispatches, claims, host, logVars>>

\* Eager observation: the loop reads the supplier regardless of the client. recordInvocationEvidence
\* is not generation-fenced, so it lands after a claim or after the terminal state too.
ApiObserve(k) ==
    /\ req[k] = "streaming"
    /\ \/ sup[k] \in {"completed", "failed"}
       \/ sup[k] = "generating" /\ now >= row[k].due   \* the dispatch deadline cuts the stream
    /\ LET e == IF sup[k] = "completed" THEN "final" ELSE "unknown" IN
         /\ sup' = IF sup[k] = "generating" THEN [sup EXCEPT ![k] = "cut"] ELSE sup
         /\ fin' = [fin EXCEPT ![k] = e]
         /\ row' = [row EXCEPT ![k].ev = @ \cup {e}]
         /\ req' = [req EXCEPT ![k] = "finishing"]
    /\ UNCHANGED <<now, acctHeld, refundHeld, voided, conn, dispatches, claims, host, logVars>>

\* The relayed body's cancel after the API noticed the client left: cut, record, absorbed_unknown.
ApiClientCancel(k) ==
    /\ req[k] = "streaming"
    /\ conn[k] = "noticed"
    /\ sup' = IF sup[k] = "generating" THEN [sup EXCEPT ![k] = "cut"] ELSE sup
    /\ row' = [row EXCEPT ![k].cancel = IF row[k].cust = "pending" /\ @ < 0 THEN now ELSE @,
                          ![k].ev = @ \cup {"abort"}]
    /\ fin' = [fin EXCEPT ![k] = "abort"]
    /\ req' = [req EXCEPT ![k] = "done"]
    /\ UNCHANGED <<now, acctHeld, refundHeld, voided, conn, dispatches, claims, host, logVars>>

\* finish(): terminalize under the admitting generation; absorbed_unknown returns without it.
ApiFinish(k) ==
    /\ req[k] = "finishing"
    /\ IF fin[k] = "final" /\ (~FenceGen \/ row[k].gen = 1) /\ row[k].cust = "pending"
       THEN Terminal(k, "settled", 1, {}, FALSE, 1)
       ELSE UNCHANGED <<row, acctHeld>>   \* a stale generation throws; a terminal row returns its receipt
    /\ req' = [req EXCEPT ![k] = "done"]
    /\ UNCHANGED <<now, refundHeld, voided, fin, conn, sup, dispatches, claims, host, logVars>>

-----------------------------------------------------------------------------
(* Recovery sweep (credit-ledger.service.ts claimDueOperations, recover, defer, absorb). *)

SweepClaim ==
    /\ Cardinality(claims) < Workers
    /\ \E k \in Keys, t \in {now - 1, now} :
         /\ t >= 0
         /\ Pending(k)
         /\ row[k].due <= t
         /\ row[k].lease < 0 \/ row[k].lease <= t
         /\ row' = [row EXCEPT ![k].gen = @ + 1, ![k].disp = "recovery_required", ![k].lease = t + 1]
         /\ claims' = claims \cup {[k |-> k, gen |-> row[k].gen + 1, t |-> t]}
    /\ UNCHANGED <<now, acctHeld, refundHeld, voided, apiVars, host, logVars>>

Current(c) == row[c.k].gen = c.gen /\ Pending(c.k)

SweepResolve ==
    \E c \in claims, t \in {now - 1, now} :
      /\ t >= c.t   \* a later transaction never reads an earlier transaction_timestamp()
      /\ claims' = claims \ {c}
      /\ LET k == c.k
             r == row[k]
         IN
         IF ~Current(c)
         THEN UNCHANGED <<row, acctHeld>>
         ELSE IF DeferGrace /\ r.ev = {} /\ r.intent >= 0 /\ t < r.due + Grace
         THEN /\ row' = [row EXCEPT ![k].lease = r.due + Grace]   \* deferRecovery
              /\ UNCHANGED acctHeld
         ELSE IF r.intent < 0
         THEN Terminal(k, "released", 0, {"rejected"}, FALSE, c.gen)   \* no-dispatch proof
         ELSE IF "final" \in r.ev
         THEN Terminal(k, "settled", 1, {}, FALSE, c.gen)
         ELSE IF r.ev # {}
         THEN Terminal(k, "absorbed", 0, {"unknown"}, FALSE, c.gen)
         ELSE Terminal(k, "absorbed", 0, {"expired"}, TRUE, c.gen)       \* time to live
      /\ UNCHANGED <<now, refundHeld, voided, apiVars, host, logVars>>

\* resolveRecoveryFailure: back off on transaction_timestamp(), or absorb once the budget is spent.
SweepFail ==
    \E c \in claims, t \in {now - 1, now} :
      /\ t >= c.t
      /\ Current(c)
      /\ claims' = claims \ {c}
      /\ LET k == c.k IN
         IF row[k].fails + 1 < MaxRecovery
         THEN /\ row' = [row EXCEPT ![k].lease = Cap(t + 1), ![k].fails = @ + 1]
              /\ UNCHANGED acctHeld
         ELSE Terminal(k, "absorbed", 0, {"unresolvable"}, FALSE, c.gen)
      /\ UNCHANGED <<now, refundHeld, voided, apiVars, host, logVars>>

\* A worker dies holding a claim; its lease expires and another claim bumps the generation.
SweepCrash ==
    /\ Crashes
    /\ \E c \in claims : claims' = claims \ {c}
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, host, logVars>>

-----------------------------------------------------------------------------

Host == \/ HostPrepare \/ HostSend \/ HostBind \/ HostComplete \/ HostSeesFailure
        \/ HostNetworkDrop \/ HostCrash \/ HostResume \/ HostReprepare
Api == \E k \in Keys : \/ ApiNotice(k) \/ ApiAbortBeforeAdmission(k) \/ ApiAdmit(k)
                       \/ ApiMarkIntent(k) \/ ApiDispatch(k) \/ SupplierEnd(k)
                       \/ ApiObserve(k) \/ ApiClientCancel(k) \/ ApiFinish(k)
Sweep == SweepClaim \/ SweepResolve \/ SweepFail \/ SweepCrash

Next == Tick \/ RefundHold \/ RefundRelease \/ Host \/ Api \/ Sweep

\* Fairness on the clock and the sweep only; the live path, client, supplier and host get none.
Spec == Init /\ [][Next]_vars /\ WF_vars(Tick) /\ WF_vars(SweepClaim) /\ WF_vars(SweepResolve)

\* Vacuity: without sweep fairness a pending row may stay pending forever.
SpecNoSweepFairness == Init /\ [][Next]_vars /\ WF_vars(Tick)

\* Reconciliation liveness additionally assumes the chat is opened again and the host's stream ends.
SpecReopen == Spec /\ WF_vars(HostBind) /\ WF_vars(HostComplete) /\ WF_vars(HostSeesFailure)
                   /\ WF_vars(HostResume)

-----------------------------------------------------------------------------
(* Properties; numbers are rows of the lane's gateway-invariants.tsv. *)

TypeOK ==
    /\ now \in 0..MaxTime
    /\ acctHeld \in 0..(Cardinality(Keys) + 1)
    /\ refundHeld \in 0..1
    /\ \A k \in Keys :
         /\ row[k].cust \in {None, "pending", "settled", "released", "absorbed"}
         /\ row[k].disp \in {None, "admitted", "intent_recorded", "accepted", "recovery_required"}
         /\ req[k] \in {"idle", "sent", "admitted", "intent", "streaming", "finishing", "done", "gone", "refused"}
         /\ sup[k] \in {None, "generating", "completed", "failed", "cut"}
         /\ conn[k] \in {None, "open", "dropped", "noticed"}

\* (1) the customer state leaves pending at most once (action property)
AtMostOneTerminal ==
    [][\A k \in Keys : row[k].ex /\ row[k].cust # "pending" => row'[k].cust = row[k].cust]_vars

\* (2a) per row: 0 <= charged <= authorized (one atom here)
RowHold == \A k \in Keys : row[k].charged \in 0..1
\* (2b) account level: held = pending operation holds + held refund intents
AccountHoldConservation == acctHeld = PendingCount + refundHeld
\* Vacuity mutant: the statement without the refund term, as L7 F14 wrote it
AccountHoldWithoutRefunds == acctHeld = PendingCount

\* (3) a terminal row has retained evidence
TerminalImpliesRecordedEvidence == \A k \in Keys : row[k].ex /\ row[k].cust # "pending" => row[k].ev # {}

\* D19 CHECK: no settlement without a recorded dispatch intent
NoChargeWithoutDispatch == \A k \in Keys : row[k].cust = "settled" => row[k].intent >= 0

\* (13) client abort: a charge needs a completed supplier generation
NoChargeWithoutFinalEvidence == \A k \in Keys : row[k].charged > 0 => "final" \in row[k].ev

\* (4) no dispatch intent after cancellation (action) or at/after dueAt (state)
NoDispatchAfterCancellation ==
    [][\A k \in Keys : row[k].intent < 0 /\ row'[k].intent >= 0 => row[k].cancel < 0]_vars
NoDispatchAfterDue == \A k \in Keys : row[k].intent >= 0 => row[k].intent < row[k].due

\* (5) the supplier is only called under the admitting generation
NoDispatchWithoutLiveGeneration == \A k \in Keys : sup[k] # None => row[k].igen = 1

\* (6) a stale generation never terminalizes
StaleGenerationNeverTerminalizes ==
    \A k \in Keys : row[k].ex /\ row[k].cust # "pending" => row[k].tgen = row[k].gen

\* (7) a claim needs pending, dueAt reached and an expired lease (action property)
SweepOnlyAfterDueAndLeaseExpiry ==
    [][\A k \in Keys : row'[k].gen > row[k].gen /\ row[k].ex =>
          /\ row[k].cust = "pending" /\ row[k].due <= now
          /\ (row[k].lease < 0 \/ row[k].lease <= now)]_vars

\* (8) a dispatched row with no evidence is not written off before dueAt + grace
DispatchedWithoutEvidenceWaitsForGrace == \A k \in Keys : row[k].ttl => row[k].rat >= row[k].due + Grace

\* (9) liveness under WF(Tick), WF(sweep)
EventualResolution == \A k \in Keys : Pending(k) ~> (row[k].ex /\ row[k].cust # "pending")

\* (10) at most one supplier call per key (the unique index makes one row per key structural)
AttemptIdempotence == \A k \in Keys : dispatches[k] <= 1

\* (11) one step is charged again only after a recorded charged loss (EQ1; W11 GI-S1 strengthens it)
ChargeAfterRecordedLoss ==
    Cardinality({k \in Keys : row[k].ex /\ row[k].cust = "settled" /\ row[k].charged > 0}) <= 1 + reprepares

\* Reconciliation (R): a charged attempt is eventually shown or recorded as settled in the log
ChargedReplyRecorded ==
    \A k \in Keys : (row[k].ex /\ row[k].charged > 0) ~> (k \in shown \/ k \in settledRow)

\* D-086: today's uncoded dead end is reachable; the target never reaches it
NoUncodedDeadEnd == host.ph # "stuck"

=============================================================================
