---------------------------- MODULE TurnSettlementToday ----------------------------
(***************************************************************************)
(* Turn placement and settlement on the browser placement as shipped      *)
(* (worktree tau-agent-substrate-v6 at 6f8b77392).                        *)
(*                                                                         *)
(* One project; each chat in Chats has at most one turn (turn id = run id  *)
(* = chat id) and its own checkout. The tab is three volatile places that  *)
(* die together: the page, the file-manager worker hosting the revision    *)
(* root (turn.machine), and one agent-host worker per stream. What         *)
(* survives a page death is OPFS: the revision graph, the lease records,   *)
(* the chat logs and the checkouts' uncommitted bytes.                     *)
(*                                                                         *)
(* The graph is abstracted to what the properties read. Per turn: how many *)
(* revisions were minted under its id before its run executed ("base",     *)
(* the D17 pre-mint at placement) and after ("result": the cut, or an E3   *)
(* re-lease pre-mint), and the newest such revision's id. A person's save  *)
(* carries no turn id; `stolen` records a save that swallowed a completed  *)
(* run's agent bytes (what E3's re-lease exists to prevent).               *)
(*                                                                         *)
(* W1, S2, S3 switch on the settlement close-out blueprint's rules S1-S3   *)
(* one by one, so the model can say what each closes.                      *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
    Chats,       \* chat ids, e.g. {"a", "b"}
    TurnChats,   \* chats whose one turn the person may start
    MaxDeaths,   \* page deaths (close, reload, crash) per behaviour
    MaxEdits,    \* person edits per behaviour
    W1,          \* Rule S1: turn.machine names its own basing pre-mint (assign revisionId on basing)
    S2,          \* Rule S2: a project-scoped settlement writer (no chat lacks one)
    S3,          \* Rule S3: reconcileTurn settles from the graph receipt before E3 re-leases
    NoDeathInSettlement, \* exploration knob: the page never dies inside a placement or settlement cycle
    IdleEditsOnly        \* exploration knob: the person edits only while the chat has no turn in flight

ASSUME TurnChats \subseteq Chats /\ MaxDeaths \in Nat /\ MaxEdits \in Nat
ASSUME {W1, S2, S3, NoDeathInSettlement, IdleEditsOnly} \subseteq BOOLEAN

VARIABLES
    \* ---- the tab (lost on page death) ----
    pageAlive, epoch, deaths, focus,
    turn,        \* root's turn.machine per chat: "none" | "preparing" | "leasing" | "leased" | "retiring"
    tRev,        \* turn.machine context.revisionId (0 = undefined)
    tBase,       \* what this actor's basing minted (0 = nothing); W1 names it
    tDone,       \* context.completionRequested (finalize asked)
    stream,      \* an agent-host worker (one per stream) is alive for the chat
    pageRun,     \* page's view of the chat's run: "none" | "completed" | "failed" | "settling"
    known,       \* latestSettlementByChat holds the run: the page treats it as settled
    reattached,  \* this page life already replayed the chat's log
    msgKind, msgRev, \* a settlement in flight root -> page -> worker ("none" = nothing)
    \* ---- durable (OPFS) ----
    lease,       \* 0, or the authority epoch the lease record .tau/runs/<runId>.json was written under
    agentDirty, personDirty, edits,
    nextRev, nBase, nResult, newest, stolen,
    gestured, admitted, executed, completed, failed,
    rowKind, rowRev  \* the chat log's settlement row: "none" | "fin" (turn.finalized) | "failed"

pageVars  == <<pageAlive, epoch, deaths, focus>>
turnVars  == <<turn, tRev, tBase, tDone>>
memVars   == <<stream, pageRun, known, reattached, msgKind, msgRev>>
treeVars  == <<agentDirty, personDirty, edits>>
graphVars == <<nextRev, nBase, nResult, newest, stolen>>
runVars   == <<gestured, admitted, executed, completed, failed>>
rowVars   == <<rowKind, rowRev>>
vars == <<pageVars, turnVars, memVars, lease, treeVars, graphVars, runVars, rowVars>>

TurnPhases == {"none", "preparing", "leasing", "leased", "retiring"}
Kinds == {"none", "fin", "failed"}

TypeOK ==
    /\ pageAlive \in BOOLEAN /\ epoch \in 1..(MaxDeaths + 1) /\ deaths \in 0..MaxDeaths /\ focus \in Chats
    /\ turn \in [Chats -> TurnPhases] /\ tRev \in [Chats -> Nat] /\ tBase \in [Chats -> Nat]
    /\ tDone \in [Chats -> BOOLEAN] /\ stream \in [Chats -> BOOLEAN]
    /\ pageRun \in [Chats -> {"none", "completed", "failed", "settling"}]
    /\ known \in [Chats -> BOOLEAN] /\ reattached \in [Chats -> BOOLEAN]
    /\ msgKind \in [Chats -> Kinds] /\ msgRev \in [Chats -> Nat]
    /\ lease \in [Chats -> Nat]
    /\ agentDirty \in [Chats -> BOOLEAN] /\ personDirty \in [Chats -> BOOLEAN] /\ edits \in 0..MaxEdits
    /\ nextRev \in Nat \ {0} /\ nBase \in [Chats -> Nat] /\ nResult \in [Chats -> Nat]
    /\ newest \in [Chats -> Nat] /\ stolen \in BOOLEAN
    /\ gestured \in [Chats -> BOOLEAN] /\ admitted \in [Chats -> BOOLEAN] /\ executed \in [Chats -> BOOLEAN]
    /\ completed \in [Chats -> BOOLEAN] /\ failed \in [Chats -> BOOLEAN]
    /\ rowKind \in [Chats -> Kinds] /\ rowRev \in [Chats -> Nat]

Init ==
    /\ pageAlive = TRUE /\ epoch = 1 /\ deaths = 0 /\ focus \in Chats
    /\ turn = [c \in Chats |-> "none"] /\ tRev = [c \in Chats |-> 0] /\ tBase = [c \in Chats |-> 0]
    /\ tDone = [c \in Chats |-> FALSE]
    /\ stream = [c \in Chats |-> FALSE] /\ pageRun = [c \in Chats |-> "none"]
    /\ known = [c \in Chats |-> FALSE] /\ reattached = [c \in Chats |-> FALSE]
    /\ msgKind = [c \in Chats |-> "none"] /\ msgRev = [c \in Chats |-> 0]
    /\ lease = [c \in Chats |-> 0]
    /\ agentDirty = [c \in Chats |-> FALSE] /\ personDirty = [c \in Chats |-> FALSE] /\ edits = 0
    /\ nextRev = 1 /\ nBase = [c \in Chats |-> 0] /\ nResult = [c \in Chats |-> 0]
    /\ newest = [c \in Chats |-> 0] /\ stolen = FALSE
    /\ gestured = [c \in Chats |-> FALSE] /\ admitted = [c \in Chats |-> FALSE]
    /\ executed = [c \in Chats |-> FALSE] /\ completed = [c \in Chats |-> FALSE]
    /\ failed = [c \in Chats |-> FALSE]
    /\ rowKind = [c \in Chats |-> "none"] /\ rowRev = [c \in Chats |-> 0]

Dirty(c) == agentDirty[c] \/ personDirty[c]

\* checkout.machine mints the whole checkout under this turn's id; the tree becomes the head.
MintTurn(c, kind) ==
    /\ nextRev' = nextRev + 1
    /\ newest' = [newest EXCEPT ![c] = nextRev]
    /\ nBase' = IF kind = "base" THEN [nBase EXCEPT ![c] = @ + 1] ELSE nBase
    /\ nResult' = IF kind = "result" THEN [nResult EXCEPT ![c] = @ + 1] ELSE nResult
    /\ agentDirty' = [agentDirty EXCEPT ![c] = FALSE]
    /\ personDirty' = [personDirty EXCEPT ![c] = FALSE]
    /\ UNCHANGED <<stolen, edits>>
NoMint == UNCHANGED <<treeVars, graphVars>>

\* checkouts' heldByTurn: only a live turn actor fences a manual save.
HeldByTurn(c) == turn[c] \in {"leased", "retiring"}

\* ---------------- the person ----------------
Focus(c) ==
    /\ pageAlive /\ focus # c
    /\ focus' = c
    /\ UNCHANGED <<pageAlive, epoch, deaths, turnVars, memVars, lease, treeVars, graphVars, runVars, rowVars>>

PersonEdit(c) ==
    /\ pageAlive /\ edits < MaxEdits /\ ~personDirty[c]
    /\ IdleEditsOnly => (turn[c] = "none" /\ ~stream[c])
    /\ personDirty' = [personDirty EXCEPT ![c] = TRUE] /\ edits' = edits + 1
    /\ UNCHANGED <<pageVars, turnVars, memVars, lease, agentDirty, graphVars, runVars, rowVars>>

ManualSave(c) ==
    /\ pageAlive /\ Dirty(c) /\ ~HeldByTurn(c)
    /\ stolen' = (stolen \/ (agentDirty[c] /\ completed[c]))
    /\ nextRev' = nextRev + 1
    /\ agentDirty' = [agentDirty EXCEPT ![c] = FALSE]
    /\ personDirty' = [personDirty EXCEPT ![c] = FALSE]
    /\ UNCHANGED <<pageVars, turnVars, memVars, lease, edits, nBase, nResult, newest, runVars, rowVars>>

Gesture(c) ==   \* the focused chat's composer: the page asks the root to prepare the turn
    /\ pageAlive /\ c \in TurnChats /\ focus = c /\ ~gestured[c]
    /\ gestured' = [gestured EXCEPT ![c] = TRUE]
    /\ turn' = [turn EXCEPT ![c] = "preparing"]
    /\ UNCHANGED <<pageVars, tRev, tBase, tDone, memVars, lease, treeVars, graphVars,
                   admitted, executed, completed, failed, rowVars>>

\* ---------------- revision root (file-manager worker) ----------------
Prepare(c) ==   \* prepare + basing: a dirty tree is minted under this turn's id first (D17)
    /\ pageAlive /\ turn[c] = "preparing"
    /\ IF Dirty(c)
         THEN /\ MintTurn(c, IF executed[c] THEN "result" ELSE "base")
              /\ tBase' = [tBase EXCEPT ![c] = nextRev]
         ELSE /\ NoMint /\ UNCHANGED tBase
    /\ turn' = [turn EXCEPT ![c] = "leasing"]
    /\ UNCHANGED <<pageVars, tRev, tDone, memVars, lease, runVars, rowVars>>

WriteLease(c) ==
    /\ pageAlive /\ turn[c] = "leasing"
    /\ lease' = [lease EXCEPT ![c] = epoch]
    /\ turn' = [turn EXCEPT ![c] = "leased"]
    /\ UNCHANGED <<pageVars, tRev, tBase, tDone, memVars, treeVars, graphVars, runVars, rowVars>>

Cut(c) ==   \* finalizing: capture, merge, cut; requesting.nothingToSave keeps context.revisionId
    /\ pageAlive /\ turn[c] = "leased" /\ tDone[c]
    /\ IF Dirty(c)
         THEN /\ MintTurn(c, "result")
              /\ tRev' = [tRev EXCEPT ![c] = nextRev]
         ELSE /\ NoMint
              /\ tRev' = [tRev EXCEPT ![c] = IF W1 THEN tBase[c] ELSE @]
    /\ turn' = [turn EXCEPT ![c] = "retiring"]
    /\ UNCHANGED <<pageVars, tBase, tDone, memVars, lease, runVars, rowVars>>

RetireAndEmit(c) ==   \* retiring drops the lease, then `finalized` emits (the lease retires before the row)
    /\ pageAlive /\ turn[c] = "retiring"
    /\ lease' = [lease EXCEPT ![c] = 0]
    /\ msgKind' = [msgKind EXCEPT ![c] = "fin"] /\ msgRev' = [msgRev EXCEPT ![c] = tRev[c]]
    /\ turn' = [turn EXCEPT ![c] = "none"] /\ tRev' = [tRev EXCEPT ![c] = 0]
    /\ tBase' = [tBase EXCEPT ![c] = 0] /\ tDone' = [tDone EXCEPT ![c] = FALSE]
    /\ UNCHANGED <<pageVars, stream, pageRun, known, reattached, treeVars, graphVars, runVars, rowVars>>

\* ---------------- agent-host worker (one per stream) ----------------
StartRun(c) ==   \* the stream spawns a worker; `start` appends run.lifecycle admitted
    /\ pageAlive /\ turn[c] = "leased" /\ ~admitted[c] /\ ~stream[c]
    /\ stream' = [stream EXCEPT ![c] = TRUE]
    /\ admitted' = [admitted EXCEPT ![c] = TRUE] /\ executed' = [executed EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<pageVars, turnVars, pageRun, known, reattached, msgKind, msgRev, lease, treeVars,
                   graphVars, gestured, completed, failed, rowVars>>

AgentWrite(c) ==   \* tool writes: worker -> page bridge -> file-manager worker -> OPFS
    /\ stream[c] /\ admitted[c] /\ ~completed[c] /\ ~failed[c] /\ ~agentDirty[c]
    /\ agentDirty' = [agentDirty EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<pageVars, turnVars, memVars, lease, personDirty, edits, graphVars, runVars, rowVars>>

CompleteRun(c) ==
    /\ stream[c] /\ admitted[c] /\ ~completed[c] /\ ~failed[c]
    /\ completed' = [completed EXCEPT ![c] = TRUE]
    /\ pageRun' = [pageRun EXCEPT ![c] = "completed"]
    /\ UNCHANGED <<pageVars, turnVars, stream, known, reattached, msgKind, msgRev, lease, treeVars,
                   graphVars, gestured, admitted, executed, failed, rowVars>>

StreamClose(c) ==   \* after its settlement or its 30 s bound; the worker dies with the stream
    /\ stream[c] /\ (completed[c] \/ failed[c])
    /\ stream' = [stream EXCEPT ![c] = FALSE]
    /\ UNCHANGED <<pageVars, turnVars, pageRun, known, reattached, msgKind, msgRev, lease, treeVars,
                   graphVars, runVars, rowVars>>

\* ---------------- the page's settlement owner and relay ----------------
Settle(c) ==   \* ProjectChatRunSettlement.settle, called once from the session actor's `finishing`
    /\ pageAlive /\ ~known[c]
    /\ \/ /\ pageRun[c] = "completed" /\ turn[c] = "leased"     \* this page holds the run's lease: finalize
          /\ tDone' = [tDone EXCEPT ![c] = TRUE]
          /\ UNCHANGED <<turn, msgKind, msgRev>>
       \/ /\ pageRun[c] = "completed" /\ turn[c] = "none"       \* adopted: the lease was swept (E3)
          /\ IF S3 /\ newest[c] # 0
               THEN /\ msgKind' = [msgKind EXCEPT ![c] = "fin"] \* reconcileTurn: newest revision naming turnId
                    /\ msgRev' = [msgRev EXCEPT ![c] = newest[c]]
                    /\ UNCHANGED <<turn, tDone>>
               ELSE /\ turn' = [turn EXCEPT ![c] = "preparing"] \* re-lease (pre-mints a dirty tree), finalize
                    /\ tDone' = [tDone EXCEPT ![c] = TRUE]
                    /\ UNCHANGED <<msgKind, msgRev>>
       \/ /\ pageRun[c] = "failed"                               \* adopted failed run: record turn.failed
          /\ msgKind' = [msgKind EXCEPT ![c] = "failed"] /\ msgRev' = [msgRev EXCEPT ![c] = 0]
          /\ UNCHANGED <<turn, tDone>>
    /\ pageRun' = [pageRun EXCEPT ![c] = "settling"]
    /\ UNCHANGED <<pageVars, tRev, tBase, stream, known, reattached, lease, treeVars, graphVars,
                   runVars, rowVars>>

Relay(c) ==   \* handleRevisionEvent -> persistBrowserTurnSettlement -> record-settlement -> host append
    /\ pageAlive /\ msgKind[c] # "none"
    /\ IF stream[c] \/ focus = c \/ S2
         THEN IF ~admitted[c]
                THEN UNCHANGED <<rowKind, rowRev, known>>                   \* SETTLEMENT_WITHOUT_RUN
                ELSE IF rowKind[c] = "none"
                  THEN /\ rowKind' = [rowKind EXCEPT ![c] = msgKind[c]]
                       /\ rowRev' = [rowRev EXCEPT ![c] = msgRev[c]]
                       /\ known' = [known EXCEPT ![c] = TRUE]
                  ELSE IF rowKind[c] = msgKind[c] /\ rowRev[c] = msgRev[c]
                    THEN /\ known' = [known EXCEPT ![c] = TRUE]            \* identical repeat: no-op
                         /\ UNCHANGED <<rowKind, rowRev>>
                    ELSE UNCHANGED <<rowKind, rowRev, known>>               \* SETTLEMENT_CONFLICT
         ELSE /\ known' = [known EXCEPT ![c] = TRUE]   \* "no settlement writer is registered": false, kept in memory
              /\ UNCHANGED <<rowKind, rowRev>>
    /\ msgKind' = [msgKind EXCEPT ![c] = "none"] /\ msgRev' = [msgRev EXCEPT ![c] = 0]
    /\ pageRun' = [pageRun EXCEPT ![c] = IF @ = "settling" THEN "none" ELSE @]
    /\ UNCHANGED <<pageVars, turnVars, stream, reattached, lease, treeVars, graphVars, runVars>>

Reattach(c) ==   \* chat-open discovery: a fresh worker replays the log (a first attach is a takeover)
    /\ pageAlive /\ ~reattached[c] /\ ~stream[c] /\ pageRun[c] = "none" /\ turn[c] = "none"
    /\ reattached' = [reattached EXCEPT ![c] = TRUE]
    /\ LET k == known[c] \/ rowKind[c] # "none"
       IN /\ known' = [known EXCEPT ![c] = k]
          /\ IF admitted[c] /\ ~completed[c] /\ ~failed[c]
               THEN /\ failed' = [failed EXCEPT ![c] = TRUE]            \* takeover records RUN_ABANDONED (I4)
                    /\ pageRun' = [pageRun EXCEPT ![c] = IF k THEN "none" ELSE "failed"]
               ELSE /\ pageRun' = [pageRun EXCEPT ![c] = IF completed[c] /\ ~k THEN "completed" ELSE "none"]
                    /\ UNCHANGED failed
    /\ UNCHANGED <<pageVars, turnVars, stream, msgKind, msgRev, lease, treeVars, graphVars,
                   gestured, admitted, executed, completed, rowVars>>

\* ---------------- the tab's life ----------------
InSettlementCycle ==
    \E c \in Chats : turn[c] \in {"preparing", "leasing", "retiring"} \/ msgKind[c] # "none" \/ pageRun[c] = "settling"

PageDies ==
    /\ pageAlive /\ deaths < MaxDeaths
    /\ NoDeathInSettlement => ~InSettlementCycle
    /\ pageAlive' = FALSE /\ deaths' = deaths + 1
    /\ turn' = [c \in Chats |-> "none"] /\ tRev' = [c \in Chats |-> 0] /\ tBase' = [c \in Chats |-> 0]
    /\ tDone' = [c \in Chats |-> FALSE]
    /\ stream' = [c \in Chats |-> FALSE] /\ pageRun' = [c \in Chats |-> "none"]
    /\ known' = [c \in Chats |-> FALSE] /\ reattached' = [c \in Chats |-> FALSE]
    /\ msgKind' = [c \in Chats |-> "none"] /\ msgRev' = [c \in Chats |-> 0]
    /\ UNCHANGED <<epoch, focus, lease, treeVars, graphVars, runVars, rowVars>>

PageOpens ==   \* a new file-manager worker and authority epoch; sweepLeases retires every older lease
    /\ ~pageAlive
    /\ pageAlive' = TRUE /\ epoch' = epoch + 1 /\ focus' \in Chats
    /\ lease' = [c \in Chats |-> 0]
    /\ UNCHANGED <<deaths, turnVars, memVars, treeVars, graphVars, runVars, rowVars>>

Next ==
    \/ PageDies \/ PageOpens
    \/ \E c \in Chats :
        \/ Focus(c) \/ PersonEdit(c) \/ ManualSave(c) \/ Gesture(c)
        \/ Prepare(c) \/ WriteLease(c) \/ Cut(c) \/ RetireAndEmit(c)
        \/ StartRun(c) \/ AgentWrite(c) \/ CompleteRun(c) \/ StreamClose(c)
        \/ Settle(c) \/ Relay(c) \/ Reattach(c)

\* The person's acts (focus, edits, saves, gestures) and failures are not obligations.
Fairness ==
    /\ WF_vars(PageOpens)
    /\ \A c \in Chats :
        /\ WF_vars(Prepare(c)) /\ WF_vars(WriteLease(c)) /\ WF_vars(Cut(c)) /\ WF_vars(RetireAndEmit(c))
        /\ WF_vars(StartRun(c)) /\ WF_vars(CompleteRun(c)) /\ WF_vars(StreamClose(c))
        /\ WF_vars(Settle(c)) /\ WF_vars(Relay(c)) /\ WF_vars(Reattach(c))

Spec == Init /\ [][Next]_vars /\ Fairness

\* ---------------- properties ----------------
\* Policy as amended by O1-b: a turn's placement may mint the base it found dirty; beyond that
\* the turn yields at most one revision (its lease's cut, or E3's pre-mint of the run's bytes).
AtMostOneRevisionPerTurn == \A c \in Chats : nBase[c] <= 1 /\ nResult[c] <= 1

\* O1: the turn.finalized row names the newest revision minted under the turn's id.
SettlementRowNamesNewestRevision == \A c \in Chats : rowKind[c] = "fin" => rowRev[c] = newest[c]

\* A turn is never recorded settled while its completed run's bytes are still uncommitted.
NoSettlementOverUncommittedWork == \A c \in Chats : rowKind[c] = "fin" => ~agentDirty[c]

\* A completed run's bytes are never minted as a person's save (E3's reason to exist).
AgentBytesAttributedToTurn == ~stolen

NoSettlementWithoutRun == \A c \in Chats : rowKind[c] # "none" => admitted[c]

\* A lease written by the live page is held by a live turn actor; older epochs' are swept at open.
NoLeaseLeak == \A c \in Chats : (pageAlive /\ lease[c] # 0) => (lease[c] = epoch /\ HeldByTurn(c))

StreamsDieWithPage == \A c \in Chats : stream[c] => pageAlive

CompletedRunEventuallySettled == \A c \in Chats : completed[c] ~> (rowKind[c] # "none")
EveryMintedTurnHasSettlementRow == \A c \in Chats : (newest[c] # 0) ~> (rowKind[c] # "none")
LeasesEventuallyRetired == \A c \in Chats : (lease[c] # 0) ~> (lease[c] = 0)

\* Compact trace rows (TLC ALIAS): per turn chat, the facts the properties read.
ChatView(c) == [turn |-> turn[c], lease |-> lease[c], dirty |-> <<agentDirty[c], personDirty[c]>>,
                baseResultNewest |-> <<nBase[c], nResult[c], newest[c]>>,
                admittedCompletedFailed |-> <<admitted[c], completed[c], failed[c]>>,
                row |-> <<rowKind[c], rowRev[c]>>, msg |-> <<msgKind[c], msgRev[c]>>,
                pageRun |-> pageRun[c], known |-> known[c], stream |-> stream[c]]
TraceView == [page |-> IF pageAlive THEN "alive" ELSE "dead", epoch |-> epoch, focus |-> focus,
              stolen |-> stolen, chat |-> [c \in TurnChats |-> ChatView(c)]]
=====================================================================================
