---------------------------- MODULE GatewayInvocation ----------------------------
(***************************************************************************)
(* W11 (GI-S1, GI-S7): one funded model step of one chat. The gateway row *)
(* is the invocation machine (D19); ChargeAfterRecordedLoss says a charged *)
(* attempt's settled row precedes the step's next prepared row (EQ1);      *)
(* AutoProceed is bounded by LostReplyRetries per live run; HostDiscard is *)
(* RV5's overflow retry; a void is recorded as a settled row; IndInv is    *)
(* the Apalache inductive invariant of the row (M* conjuncts, MC_ module). *)
(*                                                                         *)
(* Processes: the host's attempt journal (prepare, send, bind, complete,   *)
(* network drop, crash, resume with lookup); the API live path per attempt *)
(* key (admit, abort check, dispatch intent, supplier call, eager          *)
(* observation, client cancel, service stop, finish); the supplier; the   *)
(* recovery sweep (claim, defer, resolve, transient failure) with Workers  *)
(* claimers; a refund intent that also holds account atoms. The            *)
(* credit_operation row per key is the durable state; each SQL statement   *)
(* is one atomic action.                                                   *)
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
(*                  new key with no gesture, at most LostReplyRetries      *)
(*                  times per live run; then the run ends resumably and    *)
(*                  Resume proceeds the same way                           *)
(*   KeepCompleted  a completed reply is kept (W0.20); FALSE is RV5-F1's   *)
(*                  overflow retry, which discards it and sends again      *)
(***************************************************************************)
EXTENDS Integers, FiniteSets

CONSTANTS
    \* @type: Set(Str);
    Keys,
    \* @type: Int;
    Workers,
    \* @type: Bool;
    Crashes,
    \* @type: Int;
    MaxTime,
    \* @type: Int;
    Due,
    \* @type: Int;
    Grace,
    \* @type: Int;
    MaxRecovery,
    \* @type: Int;
    LostReplyRetries,
    \* @type: Bool;
    VoidOnLookup,
    \* @type: Bool;
    LookupFailed,
    \* @type: Bool;
    Reconcile,
    \* @type: Bool;
    AutoProceed,
    \* @type: Bool;
    KeepCompleted,
    \* @type: Bool;
    RefundHolds,
    \* mutation knobs: TRUE is the code as written
    \* @type: Bool;
    FenceGen,
    \* @type: Bool;
    DeferGrace,
    \* @type: Bool;
    CountRetries

None == "none"

VARIABLES
    \* @type: Int;
    now,
    \* durable: billing.credit_operation, one row per attempt key (unique index)
    \* @type: Str -> {ex: Bool, cust: Str, disp: Str, gen: Int, lease: Int, due: Int, intent: Int, igen: Int, cancel: Int, ev: Set(Str), tgen: Int, charged: Int, ttl: Bool, rat: Int, fails: Int};
    row,
    \* @type: Int;
    acctHeld,
    \* @type: Int;
    refundHeld,
    \* @type: Set(Str);
    voided,
    \* API live path and supplier, per key (volatile)
    \* @type: Str -> Str;
    req,
    \* @type: Str -> Str;
    fin,
    \* @type: Str -> Str;
    conn,
    \* @type: Str -> Str;
    sup,
    \* @type: Str -> Int;
    dispatches,
    \* sweep claims in flight (volatile): a set of [k, gen, t]
    \* @type: Set({k: Str, gen: Int, t: Int});
    claims,
    \* host: volatile phase plus the durable chat log
    \* @type: {ph: Str, key: Str};
    host,
    \* @type: Set(Str);
    prepared,
    \* @type: Set(Str);
    bound,
    \* @type: Set(Str);
    shown,
    \* @type: Set(Str);
    marker,
    \* @type: Set(Str);
    settledRow,
    \* re-prepares after a recorded charged loss: in all, and in the current live run
    \* @type: Int;
    reprepares,
    \* @type: Int;
    runRetries,
    \* history: the charged losses recorded in the current live run (LostReplyBound counts these, not runRetries)
    \* @type: Int;
    runLosses,
    \* history: the earlier attempts neither shown nor recorded when each key was prepared
    \* @type: Str -> Set(Str);
    unrecorded

vars == <<now, row, acctHeld, refundHeld, voided, req, fin, conn, sup, dispatches, claims,
          host, prepared, bound, shown, marker, settledRow, reprepares, runRetries, runLosses, unrecorded>>
apiVars == <<req, fin, conn, sup, dispatches>>
logVars == <<prepared, bound, shown, marker, settledRow, reprepares, runRetries, runLosses, unrecorded>>

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
    /\ runRetries = 0
    /\ runLosses = 0
    /\ unrecorded = [k \in Keys |-> {}]

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
         /\ unrecorded' = [unrecorded EXCEPT ![k] = prepared \ (shown \cup settledRow)]
         /\ host' = [ph |-> "prepared", key |-> k]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, bound, shown, marker, settledRow,
                   reprepares, runRetries, runLosses>>

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
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, host, prepared, shown, marker, settledRow, reprepares, runRetries, runLosses, unrecorded>>

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
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, bound, marker, settledRow, reprepares, runRetries, runLosses, unrecorded>>

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
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, bound, shown, settledRow, reprepares, runRetries, runLosses, unrecorded>>

\* Laptop sleep, Wi-Fi loss: the host stays up and appends a failure message; the API may not
\* notice for a while (half-open socket), so the request keeps running.
HostNetworkDrop ==
    /\ host.ph = "inflight"
    /\ LET k == host.key IN
         /\ conn[k] = "open"
         /\ conn' = [conn EXCEPT ![k] = "dropped"]
         /\ marker' = IF k \in bound THEN marker \cup {k} ELSE marker
         /\ host' = [host EXCEPT !.ph = "failed"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, req, fin, sup, dispatches, claims, prepared, bound, shown, settledRow, reprepares, runRetries, runLosses, unrecorded>>

\* Tab closed or process killed: volatile state is lost, the log keeps what was appended. The live run
\* ends with it, so its re-prepare budget does too.
HostCrash ==
    /\ host.ph \in {"prepared", "inflight"}
    /\ LET k == host.key IN
         conn' = IF conn[k] = "open" THEN [conn EXCEPT ![k] = "dropped"] ELSE conn
    /\ host' = [host EXCEPT !.ph = "down"]
    /\ runRetries' = 0
    /\ runLosses' = 0
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, req, fin, sup, dispatches, claims,
                   prepared, bound, shown, marker, settledRow, reprepares, unrecorded>>

\* RV5-F1 (today's overflow retry, fixed by W0.20): a completed reply is read, dropped, and the step
\* is sent again at once; the dropped reply is neither shown nor recorded.
HostDiscard ==
    /\ ~KeepCompleted
    /\ host.ph = "inflight"
    /\ LET k == host.key IN
         /\ k \in bound
         /\ fin[k] = "final"
         /\ conn[k] = "open"
    /\ host' = [host EXCEPT !.ph = "ready"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, logVars>>

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
       THEN \* not_found: today a fresh attempt at once; target: fence the key, then record the void
            /\ voided' = IF VoidOnLookup THEN voided \cup {k} ELSE voided
            /\ settledRow' = IF VoidOnLookup /\ Reconcile THEN settledRow \cup {k} ELSE settledRow
            /\ host' = [host EXCEPT !.ph = "ready"]
            /\ UNCHANGED <<now, row, acctHeld, refundHeld, apiVars, claims, prepared, bound, shown, marker,
                           reprepares, runRetries, runLosses, unrecorded>>
       ELSE IF ~Reconcile
       THEN \* today: "has no durable result; it will not be sent again" (uncoded Error)
            /\ host' = [host EXCEPT !.ph = "stuck"]
            /\ bound' = bound \cup {k}
            /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, shown, marker, settledRow,
                           reprepares, runRetries, runLosses, unrecorded>>
       ELSE IF row[k].cust = "pending"
       THEN \* target: MODEL_ATTEMPT_PENDING, retry class wait
            /\ host' = [host EXCEPT !.ph = "waiting"]
            /\ bound' = bound \cup {k}
            /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, shown, marker, settledRow,
                           reprepares, runRetries, runLosses, unrecorded>>
       ELSE \* target: append model.invocation-settled; a charged, unshown attempt is a recorded loss
            /\ settledRow' = settledRow \cup {k}
            /\ bound' = bound \cup {k}
            /\ host' = [host EXCEPT !.ph = IF row[k].charged > 0 /\ k \notin shown THEN "lost" ELSE "ready"]
            /\ runLosses' = IF row[k].charged > 0 /\ k \notin shown THEN runLosses + 1 ELSE runLosses
            /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, shown, marker, reprepares,
                           runRetries, unrecorded>>

\* EQ1: after the charged loss is recorded, the step starts a new attempt, charged again, with no gesture,
\* at most LostReplyRetries times in one live run.
HostReprepare ==
    /\ AutoProceed
    /\ host.ph = "lost"
    /\ runRetries < LostReplyRetries
    /\ reprepares' = reprepares + 1
    /\ runRetries' = IF CountRetries THEN runRetries + 1 ELSE runRetries
    /\ host' = [host EXCEPT !.ph = "ready"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, bound, shown, marker, settledRow,
                   runLosses, unrecorded>>

\* A further charged loss in the same live run ends the run with the transport's resumable code.
HostEndRun ==
    /\ AutoProceed
    /\ host.ph = "lost"
    /\ runRetries >= LostReplyRetries
    /\ host' = [host EXCEPT !.ph = "ended"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, logVars>>

\* Resume of that run proceeds the same way: a new live run, a new key, charged again, no gesture.
HostUserResume ==
    /\ host.ph = "ended"
    /\ reprepares' = reprepares + 1
    /\ runRetries' = 0
    /\ runLosses' = 0
    /\ host' = [host EXCEPT !.ph = "ready"]
    /\ UNCHANGED <<now, row, acctHeld, refundHeld, voided, apiVars, claims, prepared, bound, shown, marker, settledRow,
                   unrecorded>>

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

\* The API process stops (R10 of the graceful-shutdown blueprint): a step still streaming, or one its
\* deadline cut, is terminalized at once as absorbed instead of left for recovery, and a client that
\* left during the stop is counted the same way. finish() sees absorbed_unknown with the stop signal
\* set and terminalizes under the admitting generation, so a sweep claim that won the race fences it
\* out and recovery resolves the row as before. The signal is process-wide; one action per key
\* over-approximates it.
ApiServiceStop(k) ==
    /\ \/ req[k] = "streaming"
       \/ req[k] = "finishing" /\ fin[k] = "unknown"
    /\ LET e == IF req[k] = "streaming" /\ conn[k] = "noticed" THEN "abort" ELSE "unknown" IN
         /\ sup' = IF sup[k] = "generating" THEN [sup EXCEPT ![k] = "cut"] ELSE sup
         /\ fin' = [fin EXCEPT ![k] = e]
         /\ IF (~FenceGen \/ row[k].gen = 1) /\ row[k].cust = "pending"
            THEN Terminal(k, "absorbed", 0, {e}, FALSE, 1)
            ELSE /\ row' = [row EXCEPT ![k].ev = @ \cup {e}]   \* the evidence write is not fenced
                 /\ UNCHANGED acctHeld
    /\ req' = [req EXCEPT ![k] = "done"]
    /\ UNCHANGED <<now, refundHeld, voided, conn, dispatches, claims, host, logVars>>

\* finish(): terminalize under the admitting generation; absorbed_unknown returns without it, unless
\* the process is stopping (ApiServiceStop).
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

\* @type: ({k: Str, gen: Int, t: Int}) => Bool;
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
        \/ HostNetworkDrop \/ HostCrash \/ HostDiscard \/ HostResume \/ HostReprepare \/ HostEndRun
        \/ HostUserResume
Api == \E k \in Keys : \/ ApiNotice(k) \/ ApiAbortBeforeAdmission(k) \/ ApiAdmit(k)
                       \/ ApiMarkIntent(k) \/ ApiDispatch(k) \/ SupplierEnd(k)
                       \/ ApiObserve(k) \/ ApiClientCancel(k) \/ ApiServiceStop(k) \/ ApiFinish(k)
Sweep == SweepClaim \/ SweepResolve \/ SweepFail \/ SweepCrash

Next == Tick \/ RefundHold \/ RefundRelease \/ Host \/ Api \/ Sweep

\* Fairness on the clock and the sweep only; the live path, client, supplier and host get none.
Spec == Init /\ [][Next]_vars /\ WF_vars(Tick) /\ WF_vars(SweepClaim) /\ WF_vars(SweepResolve)

\* Vacuity: without sweep fairness a pending row may stay pending forever.
SpecNoSweepFairness == Init /\ [][Next]_vars /\ WF_vars(Tick)

\* Reconciliation liveness additionally assumes the chat is opened again and the host's stream ends.
SpecReopen == Spec /\ WF_vars(HostBind) /\ WF_vars(HostComplete) /\ WF_vars(HostSeesFailure)
                   /\ WF_vars(HostResume) /\ WF_vars(HostReprepare) /\ WF_vars(HostEndRun)
                   /\ WF_vars(HostUserResume)

-----------------------------------------------------------------------------
(* Properties; numbers are rows of the lane's gateway-invariants.tsv. *)

TypeOK ==
    /\ now \in 0..MaxTime
    /\ acctHeld \in 0..(Cardinality(Keys) + 1)
    /\ refundHeld \in 0..1
    /\ runRetries \in 0..LostReplyRetries
    /\ runLosses \in 0..(LostReplyRetries + 1)
    /\ \A k \in Keys :
         /\ unrecorded[k] \subseteq Keys
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

\* (11) EQ1: an earlier attempt that was neither shown nor recorded when the step's next attempt was
\* prepared is never charged, so a charged attempt's settled row precedes the next prepared row; and
\* every charge beyond the first follows a recorded loss. (No attempt is re-sent: each key is sent once.)
ChargeAfterRecordedLoss ==
    /\ \A k \in prepared : \A j \in unrecorded[k] : row[j].charged = 0
    /\ Cardinality({k \in Keys : row[k].ex /\ row[k].cust = "settled" /\ row[k].charged > 0}) <= 1 + reprepares

\* EQ1's bound, over the losses themselves rather than the guard's counter: once a live run has recorded
\* more than LostReplyRetries charged losses it prepares and sends nothing more (it ends; Resume starts a
\* new live run). A re-prepare that forgot to count (runRetries' = runRetries) violates it.
LostReplyBound == host.ph \in {"ready", "prepared", "inflight"} => runLosses <= LostReplyRetries
\* Vacuity: a second charged loss in one live run is reachable, so the run ends (then Resume proceeds).
NeverEndsRun == host.ph # "ended"

\* Reconciliation (R): a charged attempt is eventually shown or recorded as settled in the log
ChargedReplyRecorded ==
    \A k \in Keys : (row[k].ex /\ row[k].charged > 0) ~> (k \in shown \/ k \in settledRow)

\* D-086: today's uncoded dead end is reachable; the target never reaches it
NoUncodedDeadEnd == host.ph # "stuck"

\* Vacuity for ApiServiceStop: only a stopping API absorbs under the admitting generation; every
\* recovery absorb runs under a claimed one. Its witness must keep failing.
NoLiveAbsorb == \A k \in Keys : row[k].cust = "absorbed" => row[k].tgen > 1

-----------------------------------------------------------------------------
(* GI-S7: the row's inductive invariant for Apalache (MC_GatewayInvocation). *)
(* The M* conjuncts of I34 plus the facts that make them inductive. The host *)
(* history (ChargeAfterRecordedLoss) is not inductive and stays with TLC.    *)

Evidence == {"final", "unknown", "abort", "rejected", "expired", "unresolvable"}
CustStates == {None, "pending", "settled", "released", "absorbed"}
DispStates == {None, "admitted", "intent_recorded", "accepted", "recovery_required"}
ReqStates == {"idle", "sent", "admitted", "intent", "streaming", "finishing", "done", "gone", "refused"}
FinStates == {None, "final", "unknown", "replay", "abort"}
ConnStates == {None, "open", "dropped", "noticed"}
SupStates == {None, "generating", "completed", "failed", "cut"}
Phases == {"ready", "prepared", "inflight", "done", "failed", "down", "waiting", "stuck", "lost", "ended"}

\* TypeOK without infinite sets: integer fields are typed Int by the annotations.
TypeInv ==
    /\ now \in 0..MaxTime
    /\ refundHeld \in 0..1
    /\ runRetries \in 0..LostReplyRetries
    /\ host.ph \in Phases /\ host.key \in Keys \cup {None}
    /\ host.key = None => host.ph = "ready"
    /\ host.key # None => host.key \in prepared
    /\ voided \cup prepared \cup bound \cup shown \cup marker \cup settledRow \subseteq Keys
    /\ \A c \in claims : c.k \in Keys
    /\ \A k \in Keys :
         /\ row[k].cust \in CustStates /\ row[k].disp \in DispStates /\ row[k].ev \subseteq Evidence
         /\ req[k] \in ReqStates /\ fin[k] \in FinStates /\ conn[k] \in ConnStates /\ sup[k] \in SupStates
         /\ dispatches[k] \in 0..1 /\ unrecorded[k] \subseteq Keys

\* Strengthening: what each row, request and supplier call implies about the others.
RowFacts(k) ==
    LET r == row[k] IN
    /\ ~r.ex => r = NoRow
    /\ r.ex => r.cust # None /\ r.disp # None
    /\ r.cust = "pending" => r.charged = 0 /\ ~r.ttl
    /\ r.charged = 1 => r.cust = "settled"
    /\ r.intent >= 0 => r.igen = 1
    /\ "final" \in r.ev => r.intent >= 0
    /\ sup[k] # None => r.ex /\ r.intent >= 0 /\ dispatches[k] = 1
    /\ dispatches[k] = 1 => sup[k] # None /\ req[k] \in {"streaming", "finishing", "done"}
    /\ fin[k] = "final" => "final" \in r.ev /\ sup[k] = "completed"
    /\ req[k] \in {"admitted", "intent", "streaming", "finishing"} => r.ex
    /\ req[k] = "intent" => r.intent >= 0

IndInv ==
    /\ TypeInv
    /\ RowHold
    /\ AccountHoldConservation
    /\ TerminalImpliesRecordedEvidence
    /\ NoChargeWithoutDispatch
    /\ NoChargeWithoutFinalEvidence
    /\ NoDispatchAfterDue
    /\ NoDispatchWithoutLiveGeneration
    /\ StaleGenerationNeverTerminalizes
    /\ DispatchedWithoutEvidenceWaitsForGrace
    /\ AttemptIdempotence
    /\ \A k \in Keys : RowFacts(k)

\* The action properties (1), (4) and (7) as one step predicate, checked from every IndInv state.
RowSteps ==
    \A k \in Keys :
      /\ row[k].ex /\ row[k].cust # "pending" => row'[k].cust = row[k].cust
      /\ row[k].intent < 0 /\ row'[k].intent >= 0 => row[k].cancel < 0
      /\ row'[k].gen > row[k].gen /\ row[k].ex =>
            /\ row[k].cust = "pending" /\ row[k].due <= now
            /\ (row[k].lease < 0 \/ row[k].lease <= now)

\* Vacuity: the same invariant with L7 F14's hold statement, which a refund hold breaks.
IndInvWithoutRefunds == IndInv /\ AccountHoldWithoutRefunds

=============================================================================
