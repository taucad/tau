---------------------------- MODULE TurnSettlementSteal ----------------------------
(***************************************************************************)
(* RV2's two-tab probe, promoted by W8 TS-S1 (RV2-F1). W8's two-tab        *)
(* instance (TurnSettlementTabs.tla),                                      *)
(* extended with what it leaves out (W8 TS-Q4):                            *)
(*  - each tab has its own revisions root (its dedicated file-manager      *)
(*    worker): the turn actor, its tool port and its published settlement  *)
(*    live and die with the tab, not with the agent-host worker (TS-R6);   *)
(*  - placement is not atomic: intent row, then the root's lease write,    *)
(*    then its base cut, then attempt 1's running row (W5 RM-R12, W7);     *)
(*  - freeze and thaw of a whole tab, and steal from a frozen leader by a  *)
(*    tab with a pending command, delivered as a later notice (W6 RH-R12, *)
(*    S7): until it notices, the victim acts on its belief;                *)
(*  - the agent-host worker dying alone while its tab's root lives; the    *)
(*    browser releases its lock and the page starts a new one (RH-R14);    *)
(*  - adoption of a lease record by a root with no actor for the key (W5   *)
(*    RM-R14) and acknowledge without an actor (W8 TS-R5).                 *)
(* The log is its length with W3's conditional append (CL-R11): an append  *)
(* lands only if the writer's view is the whole log; otherwise LOG_FENCED  *)
(* and the writer rereads while it believes it holds the lock (RH-R9).     *)
(* W8's reconciliation table is decided on the read, before any command is *)
(* served; a decision that needs no append (complete after a terminal row, *)
(* acknowledge after a turn.* row) is sent before the claim, as written.   *)
(* One project, one chat, one attempt.                                     *)
(*                                                                         *)
(* Switches:                                                               *)
(*   AllowSteal      steal from a frozen holder by a tab with a command    *)
(*   AllowHostDeath  the agent-host worker dies alone                      *)
(*   HolderMark      the correction under test (v2): the lease record names *)
(*                   its holder root, whose liveness mark (a Web Lock held *)
(*                   for the root's life) others probe. A root adopts or   *)
(*                   retires the record only when the named holder is      *)
(*                   itself or gone, re-stamping it atomically (under the  *)
(*                   per-ref lock); a leader settles nothing while another *)
(*                   live root holds the attempt (or, before the record,   *)
(*                   the intent's root lives), appending at most the log   *)
(*                   abandonment; a tab whose root holds an attempt queues *)
(*                   to lead. v1 keyed the mark by the intent's tab only.  *)
(*   RootHeld        the root's in-process heldByTurn save fence (W5 R7)   *)
(*   NoticeFirst     W6 RH-Q10's assumption: a thawed victim's M1 takes no *)
(*                   step before its steal notice (tool writes still may)  *)
(*   PortChecksLease W8 TS-Q4's proposal: the tool port applies a write    *)
(*                   only while the attempt's lease record exists          *)
(* v3 adds AttachReads (RH-R1, RH-R16, RH-R18) in every configuration;     *)
(* v4 lets a retried refused save re-report leaseHeld and queue (TS-R17).  *)
(***************************************************************************)
EXTENDS Integers

CONSTANTS Tabs, MaxDeaths, MaxFreezes, MaxHostDeaths, MaxEdits, MaxWants,
          AllowSteal, AllowHostDeath, HolderMark, RootHeld, NoticeFirst, PortChecksLease

None == "none"

VARIABLES
    open, frozen, host, deaths, freezes, hostDeaths,        \* environment
    lock, holds, queued, pend, wants,                       \* the chat's Web Lock; beliefs; queue
    m1, plan, view, logLen,                                 \* M1 per tab; the log's length
    gestured, admitted, intentTab, placed, term,            \* durable log facts
    rowKind, rowNames, rowAt, nRows,
    lease, holder, nBase, nResult, mintAfterRow, liveRetired, \* durable lease record (and its holder root) and graph
    agentDirty, personDirty, edits, stolen, wantSave,       \* durable tree; the person's saves
    tp, tverb, port, know, pub                              \* per-tab root

envV  == <<open, frozen, host, deaths, freezes, hostDeaths>>
lockV == <<lock, holds, queued, pend, wants>>
m1V   == <<m1, plan, view, logLen>>
logV  == <<gestured, admitted, intentTab, placed, term, rowKind, rowNames, rowAt, nRows>>
durV  == <<lease, holder, nBase, nResult, mintAfterRow, liveRetired>>
treeV == <<agentDirty, personDirty, edits, stolen, wantSave>>
rootV == <<tp, tverb, port, know, pub>>
vars  == <<envV, lockV, m1V, logV, durV, treeV, rootV>>

M1Phases == {"none", "reading", "claiming", "idle", "placing", "running", "finishing", "acking"}
TPhases  == {"none", "writing", "basing", "held", "settled"}
Pubs     == {"none", "fin-result", "fin-base", "fin-none", "failed-base", "failed-none", "unknown", "held"}
Gone     == "gone"   \* a root instance that no longer exists: its mark is free (a reopened tab is a new root)

Dirty == agentDirty \/ personDirty
Runs(t) == open[t] /\ ~frozen[t]                     \* the tab's workers take steps
HostUp(t) == Runs(t) /\ host[t]
CanAppend(t) == view[t] = logLen
Appended(t) == logLen' = logLen + 1 /\ view' = [view EXCEPT ![t] = logLen + 1]
\* HolderMark: another live root holds the record (or, before the record exists, the intent's root lives)
OtherHolder(t) == HolderMark /\ LET h == IF lease THEN holder ELSE intentTab IN h \in Tabs /\ h # t
\* HolderMark at the root: the record's named holder is this root or gone (probe ifAvailable under the per-ref lock)
MarkFree(t) == ~HolderMark \/ holder \notin Tabs \/ holder = t
\* NoticeFirst, W6 RH-Q10's assumption: a thawed victim's steal notice runs before any read or append it starts
Believes(t) == ~NoticeFirst \/ lock = t
\* why a project host asks leadership to reconcile the chat (RH-R16, RH-R1); HolderMark adds its own root's actor
NeedsRecon(t) == lease \/ (admitted /\ term = "none") \/ (HolderMark /\ tp[t] # "none")
LiveActorElsewhere(t) == \E u \in Tabs : u # t /\ open[u] /\ tp[u] \in {"writing", "basing", "held"}
KindOf(p) == IF p \in {"fin-result", "fin-base", "fin-none"} THEN "fin" ELSE "failed"
NamesOf(p) == IF p = "fin-result" THEN "result"
              ELSE IF p \in {"fin-base", "failed-base"} THEN "base" ELSE "none"
\* LOG_FENCED: nothing written; M1 fences (its tool port is abandoned) and M2 rereads on its belief
FencedStep(t) == /\ port' = [port EXCEPT ![t] = FALSE] /\ m1' = [m1 EXCEPT ![t] = "reading"]

Init ==
    /\ open = [t \in Tabs |-> FALSE] /\ frozen = [t \in Tabs |-> FALSE] /\ host = [t \in Tabs |-> FALSE]
    /\ deaths = 0 /\ freezes = 0 /\ hostDeaths = 0
    /\ lock = None /\ holds = [t \in Tabs |-> FALSE] /\ queued = {} /\ pend = [t \in Tabs |-> FALSE] /\ wants = 0
    /\ m1 = [t \in Tabs |-> "none"] /\ plan = [t \in Tabs |-> "none"] /\ view = [t \in Tabs |-> 0] /\ logLen = 0
    /\ gestured = None /\ admitted = FALSE /\ intentTab = None /\ placed = FALSE /\ term = "none"
    /\ rowKind = "none" /\ rowNames = "none" /\ rowAt = 0 /\ nRows = 0
    /\ lease = FALSE /\ holder = None /\ nBase = 0 /\ nResult = 0 /\ mintAfterRow = FALSE /\ liveRetired = FALSE
    /\ agentDirty = FALSE /\ personDirty = FALSE /\ edits = 0 /\ stolen = FALSE /\ wantSave = [t \in Tabs |-> FALSE]
    /\ tp = [t \in Tabs |-> "none"] /\ tverb = [t \in Tabs |-> "none"] /\ port = [t \in Tabs |-> FALSE]
    /\ know = [t \in Tabs |-> FALSE] /\ pub = [t \in Tabs |-> "none"]

\* ---------------- environment ----------------
\* A tab opens the project (root, agent-host worker, placement session). The project host reconciles:
\* reconcile{wait: true} is granted at once if the lock is free, and queues otherwise (RH-R16, TS-R16).
Open(t) ==
    /\ ~open[t]
    /\ open' = [open EXCEPT ![t] = TRUE] /\ host' = [host EXCEPT ![t] = TRUE]
    /\ IF NeedsRecon(t)
         THEN IF lock = None
                THEN /\ lock' = t /\ holds' = [holds EXCEPT ![t] = TRUE]
                     /\ m1' = [m1 EXCEPT ![t] = "reading"] /\ UNCHANGED queued
                ELSE /\ queued' = queued \cup {t} /\ UNCHANGED <<lock, holds, m1>>
         ELSE UNCHANGED <<lock, holds, queued, m1>>
    /\ UNCHANGED <<frozen, deaths, freezes, hostDeaths, pend, wants, plan, view, logLen, logV, durV, treeV, rootV>>

\* The tab dies (closed, discarded, crashed): its workers go and the browser releases its locks.
TabDies(t) ==
    /\ open[t] /\ deaths < MaxDeaths
    /\ open' = [open EXCEPT ![t] = FALSE] /\ frozen' = [frozen EXCEPT ![t] = FALSE]
    /\ host' = [host EXCEPT ![t] = FALSE] /\ deaths' = deaths + 1
    /\ lock' = IF lock = t THEN None ELSE lock
    /\ holds' = [holds EXCEPT ![t] = FALSE] /\ queued' = queued \ {t} /\ pend' = [pend EXCEPT ![t] = FALSE]
    /\ m1' = [m1 EXCEPT ![t] = "none"] /\ plan' = [plan EXCEPT ![t] = "none"] /\ view' = [view EXCEPT ![t] = 0]
    /\ tp' = [tp EXCEPT ![t] = "none"] /\ tverb' = [tverb EXCEPT ![t] = "none"]
    /\ port' = [port EXCEPT ![t] = FALSE] /\ know' = [know EXCEPT ![t] = FALSE] /\ pub' = [pub EXCEPT ![t] = "none"]
    /\ wantSave' = [wantSave EXCEPT ![t] = FALSE]
    /\ holder' = IF holder = t THEN Gone ELSE holder            \* the root's mark is released with it
    /\ intentTab' = IF intentTab = t THEN Gone ELSE intentTab
    /\ UNCHANGED <<freezes, hostDeaths, wants, logLen, gestured, admitted, placed, term, rowKind, rowNames, rowAt, nRows,
                   lease, nBase, nResult, mintAfterRow, liveRetired, agentDirty, personDirty, edits, stolen>>

Freeze(t) ==
    /\ Runs(t) /\ freezes < MaxFreezes
    /\ frozen' = [frozen EXCEPT ![t] = TRUE] /\ freezes' = freezes + 1
    /\ UNCHANGED <<open, host, deaths, hostDeaths, lockV, m1V, logV, durV, treeV, rootV>>

Thaw(t) ==
    /\ open[t] /\ frozen[t]
    /\ frozen' = [frozen EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<open, host, deaths, freezes, hostDeaths, lockV, m1V, logV, durV, treeV, rootV>>

\* The agent-host worker dies alone (a crash, or a false death the page acts on); its root lives on.
HostDies(t) ==
    /\ AllowHostDeath /\ HostUp(t) /\ hostDeaths < MaxHostDeaths
    /\ host' = [host EXCEPT ![t] = FALSE] /\ hostDeaths' = hostDeaths + 1
    /\ lock' = IF lock = t THEN None ELSE lock        \* the browser releases the terminated worker's locks
    /\ holds' = [holds EXCEPT ![t] = FALSE] /\ queued' = queued \ {t} /\ pend' = [pend EXCEPT ![t] = FALSE]
    /\ m1' = [m1 EXCEPT ![t] = "none"] /\ plan' = [plan EXCEPT ![t] = "none"] /\ view' = [view EXCEPT ![t] = 0]
    /\ UNCHANGED <<open, frozen, deaths, freezes, wants, logLen, logV, durV, treeV, rootV>>

\* The page starts a new agent-host worker. Its session's hello fences the old one at this tab's root:
\* the old tool port is revoked and the actors are kept (TS-R6). The project host reconciles (RH-R16).
HostStarts(t) ==
    /\ Runs(t) /\ ~host[t]
    /\ host' = [host EXCEPT ![t] = TRUE] /\ port' = [port EXCEPT ![t] = FALSE]
    /\ IF NeedsRecon(t)
         THEN IF lock = None
                THEN /\ lock' = t /\ holds' = [holds EXCEPT ![t] = TRUE]
                     /\ m1' = [m1 EXCEPT ![t] = "reading"] /\ UNCHANGED queued
                ELSE /\ queued' = queued \cup {t} /\ UNCHANGED <<lock, holds, m1>>
         ELSE UNCHANGED <<lock, holds, queued, m1>>
    /\ UNCHANGED <<open, frozen, deaths, freezes, hostDeaths, pend, wants, plan, view, logLen, logV, durV, treeV,
                   tp, tverb, know, pub>>

\* ---------------- leadership (M2) ----------------
Grant(t) ==   \* a queued plain request is granted once the lock is free
    /\ HostUp(t) /\ lock = None /\ t \in queued /\ ~holds[t]
    /\ lock' = t /\ holds' = [holds EXCEPT ![t] = TRUE] /\ queued' = queued \ {t}
    /\ m1' = [m1 EXCEPT ![t] = "reading"]
    /\ UNCHANGED <<envV, pend, wants, plan, view, logLen, logV, durV, treeV, rootV>>

\* A person's write command in a tab that does not hold the lock (Stop, or a message to the chat).
Want(t) ==
    /\ HostUp(t) /\ ~pend[t] /\ wants < MaxWants /\ lock \in Tabs /\ lock # t /\ ~holds[t]
    /\ pend' = [pend EXCEPT ![t] = TRUE] /\ wants' = wants + 1
    /\ UNCHANGED <<envV, lock, holds, queued, m1V, logV, durV, treeV, rootV>>

Forwarded(t) ==   \* a live holder serves the forwarded command (its own effect is not modelled)
    /\ HostUp(t) /\ pend[t] /\ lock \in Tabs /\ lock # t /\ HostUp(lock)
    /\ pend' = [pend EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<envV, lock, holds, queued, wants, m1V, logV, durV, treeV, rootV>>

\* RH-R12: a tab with a pending command steals from a silent (frozen) holder; the victim learns later.
Steal(t) ==
    /\ AllowSteal /\ HostUp(t) /\ pend[t] /\ lock \in Tabs /\ lock # t /\ frozen[lock]
    /\ lock' = t /\ holds' = [holds EXCEPT ![t] = TRUE] /\ queued' = queued \ {t}
    /\ m1' = [m1 EXCEPT ![t] = "reading"]
    /\ UNCHANGED <<envV, pend, wants, plan, view, logLen, logV, durV, treeV, rootV>>

\* The steal notice, once the tab runs: M2 relinquishes; M1 fences and abandons its tool port (TS-R15).
\* The root's turn actor is untouched: nothing addresses it.
Notice(t) ==
    /\ HostUp(t) /\ holds[t] /\ lock # t
    /\ holds' = [holds EXCEPT ![t] = FALSE] /\ m1' = [m1 EXCEPT ![t] = "none"]
    /\ port' = [port EXCEPT ![t] = FALSE]
    /\ queued' = IF NeedsRecon(t) /\ HolderMark THEN queued \cup {t} ELSE queued
    /\ UNCHANGED <<envV, lock, pend, wants, plan, view, logLen, logV, durV, treeV, tp, tverb, know, pub>>

Release(t) ==   \* M1 quiescent (RH-R8): the lock goes
    /\ HostUp(t) /\ holds[t] /\ m1[t] = "idle" /\ ~pend[t] /\ ~(gestured = t /\ ~admitted)
    /\ lock' = IF lock = t THEN None ELSE lock
    /\ holds' = [holds EXCEPT ![t] = FALSE] /\ m1' = [m1 EXCEPT ![t] = "none"]
    /\ UNCHANGED <<envV, queued, pend, wants, plan, view, logLen, logV, durV, treeV, rootV>>

\* W6 RH-R1, RH-R16, RH-R18 (v3): an attach, or a relinquished leader's re-read, whose read shows a run admitted or
\* running with no driver in this process asks leadership to reconcile: a free lock is granted, otherwise it queues.
AttachReads(t) ==
    /\ HostUp(t) /\ ~holds[t] /\ m1[t] = "none" /\ t \notin queued /\ admitted /\ term = "none"
    /\ IF lock = None
         THEN /\ lock' = t /\ holds' = [holds EXCEPT ![t] = TRUE] /\ m1' = [m1 EXCEPT ![t] = "reading"]
              /\ UNCHANGED queued
         ELSE /\ queued' = queued \cup {t} /\ UNCHANGED <<lock, holds, m1>>
    /\ UNCHANGED <<envV, pend, wants, plan, view, logLen, logV, durV, treeV, rootV>>

\* ---------------- M1 ----------------
\* The person's gesture in a tab: the write command takes the free lock (ifAvailable) and reads.
Gesture(t) ==
    /\ HostUp(t) /\ gestured = None /\ lock = None /\ ~holds[t] /\ m1[t] = "none"
    /\ gestured' = t /\ lock' = t /\ holds' = [holds EXCEPT ![t] = TRUE] /\ queued' = queued \ {t}
    /\ m1' = [m1 EXCEPT ![t] = "reading"]
    /\ UNCHANGED <<envV, pend, wants, plan, view, logLen, admitted, intentTab, placed, term,
                   rowKind, rowNames, rowAt, nRows, durV, treeV, rootV>>

\* Read under the lock (on belief), then W8's reconciliation table, decided on this read (D10, TS-R16).
ReadDecide(t) ==
    /\ HostUp(t) /\ holds[t] /\ m1[t] = "reading" /\ Believes(t)
    /\ view' = [view EXCEPT ![t] = logLen]
    /\ CASE ~admitted ->
              /\ m1' = [m1 EXCEPT ![t] = "idle"] /\ UNCHANGED <<plan, tverb>>
         [] OtherHolder(t) /\ (rowKind = "none" \/ lease) ->                 \* correction only
              IF term = "none" /\ rowKind = "none"
                THEN /\ m1' = [m1 EXCEPT ![t] = "claiming"] /\ plan' = [plan EXCEPT ![t] = "idle"]
                     /\ UNCHANGED tverb
                ELSE /\ m1' = [m1 EXCEPT ![t] = "idle"] /\ UNCHANGED <<plan, tverb>>
         [] rowKind # "none" /\ lease ->                                       \* acknowledge
              /\ tverb' = [tverb EXCEPT ![t] = "ack"] /\ m1' = [m1 EXCEPT ![t] = "acking"] /\ UNCHANGED plan
         [] rowKind # "none" ->
              /\ m1' = [m1 EXCEPT ![t] = "idle"] /\ UNCHANGED <<plan, tverb>>
         [] term # "none" /\ (lease \/ tp[t] # "none") ->                      \* complete, before any append
              /\ tverb' = [tverb EXCEPT ![t] = IF placed THEN "cut" ELSE "nocut"]
              /\ m1' = [m1 EXCEPT ![t] = "finishing"] /\ UNCHANGED plan
         [] lease \/ tp[t] # "none" ->                                         \* RUN_ABANDONED claims, then complete
              /\ m1' = [m1 EXCEPT ![t] = "claiming"]
              /\ plan' = [plan EXCEPT ![t] = IF placed THEN "cut" ELSE "nocut"] /\ UNCHANGED tverb
         [] OTHER ->                                                           \* intent, no lease: failure rows
              /\ m1' = [m1 EXCEPT ![t] = "claiming"] /\ plan' = [plan EXCEPT ![t] = "fail"] /\ UNCHANGED tverb
    /\ UNCHANGED <<envV, lockV, logLen, logV, durV, treeV, tp, port, know, pub>>

\* The claiming append a reconciliation needs (conditional on the read).
ClaimAppend(t) ==
    /\ HostUp(t) /\ holds[t] /\ m1[t] = "claiming" /\ Believes(t)
    /\ IF CanAppend(t)
         THEN /\ Appended(t)
              /\ term' = IF term = "none" THEN "abandoned" ELSE term
              /\ IF plan[t] = "fail"
                   THEN /\ rowKind' = "failed" /\ rowNames' = "none" /\ rowAt' = logLen + 1 /\ nRows' = nRows + 1
                   ELSE UNCHANGED <<rowKind, rowNames, rowAt, nRows>>
              /\ tverb' = IF plan[t] \in {"cut", "nocut"} THEN [tverb EXCEPT ![t] = plan[t]] ELSE tverb
              /\ m1' = [m1 EXCEPT ![t] = IF plan[t] \in {"cut", "nocut"} THEN "finishing" ELSE "idle"]
              /\ plan' = [plan EXCEPT ![t] = "none"]
              /\ UNCHANGED port
         ELSE /\ FencedStep(t) /\ plan' = [plan EXCEPT ![t] = "none"]
              /\ UNCHANGED <<logLen, view, term, rowKind, rowNames, rowAt, nRows, tverb>>
    /\ UNCHANGED <<envV, lockV, gestured, admitted, intentTab, placed, durV, treeV, tp, know, pub>>

\* The gesture's intent row (attempt 1's admitted row), then admit on this tab's root (W8 steps 2-3).
Admit(t) ==
    /\ HostUp(t) /\ holds[t] /\ m1[t] = "idle" /\ gestured = t /\ ~admitted /\ Believes(t)
    /\ IF CanAppend(t)
         THEN /\ admitted' = TRUE /\ intentTab' = t /\ Appended(t)
              /\ m1' = [m1 EXCEPT ![t] = "placing"] /\ tp' = [tp EXCEPT ![t] = "writing"]
              /\ UNCHANGED port
         ELSE /\ FencedStep(t) /\ UNCHANGED <<admitted, intentTab, logLen, view, tp>>
    /\ UNCHANGED <<envV, lockV, plan, gestured, placed, term, rowKind, rowNames, rowAt, nRows, durV, treeV,
                   tverb, know, pub>>

\* The root answered admit: attempt 1's running row with the placement; the tool port goes to the driver.
Start(t) ==
    /\ HostUp(t) /\ holds[t] /\ m1[t] = "placing" /\ tp[t] = "held" /\ tverb[t] = "none" /\ Believes(t)
    /\ IF CanAppend(t)
         THEN /\ placed' = TRUE /\ Appended(t) /\ m1' = [m1 EXCEPT ![t] = "running"]
              /\ port' = [port EXCEPT ![t] = TRUE]
         ELSE /\ FencedStep(t) /\ UNCHANGED <<placed, logLen, view>>
    /\ UNCHANGED <<envV, lockV, plan, gestured, admitted, intentTab, term, rowKind, rowNames, rowAt, nRows,
                   durV, treeV, tp, tverb, know, pub>>

\* The driver writes through its tool port; a victim does so on its belief, before its notice.
AgentWrite(t) ==
    /\ HostUp(t) /\ m1[t] = "running" /\ port[t] /\ ~agentDirty /\ (~PortChecksLease \/ lease)
    /\ agentDirty' = TRUE
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, personDirty, edits, stolen, wantSave, rootV>>

\* The run ends: the terminal row, then complete{cut: true} (TS-R11), which revokes the tool port.
RunEnds(t) ==
    /\ HostUp(t) /\ holds[t] /\ m1[t] = "running" /\ Believes(t)
    /\ IF CanAppend(t)
         THEN /\ term' = "completed" /\ Appended(t) /\ m1' = [m1 EXCEPT ![t] = "finishing"]
              /\ tverb' = [tverb EXCEPT ![t] = "cut"] /\ port' = [port EXCEPT ![t] = FALSE]
         ELSE /\ FencedStep(t) /\ UNCHANGED <<term, logLen, view, tverb>>
    /\ UNCHANGED <<envV, lockV, plan, gestured, admitted, intentTab, placed, rowKind, rowNames, rowAt, nRows,
                   durV, treeV, tp, know, pub>>

\* The settlement is published: the turn.* row unless this M1's ledger has one (TS-R18), then acknowledge.
Row(t) ==
    /\ HostUp(t) /\ holds[t] /\ m1[t] = "finishing" /\ pub[t] # "none" /\ tverb[t] = "none" /\ Believes(t)
    /\ IF pub[t] = "held"      \* HolderMark: another live root holds the attempt; settle nothing, go idle
         THEN /\ m1' = [m1 EXCEPT ![t] = "idle"] /\ pub' = [pub EXCEPT ![t] = "none"]
              /\ UNCHANGED <<logLen, view, rowKind, rowNames, rowAt, nRows, tverb, port>>
       ELSE IF rowAt # 0 /\ rowAt <= view[t]
         THEN /\ tverb' = IF pub[t] = "unknown" THEN tverb ELSE [tverb EXCEPT ![t] = "ack"]
              /\ m1' = [m1 EXCEPT ![t] = IF pub[t] = "unknown" THEN "idle" ELSE "acking"]
              /\ pub' = IF pub[t] = "unknown" THEN [pub EXCEPT ![t] = "none"] ELSE pub
              /\ UNCHANGED <<logLen, view, rowKind, rowNames, rowAt, nRows, port>>
         ELSE IF CanAppend(t)
           THEN /\ Appended(t)
                /\ rowKind' = KindOf(pub[t]) /\ rowNames' = NamesOf(pub[t]) /\ rowAt' = logLen + 1 /\ nRows' = nRows + 1
                /\ tverb' = IF pub[t] = "unknown" THEN tverb ELSE [tverb EXCEPT ![t] = "ack"]
                /\ m1' = [m1 EXCEPT ![t] = IF pub[t] = "unknown" THEN "idle" ELSE "acking"]
                /\ pub' = IF pub[t] = "unknown" THEN [pub EXCEPT ![t] = "none"] ELSE pub
                /\ UNCHANGED port
           ELSE /\ FencedStep(t) /\ UNCHANGED <<logLen, view, rowKind, rowNames, rowAt, nRows, tverb, pub>>
    /\ UNCHANGED <<envV, lockV, plan, gestured, admitted, intentTab, placed, term, durV, treeV, tp, know>>

AckDone(t) ==
    /\ HostUp(t) /\ holds[t] /\ m1[t] = "acking" /\ tverb[t] = "none" /\ Believes(t)
    /\ m1' = [m1 EXCEPT ![t] = "idle"]
    /\ UNCHANGED <<envV, lockV, plan, view, logLen, logV, durV, treeV, rootV>>

Serve(t) ==   \* the pending command is answered once M1 serves (after reconciling)
    /\ HostUp(t) /\ holds[t] /\ m1[t] = "idle" /\ pend[t]
    /\ pend' = [pend EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<envV, lock, holds, queued, wants, m1V, logV, durV, treeV, rootV>>

\* ---------------- the root of each tab (the file-manager worker) ----------------
RootLease(t) ==   \* the lease record first (RM-R12), naming this root; a release before the base skips it
    /\ Runs(t) /\ tp[t] = "writing"
    /\ lease' = TRUE /\ holder' = t
    /\ tp' = [tp EXCEPT ![t] = IF Dirty /\ tverb[t] # "nocut" THEN "basing" ELSE "held"]
    /\ UNCHANGED <<envV, lockV, m1V, logV, nBase, nResult, mintAfterRow, liveRetired, treeV, tverb, port, know, pub>>

RootBase(t) ==    \* the pre-mint of the dirty base, attributed to the attempt (turnCut base)
    /\ Runs(t) /\ tp[t] = "basing"
    /\ IF Dirty
         THEN /\ nBase' = nBase + 1 /\ know' = [know EXCEPT ![t] = TRUE]
              /\ agentDirty' = FALSE /\ personDirty' = FALSE
              /\ mintAfterRow' = (mintAfterRow \/ rowKind # "none")
         ELSE UNCHANGED <<nBase, know, agentDirty, personDirty, mintAfterRow>>
    /\ tp' = [tp EXCEPT ![t] = "held"]
    /\ UNCHANGED <<envV, lockV, m1V, logV, lease, holder, nResult, liveRetired, edits, stolen, wantSave, tverb, port, pub>>

RootBaseCancel(t) ==   \* a release while basing withdraws a queued base cut (cancelCut, RM-R4)
    /\ Runs(t) /\ tp[t] = "basing" /\ tverb[t] = "nocut"
    /\ tp' = [tp EXCEPT ![t] = "held"]
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, treeV, tverb, port, know, pub>>

RootAdopt(t) ==   \* a verb for a key with no actor here: adopt the record; search for base and result first
    /\ Runs(t) /\ tp[t] = "none" /\ tverb[t] \in {"cut", "nocut"} /\ lease /\ MarkFree(t)
    /\ tp' = [tp EXCEPT ![t] = "held"] /\ know' = [know EXCEPT ![t] = nBase > 0] /\ holder' = t
    /\ UNCHANGED <<envV, lockV, m1V, logV, lease, nBase, nResult, mintAfterRow, liveRetired, treeV, tverb, port, pub>>

RootAdoptRefused(t) ==   \* HolderMark: another live root holds the record; answer "held", adopt nothing
    /\ Runs(t) /\ tp[t] = "none" /\ tverb[t] \in {"cut", "nocut"} /\ lease /\ ~MarkFree(t)
    /\ tverb' = [tverb EXCEPT ![t] = "none"] /\ pub' = [pub EXCEPT ![t] = "held"]
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, treeV, tp, port, know>>

RootUnknown(t) ==   \* complete with no actor and no record: TURN_UNKNOWN; M1 writes turn.failed{RUN_ABANDONED}
    /\ Runs(t) /\ tp[t] = "none" /\ tverb[t] \in {"cut", "nocut"} /\ ~lease
    /\ pub' = [pub EXCEPT ![t] = "unknown"] /\ tverb' = [tverb EXCEPT ![t] = "none"]
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, treeV, tp, port, know>>

RootCut(t) ==   \* complete{cut: true}: find-or-cut (a result found by key settles without a cut, RM-R14)
    /\ Runs(t) /\ tp[t] = "held" /\ tverb[t] = "cut"
    /\ IF nResult = 0 /\ Dirty
         THEN /\ nResult' = 1 /\ agentDirty' = FALSE /\ personDirty' = FALSE
              /\ mintAfterRow' = (mintAfterRow \/ rowKind # "none")
              /\ pub' = [pub EXCEPT ![t] = "fin-result"]
         ELSE /\ pub' = [pub EXCEPT ![t] = IF nResult > 0 THEN "fin-result"
                                            ELSE IF know[t] \/ nBase > 0 THEN "fin-base" ELSE "fin-none"]
              /\ UNCHANGED <<nResult, agentDirty, personDirty, mintAfterRow>>
    /\ tp' = [tp EXCEPT ![t] = "settled"] /\ tverb' = [tverb EXCEPT ![t] = "none"]
    /\ port' = [port EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<envV, lockV, m1V, logV, lease, holder, nBase, liveRetired, edits, stolen, wantSave, know>>

RootRelease(t) ==   \* complete{cut: false}: released, naming any base this actor knows
    /\ Runs(t) /\ tp[t] = "held" /\ tverb[t] = "nocut"
    /\ pub' = [pub EXCEPT ![t] = IF know[t] THEN "failed-base" ELSE "failed-none"]
    /\ tp' = [tp EXCEPT ![t] = "settled"] /\ tverb' = [tverb EXCEPT ![t] = "none"]
    /\ port' = [port EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, treeV, know>>

RootReplay(t) ==   \* a second complete for a settled key: replayed
    /\ Runs(t) /\ tp[t] = "settled" /\ tverb[t] \in {"cut", "nocut"}
    /\ tverb' = [tverb EXCEPT ![t] = "none"]
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, treeV, tp, port, know, pub>>

RootAck(t) ==   \* acknowledge: the record retires (TS-R5)
    /\ Runs(t) /\ tp[t] = "settled" /\ tverb[t] = "ack"
    /\ lease' = FALSE /\ holder' = None /\ liveRetired' = (liveRetired \/ (lease /\ LiveActorElsewhere(t)))
    /\ tp' = [tp EXCEPT ![t] = "none"] /\ tverb' = [tverb EXCEPT ![t] = "none"]
    /\ pub' = [pub EXCEPT ![t] = "none"] /\ know' = [know EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<envV, lockV, m1V, logV, nBase, nResult, mintAfterRow, treeV, port>>

RootAckNoActor(t) ==   \* acknowledge with no actor: retire the record naming the attempt, else replayed
    /\ Runs(t) /\ tp[t] = "none" /\ tverb[t] = "ack" /\ MarkFree(t)
    /\ lease' = FALSE /\ holder' = None /\ liveRetired' = (liveRetired \/ (lease /\ LiveActorElsewhere(t)))
    /\ tverb' = [tverb EXCEPT ![t] = "none"]
    /\ UNCHANGED <<envV, lockV, m1V, logV, nBase, nResult, mintAfterRow, treeV, tp, port, know, pub>>

RootAckNoActorRefused(t) ==   \* HolderMark: another live root holds the record; retire nothing
    /\ Runs(t) /\ tp[t] = "none" /\ tverb[t] = "ack" /\ ~MarkFree(t)
    /\ tverb' = [tverb EXCEPT ![t] = "none"]
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, treeV, tp, port, know, pub>>

RootAckBusy(t) ==   \* acknowledge while this root's actor is not settled: W5 answers only in settled
    /\ Runs(t) /\ tp[t] \in {"writing", "basing", "held"} /\ tverb[t] = "ack"
    /\ tverb' = [tverb EXCEPT ![t] = "none"]
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, treeV, tp, port, know, pub>>

\* ---------------- the person ----------------
PersonEdit(t) ==
    /\ Runs(t) /\ edits < MaxEdits /\ ~personDirty
    /\ personDirty' = TRUE /\ edits' = edits + 1
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, agentDirty, stolen, wantSave, rootV>>

\* A trigger-only cut: the fresh fence reads the lease record (TS-R17); RootHeld adds heldByTurn.
SaveBlocked(t) == lease \/ (RootHeld /\ tp[t] \in {"writing", "basing", "held"})

Save(t) ==
    /\ Runs(t) /\ Dirty /\ ~SaveBlocked(t)
    /\ stolen' = (stolen \/ agentDirty)
    /\ agentDirty' = FALSE /\ personDirty' = FALSE /\ wantSave' = [wantSave EXCEPT ![t] = FALSE]
    /\ UNCHANGED <<envV, lockV, m1V, logV, durV, edits, rootV>>

SaveRefused(t) ==   \* nothingToSave; a lease on disk also reports leaseHeld, which queues (TS-R16)
    /\ Runs(t) /\ Dirty /\ SaveBlocked(t)
    /\ \/ ~wantSave[t]
       \/ lease /\ host[t] /\ ~holds[t] /\ t \notin queued   \* v4: a retried save re-reports leaseHeld (TS-R17)
    /\ wantSave' = [wantSave EXCEPT ![t] = TRUE]
    /\ queued' = IF lease /\ lock # t /\ host[t] /\ ~holds[t] THEN queued \cup {t} ELSE queued
    /\ UNCHANGED <<envV, lock, holds, pend, wants, m1V, logV, durV, agentDirty, personDirty, edits, stolen, rootV>>

Next ==
    \E t \in Tabs :
        \/ Open(t) \/ TabDies(t) \/ Freeze(t) \/ Thaw(t) \/ HostDies(t) \/ HostStarts(t)
        \/ Grant(t) \/ Want(t) \/ Forwarded(t) \/ Steal(t) \/ Notice(t) \/ Release(t)
        \/ Gesture(t) \/ ReadDecide(t) \/ ClaimAppend(t) \/ Admit(t) \/ Start(t) \/ AgentWrite(t) \/ RunEnds(t)
        \/ Row(t) \/ AckDone(t) \/ Serve(t)
        \/ RootLease(t) \/ RootBase(t) \/ RootBaseCancel(t) \/ RootAdopt(t) \/ RootAdoptRefused(t) \/ RootUnknown(t)
        \/ RootCut(t) \/ RootRelease(t) \/ RootReplay(t) \/ RootAck(t) \/ RootAckNoActor(t) \/ RootAckBusy(t)
        \/ RootAckNoActorRefused(t)
        \/ PersonEdit(t) \/ Save(t) \/ SaveRefused(t) \/ AttachReads(t)

\* v4: Grant is strongly fair, standing in for Web Locks' FIFO queue (a queued request is never overtaken forever)
Fairness ==
    \A t \in Tabs :
        /\ WF_vars(Thaw(t)) /\ WF_vars(AttachReads(t)) /\ WF_vars(HostStarts(t)) /\ SF_vars(Grant(t)) /\ WF_vars(Notice(t))
        /\ WF_vars(Release(t)) /\ WF_vars(Forwarded(t)) /\ WF_vars(Serve(t))
        /\ WF_vars(ReadDecide(t)) /\ WF_vars(ClaimAppend(t)) /\ WF_vars(Admit(t)) /\ WF_vars(Start(t))
        /\ WF_vars(RunEnds(t)) /\ WF_vars(Row(t)) /\ WF_vars(AckDone(t))
        /\ WF_vars(RootLease(t)) /\ WF_vars(RootBase(t)) /\ WF_vars(RootAdopt(t)) /\ WF_vars(RootUnknown(t))
        /\ WF_vars(RootCut(t)) /\ WF_vars(RootRelease(t)) /\ WF_vars(RootReplay(t))
        /\ WF_vars(RootAck(t)) /\ WF_vars(RootAckNoActor(t)) /\ WF_vars(RootAckBusy(t))
        /\ WF_vars(RootAdoptRefused(t)) /\ WF_vars(RootAckNoActorRefused(t))
        /\ WF_vars(wantSave[t] /\ Save(t)) /\ WF_vars(wantSave[t] /\ SaveRefused(t))   \* refused saves retry (idle trigger)

Spec == Init /\ [][Next]_vars /\ Fairness

TypeOK ==
    /\ lock \in Tabs \cup {None} /\ queued \subseteq Tabs
    /\ m1 \in [Tabs -> M1Phases] /\ tp \in [Tabs -> TPhases] /\ pub \in [Tabs -> Pubs]
    /\ tverb \in [Tabs -> {"none", "cut", "nocut", "ack"}] /\ plan \in [Tabs -> {"none", "cut", "nocut", "idle", "fail"}]
    /\ term \in {"none", "completed", "abandoned"} /\ rowKind \in {"none", "fin", "failed"} /\ holder \in Tabs \cup {None, Gone}

\* ---------------- properties ----------------
NoMintAfterRow == ~mintAfterRow                                   \* I22 (and question item: a revision no row names)
RowNamesItsRevision ==                                            \* D10: the row names the attempt's newest revision
    rowKind # "none" =>
        \/ nResult > 0 /\ rowNames = "result"
        \/ nResult = 0 /\ nBase > 0 /\ rowNames = "base"
        \/ nResult = 0 /\ nBase = 0 /\ rowNames = "none"
AtMostOneRow == nRows <= 1                                         \* question item: two settlement rows
AtMostOneBase == nBase <= 1                                        \* I20
AtMostOneResult == nResult <= 1                                    \* I20
AgentBytesAttributedToTurn == ~stolen                              \* I19, I20; W8's strong form
LiveHolderNotRetired == ~liveRetired                               \* I25: a lease retired while another root still acts on it
RetireAfterRow == (placed /\ ~lease /\ nRows = 0) => \A t \in Tabs : tp[t] \in {"none"}  \* I19, loose form

LeaseEventuallyRetired == lease ~> ~lease
AttemptEventuallyRowed == admitted ~> (rowKind # "none")
SaveEventuallyDone == \A t \in Tabs : wantSave[t] ~> (~wantSave[t] \/ ~open[t] \/ ~Dirty)   \* a cut may take the bytes

TraceView == [open |-> open, frozen |-> frozen, host |-> host, lock |-> lock, holds |-> holds, queued |-> queued,
              pend |-> pend, m1 |-> m1, plan |-> plan, view |-> view, logLen |-> logLen,
              log |-> [admitted |-> admitted, by |-> intentTab, placed |-> placed, term |-> term,
                       row |-> <<rowKind, rowNames, rowAt>>],
              lease |-> lease, holder |-> holder, graph |-> [base |-> nBase, result |-> nResult, afterRow |-> mintAfterRow],
              tree |-> [agent |-> agentDirty, person |-> personDirty, stolen |-> stolen, wantSave |-> wantSave],
              root |-> [tp |-> tp, verb |-> tverb, port |-> port, knowsBase |-> know, pub |-> pub],
              liveRetired |-> liveRetired]
=====================================================================================
