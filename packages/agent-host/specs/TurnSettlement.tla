---------------------------- MODULE TurnSettlement ----------------------------
(***************************************************************************)
(* The north star's target (NS4, NS5): a resident anchor admits, places,   *)
(* runs and settles every turn itself; the page is a view whose death      *)
(* changes nothing durable. The revision graph's provenance is the         *)
(* settlement of record and the chat log's turn.finalized row is a pointer *)
(* derived from it; the anchor reconciles at start; the lease retires      *)
(* after the row. The anchor (host + revision root: one process on a       *)
(* daemon, two port-joined workers of one tab in the browser) may crash    *)
(* between any two durable writes, including between the mint and the row.*)
(*                                                                         *)
(* Same abstraction as TurnSettlementToday: one turn per chat, one         *)
(* checkout per chat, the graph as per-turn counts of "base" (placement    *)
(* pre-mint, before the run executes) and "result" (the run's cut) plus    *)
(* the newest id; `stolen` records a person's save that swallowed a        *)
(* completed run's bytes.                                                  *)
(*                                                                         *)
(* Three design knobs, each TRUE in the target:                            *)
(*   IntentFirst    the run's admitted row is appended before placement's  *)
(*                  first mint (the daemon today leases first);            *)
(*   LeaseUntilRow  a lease record, live or stale, fences the checkout     *)
(*                  until the row lands (today: retire before the row,     *)
(*                  sweep stale leases at open);                           *)
(*   ReconcileOnView FALSE: reconcile every chat of the project at anchor  *)
(*                  start, not when a view opens the chat.                 *)
(***************************************************************************)
EXTENDS Integers

CONSTANTS
    \* @type: Set(Str);
    Chats,
    \* @type: Set(Str);
    TurnChats,
    \* @type: Int;
    MaxCrashes,
    \* @type: Int;
    MaxPageDeaths,
    \* @type: Int;
    MaxEdits,
    \* @type: Bool;
    IntentFirst,
    \* @type: Bool;
    LeaseUntilRow,
    \* @type: Bool;
    ReconcileOnView

VARIABLES
    \* ---- the page: a view (commands in, events out) ----
    \* @type: Bool;
    pageAlive,
    \* @type: Int;
    pageDeaths,
    \* @type: Str;
    focus,
    \* @type: Str -> Str;
    cmd,          \* the start command, idempotency key = run id: "none" | "sent" | "answered"
    \* @type: Str -> Bool;
    gestured,
    \* ---- the anchor: resident host + revision root (volatile) ----
    \* @type: Bool;
    anchorAlive,
    \* @type: Int;
    aEpoch,
    \* @type: Int;
    crashes,
    \* @type: Str -> Str;
    phase,        \* the host's run actor and turn.machine, per chat
    \* @type: Set(Str);
    reconciling,  \* chats this anchor life still owes a reconcile
    \* ---- durable ----
    \* @type: Str -> Int;
    lease,        \* 0, or the anchor epoch that wrote the lease record
    \* @type: Str -> Bool;
    agentDirty,
    \* @type: Str -> Bool;
    personDirty,
    \* @type: Int;
    edits,
    \* @type: Int;
    nextRev,
    \* @type: Str -> Int;
    nBase,
    \* @type: Str -> Int;
    nResult,
    \* @type: Str -> Int;
    newest,
    \* @type: Bool;
    stolen,
    \* @type: Str -> Bool;
    admitted,
    \* @type: Str -> Bool;
    executed,
    \* @type: Str -> Bool;
    completed,
    \* @type: Str -> Bool;
    failed,
    \* @type: Str -> Str;
    rowKind,      \* "none" | "fin" | "failed"
    \* @type: Str -> Int;
    rowRev

pageVars   == <<pageAlive, pageDeaths, focus, cmd, gestured>>
anchorVars == <<anchorAlive, aEpoch, crashes, phase, reconciling>>
treeVars   == <<agentDirty, personDirty, edits>>
graphVars  == <<nextRev, nBase, nResult, newest, stolen>>
\* @type: <<Str -> Bool, Str -> Bool, Str -> Bool, Str -> Bool>>;
runVars    == <<admitted, executed, completed, failed>>
rowVars    == <<rowKind, rowRev>>
vars == <<pageVars, anchorVars, lease, treeVars, graphVars, runVars, rowVars>>

Phases == {"none", "placing", "leasing", "running", "finishing", "appending", "retiring"}
\* The phases in which the live anchor holds the chat's lease record.
Holding == IF LeaseUntilRow THEN {"running", "finishing", "appending", "retiring"}
                            ELSE {"running", "finishing", "retiring"}

Dirty(c) == agentDirty[c] \/ personDirty[c]

\* A manual save is refused while the checkout is held (checkouts' heldByTurn).
Fenced(c) == IF LeaseUntilRow THEN lease[c] # 0
                              ELSE anchorAlive /\ lease[c] = aEpoch /\ phase[c] \in Holding

Init ==
    /\ pageAlive = TRUE /\ pageDeaths = 0 /\ focus \in Chats
    /\ cmd = [c \in Chats |-> "none"] /\ gestured = [c \in Chats |-> FALSE]
    /\ anchorAlive = TRUE /\ aEpoch = 1 /\ crashes = 0
    /\ phase = [c \in Chats |-> "none"] /\ reconciling = {}
    /\ lease = [c \in Chats |-> 0]
    /\ agentDirty = [c \in Chats |-> FALSE] /\ personDirty = [c \in Chats |-> FALSE] /\ edits = 0
    /\ nextRev = 1 /\ nBase = [c \in Chats |-> 0] /\ nResult = [c \in Chats |-> 0]
    /\ newest = [c \in Chats |-> 0] /\ stolen = FALSE
    /\ admitted = [c \in Chats |-> FALSE] /\ executed = [c \in Chats |-> FALSE]
    /\ completed = [c \in Chats |-> FALSE] /\ failed = [c \in Chats |-> FALSE]
    /\ rowKind = [c \in Chats |-> "none"] /\ rowRev = [c \in Chats |-> 0]

MintTurn(c, kind) ==
    /\ nextRev' = nextRev + 1
    /\ newest' = [newest EXCEPT ![c] = nextRev]
    /\ nBase' = IF kind = "base" THEN [nBase EXCEPT ![c] = nBase[c] + 1] ELSE nBase
    /\ nResult' = IF kind = "result" THEN [nResult EXCEPT ![c] = nResult[c] + 1] ELSE nResult
    /\ agentDirty' = [agentDirty EXCEPT ![c] = FALSE]
    /\ personDirty' = [personDirty EXCEPT ![c] = FALSE]
    /\ UNCHANGED <<stolen, edits>>
NoMint == UNCHANGED <<treeVars, graphVars>>

SetPhase(c, p) == phase' = [phase EXCEPT ![c] = p]

\* ---------------- the person and the page ----------------
Focus(c) ==
    /\ pageAlive /\ focus # c
    /\ focus' = c
    /\ UNCHANGED <<pageAlive, pageDeaths, cmd, gestured, anchorVars, lease, treeVars, graphVars, runVars, rowVars>>

PersonEdit(c) ==
    /\ pageAlive /\ edits < MaxEdits /\ ~personDirty[c]
    /\ personDirty' = [personDirty EXCEPT ![c] = TRUE] /\ edits' = edits + 1
    /\ UNCHANGED <<pageVars, anchorVars, lease, agentDirty, graphVars, runVars, rowVars>>

ManualSave(c) ==
    /\ pageAlive /\ anchorAlive /\ Dirty(c) /\ ~Fenced(c)
    /\ stolen' = (stolen \/ (agentDirty[c] /\ completed[c]))
    /\ nextRev' = nextRev + 1
    /\ agentDirty' = [agentDirty EXCEPT ![c] = FALSE]
    /\ personDirty' = [personDirty EXCEPT ![c] = FALSE]
    /\ UNCHANGED <<pageVars, anchorVars, lease, edits, nBase, nResult, newest, runVars, rowVars>>

Gesture(c) ==
    /\ pageAlive /\ c \in TurnChats /\ focus = c /\ ~gestured[c]
    /\ gestured' = [gestured EXCEPT ![c] = TRUE] /\ cmd' = [cmd EXCEPT ![c] = "sent"]
    /\ UNCHANGED <<pageAlive, pageDeaths, focus, anchorVars, lease, treeVars, graphVars, runVars, rowVars>>

PageDies ==   \* a view dies; a command it had not delivered dies with it
    /\ pageAlive /\ pageDeaths < MaxPageDeaths
    /\ pageAlive' = FALSE /\ pageDeaths' = pageDeaths + 1
    /\ cmd' = [c \in Chats |-> IF cmd[c] = "sent" THEN "none" ELSE cmd[c]]
    /\ UNCHANGED <<focus, gestured, anchorVars, lease, treeVars, graphVars, runVars, rowVars>>

PageOpens ==
    /\ ~pageAlive
    /\ pageAlive' = TRUE /\ focus' \in Chats
    /\ UNCHANGED <<pageDeaths, cmd, gestured, anchorVars, lease, treeVars, graphVars, runVars, rowVars>>

\* ---------------- the anchor ----------------
DeliverStart(c) ==   \* at-least-once from the page; the run id is the idempotency key
    /\ anchorAlive /\ pageAlive /\ cmd[c] = "sent"
    /\ IF admitted[c]
         THEN /\ cmd' = [cmd EXCEPT ![c] = "answered"]   \* RUN_ID_TAKEN: attach, never a second run
              /\ UNCHANGED <<phase, admitted>>
         ELSE /\ phase[c] = "none"
              /\ SetPhase(c, "placing")
              /\ admitted' = IF IntentFirst THEN [admitted EXCEPT ![c] = TRUE] ELSE admitted
              /\ cmd' = IF IntentFirst THEN [cmd EXCEPT ![c] = "answered"] ELSE cmd
    /\ UNCHANGED <<pageAlive, pageDeaths, focus, gestured, anchorAlive, aEpoch, crashes, reconciling, lease,
                   treeVars, graphVars, executed, completed, failed, rowVars>>

Place(c) ==   \* turn-placement port: prepare + basing (D17 pre-mint of a dirty base)
    /\ anchorAlive /\ phase[c] = "placing"
    /\ IF Dirty(c) THEN MintTurn(c, "base") ELSE NoMint
    /\ SetPhase(c, "leasing")
    /\ UNCHANGED <<pageVars, anchorAlive, aEpoch, crashes, reconciling, lease, runVars, rowVars>>

WriteLease(c) ==   \* the lease record, then (without IntentFirst) the admitted row; the run starts
    /\ anchorAlive /\ phase[c] = "leasing"
    /\ lease' = [lease EXCEPT ![c] = aEpoch]
    /\ admitted' = [admitted EXCEPT ![c] = TRUE]
    /\ executed' = [executed EXCEPT ![c] = TRUE]
    /\ cmd' = [cmd EXCEPT ![c] = IF cmd[c] = "sent" THEN "answered" ELSE cmd[c]]
    /\ SetPhase(c, "running")
    /\ UNCHANGED <<pageAlive, pageDeaths, focus, gestured, anchorAlive, aEpoch, crashes, reconciling,
                   treeVars, graphVars, completed, failed, rowVars>>

AgentWrite(c) ==
    /\ anchorAlive /\ phase[c] = "running" /\ ~agentDirty[c]
    /\ agentDirty' = [agentDirty EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<pageVars, anchorVars, lease, personDirty, edits, graphVars, runVars, rowVars>>

CompleteRun(c) ==
    /\ anchorAlive /\ phase[c] = "running"
    /\ completed' = [completed EXCEPT ![c] = TRUE]
    /\ SetPhase(c, "finishing")
    /\ UNCHANGED <<pageVars, anchorAlive, aEpoch, crashes, reconciling, lease, treeVars, graphVars,
                   admitted, executed, failed, rowVars>>

Cut(c) ==   \* under the held lease; the cut's provenance names the run
    /\ anchorAlive /\ phase[c] = "finishing"
    /\ IF Dirty(c) THEN MintTurn(c, "result") ELSE NoMint
    /\ SetPhase(c, IF LeaseUntilRow THEN "appending" ELSE "retiring")
    /\ UNCHANGED <<pageVars, anchorAlive, aEpoch, crashes, reconciling, lease, runVars, rowVars>>

AppendRow(c) ==   \* the derived pointer: describeTurnSettlement over the graph, appended by the host
    /\ anchorAlive /\ phase[c] = "appending" /\ admitted[c]
    /\ rowKind' = [rowKind EXCEPT ![c] = "fin"] /\ rowRev' = [rowRev EXCEPT ![c] = newest[c]]
    /\ SetPhase(c, IF LeaseUntilRow THEN "retiring" ELSE "none")
    /\ UNCHANGED <<pageVars, anchorAlive, aEpoch, crashes, reconciling, lease, treeVars, graphVars, runVars>>

RetireLease(c) ==
    /\ anchorAlive /\ phase[c] = "retiring"
    /\ lease' = [lease EXCEPT ![c] = 0]
    /\ SetPhase(c, IF LeaseUntilRow THEN "none" ELSE "appending")
    /\ UNCHANGED <<pageVars, anchorAlive, aEpoch, crashes, reconciling, treeVars, graphVars, runVars, rowVars>>

Reconcile(c) ==   \* at anchor start: the graph and the log decide; nothing is replayed from memory
    /\ anchorAlive /\ c \in reconciling /\ phase[c] = "none"
    /\ ReconcileOnView => (pageAlive /\ focus = c)
    /\ reconciling' = reconciling \ {c}
    /\ IF ~admitted[c] \/ rowKind[c] # "none"
         THEN \* nothing ran, or the row landed: at most a lease retirement is owed
              /\ lease' = [lease EXCEPT ![c] = 0]
              /\ UNCHANGED <<phase, failed, rowKind, rowRev>>
         ELSE IF completed[c]
           THEN \* re-own the lease; derive the row from a run-named revision, or cut first
                /\ lease' = [lease EXCEPT ![c] = aEpoch]
                /\ SetPhase(c, IF nResult[c] = 0 THEN "finishing"
                               ELSE IF LeaseUntilRow THEN "appending" ELSE "retiring")
                /\ UNCHANGED <<failed, rowKind, rowRev>>
           ELSE \* admitted, never completed: its driver died with the anchor (RUN_ABANDONED)
                /\ failed' = [failed EXCEPT ![c] = TRUE]
                /\ rowKind' = [rowKind EXCEPT ![c] = "failed"] /\ rowRev' = [rowRev EXCEPT ![c] = 0]
                /\ lease' = [lease EXCEPT ![c] = 0]
                /\ UNCHANGED phase
    /\ UNCHANGED <<pageVars, anchorAlive, aEpoch, crashes, treeVars, graphVars, admitted, executed, completed>>

AnchorCrashes ==
    /\ anchorAlive /\ crashes < MaxCrashes
    /\ anchorAlive' = FALSE /\ crashes' = crashes + 1
    /\ phase' = [c \in Chats |-> "none"] /\ reconciling' = {}
    /\ UNCHANGED <<pageVars, aEpoch, lease, treeVars, graphVars, runVars, rowVars>>

AnchorStarts ==
    /\ ~anchorAlive
    /\ anchorAlive' = TRUE /\ aEpoch' = aEpoch + 1 /\ reconciling' = Chats
    /\ lease' = IF LeaseUntilRow THEN lease ELSE [c \in Chats |-> 0]   \* else: sweepLeases at open
    /\ UNCHANGED <<pageVars, crashes, phase, treeVars, graphVars, runVars, rowVars>>

Next ==
    \/ PageDies \/ PageOpens \/ AnchorCrashes \/ AnchorStarts
    \/ \E c \in Chats :
        \/ Focus(c) \/ PersonEdit(c) \/ ManualSave(c) \/ Gesture(c)
        \/ DeliverStart(c) \/ Place(c) \/ WriteLease(c) \/ AgentWrite(c) \/ CompleteRun(c)
        \/ Cut(c) \/ AppendRow(c) \/ RetireLease(c) \/ Reconcile(c)

Fairness ==
    /\ WF_vars(PageOpens) /\ WF_vars(AnchorStarts)
    /\ \A c \in Chats :
        /\ WF_vars(DeliverStart(c)) /\ WF_vars(Place(c)) /\ WF_vars(WriteLease(c))
        /\ WF_vars(CompleteRun(c)) /\ WF_vars(Cut(c)) /\ WF_vars(AppendRow(c))
        /\ WF_vars(RetireLease(c)) /\ WF_vars(Reconcile(c))

Spec == Init /\ [][Next]_vars /\ Fairness

\* ---------------- properties (same names as TurnSettlementToday) ----------------
AtMostOneRevisionPerTurn == \A c \in Chats : nBase[c] <= 1 /\ nResult[c] <= 1
SettlementRowNamesNewestRevision == \A c \in Chats : rowKind[c] = "fin" => rowRev[c] = newest[c]
NoSettlementOverUncommittedWork == \A c \in Chats : rowKind[c] = "fin" => ~agentDirty[c]
AgentBytesAttributedToTurn == ~stolen
NoSettlementWithoutRun == \A c \in Chats : rowKind[c] # "none" => admitted[c]
NoLeaseLeak == \A c \in Chats : (anchorAlive /\ lease[c] # 0) =>
                   \/ (lease[c] = aEpoch /\ phase[c] \in Holding)
                   \/ (lease[c] # aEpoch /\ c \in reconciling)

Safety ==
    /\ AtMostOneRevisionPerTurn /\ SettlementRowNamesNewestRevision /\ NoSettlementOverUncommittedWork
    /\ AgentBytesAttributedToTurn /\ NoSettlementWithoutRun /\ NoLeaseLeak

CompletedRunEventuallySettled == \A c \in Chats : completed[c] ~> (rowKind[c] # "none")
EveryMintedTurnHasSettlementRow == \A c \in Chats : (newest[c] # 0) ~> (rowKind[c] # "none")
LeasesEventuallyRetired == \A c \in Chats : (lease[c] # 0) ~> (lease[c] = 0)

\* ---------------- inductive invariant (IntentFirst, LeaseUntilRow, ReconcileOnView = FALSE) -------
TypeOK ==
    /\ pageAlive \in BOOLEAN /\ anchorAlive \in BOOLEAN /\ stolen \in BOOLEAN
    /\ focus \in Chats
    /\ cmd \in [Chats -> {"none", "sent", "answered"}]
    /\ gestured \in [Chats -> BOOLEAN]
    /\ phase \in [Chats -> Phases]
    /\ reconciling \in SUBSET Chats
    /\ pageDeaths \in Int /\ crashes \in Int /\ edits \in Int /\ aEpoch \in Int /\ nextRev \in Int
    /\ lease \in [Chats -> Int] /\ nBase \in [Chats -> Int] /\ nResult \in [Chats -> Int]
    /\ newest \in [Chats -> Int] /\ rowRev \in [Chats -> Int]
    /\ agentDirty \in [Chats -> BOOLEAN] /\ personDirty \in [Chats -> BOOLEAN]
    /\ admitted \in [Chats -> BOOLEAN] /\ executed \in [Chats -> BOOLEAN]
    /\ completed \in [Chats -> BOOLEAN] /\ failed \in [Chats -> BOOLEAN]
    /\ rowKind \in [Chats -> {"none", "fin", "failed"}]
    /\ aEpoch >= 1 /\ nextRev >= 1
    /\ \A c \in Chats : /\ lease[c] >= 0 /\ lease[c] <= aEpoch
                        /\ nBase[c] >= 0 /\ nResult[c] >= 0
                        /\ newest[c] >= 0 /\ newest[c] < nextRev

\* How each in-memory phase sits on the durable facts.
PhaseFacts(c) ==
    /\ phase[c] # "none" => anchorAlive
    /\ phase[c] \in {"placing", "leasing"} =>
          /\ admitted[c] /\ ~executed[c] /\ ~completed[c] /\ ~failed[c] /\ rowKind[c] = "none"
          /\ nResult[c] = 0 /\ lease[c] = 0 /\ ~agentDirty[c]
    /\ phase[c] = "placing" => nBase[c] = 0
    /\ phase[c] = "running" =>
          /\ admitted[c] /\ executed[c] /\ ~completed[c] /\ ~failed[c] /\ rowKind[c] = "none"
          /\ nResult[c] = 0
    /\ phase[c] = "finishing" =>
          /\ completed[c] /\ ~failed[c] /\ rowKind[c] = "none" /\ nResult[c] = 0
    /\ phase[c] = "appending" =>
          /\ completed[c] /\ ~failed[c] /\ rowKind[c] = "none" /\ ~agentDirty[c]
    /\ phase[c] = "retiring" => rowKind[c] # "none"
    /\ phase[c] \in Holding => lease[c] = aEpoch

DurableFacts(c) ==
    /\ executed[c] => admitted[c]
    /\ completed[c] => executed[c]
    /\ failed[c] => ~completed[c]
    /\ lease[c] # 0 => admitted[c]
    /\ agentDirty[c] => executed[c] /\ nResult[c] = 0
    /\ nResult[c] > 0 => completed[c]
    /\ agentDirty[c] /\ completed[c] => lease[c] # 0 /\ rowKind[c] = "none"
    /\ completed[c] /\ rowKind[c] = "none" => lease[c] # 0
    /\ rowKind[c] = "fin" => completed[c] /\ ~agentDirty[c]
    /\ rowKind[c] = "failed" => failed[c] /\ ~completed[c]
    /\ failed[c] => rowKind[c] = "failed"
    /\ (newest[c] = 0) <=> (nBase[c] + nResult[c] = 0)
    /\ nBase[c] > 0 => admitted[c]
    /\ (anchorAlive /\ lease[c] # 0 /\ lease[c] # aEpoch) => c \in reconciling /\ phase[c] = "none"

IndInv ==
    /\ TypeOK
    /\ Safety
    /\ \A c \in Chats : PhaseFacts(c) /\ DurableFacts(c)

\* Compact trace rows (TLC ALIAS).
ChatView(c) == [phase |-> phase[c], cmd |-> cmd[c], lease |-> lease[c],
                dirty |-> IF agentDirty[c] THEN (IF personDirty[c] THEN "agent+person" ELSE "agent")
                          ELSE IF personDirty[c] THEN "person" ELSE "clean",
                base |-> nBase[c], result |-> nResult[c], newest |-> newest[c],
                run |-> IF failed[c] THEN "failed" ELSE IF completed[c] THEN "completed"
                        ELSE IF admitted[c] THEN "admitted" ELSE "-",
                row |-> <<rowKind[c], rowRev[c]>>, reconciling |-> c \in reconciling]
TraceView == [page |-> IF pageAlive THEN "alive" ELSE "dead", focus |-> focus,
              anchor |-> IF anchorAlive THEN "alive" ELSE "dead", epoch |-> aEpoch,
              stolen |-> stolen, chat |-> [c \in TurnChats |-> ChatView(c)]]
=====================================================================================
