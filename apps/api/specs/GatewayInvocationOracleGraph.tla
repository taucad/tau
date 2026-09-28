---- MODULE GatewayInvocationOracleGraph ----
\* A one-key, action-labelled slice of GatewayInvocation's actual transition relations.
\* Host and supplier actions remain so admission, loss and recovery are reachable.
EXTENDS Integers, FiniteSets
CONSTANTS Keys, Workers, Crashes, MaxTime, Due, Grace, MaxRecovery, LostReplyRetries,
          VoidOnLookup, LookupFailed, Reconcile, AutoProceed, KeepCompleted, RefundHolds,
          FenceGen, DeferGrace, CountRetries
VARIABLES now, row, acctHeld, refundHeld, voided, req, fin, conn, sup, dispatches, claims,
          host, prepared, bound, shown, marker, settledRow, reprepares, runRetries, runLosses,
          unrecorded, act

S == INSTANCE GatewayInvocation
Label(name) == act' = name

GraphInit == S!Init /\ act = "Init"
GraphNext ==
    \/ S!Tick /\ Label("Tick")
    \/ S!HostPrepare /\ Label("HostPrepare")
    \/ S!HostSend /\ Label("HostSend")
    \/ S!HostCrash /\ Label("HostCrash")
    \/ S!HostResume /\ Label("HostResume")
    \/ S!ApiAdmit("a") /\ Label("ApiAdmit")
    \/ S!ApiMarkIntent("a") /\ Label("ApiMarkIntent")
    \/ S!ApiDispatch("a") /\ Label("ApiDispatch")
    \/ S!SupplierEnd("a") /\ Label("SupplierEnd")
    \/ S!ApiObserve("a") /\ Label("ApiObserve")
    \/ S!ApiFinish("a") /\ Label("ApiFinish")
    \/ S!SweepClaim /\ Label("SweepClaim")
    \/ S!SweepResolve /\ Label("SweepResolve")
    \/ S!SweepFail /\ Label("SweepFail")

GraphSpec == GraphInit /\ [][GraphNext]_<<S!vars, act>>
====
