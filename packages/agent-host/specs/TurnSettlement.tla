---------------------------- MODULE TurnSettlement ----------------------------
(***************************************************************************)
(* The turn settlement target (W8, TS-S1): S4's target with W8's four      *)
(* refinements and the root's death alone (RV1-F1). One attempt per chat.  *)
(*                                                                         *)
(* The page is a view: it sends `start` (idempotency key = run id) and     *)
(* its death changes nothing durable. M1 (the host, per chat) reserves,    *)
(* appends the intent row and sends `admit` on the placement port; the     *)
(* root's turn actor writes the lease record `.tau/runs/<runId>.json`,     *)
(* pre-mints a dirty base, and on `complete` finds or cuts the result and  *)
(* holds the settlement; M1 appends the derived `turn.*` row and sends     *)
(* `acknowledge`, and only then does the root retire the lease. The graph  *)
(* is per-chat counts of base and result mints plus the newest id; rowKind *)
(* "fin" is turn.finalized (after a cut, whatever the outcome), "failed"   *)
(* is turn.failed (refused, released before execution, or abandoned        *)
(* without a lease). `stolen` records a person's save that minted bytes an *)
(* executed attempt wrote.                                                 *)
(*                                                                         *)
(* Switches, each TRUE in the target unless noted:                         *)
(*   IntentFirst      (S4) the intent row lands before placement; FALSE    *)
(*                    is S4's LeaseFirst (the daemon's old order).         *)
(*   ReconcileOnView  (S4) FALSE in the target: reconcile at attach, not   *)
(*                    when a view opens the chat.                          *)
(*   LeaseBeforeMint  admit writes the lease record before the pre-mint.   *)
(*   LeaseIndexed     attach reconciles the chats the lease directory and  *)
(*                    the root's live actors name, not every chat's log.   *)
(*   CutEveryTerminal every executed attempt is cut, whatever its outcome; *)
(*                    FALSE is the browser's discard.                      *)
(*   AckBeforeRetire  the lease retires only on acknowledge, after the row *)
(*                    (I19); FALSE retires at the cut (S4's RetireFirst).  *)
(*   SplitAnchor      the browser leg: the agent-host worker (M1) and the  *)
(*                    file-manager worker (the root) each die alone; FALSE *)
(*                    is the daemon leg (one process).                     *)
(*   FenceOldSession  a new host session fences the old one at the root    *)
(*                    before reconcile is answered (TS-R6).                *)
(*   DropOnFence      FALSE in the target: the alternative that stops the  *)
(*                    old session's actors and keeps only lease records.   *)
(*   Rebroker         after the root dies alone, a new placement session   *)
(*                    reaches the project host, which reconciles (RH-R16). *)
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
    ReconcileOnView,
    \* @type: Bool;
    LeaseBeforeMint,
    \* @type: Bool;
    LeaseIndexed,
    \* @type: Bool;
    CutEveryTerminal,
    \* @type: Bool;
    AckBeforeRetire,
    \* @type: Bool;
    SplitAnchor,
    \* @type: Bool;
    FenceOldSession,
    \* @type: Bool;
    DropOnFence,
    \* @type: Bool;
    Rebroker

VARIABLES
    \* ---- the page: a view ----
    \* @type: Bool;
    pageAlive,
    \* @type: Int;
    pageDeaths,
    \* @type: Str;
    focus,
    \* @type: Str -> Str;
    cmd,          \* the start command: "none" | "sent" | "answered"
    \* @type: Str -> Bool;
    gestured,
    \* ---- the host: M1 per chat (volatile) ----
    \* @type: Bool;
    hostAlive,
    \* @type: Str -> Str;
    phase,
    \* @type: Set(Str);
    reconciling,  \* chats this host session still owes a reconcile
    \* ---- the root: turn actors, the requests they hold, the tool ports they minted (volatile) ----
    \* @type: Bool;
    rootAlive,
    \* @type: Str -> Str;
    tPhase,
    \* @type: Str -> Str;
    req,          \* the port request the root holds for the chat, or its answer
    \* @type: Str -> Bool;
    portLive,
    \* @type: Int;
    crashes,
    \* ---- durable ----
    \* @type: Str -> Bool;
    lease,        \* the lease record exists
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
    admitted,     \* the intent row (attempt 1's admitted row)
    \* @type: Str -> Bool;
    executed,     \* the placement row: the run executes
    \* @type: Str -> Bool;
    completed,
    \* @type: Str -> Bool;
    failed,       \* a terminal failure row
    \* @type: Str -> Str;
    rowKind,      \* the turn.* row: "none" | "fin" | "failed"
    \* @type: Str -> Int;
    rowRev

pageVars  == <<pageAlive, pageDeaths, focus, cmd, gestured>>
hostVars  == <<hostAlive, phase, reconciling>>
rootVars  == <<rootAlive, tPhase, req, portLive>>
treeVars  == <<agentDirty, personDirty, edits>>
graphVars == <<nextRev, nBase, nResult, newest, stolen>>
\* @type: <<Str -> Bool, Str -> Bool, Str -> Bool, Str -> Bool>>;
runVars   == <<admitted, executed, completed, failed>>
rowVars   == <<rowKind, rowRev>>
vars == <<pageVars, hostVars, rootVars, crashes, lease, treeVars, graphVars, runVars, rowVars>>

HPhases == {"none", "placing", "running", "finishing", "acking"}
TPhases == {"none", "basing", "leasing", "leased", "settled"}
Reqs    == {"none", "admit", "refused", "cut", "nocut", "ack"}

Dirty(c)  == agentDirty[c] \/ personDirty[c]
Fenced(c) == lease[c]            \* heldByTurn reads the lease records on disk (the fresh fence)

Init ==
    /\ pageAlive = TRUE /\ pageDeaths = 0 /\ focus \in Chats
    /\ cmd = [c \in Chats |-> "none"] /\ gestured = [c \in Chats |-> FALSE]
    /\ hostAlive = TRUE /\ phase = [c \in Chats |-> "none"] /\ reconciling = {}
    /\ rootAlive = TRUE /\ tPhase = [c \in Chats |-> "none"] /\ req = [c \in Chats |-> "none"]
    /\ portLive = [c \in Chats |-> FALSE]
    /\ crashes = 0
    /\ lease = [c \in Chats |-> FALSE]
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
SetT(c, p)     == tPhase' = [tPhase EXCEPT ![c] = p]
\* A request sent to a dead root session is lost.
SetReq(c, r)   == req' = [req EXCEPT ![c] = IF rootAlive \/ r = "none" THEN r ELSE "none"]
Answer(c)      == cmd' = [cmd EXCEPT ![c] = IF cmd[c] = "sent" THEN "answered" ELSE cmd[c]]

\* ---------------- the person and the page ----------------
Focus(c) ==
    /\ pageAlive /\ focus # c
    /\ focus' = c
    /\ UNCHANGED <<pageAlive, pageDeaths, cmd, gestured, hostVars, rootVars, crashes, lease, treeVars, graphVars,
                   runVars, rowVars>>

PersonEdit(c) ==
    /\ pageAlive /\ edits < MaxEdits /\ ~personDirty[c]
    /\ personDirty' = [personDirty EXCEPT ![c] = TRUE] /\ edits' = edits + 1
    /\ UNCHANGED <<pageVars, hostVars, rootVars, crashes, lease, agentDirty, graphVars, runVars, rowVars>>

\* A person's save: stolen if it mints bytes an executed attempt wrote (stronger than S4's "completed").
ManualSave(c) ==
    /\ pageAlive /\ rootAlive /\ Dirty(c) /\ ~Fenced(c)
    /\ stolen' = (stolen \/ agentDirty[c])
    /\ nextRev' = nextRev + 1
    /\ agentDirty' = [agentDirty EXCEPT ![c] = FALSE]
    /\ personDirty' = [personDirty EXCEPT ![c] = FALSE]
    /\ UNCHANGED <<pageVars, hostVars, rootVars, crashes, lease, edits, nBase, nResult, newest, runVars, rowVars>>

Gesture(c) ==
    /\ pageAlive /\ c \in TurnChats /\ focus = c /\ ~gestured[c]
    /\ gestured' = [gestured EXCEPT ![c] = TRUE] /\ cmd' = [cmd EXCEPT ![c] = "sent"]
    /\ UNCHANGED <<pageAlive, pageDeaths, focus, hostVars, rootVars, crashes, lease, treeVars, graphVars, runVars,
                   rowVars>>

PageDies ==   \* a view dies; a command it had not delivered dies with it
    /\ pageAlive /\ pageDeaths < MaxPageDeaths
    /\ pageAlive' = FALSE /\ pageDeaths' = pageDeaths + 1
    /\ cmd' = [c \in Chats |-> IF cmd[c] = "sent" THEN "none" ELSE cmd[c]]
    /\ UNCHANGED <<focus, gestured, hostVars, rootVars, crashes, lease, treeVars, graphVars, runVars, rowVars>>

PageOpens ==
    /\ ~pageAlive
    /\ pageAlive' = TRUE /\ focus' \in Chats
    /\ UNCHANGED <<pageDeaths, cmd, gestured, hostVars, rootVars, crashes, lease, treeVars, graphVars, runVars,
                   rowVars>>

\* ---------------- M1 (the host) ----------------
\* Reserve, then the intent row (D15), then admit on the placement port (D9).
DeliverStart(c) ==
    /\ hostAlive /\ pageAlive /\ cmd[c] = "sent"
    /\ IF admitted[c]
         THEN /\ cmd' = [cmd EXCEPT ![c] = "answered"]      \* replayed: the command id is taken
              /\ UNCHANGED <<phase, admitted, req>>
         ELSE /\ phase[c] = "none"
              /\ admitted' = IF IntentFirst THEN [admitted EXCEPT ![c] = TRUE] ELSE admitted
              /\ cmd' = IF IntentFirst THEN [cmd EXCEPT ![c] = "answered"] ELSE cmd
              /\ SetPhase(c, "placing")
              /\ SetReq(c, "admit")
    /\ UNCHANGED <<pageAlive, pageDeaths, focus, gestured, hostAlive, reconciling, rootAlive, tPhase, portLive,
                   crashes, lease, treeVars, graphVars, executed, completed, failed, rowVars>>

\* The answer is placed: the placement row (and, without IntentFirst, the admitted row); the run executes
\* with the tool port the root minted.
Run(c) ==
    /\ hostAlive /\ phase[c] = "placing" /\ tPhase[c] = "leased"
    /\ admitted' = [admitted EXCEPT ![c] = TRUE] /\ executed' = [executed EXCEPT ![c] = TRUE]
    /\ Answer(c)
    /\ portLive' = [portLive EXCEPT ![c] = TRUE]
    /\ SetPhase(c, "running") /\ SetReq(c, "none")
    /\ UNCHANGED <<pageAlive, pageDeaths, focus, gestured, hostAlive, reconciling, rootAlive, tPhase, crashes,
                   lease, treeVars, graphVars, completed, failed, rowVars>>

\* The answer is refused: M1 appends the terminal failure (when the attempt has a row); no lease exists.
PlacementRefused(c) ==
    /\ hostAlive /\ phase[c] = "placing" /\ req[c] = "refused"
    /\ failed' = IF admitted[c] THEN [failed EXCEPT ![c] = TRUE] ELSE failed
    /\ rowKind' = IF admitted[c] THEN [rowKind EXCEPT ![c] = "failed"] ELSE rowKind
    /\ rowRev' = [rowRev EXCEPT ![c] = 0]
    /\ Answer(c)
    /\ SetPhase(c, "none") /\ SetReq(c, "none")
    /\ UNCHANGED <<pageAlive, pageDeaths, focus, gestured, hostAlive, reconciling, rootAlive, tPhase, portLive,
                   crashes, lease, treeVars, graphVars, admitted, executed, completed>>

\* The driver writes through its tool port, which dies with the root that minted it.
AgentWrite(c) ==
    /\ hostAlive /\ phase[c] = "running" /\ ~agentDirty[c] /\ rootAlive /\ portLive[c]
    /\ agentDirty' = [agentDirty EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<pageVars, hostVars, rootVars, crashes, lease, personDirty, edits, graphVars, runVars, rowVars>>

\* Terminal row, then complete{cut}.
CompleteRun(c) ==
    /\ hostAlive /\ phase[c] = "running"
    /\ completed' = [completed EXCEPT ![c] = TRUE]
    /\ SetPhase(c, "finishing") /\ SetReq(c, "cut")
    /\ UNCHANGED <<pageVars, hostAlive, reconciling, rootAlive, tPhase, portLive, crashes, lease, treeVars,
                   graphVars, admitted, executed, failed, rowVars>>

FailRun(c) ==   \* failed or cancelled while running
    /\ hostAlive /\ phase[c] = "running"
    /\ failed' = [failed EXCEPT ![c] = TRUE]
    /\ SetPhase(c, "finishing") /\ SetReq(c, IF CutEveryTerminal THEN "cut" ELSE "nocut")
    /\ UNCHANGED <<pageVars, hostAlive, reconciling, rootAlive, tPhase, portLive, crashes, lease, treeVars,
                   graphVars, admitted, executed, completed, rowVars>>

\* The settlement arrives on the stream; M1 appends the derived row, then acknowledges.
AppendRow(c) ==
    /\ hostAlive /\ phase[c] = "finishing" /\ tPhase[c] = "settled" /\ admitted[c]
    /\ rowKind' = [rowKind EXCEPT ![c] = IF req[c] = "cut" THEN "fin" ELSE "failed"]
    /\ rowRev' = [rowRev EXCEPT ![c] = IF req[c] = "cut" THEN newest[c] ELSE 0]
    /\ SetPhase(c, "acking") /\ SetReq(c, "ack")
    /\ UNCHANGED <<pageVars, hostAlive, reconciling, rootAlive, tPhase, portLive, crashes, lease, treeVars,
                   graphVars, runVars>>

\* For each chat the root names: the log and the graph decide; nothing is replayed from memory.
Reconcile(c) ==
    /\ hostAlive /\ rootAlive /\ c \in reconciling /\ phase[c] = "none"
    /\ ReconcileOnView => (pageAlive /\ focus = c)
    /\ reconciling' = reconciling \ {c}
    /\ IF rowKind[c] # "none"
         THEN IF lease[c] \/ tPhase[c] # "none"
                THEN \* the row landed, the acknowledgement did not: acknowledge again
                     /\ SetT(c, "settled") /\ SetReq(c, "ack") /\ SetPhase(c, "acking")
                     /\ UNCHANGED <<failed, rowVars>>
                ELSE UNCHANGED <<tPhase, req, phase, failed, rowVars>>
         ELSE IF ~admitted[c]
           THEN UNCHANGED <<tPhase, req, phase, failed, rowVars>>
         ELSE IF ~lease[c] /\ tPhase[c] = "none"
           THEN \* an intent that never leased: nothing to cut; a log-only failure
                /\ failed' = [failed EXCEPT ![c] = TRUE]
                /\ rowKind' = [rowKind EXCEPT ![c] = "failed"] /\ rowRev' = [rowRev EXCEPT ![c] = 0]
                /\ UNCHANGED <<tPhase, req, phase>>
           ELSE \* re-own the attempt (adopt the lease record if no actor holds it); abandon it unless it completed
                /\ failed' = IF completed[c] THEN failed ELSE [failed EXCEPT ![c] = TRUE]
                /\ tPhase' = IF tPhase[c] = "none" THEN [tPhase EXCEPT ![c] = "leased"] ELSE tPhase
                /\ req' = IF tPhase[c] = "settled" THEN req
                          ELSE [req EXCEPT ![c] = IF completed[c] \/ (executed[c] /\ CutEveryTerminal)
                                                  THEN "cut" ELSE "nocut"]
                /\ SetPhase(c, "finishing")
                /\ UNCHANGED rowVars
    /\ UNCHANGED <<pageVars, hostAlive, rootAlive, portLive, crashes, lease, treeVars, graphVars, admitted, executed,
                   completed>>

\* M1's rehydration when the chat is next touched (no fairness): an intent that never leased.
RepairOrphan(c) ==
    /\ hostAlive /\ phase[c] = "none" /\ c \notin reconciling /\ pageAlive /\ focus = c
    /\ admitted[c] /\ ~executed[c] /\ rowKind[c] = "none" /\ ~lease[c] /\ tPhase[c] = "none" /\ req[c] = "none"
    /\ failed' = [failed EXCEPT ![c] = TRUE]
    /\ rowKind' = [rowKind EXCEPT ![c] = "failed"] /\ rowRev' = [rowRev EXCEPT ![c] = 0]
    /\ UNCHANGED <<pageVars, hostVars, rootVars, crashes, lease, treeVars, graphVars, admitted, executed, completed>>

\* A port verb on a dead root session ends effect: unknown and M1 closes the chat (W7); an unknown admit is
\* failed{RUN_ABANDONED}. The next reconciliation settles whatever the lease record names.
EffectUnknownClose(c) ==
    /\ hostAlive /\ phase[c] \in {"placing", "finishing", "acking"} /\ req[c] = "none"
    /\ SetPhase(c, "none")
    /\ failed' = IF phase[c] = "placing" THEN [failed EXCEPT ![c] = TRUE] ELSE failed
    /\ UNCHANGED <<pageVars, hostAlive, reconciling, rootVars, crashes, lease, treeVars, graphVars, admitted,
                   executed, completed, rowVars>>

\* ---------------- the root (turn actors behind the placement port) ----------------
Refuse(c) ==   \* prepare refuses: no lease, no mint
    /\ rootAlive /\ req[c] = "admit" /\ tPhase[c] = "none" /\ ~lease[c]
    /\ SetReq(c, "refused")
    /\ UNCHANGED <<pageVars, hostVars, rootAlive, tPhase, portLive, crashes, lease, treeVars, graphVars, runVars,
                   rowVars>>

\* admit's two durable steps, in the order LeaseBeforeMint selects; only the first needs the request.
LeaseStep(c) ==
    /\ rootAlive
    /\ IF LeaseBeforeMint
         THEN /\ tPhase[c] = "none" /\ req[c] = "admit" /\ ~lease[c]
              /\ SetT(c, "basing")
         ELSE /\ tPhase[c] = "leasing"
              /\ SetT(c, "leased")
    /\ lease' = [lease EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<pageVars, hostVars, rootAlive, req, portLive, crashes, treeVars, graphVars, runVars, rowVars>>

BaseStep(c) ==   \* the placement pre-mint of a dirty base, attributed to the attempt
    /\ rootAlive
    /\ IF LeaseBeforeMint
         THEN /\ tPhase[c] = "basing"
              /\ SetT(c, "leased")
         ELSE /\ tPhase[c] = "none" /\ req[c] = "admit" /\ ~lease[c]
              /\ SetT(c, "leasing")
    /\ IF Dirty(c) THEN MintTurn(c, "base") ELSE NoMint
    /\ UNCHANGED <<pageVars, hostVars, rootAlive, req, portLive, crashes, lease, runVars, rowVars>>

\* complete: find-or-cut under the attempt's lease; the settlement waits in the root for acknowledge.
Cut(c) ==
    /\ rootAlive /\ tPhase[c] = "leased" /\ req[c] \in {"cut", "nocut"}
    /\ IF req[c] = "cut" /\ nResult[c] = 0 /\ Dirty(c) THEN MintTurn(c, "result") ELSE NoMint
    /\ SetT(c, "settled")
    /\ lease' = IF AckBeforeRetire THEN lease ELSE [lease EXCEPT ![c] = FALSE]
    /\ UNCHANGED <<pageVars, hostVars, rootAlive, req, portLive, crashes, runVars, rowVars>>

\* acknowledge: the row is durable, so the lease goes. A delivered acknowledgement outlives its sender.
Retire(c) ==
    /\ rootAlive /\ tPhase[c] = "settled" /\ req[c] = "ack"
    /\ lease' = [lease EXCEPT ![c] = FALSE]
    /\ SetT(c, "none") /\ SetReq(c, "none")
    /\ phase' = IF phase[c] = "acking" THEN [phase EXCEPT ![c] = "none"] ELSE phase
    /\ UNCHANGED <<pageVars, hostAlive, reconciling, rootAlive, portLive, crashes, treeVars, graphVars, runVars,
                   rowVars>>

\* complete reaching a root with no actor for the key adopts the lease record into a new actor (W5).
AdoptLease(c) ==
    /\ rootAlive /\ tPhase[c] = "none" /\ lease[c] /\ req[c] \in {"cut", "nocut"}
    /\ SetT(c, "leased")
    /\ UNCHANGED <<pageVars, hostVars, rootAlive, req, portLive, crashes, lease, treeVars, graphVars, runVars,
                   rowVars>>

\* ---------------- failures and restarts ----------------
HostCrashes ==   \* browser only: the agent-host worker dies; the root lives on
    /\ SplitAnchor /\ hostAlive /\ crashes < MaxCrashes
    /\ hostAlive' = FALSE /\ crashes' = crashes + 1
    /\ phase' = [c \in Chats |-> "none"] /\ reconciling' = {}
    /\ req' = [c \in Chats |-> IF req[c] = "refused" THEN "none" ELSE req[c]]   \* an answer in flight is lost
    /\ UNCHANGED <<pageVars, rootAlive, tPhase, portLive, lease, treeVars, graphVars, runVars, rowVars>>

HostStarts ==   \* a new session: the root refuses the old session's unstarted admits, then answers reconcile
    /\ ~hostAlive /\ rootAlive
    /\ hostAlive' = TRUE
    /\ req' = IF DropOnFence THEN [c \in Chats |-> "none"]
              ELSE IF FenceOldSession
              THEN [c \in Chats |-> IF req[c] = "admit" /\ tPhase[c] = "none" THEN "none" ELSE req[c]]
              ELSE req
    \* DropOnFence: the root stops the old session's turn actors and keeps only their lease records.
    /\ tPhase' = IF DropOnFence THEN [c \in Chats |-> "none"] ELSE tPhase
    /\ reconciling' = IF LeaseIndexed
                      THEN {c \in Chats : lease[c] \/ (~DropOnFence /\ tPhase[c] # "none")}
                      ELSE Chats
    /\ UNCHANGED <<pageVars, phase, rootAlive, portLive, crashes, lease, treeVars, graphVars, runVars, rowVars>>

AnchorCrashes ==   \* the process (daemon) or the tab's workers die together
    /\ rootAlive /\ crashes < MaxCrashes
    /\ hostAlive' = FALSE /\ rootAlive' = FALSE /\ crashes' = crashes + 1
    /\ phase' = [c \in Chats |-> "none"] /\ reconciling' = {}
    /\ tPhase' = [c \in Chats |-> "none"] /\ req' = [c \in Chats |-> "none"] /\ portLive' = [c \in Chats |-> FALSE]
    /\ UNCHANGED <<pageVars, lease, treeVars, graphVars, runVars, rowVars>>

AnchorStarts ==
    /\ ~rootAlive /\ ~hostAlive
    /\ hostAlive' = TRUE /\ rootAlive' = TRUE
    /\ reconciling' = IF LeaseIndexed THEN {c \in Chats : lease[c]} ELSE Chats
    /\ UNCHANGED <<pageVars, phase, tPhase, req, portLive, crashes, lease, treeVars, graphVars, runVars, rowVars>>

\* Browser only (RV1-F1): the file-manager worker is reloaded or dies alone while M1 lives. The restarted root
\* keeps only the lease records; the requests and answers on the dead session and the tool ports it minted go.
RootCrashes ==
    /\ SplitAnchor /\ rootAlive /\ hostAlive /\ crashes < MaxCrashes
    /\ rootAlive' = FALSE /\ crashes' = crashes + 1
    /\ tPhase' = [c \in Chats |-> "none"] /\ req' = [c \in Chats |-> "none"] /\ portLive' = [c \in Chats |-> FALSE]
    /\ UNCHANGED <<pageVars, hostVars, lease, treeVars, graphVars, runVars, rowVars>>

\* Rebroker: the new root's placement session reaches the project host, which reconciles (W6, RH-R16).
RootRestarts ==
    /\ Rebroker /\ ~rootAlive /\ hostAlive
    /\ rootAlive' = TRUE
    /\ reconciling' = reconciling \cup (IF LeaseIndexed THEN {c \in Chats : lease[c]} ELSE Chats)
    /\ UNCHANGED <<pageVars, hostAlive, phase, tPhase, req, portLive, crashes, lease, treeVars, graphVars, runVars,
                   rowVars>>

Next ==
    \/ PageDies \/ PageOpens \/ HostCrashes \/ HostStarts \/ AnchorCrashes \/ AnchorStarts
    \/ RootCrashes \/ RootRestarts
    \/ \E c \in Chats :
        \/ Focus(c) \/ PersonEdit(c) \/ ManualSave(c) \/ Gesture(c)
        \/ DeliverStart(c) \/ Run(c) \/ PlacementRefused(c) \/ AgentWrite(c) \/ CompleteRun(c) \/ FailRun(c)
        \/ AppendRow(c) \/ Reconcile(c) \/ RepairOrphan(c) \/ EffectUnknownClose(c)
        \/ Refuse(c) \/ LeaseStep(c) \/ BaseStep(c) \/ Cut(c) \/ Retire(c) \/ AdoptLease(c)

Fairness ==
    /\ WF_vars(PageOpens) /\ WF_vars(HostStarts) /\ WF_vars(AnchorStarts) /\ WF_vars(RootRestarts)
    /\ \A c \in Chats :
        /\ WF_vars(DeliverStart(c)) /\ WF_vars(Run(c)) /\ WF_vars(PlacementRefused(c))
        /\ WF_vars(CompleteRun(c)) /\ WF_vars(AppendRow(c)) /\ WF_vars(Reconcile(c)) /\ WF_vars(EffectUnknownClose(c))
        /\ WF_vars(LeaseStep(c)) /\ WF_vars(BaseStep(c)) /\ WF_vars(Cut(c)) /\ WF_vars(Retire(c))
        /\ WF_vars(AdoptLease(c))

Spec == Init /\ [][Next]_vars /\ Fairness

\* ---------------- properties ----------------
AtMostOneRevisionPerTurn == \A c \in Chats : nBase[c] <= 1 /\ nResult[c] <= 1
SettlementRowNamesNewestRevision == \A c \in Chats : rowKind[c] = "fin" => rowRev[c] = newest[c]
NoSettlementOverUncommittedWork == \A c \in Chats : rowKind[c] = "fin" => ~agentDirty[c]
AgentBytesAttributedToTurn == ~stolen
NoSettlementWithoutRun == \A c \in Chats : rowKind[c] # "none" => admitted[c]
ExecutedAttemptIsCut == \A c \in Chats : (rowKind[c] # "none" /\ executed[c]) => rowKind[c] = "fin"
\* I19 as a state predicate, and the completeness of the lease index: no rowless mint or execution without a lease.
LeaseOutlivesRowlessAttempt == \A c \in Chats : ((newest[c] # 0 \/ executed[c]) /\ rowKind[c] = "none") => lease[c]
NoLeaseLeak == \A c \in Chats : (hostAlive /\ rootAlive /\ lease[c]) => (tPhase[c] # "none" \/ c \in reconciling)

Safety ==
    /\ AtMostOneRevisionPerTurn /\ SettlementRowNamesNewestRevision /\ NoSettlementOverUncommittedWork
    /\ AgentBytesAttributedToTurn /\ NoSettlementWithoutRun /\ ExecutedAttemptIsCut
    /\ LeaseOutlivesRowlessAttempt /\ NoLeaseLeak

CompletedRunEventuallySettled == \A c \in Chats : completed[c] ~> (rowKind[c] # "none")
ExecutedRunEventuallySettled == \A c \in Chats : executed[c] ~> (rowKind[c] # "none")
EveryMintedTurnHasSettlementRow == \A c \in Chats : (newest[c] # 0) ~> (rowKind[c] # "none")
LeasesEventuallyRetired == \A c \in Chats : lease[c] ~> ~lease[c]

\* ---------------- inductive invariant (the target's switches; HostNeedsRoot is not carried, RV1-F1) -------
TypeOK ==
    /\ pageAlive \in BOOLEAN /\ hostAlive \in BOOLEAN /\ rootAlive \in BOOLEAN /\ stolen \in BOOLEAN
    /\ focus \in Chats
    /\ cmd \in [Chats -> {"none", "sent", "answered"}]
    /\ gestured \in [Chats -> BOOLEAN]
    /\ phase \in [Chats -> HPhases] /\ tPhase \in [Chats -> TPhases] /\ req \in [Chats -> Reqs]
    /\ portLive \in [Chats -> BOOLEAN]
    /\ reconciling \in SUBSET Chats
    /\ pageDeaths \in Int /\ crashes \in Int /\ edits \in Int /\ nextRev \in Int
    /\ lease \in [Chats -> BOOLEAN]
    /\ nBase \in [Chats -> Int] /\ nResult \in [Chats -> Int] /\ newest \in [Chats -> Int] /\ rowRev \in [Chats -> Int]
    /\ agentDirty \in [Chats -> BOOLEAN] /\ personDirty \in [Chats -> BOOLEAN]
    /\ admitted \in [Chats -> BOOLEAN] /\ executed \in [Chats -> BOOLEAN]
    /\ completed \in [Chats -> BOOLEAN] /\ failed \in [Chats -> BOOLEAN]
    /\ rowKind \in [Chats -> {"none", "fin", "failed"}]
    /\ nextRev >= 1
    /\ \A c \in Chats : /\ nBase[c] >= 0 /\ nResult[c] >= 0
                        /\ newest[c] >= 0 /\ newest[c] < nextRev

\* How each volatile phase sits on the durable facts.
PhaseFacts(c) ==
    /\ phase[c] # "none" => hostAlive
    /\ tPhase[c] # "none" => rootAlive
    /\ req[c] # "none" => rootAlive
    /\ portLive[c] => rootAlive /\ executed[c]
    /\ tPhase[c] # "leasing"
    /\ (phase[c] # "none" \/ req[c] # "none" \/ c \in reconciling) => admitted[c]
    /\ phase[c] = "placing" =>
          /\ admitted[c] /\ ~executed[c] /\ ~completed[c] /\ ~failed[c] /\ rowKind[c] = "none"
          /\ nResult[c] = 0 /\ ~agentDirty[c]
          /\ tPhase[c] \in {"none", "basing", "leased"} /\ req[c] \in {"none", "admit", "refused"}
    \* the tool port lives only in the root that minted it, so a running attempt with a live port is leased
    /\ phase[c] = "running" =>
          /\ executed[c] /\ ~completed[c] /\ ~failed[c] /\ rowKind[c] = "none" /\ req[c] = "none"
          /\ tPhase[c] \in {"none", "leased"}
          /\ portLive[c] => tPhase[c] = "leased"
    /\ phase[c] = "finishing" => rowKind[c] = "none" /\ req[c] \in {"none", "cut", "nocut"}
    /\ phase[c] = "acking" => rowKind[c] # "none" /\ req[c] \in {"none", "ack"}
    /\ req[c] = "admit" => ~executed[c] /\ rowKind[c] = "none"
    \* an unstarted admit belongs to the live session: HostStarts fences an older one
    /\ (req[c] = "admit" /\ tPhase[c] = "none") => c \notin reconciling /\ (hostAlive => phase[c] = "placing")
    /\ req[c] = "refused" =>
          /\ tPhase[c] = "none" /\ ~lease[c] /\ ~executed[c] /\ rowKind[c] = "none" /\ c \notin reconciling
          /\ hostAlive => phase[c] \in {"none", "placing"}
    /\ req[c] = "ack" => rowKind[c] # "none"
    /\ req[c] \in {"cut", "nocut"} => lease[c] /\ rowKind[c] = "none"
    /\ req[c] = "cut" => executed[c] /\ (completed[c] \/ failed[c])
    /\ req[c] = "nocut" => ~executed[c] /\ failed[c]
    /\ tPhase[c] \in {"basing", "leased", "settled"} => lease[c]
    /\ tPhase[c] = "basing" => ~executed[c] /\ nBase[c] = 0 /\ nResult[c] = 0 /\ rowKind[c] = "none"
    /\ tPhase[c] = "leased" => rowKind[c] = "none"
    /\ tPhase[c] = "settled" => ~agentDirty[c] /\ req[c] \in {"cut", "nocut", "ack"}

DurableFacts(c) ==
    /\ executed[c] => admitted[c]
    /\ completed[c] => executed[c]
    /\ failed[c] => admitted[c] /\ ~completed[c]
    /\ lease[c] => admitted[c]
    /\ agentDirty[c] => executed[c] /\ nResult[c] = 0 /\ lease[c] /\ rowKind[c] = "none"
    /\ nResult[c] > 0 => executed[c] /\ (completed[c] \/ failed[c])
    /\ rowKind[c] = "fin" => executed[c]
    /\ rowKind[c] = "failed" => failed[c] /\ ~executed[c]
    /\ (newest[c] = 0) <=> (nBase[c] + nResult[c] = 0)
    /\ nBase[c] > 0 => admitted[c]

\* S4's IndInv ported to the refined variables, with TS-S1's conjuncts: tPhase in {basing, leased, settled} => lease;
\* LeaseOutlivesRowlessAttempt (in Safety); req = ack => a row. S4's HostNeedsRoot is dropped, and so is the literal
\* "running => tPhase = leased": the root may die alone while M1 runs (RV1-F1), so only a running attempt whose tool
\* port lives is leased. Apalache checks that IndInv is inductive (MC_TurnSettlement).
IndInv ==
    /\ TypeOK
    /\ Safety
    /\ \A c \in Chats : PhaseFacts(c) /\ DurableFacts(c)

\* Compact trace rows (TLC ALIAS).
TraceView == [page |-> pageAlive, focus |-> focus, host |-> hostAlive, root |-> rootAlive,
              chat |-> [c \in TurnChats |-> [phase |-> phase[c], t |-> tPhase[c], req |-> req[c], lease |-> lease[c],
                                             port |-> portLive[c],
                                             dirty |-> [agent |-> agentDirty[c], person |-> personDirty[c]],
                                             base |-> nBase[c], result |-> nResult[c], newest |-> newest[c],
                                             run |-> [admitted |-> admitted[c], executed |-> executed[c],
                                                     completed |-> completed[c], failed |-> failed[c]],
                                             row |-> <<rowKind[c], rowRev[c]>>, rec |-> c \in reconciling]]]
=====================================================================================
