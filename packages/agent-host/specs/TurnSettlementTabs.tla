---------------------------- MODULE TurnSettlementTabs ----------------------------
(***************************************************************************)
(* W8's two-tab instance (I25): two tabs share one project's durable       *)
(* state (lease record, graph, tree, chat log) and one chat whose Web Lock *)
(* elects the leader. Each tab's anchor (host + root) dies with the tab:   *)
(* an assumption the browser breaks; TurnSettlementSteal lifts it (RV2).   *)
(* There is no epoch sweep: a lease is retired only by the chat's leader,  *)
(* after the row (acknowledge), or by a leader's reconciliation.           *)
(* Placement is atomic here (intent row, lease, running row); the one-tab  *)
(* model checks its interleavings.                                         *)
(*                                                                         *)
(* Switches, TRUE in the proposal:                                         *)
(*   QueueOnAttach  at attach, a tab queues a blocking request for the     *)
(*                  lock of a leased chat that another tab leads;          *)
(*   QueueOnFence   a tab whose mint is refused by a lease queues the      *)
(*                  same request for that lease's chat;                    *)
(*   FreshFence     the save fence reads the lease record at mint time,    *)
(*                  not the registry's cached view from attach.            *)
(* A granted request makes the tab the chat's leader: it reconciles (D10)  *)
(* and releases the lock when quiescent (W6 RH-R8). Steal is not modelled  *)
(* (EQ2): leadership moves only when the holder releases or dies.          *)
(***************************************************************************)
EXTENDS Integers

CONSTANTS Tabs, MaxDeaths, MaxEdits, QueueOnAttach, QueueOnFence, FreshFence

VARIABLES
    alive, opened, deaths,               \* tabs
    lock, waiting,                       \* the chat's Web Lock and its queued requests
    phase,                               \* per tab: M1 for the chat while leading
    view,                                \* per tab: the registry's cached "checkout leased"
    wants,                               \* per tab: a save was refused and is still wanted
    gestured, admitted, executed, completed, failed,  \* durable run rows (one attempt)
    lease,                               \* durable lease record
    agentDirty, personDirty, edits,      \* durable tree
    nResult, stolen,                     \* durable graph
    rowKind                              \* durable settlement row

tabVars  == <<alive, opened, deaths>>
lockVars == <<lock, waiting>>
runVars  == <<gestured, admitted, executed, completed, failed>>
treeVars == <<agentDirty, personDirty, edits>>
vars == <<tabVars, lockVars, phase, view, wants, runVars, lease, treeVars, nResult, stolen, rowKind>>

None == "none"
Dirty == agentDirty \/ personDirty
Leading(t) == lock = t /\ alive[t]
OwnTurn(t) == lock = t /\ phase[t] \in {"running", "finishing", "appending", "acking"}
Fenced(t) == IF FreshFence THEN lease ELSE (view[t] \/ OwnTurn(t))

Init ==
    /\ alive = [t \in Tabs |-> FALSE] /\ opened = [t \in Tabs |-> FALSE]
    /\ deaths = 0
    /\ lock = None /\ waiting = {}
    /\ phase = [t \in Tabs |-> "none"] /\ view = [t \in Tabs |-> FALSE] /\ wants = [t \in Tabs |-> FALSE]
    /\ gestured = FALSE /\ admitted = FALSE /\ executed = FALSE /\ completed = FALSE /\ failed = FALSE
    /\ lease = FALSE /\ agentDirty = FALSE /\ personDirty = FALSE /\ edits = 0
    /\ nResult = 0 /\ stolen = FALSE /\ rowKind = "none"

\* Attach (tab load or reload): reconcile a leased chat if its lock is free, else queue for it.
Open(t) ==
    /\ ~opened[t]
    /\ alive' = [alive EXCEPT ![t] = TRUE] /\ opened' = [opened EXCEPT ![t] = TRUE]
    /\ view' = [view EXCEPT ![t] = lease]
    /\ IF lease /\ lock = None
         THEN /\ lock' = t /\ phase' = [phase EXCEPT ![t] = "reconciling"] /\ UNCHANGED waiting
         ELSE /\ waiting' = IF lease /\ QueueOnAttach THEN waiting \cup {t} ELSE waiting
              /\ UNCHANGED <<lock, phase>>
    /\ UNCHANGED <<deaths, wants, runVars, lease, treeVars, nResult, stolen, rowKind>>

TabDies(t) ==
    /\ alive[t] /\ deaths < MaxDeaths
    /\ alive' = [alive EXCEPT ![t] = FALSE] /\ opened' = [opened EXCEPT ![t] = FALSE] /\ deaths' = deaths + 1
    /\ lock' = IF lock = t THEN None ELSE lock        \* the browser releases a dead context's locks
    /\ waiting' = waiting \ {t}
    /\ phase' = [phase EXCEPT ![t] = "none"] /\ wants' = [wants EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<view, runVars, lease, treeVars, nResult, stolen, rowKind>>

Grant(t) ==   \* a queued request is granted once the lock is free
    /\ lock = None /\ t \in waiting /\ alive[t]
    /\ lock' = t /\ waiting' = waiting \ {t} /\ phase' = [phase EXCEPT ![t] = "reconciling"]
    /\ UNCHANGED <<tabVars, view, wants, runVars, lease, treeVars, nResult, stolen, rowKind>>

Release(t) ==   \* M1 quiescent: nothing running and nothing unacknowledged (RH-R8, TS-R10)
    /\ lock = t /\ phase[t] = "none"
    /\ lock' = None
    /\ UNCHANGED <<tabVars, waiting, phase, view, wants, runVars, lease, treeVars, nResult, stolen, rowKind>>

\* The gesture's write command takes the free lock; intent row, lease, running row (atomic here).
Start(t) ==
    /\ opened[t] /\ alive[t] /\ ~gestured /\ lock \in {None, t} /\ phase[t] = "none"
    /\ lock' = t /\ gestured' = TRUE /\ admitted' = TRUE /\ executed' = TRUE /\ lease' = TRUE
    /\ view' = [view EXCEPT ![t] = TRUE] /\ phase' = [phase EXCEPT ![t] = "running"]
    /\ UNCHANGED <<tabVars, waiting, wants, completed, failed, treeVars, nResult, stolen, rowKind>>

AgentWrite(t) ==
    /\ Leading(t) /\ phase[t] = "running" /\ ~agentDirty
    /\ agentDirty' = TRUE
    /\ UNCHANGED <<tabVars, lockVars, phase, view, wants, runVars, lease, personDirty, edits, nResult, stolen, rowKind>>

CompleteRun(t) ==
    /\ Leading(t) /\ phase[t] = "running"
    /\ completed' = TRUE /\ phase' = [phase EXCEPT ![t] = "finishing"]
    /\ UNCHANGED <<tabVars, lockVars, view, wants, gestured, admitted, executed, failed, lease, treeVars, nResult, stolen, rowKind>>

Cut(t) ==   \* find-or-cut under the lease
    /\ Leading(t) /\ phase[t] = "finishing"
    /\ IF nResult = 0 /\ Dirty
         THEN /\ nResult' = 1 /\ agentDirty' = FALSE /\ personDirty' = FALSE
         ELSE UNCHANGED <<nResult, agentDirty, personDirty>>
    /\ phase' = [phase EXCEPT ![t] = "appending"]
    /\ UNCHANGED <<tabVars, lockVars, view, wants, runVars, lease, edits, stolen, rowKind>>

AppendRow(t) ==   \* only the leader appends (the log fence)
    /\ Leading(t) /\ phase[t] = "appending"
    /\ rowKind' = "fin" /\ phase' = [phase EXCEPT ![t] = "acking"]
    /\ UNCHANGED <<tabVars, lockVars, view, wants, runVars, lease, treeVars, nResult, stolen>>

Acknowledge(t) ==
    /\ Leading(t) /\ phase[t] = "acking"
    /\ lease' = FALSE /\ view' = [view EXCEPT ![t] = FALSE] /\ phase' = [phase EXCEPT ![t] = "none"]
    /\ UNCHANGED <<tabVars, lockVars, wants, runVars, treeVars, nResult, stolen, rowKind>>

\* The new leader after its read (D10): the log and the lease record decide.
Reconcile(t) ==
    /\ Leading(t) /\ phase[t] = "reconciling"
    /\ view' = [view EXCEPT ![t] = lease]
    /\ IF lease /\ rowKind # "none"
         THEN /\ phase' = [phase EXCEPT ![t] = "acking"] /\ UNCHANGED failed
         ELSE IF lease
           THEN /\ failed' = ~completed      \* abandoned unless it completed; RUN_ABANDONED
                /\ phase' = [phase EXCEPT ![t] = "finishing"]
           ELSE /\ phase' = [phase EXCEPT ![t] = "none"] /\ UNCHANGED failed
    /\ UNCHANGED <<tabVars, lockVars, wants, gestured, admitted, executed, completed, lease, treeVars, nResult, stolen, rowKind>>

PersonEdit(t) ==
    /\ opened[t] /\ alive[t] /\ edits < MaxEdits /\ ~personDirty
    /\ personDirty' = TRUE /\ edits' = edits + 1
    /\ UNCHANGED <<tabVars, lockVars, phase, view, wants, runVars, lease, agentDirty, nResult, stolen, rowKind>>

Save(t) ==
    /\ opened[t] /\ alive[t] /\ Dirty /\ ~Fenced(t)
    /\ stolen' = (stolen \/ agentDirty)
    /\ agentDirty' = FALSE /\ personDirty' = FALSE /\ wants' = [wants EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<tabVars, lockVars, phase, view, runVars, lease, edits, nResult, rowKind>>

\* A refused save: the person still wants it; with QueueOnFence the tab queues for the lease's chat.
SaveRefused(t) ==
    /\ opened[t] /\ alive[t] /\ Dirty /\ Fenced(t) /\ ~wants[t]
    /\ wants' = [wants EXCEPT ![t] = TRUE]
    /\ view' = [view EXCEPT ![t] = lease]
    /\ waiting' = IF QueueOnFence /\ lease /\ lock # t THEN waiting \cup {t} ELSE waiting
    /\ UNCHANGED <<tabVars, lock, phase, runVars, lease, treeVars, nResult, stolen, rowKind>>

Next ==
    \E t \in Tabs :
        \/ Open(t) \/ TabDies(t) \/ Grant(t) \/ Release(t)
        \/ Start(t) \/ AgentWrite(t) \/ CompleteRun(t) \/ Cut(t) \/ AppendRow(t) \/ Acknowledge(t) \/ Reconcile(t)
        \/ PersonEdit(t) \/ Save(t) \/ SaveRefused(t)

Fairness ==
    \A t \in Tabs :
        /\ WF_vars(Grant(t)) /\ WF_vars(Release(t)) /\ WF_vars(Reconcile(t))
        /\ WF_vars(CompleteRun(t)) /\ WF_vars(Cut(t)) /\ WF_vars(AppendRow(t)) /\ WF_vars(Acknowledge(t))

Spec == Init /\ [][Next]_vars /\ Fairness

\* The same, assuming a closed tab is eventually opened again: the project's next attach.
SpecReopen == Spec /\ \A t \in Tabs : WF_vars(Open(t))

TypeOK ==
    /\ lock \in Tabs \cup {None} /\ waiting \subseteq Tabs
    /\ phase \in [Tabs -> {"none", "running", "finishing", "appending", "acking", "reconciling"}]
    /\ rowKind \in {"none", "fin"}

AgentBytesAttributedToTurn == ~stolen
AtMostOneResult == nResult <= 1
RetireAfterRow == (executed /\ ~lease) => rowKind # "none"            \* I19; with no sweep, I25
LeaderOnlyTurn == \A t \in Tabs : phase[t] # "none" => lock = t          \* M1 drives only while leading

\* The harm: a save refused by a lease is eventually unfenced, or its tab dies.
SaveEventuallyUnfenced == \A t \in Tabs : wants[t] ~> (~lease \/ ~alive[t])
LeasesEventuallyRetired == lease ~> ~lease
\* The residue: a dead holder's lease that no open tab observes waits for the next attach (a limit).
LeaseRetiredWhileATabIsOpen == lease ~> (~lease \/ \A t \in Tabs : ~alive[t])
CompletedRunEventuallySettled == completed ~> (rowKind # "none")

TraceView == [alive |-> alive, opened |-> opened, lock |-> lock, waiting |-> waiting, phase |-> phase,
              view |-> view, wants |-> wants, lease |-> lease, run |-> <<admitted, executed, completed, failed>>,
              dirty |-> <<agentDirty, personDirty>>, result |-> nResult, row |-> rowKind, stolen |-> stolen]
=====================================================================================
