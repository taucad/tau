---------------------------- MODULE ProjectFocus ----------------------------
(***************************************************************************)
(* Which project has focus when the person navigates between projects,     *)
(* possibly faster than a leave flush, an access check or the project      *)
(* runtime import completes (app state orchestration charter D7, D13; I2,  *)
(* I3, I4, I6, I18, I20).                                                  *)
(*                                                                         *)
(* Parties:                                                                *)
(*   router    commits a request {id, project, chat}; focus hears it in a  *)
(*             later step (RouteCommitted, then RouteHeard). A request for *)
(*             Home names no project                                       *)
(*   library   an epoch that LibraryChanged moves, and per project an      *)
(*             access answer: "ready" or "held" (every held answer:        *)
(*             missing, trashed, conflict, unavailable, recovering,        *)
(*             recovery failed, native kernel, error). It answers for the  *)
(*             epoch current when it answers (LibraryCatalog's             *)
(*             AccessAnswerFenced); the epoch may move again before focus  *)
(*             acts on the answer                                          *)
(*   focus     the machine this spec rules (machines/focus.machine.ts and  *)
(*             its selector, focus.route-state.ts; A5a) or, with Focus =   *)
(*             "today", the effects of ProjectRouteGate as written         *)
(*   leaving   the session being left (`f.from`), dirty or clean, and its  *)
(*             leave flush, which completes, fails or is still running     *)
(*   module    the project runtime import, one for every project           *)
(*   registry  the live set, the budget, the single pendingOpen slot, the  *)
(*             close flush and idle expiry. Environment: no conformance of *)
(*             sessions.machine is claimed. It answers an open in the step *)
(*             that sends it, as the actor does, so OpenAsked is also      *)
(*             OpenSettled                                                 *)
(*   session   an opening session reports two facts once live: its chat    *)
(*             session and its first file check. One open bound may pass   *)
(*             while either is pending                                     *)
(*   person    edits the focused project, opens a project from the sidebar *)
(*             or a notice (through focus), closes a project and retries   *)
(*             (to their owners)                                           *)
(*                                                                         *)
(* The model is untimed: the open bound and idle expiry are steps that may *)
(* happen. Slug resolution is not modelled: a request names its project.   *)
(* A chat is an opaque value that travels in a request. The unload         *)
(* sequencer (D26) is held by test rows, not by this model. Touch and the  *)
(* registry's recency order are not modelled: a policy close may take any  *)
(* candidate.                                                              *)
(*                                                                         *)
(* Every configuration but `wide` and the six `-wide` siblings runs on     *)
(* the pr tier, in this family's own target, ui:formal:tla:project-focus   *)
(* (README). Each `-wide` sibling holds the full bounds of its narrowed pr *)
(* form. `target-person-epoch` keeps a person's waiting open with a        *)
(* library change, in flushFailed too, and `target-start-retry` a retry    *)
(* after a failed start with a library change, at pr.                      *)
(*                                                                         *)
(* Switches. The first value of each is the target.                        *)
(*   Focus          "target": the focus machine (D7).                      *)
(*                  "today": ProjectRouteGate as built at c5f528dd         *)
(*                    (project-route.tsx 141 to 296; inventory S8 to S10,  *)
(*                    S30, S31, S34): one effect per (project, library     *)
(*                    revision, retry attempt) that asks access, flushes   *)
(*                    the registration it holds and sets `resolved`, with  *)
(*                    a cancellation flag; a layout effect that sends a    *)
(*                    bare `open`; and a route state derived from          *)
(*                    `resolved` and the live set alone                    *)
(*                    (project-route-state.ts 101 to 179), which reads     *)
(*                    neither the import nor the two session facts.        *)
(*   IdFence        TRUE: an answer whose id is not the current request's  *)
(*                  is ignored. FALSE: focus takes whichever answer comes. *)
(*   SelectorRoute  TRUE: the route-state selector takes the committed     *)
(*                  route. FALSE: it is derived from focus alone.          *)
(*   SelectorMatch  "project": the selector compares the committed route   *)
(*                  with focus's request by project. "id": by request id.  *)
(*   LateRegistration  today: the gate's flush registration                *)
(*                  (`activeSessionFlushRef`) is set by a passive effect   *)
(*                  of ProjectPersistenceGuard after the commit that       *)
(*                  mounts the session it names (project-live-sessions.tsx *)
(*                  655, 797 to 812), so the person may edit before it     *)
(*                  lands; React runs it before the next render, so it has *)
(*                  landed before the next commit or effect run            *)
(*                  (RegFlushed). FALSE: it is current at every step.      *)
(*   ModuleAtStart  "unloaded", or "loaded" when a project link warmed the *)
(*                  import before the first request.                       *)
(*   SessionFacts   TRUE: a new session reports its two facts after it is  *)
(*                  live. FALSE: both are settled when it goes live.       *)
(*   FactOrder      "any": the chat fact and the first file check settle   *)
(*                  in either order, each before or after the open bound.  *)
(*                  "together": both settle in one step (ChatReady), or    *)
(*                  the bound passes first; a reduction for the configs    *)
(*                  whose question is not the order.                       *)
(*   RegistryChecksEpoch  TRUE: the registry's resume drops a pendingOpen *)
(*                  whose request's epoch (focus's library epoch) is       *)
(*                  stale, and replies to focus that it dropped it: the    *)
(*                  requirement on A5c. FALSE: the registry as built,      *)
(*                  which resumes it.                                      *)
(*   Labelled       TRUE: `act` names each step, for the graph export and  *)
(*                  the covering suite. FALSE: `act` is constant.          *)
(***************************************************************************)
\* A3b: `ProjectRouteAccess` moved from `use-project-manager.tsx` to `runtime/project-library.ts`; the
\* route gate imports the type from there. No action or correspondence changes.
\* A4b: `tauCloudIntent` and its type moved from `hooks/use-cloud-projects.ts` to
\* `lib/tau-cloud-intent.ts`; the route gate and the live sessions import them from there. No action or
\* correspondence changes.
EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS Projects,          \* the projects the person can navigate to
          Chats,             \* opaque chat values a request carries
          None, Home,        \* model values: no project; the route outside any project
          MaxRequests,       \* route commits
          MaxLibraryChanges, \* library epochs after the first
          Budget,            \* live sessions the registry keeps; 1 is a one-project device
          MaxFlushFails,     \* leave flushes that may fail
          MaxOpenFails,      \* session starts that may fail
          MaxRetries,        \* the person's retries of a held answer or a failed flush
          MaxPersonOpens,    \* opens from the sidebar or a notice
          MaxPersonCloses,   \* closes by the person
          MaxCloseFails,     \* close flushes that may fail (the session is then retained)
          MaxDiscards,       \* explicit discards of a retained session's unsaved work by the person
          AllowHome,         \* the router may commit Home
          IdleExpiry,        \* the registry may close any clean session focus is not on
          Focus, IdFence, SelectorRoute, SelectorMatch, LateRegistration, ModuleAtStart,
          SessionFacts, FactOrder, RegistryChecksEpoch, Labelled

ASSUME /\ MaxRequests \in Nat /\ MaxLibraryChanges \in Nat /\ Budget \in Nat \ {0}
       /\ MaxFlushFails \in Nat /\ MaxOpenFails \in Nat /\ MaxRetries \in Nat
       /\ MaxPersonOpens \in Nat /\ MaxPersonCloses \in Nat /\ MaxCloseFails \in Nat /\ MaxDiscards \in Nat
       /\ AllowHome \in BOOLEAN /\ IdleExpiry \in BOOLEAN
       /\ Focus \in {"target", "today"}
       /\ IdFence \in BOOLEAN /\ SelectorRoute \in BOOLEAN
       /\ SelectorMatch \in {"project", "id"}
       /\ LateRegistration \in BOOLEAN
       /\ ModuleAtStart \in {"unloaded", "loaded"}
       /\ SessionFacts \in BOOLEAN /\ FactOrder \in {"any", "together"} /\ RegistryChecksEpoch \in BOOLEAN /\ Labelled \in BOOLEAN
       /\ None \notin Projects /\ Home \notin Projects /\ None # Home

VARIABLES
  route,        \* the newest committed request; NoReq before the first commit
  nreq,         \* requests committed so far; the next one's id is nreq + 1
  f,            \* focus (Focus = "today": the gate's effects and state)
  asks,         \* access questions the library has not answered yet
  lib,          \* the library: its epoch and each project's access answer
  mod,          \* the project runtime import
  sess,         \* the registry: each project's session, "none" when not in the live set; "failed" holds its slot
  sreq,         \* the request each live session was opened with, its input
  fact,         \* each session's two facts and the open bound
  dirty,        \* sessions with unsaved work
  pendingOpen,  \* the registry's single pendingOpen slot and the request it keeps
  reg,          \* today: the project whose flush registration the gate holds
  keep,         \* history for SameProjectKeepsEditor
  cnt,          \* bounded failures and person steps
  act           \* the step's label, for the graph export; constant unless Labelled

vars == <<route, nreq, f, asks, lib, mod, sess, sreq, fact, dirty, pendingOpen, reg, keep, cnt, act>>

-----------------------------------------------------------------------------
(* Values *)

Places == Projects \cup (IF AllowHome THEN {Home} ELSE {})
ChatsFor(p) == IF p = Home THEN {None} ELSE Chats
Ids == 0..MaxRequests
NoReq == [id |-> 0, project |-> None, chat |-> None]
Requests == {NoReq} \cup [id : 1..MaxRequests, project : Places, chat : Chats \cup {None}]
AccessValues == {"ready", "held"}
\* What an open carries (D7): the project of the ready answer it was built from, or None for a bare
\* open. The workspace, native kernel id and chat of the charter's request travel with it, unmodelled.
NoOpenReq == None
\* A request names its project and the library epoch of the ready answer it was built from.
Req(p, e) == [project |-> p, epoch |-> e]
OpenReqs == {None} \cup [project : Projects, epoch : 0..MaxLibraryChanges]
NoPending == [project |-> None, req |-> None]
NoKeep == [proj |-> None, fwd |-> 0, work |-> FALSE]
FocusStates == {"idle", "resolving", "leaving", "opening", "focused", "held", "flushFailed"}
SessionStates == {"none", "live", "closing", "failed"}
FactStates == {"pending", "chatOnly", "checkOnly", "settled", "bound"}
Label(l) == IF Labelled THEN l ELSE "-"
Labels == {"Init", "RouteCommitted", "RouteHeard", "ChatForwarded", "AccessAsked", "AccessAnswered",
           "LibraryChanged", "LeaveFlushStarted", "LeaveFlushSettled", "Retry", "ModuleLoaded", "OpenAsked",
           "OpenJoined", "OpenLost", "OpenOnFailed", "ChatReady", "FirstCheckSettled", "OpenBoundPassed", "Edit", "PersonOpenAsked",
           "PersonClosed", "PersonDiscarded", "CloseFlushFailed", "CloseFailed", "IdleExpired", "BudgetSwitchClose", "SessionClosed", "FlushRegistered"}

InLive(p) == p \in Projects /\ sess[p] # "none"
\* A session the person can work in: live, not closing and not failed.
Live(p) == p \in Projects /\ sess[p] = "live"
\* A session the person or the budget may close: live, or failed after a close that did not finish.
Closeable(p) == sess[p] \in {"live", "failed"}
LiveCount == Cardinality({p \in Projects : sess[p] # "none"})
FactsOk(p) == p \in Projects /\ fact[p] \in {"settled", "bound"}
CheckOk(p) == p \in Projects /\ fact[p] \in {"checkOnly", "settled", "bound"}
Spawned == IF SessionFacts THEN "pending" ELSE "settled"
PersonCommands == MaxPersonOpens > 0
\* Focus holds an answer for the library's current epoch.
Fresh == f.ans # "none" /\ f.ansEpoch = lib.epoch
\* Target: focus's own open waiting in the registry's pendingOpen slot for the project it is opening.
\* It is by project: a person's open of that project takes the slot in its place, and the machine then
\* waits for that open's reply (focus.machine.ts, `personOpen`).
FocusPending == pendingOpen # NoPending /\ pendingOpen.req # NoOpenReq /\ pendingOpen.project = f.ansProj
                /\ f.st = "opening" /\ f.opened
\* Target: focus withdraws that open (the registry's cancelPendingOpen) in the step it stops opening
\* that project from that answer. g is focus's next state.
PendingAfter(g) ==
  IF FocusPending /\ ~(g.st = "opening" /\ g.opened /\ g.ans = "ready" /\ g.ansProj = pendingOpen.project)
    THEN NoPending ELSE pendingOpen
\* After an answer, focus also withdraws a person's open waiting in pendingOpen whose kept request it
\* just dropped (a held answer for that project).
StandingAfter(g) ==
  LET po == PendingAfter(g)
  IN IF po # NoPending /\ po.req # NoOpenReq
        /\ ~(g.st = "opening" /\ g.opened /\ g.ansProj = po.project) /\ g.kept[po.project] # po.req.epoch
       THEN NoPending ELSE po
\* The session being left owes no leave flush: there is none, it flushed, or its close flush ran.
LeaveDone == f.from = None \/ f.lf = "ok" \/ sess[f.from] = "none"
Warm == IF mod = "unloaded" THEN "loading" ELSE mod

-----------------------------------------------------------------------------
(* The route state the selector derives (project-route-state.ts; D7) *)

Mismatch ==
  \/ f.req = NoReq
  \/ SelectorMatch = "project" /\ route.project # f.req.project
  \/ SelectorMatch = "id" /\ route.id # f.req.id

TargetView ==
  IF SelectorRoute /\ (route = NoReq \/ route.project = Home) THEN "none"
  ELSE IF SelectorRoute /\ Mismatch THEN "resolving"
  ELSE CASE f.st = "flushFailed" -> "flushError"
         [] f.st = "held" -> "held"
         [] f.st = "focused" -> IF Live(f.ansProj) THEN "editor" ELSE "closed"
         [] OTHER -> "resolving"

\* deriveProjectRouteState over `resolved` (project-route.tsx 319 to 335).
TodayView ==
  IF route = NoReq \/ route.project = Home THEN "none"
  ELSE IF f.err THEN "flushError"
  ELSE IF f.ans = "none" \/ f.ansProj # route.project THEN "resolving"
  ELSE IF f.ans = "held" THEN "held"
  ELSE IF InLive(f.ansProj) THEN "editor" ELSE "closed"

View == IF Focus = "target" THEN TargetView ELSE TodayView

\* Today: the registration ProjectPersistenceGuard would hold now. The focused (resolved, ready)
\* project registers once its session subtree has mounted, which needs the live set and the import.
RegTarget == IF f.ans = "ready" /\ InLive(f.ansProj) /\ mod = "loaded" THEN f.ansProj ELSE None
RegNow == IF LateRegistration THEN reg ELSE RegTarget
\* ProjectPersistenceGuard commits no later than the editor, and React runs pending passive effects
\* before the next render: the registration has landed before the next commit or effect run.
RegFlushed == ~(Focus = "today" /\ LateRegistration) \/ reg = RegTarget

-----------------------------------------------------------------------------

TypeOK ==
  /\ route \in Requests /\ nreq \in Ids
  /\ f.req \in Requests /\ f.st \in FocusStates
  /\ f.ans \in {"none", "ready", "held", "failed"} /\ f.ansProj \in Places \cup {None}
  /\ f.ansEpoch \in 0..MaxLibraryChanges
  /\ f.on \in Projects \cup {None} /\ f.from \in Projects \cup {None}
  /\ f.lf \in {"none", "running", "ok", "failed"} /\ f.lfp \in Projects \cup {None}
  /\ f.opened \in BOOLEAN /\ f.live \in BOOLEAN /\ f.blocked \in BOOLEAN /\ f.err \in BOOLEAN /\ f.sup \in BOOLEAN
  /\ f.kept \in [Projects -> (0..MaxLibraryChanges) \cup {None}]
  /\ asks \subseteq [id : 1..MaxRequests, project : Projects, epoch : 0..MaxLibraryChanges]
  /\ lib.access \in [Projects -> AccessValues] /\ lib.epoch \in 0..MaxLibraryChanges
  /\ Len(lib.hist) = lib.epoch + 1 /\ lib.hist[lib.epoch + 1] = lib.access
  /\ mod \in {"unloaded", "loading", "loaded"}
  /\ sess \in [Projects -> SessionStates] /\ sreq \in [Projects -> OpenReqs]
  /\ fact \in [Projects -> FactStates]
  /\ dirty \subseteq Projects
  /\ pendingOpen.project \in Projects \cup {None} /\ pendingOpen.req \in OpenReqs
  /\ reg \in Projects \cup {None}
  /\ keep.proj \in Projects \cup {None}
  /\ act \in Labels \cup {"-"}

Init ==
  /\ route = NoReq
  /\ nreq = 0
  /\ f = [req |-> NoReq, st |-> "idle", ans |-> "none", ansProj |-> None, ansEpoch |-> 0,
          pend |-> "none", pendEpoch |-> 0, effEpoch |-> 0, on |-> None, from |-> None,
          lf |-> "none", lfp |-> None, opened |-> FALSE, live |-> FALSE, kept |-> [p \in Projects |-> None],
          blocked |-> FALSE, err |-> FALSE, sup |-> FALSE]
  /\ asks = {}
  /\ \E a0 \in [Projects -> AccessValues] : lib = [access |-> a0, epoch |-> 0, hist |-> <<a0>>]
  /\ mod = ModuleAtStart
  /\ sess = [p \in Projects |-> "none"]
  /\ sreq = [p \in Projects |-> NoOpenReq]
  /\ fact = [p \in Projects |-> "pending"]
  /\ dirty = {}
  /\ pendingOpen = NoPending
  /\ reg = None
  /\ keep = NoKeep
  /\ cnt = [flushFails |-> 0, openFails |-> 0, retries |-> 0, pOpens |-> 0, pCloses |-> 0,
         closeFails |-> 0, discards |-> 0]
  /\ act = Label("Init")

-----------------------------------------------------------------------------
(* Registry (environment; sessions.machine.ts as built, with the request it keeps, S38) *)

\* How the registry answers an open of p: a touch for a live session, which drops pendingOpen
\* (343 to 349); a wait in pendingOpen for a closing one (347); a new session when there is room
\* (351), whose start may fail; otherwise a wait in the single pendingOpen slot, latest destination
\* only (377 to 409), until BudgetSwitchClose or the person frees a slot.
Outcomes(p) ==
  CASE sess[p] \in {"live", "failed"} -> {"touch"}
    [] sess[p] = "closing" -> {"wait"}
    [] LiveCount < Budget -> {"spawn"} \cup (IF cnt.openFails < MaxOpenFails THEN {"failed"} ELSE {})
    [] OTHER -> {"wait"}

RegistryOpen(p, rq, out, c) ==
  /\ sess' = IF out = "spawn" THEN [sess EXCEPT ![p] = "live"] ELSE sess
  /\ sreq' = IF out = "spawn" THEN [sreq EXCEPT ![p] = rq] ELSE sreq
  /\ fact' = IF out = "spawn" THEN [fact EXCEPT ![p] = Spawned] ELSE fact
  /\ pendingOpen' = IF out = "wait" THEN [project |-> p, req |-> rq] ELSE NoPending
  /\ cnt' = IF out = "failed" THEN [c EXCEPT !.openFails = @ + 1] ELSE c

NoOpen == UNCHANGED <<sess, sreq, fact, pendingOpen>>

\* The registry closing a session by policy to make room for pendingOpen: on a one-project device
\* the session being left, dirty or not, as the person's close (389 to 399); elsewhere a clean one
\* (380 to 390).
BudgetSwitchClose(v) ==
  /\ pendingOpen # NoPending /\ \A p \in Projects : sess[p] # "closing"
  /\ Closeable(v) /\ v # pendingOpen.project
  /\ Budget = 1 \/ v \notin dirty
  /\ sess' = [sess EXCEPT ![v] = "closing"]
  /\ keep' = IF keep.proj = v THEN NoKeep ELSE keep
  /\ UNCHANGED <<route, nreq, f, asks, lib, mod, sreq, fact, dirty, pendingOpen, reg, cnt>>
  /\ act' = Label("BudgetSwitchClose")

\* The idle window (426 to 440): a clean session focus is neither on nor moving to.
IdleExpired(v) ==
  /\ IdleExpiry
  /\ sess[v] = "live" /\ v \notin dirty /\ v # f.req.project /\ v # f.ansProj
  /\ sess' = [sess EXCEPT ![v] = "closing"]
  /\ UNCHANGED <<route, nreq, f, asks, lib, mod, sreq, fact, dirty, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("IdleExpired")

\* The session's own `closing`: producers and sync flush, or a failure is recorded (I6); then
\* SessionClosed is the close flush succeeding (or a clean session's close): `sessionClosed` frees the slot and resumes pendingOpen with the request it kept (315 to 334). With
\* RegistryChecksEpoch it drops instead a request of focus's whose epoch is stale (A5c).
SessionClosed(v) ==
  /\ sess[v] = "closing"
  /\ dirty' = dirty \ {v}
  /\ LET s1 == [sess EXCEPT ![v] = "none"]
         q == pendingOpen.project
         room == Cardinality({p \in Projects : s1[p] # "none"}) < Budget
         stale == RegistryChecksEpoch /\ pendingOpen.req # NoOpenReq /\ pendingOpen.req.epoch # lib.epoch
     IN IF pendingOpen # NoPending /\ s1[q] = "none" /\ room /\ ~stale
          THEN /\ sess' = [s1 EXCEPT ![q] = "live"]
               /\ sreq' = [sreq EXCEPT ![v] = NoOpenReq, ![q] = pendingOpen.req]
               /\ fact' = [fact EXCEPT ![v] = "pending", ![q] = Spawned]
               /\ pendingOpen' = NoPending
          ELSE /\ sess' = s1
               /\ sreq' = [sreq EXCEPT ![v] = NoOpenReq]
               /\ fact' = [fact EXCEPT ![v] = "pending"]
               /\ pendingOpen' = IF pendingOpen # NoPending /\ (Closeable(q) \/ stale) THEN NoPending ELSE pendingOpen
  \* The registry's reply about focus's own waiting open: resumed (or already live), or dropped as stale,
  \* which sends focus back to OpenAsked from its fresh answer (PendingOpenDropped, A5c).
  /\ f' = IF ~FocusPending THEN f
          ELSE IF sess'[pendingOpen.project] \in {"live", "failed"} THEN [f EXCEPT !.live = TRUE]
          ELSE IF pendingOpen' = NoPending THEN [f EXCEPT !.opened = FALSE]
          ELSE f
  /\ keep' = IF keep.proj = v THEN NoKeep ELSE keep
  /\ UNCHANGED <<route, nreq, asks, lib, mod, reg, cnt>>
  /\ act' = Label("SessionClosed")

\* A dirty session's close fails (I6): the session is not discarded. It stays in the live set with its
\* unsaved work, retained until a later close's flush succeeds or the person discards it. The two ways
\* it fails share the MaxCloseFails bound, so each config with a close failure explores both.
\*
\* CloseFlushFailed: a producer refuses the flush (flushProducers) and the session returns to `live`
\* (project-session.machine.ts). An open waiting in pendingOpen for another project keeps waiting: the
\* registry has no room for it. An open waiting for the retained session itself is answered by it: the
\* registry reopens the retained session and clears pendingOpen (sessions.machine.ts 281 to 289,
\* reopenRetained), so focus's own waiting open goes live. The registry emits nothing to focus here;
\* A5a derives it from the registry snapshot (pendingOpen cleared, status live).
CloseFlushFailed(v) ==
  /\ sess[v] = "closing" /\ v \in dirty /\ cnt.closeFails < MaxCloseFails
  /\ sess' = [sess EXCEPT ![v] = "live"]
  /\ pendingOpen' = IF pendingOpen.project = v THEN NoPending ELSE pendingOpen
  /\ f' = IF FocusPending /\ pendingOpen.project = v THEN [f EXCEPT !.live = TRUE] ELSE f
  /\ cnt' = [cnt EXCEPT !.closeFails = @ + 1]
  /\ UNCHANGED <<route, nreq, asks, lib, mod, sreq, fact, dirty, reg, keep>>
  /\ act' = Label("CloseFlushFailed")

\* CloseFailed: cancelRuns, flushSync or releaseAgentHost fails and the session goes to `failed`
\* (project-session.machine.ts closeFailed). The failed child stays in the registry's refs and holds its
\* slot: an open of it is a touch, the person or the budget may close it again, and idle expiry does
\* not (only `live.idle` has the timer). The registry keeps pendingOpen and emits budgetRefused for it
\* (sessions.machine.ts 281 to 289). A5a rule: on budgetRefused for its own waiting open of a project
\* still in the live set, focus withdraws that open (cancelPendingOpen) in the same step and sends it
\* again; as built that open is a touch, and focus then settles on the failed session (TOpenOnFailed).
\* No other open waits for v here: a person's open needs v out of the live set (PersonOpenAsked), and
\* focus withdraws its open when it moves, so in the target pendingOpen names v only as FocusPending.
CloseFailed(v) ==
  /\ sess[v] = "closing" /\ v \in dirty /\ cnt.closeFails < MaxCloseFails
  /\ sess' = [sess EXCEPT ![v] = "failed"]
  /\ pendingOpen' = IF FocusPending /\ pendingOpen.project = v THEN NoPending ELSE pendingOpen
  /\ f' = IF FocusPending /\ pendingOpen.project = v THEN [f EXCEPT !.opened = FALSE] ELSE f
  /\ cnt' = [cnt EXCEPT !.closeFails = @ + 1]
  /\ UNCHANGED <<route, nreq, asks, lib, mod, sreq, fact, dirty, reg, keep>>
  /\ act' = Label("CloseFailed")

(* The opening session's facts. They move only for the project focus holds an answer for: a session
   nobody is opening stays as it was until focus opens it, which still reaches every value it could
   have at the join. *)

ChatReady(p) ==
  /\ sess[p] = "live" /\ p = f.ansProj /\ fact[p] \in {"pending", "checkOnly"}
  /\ fact' = [fact EXCEPT ![p] = IF @ = "pending" /\ FactOrder = "any" THEN "chatOnly" ELSE "settled"]
  /\ UNCHANGED <<route, nreq, f, asks, lib, mod, sess, sreq, dirty, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("ChatReady")

FirstCheckSettled(p) ==
  /\ FactOrder = "any"
  /\ sess[p] = "live" /\ p = f.ansProj /\ fact[p] \in {"pending", "chatOnly"}
  /\ fact' = [fact EXCEPT ![p] = IF @ = "pending" THEN "checkOnly" ELSE "settled"]
  /\ UNCHANGED <<route, nreq, f, asks, lib, mod, sess, sreq, dirty, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("FirstCheckSettled")

\* `openPatienceMilliseconds`, an `after` that starts when the session reports live.
OpenBoundPassed(p) ==
  /\ sess[p] = "live" /\ p = f.ansProj /\ fact[p] \in {"pending", "chatOnly", "checkOnly"}
  /\ fact' = [fact EXCEPT ![p] = "bound"]
  /\ UNCHANGED <<route, nreq, f, asks, lib, mod, sess, sreq, dirty, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("OpenBoundPassed")

-----------------------------------------------------------------------------
(* Router, library and module *)

\* A commit for the project the editor shows (a chat switch, or the focused-chat URL replace,
\* project-route.tsx 442 and 460 to 470) starts SameProjectKeepsEditor's watch; any other ends it. A
\* commit while a library change still owes its re-check starts none: the library change is the cause.
RouteCommitted(p, c) ==
  /\ nreq < MaxRequests
  /\ RegFlushed
  /\ route' = [id |-> nreq + 1, project |-> p, chat |-> c]
  /\ nreq' = nreq + 1
  /\ keep' = IF p \in Projects /\ View = "editor" /\ p = f.ansProj /\ Fresh
               THEN [proj |-> p, fwd |-> 0, work |-> FALSE]
               ELSE NoKeep
  /\ UNCHANGED <<f, asks, lib, mod, sess, sreq, fact, dirty, pendingOpen, reg, cnt>>
  /\ act' = Label("RouteCommitted")

LibraryChanged(p, v) ==
  /\ lib.epoch < MaxLibraryChanges
  /\ v # lib.access[p]
  /\ lib' = LET a2 == [lib.access EXCEPT ![p] = v]
            IN [access |-> a2, epoch |-> lib.epoch + 1, hist |-> Append(lib.hist, a2)]
  /\ keep' = NoKeep
  /\ UNCHANGED <<route, nreq, f, asks, mod, sess, sreq, fact, dirty, pendingOpen, reg, cnt>>
  /\ act' = Label("LibraryChanged")

ModuleLoaded ==
  /\ mod = "loading"
  /\ mod' = "loaded"
  /\ UNCHANGED <<route, nreq, f, asks, lib, sess, sreq, fact, dirty, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("ModuleLoaded")

-----------------------------------------------------------------------------
(* Focus, target (D7) *)

TWaiting == f.st \in {"resolving", "leaving", "opening", "focused", "held"}

KeepWork == IF keep.proj # None THEN [keep EXCEPT !.work = TRUE] ELSE keep

\* A request for the project focus is on or moving to is not a new open: focus keeps its state and,
\* when focused, forwards the chat. Any other project starts a move: the session focus was on becomes
\* the one being left, and a leave flush still running for it is kept (one flush in flight).
TRouteHeard ==
  /\ Focus = "target"
  /\ route # NoReq /\ route.id # f.req.id
  /\ IF route.project = f.req.project /\ (f.st # "idle" \/ route.project = Home)
       THEN /\ f' = [f EXCEPT !.req = route]
            /\ keep' = IF keep.proj # None /\ f.st = "focused" THEN [keep EXCEPT !.fwd = @ + 1] ELSE keep
            /\ act' = Label(IF f.st = "focused" THEN "ChatForwarded" ELSE "RouteHeard")
       ELSE LET p == route.project
                from2 == IF f.on # None /\ f.on # p THEN f.on ELSE None
                lf2 == IF from2 = f.from /\ f.lf # "failed" THEN f.lf ELSE "none"
            IN /\ f' = [f EXCEPT !.req = route,
                          !.st = IF p = Home THEN (IF from2 = None THEN "idle" ELSE "leaving") ELSE "resolving",
                          !.ans = "none", !.ansProj = None, !.ansEpoch = 0,
                          !.from = from2, !.lf = lf2, !.lfp = IF lf2 = "none" THEN None ELSE f.lfp,
                          !.opened = FALSE, !.blocked = FALSE]
               /\ keep' = keep
               /\ act' = Label("RouteHeard")
  /\ mod' = IF route.project \in Projects THEN Warm ELSE mod
  /\ pendingOpen' = PendingAfter(f')
  /\ UNCHANGED <<route, nreq, asks, lib, sess, sreq, fact, dirty, reg, cnt>>

\* Focus asks access for its request, and again once the epoch moved; it starts the import beside
\* it (S31). The re-ask is where focus notices the library change: it withdraws (cancelPendingOpen)
\* any open of its own waiting in pendingOpen with a request from an older epoch, and asks the open
\* for the project it is opening again only from the fresh answer. A kept request is usable only at
\* its epoch (PersonOpenAsked), so a library change drops every kept request in any state.
TAccessAsked ==
  /\ Focus = "target"
  /\ TWaiting /\ f.req.project \in Projects /\ ~Fresh
  /\ ~\E a \in asks : a.id = f.req.id
  /\ asks' = asks \cup {[id |-> f.req.id, project |-> f.req.project, epoch |-> lib.epoch]}
  /\ LET withdraw == pendingOpen # NoPending /\ pendingOpen.req # NoOpenReq
                     /\ (pendingOpen.req.epoch # lib.epoch \/ FocusPending)
     IN /\ f' = [f EXCEPT !.opened = IF FocusPending THEN FALSE ELSE f.opened]
        /\ pendingOpen' = IF withdraw THEN NoPending ELSE pendingOpen
  /\ mod' = Warm
  /\ keep' = KeepWork
  /\ UNCHANGED <<route, nreq, lib, sess, sreq, fact, dirty, reg, cnt>>
  /\ act' = Label("AccessAsked")

TAccepts(a) == IF IdFence THEN TWaiting /\ a.id = f.req.id ELSE TWaiting /\ ~Fresh

TAnswered(a) ==
  IF ~TAccepts(a)
    THEN f' = f
    ELSE LET v == lib.access[a.project]
             ready == v = "ready"
             st2 == CASE ~ready -> "held"
                      [] f.st \in {"resolving", "held"} ->
                           IF LeaveDone THEN "opening"
                           ELSE IF f.lf = "failed" THEN "flushFailed" ELSE "leaving"
                      [] OTHER -> f.st
         IN f' = [f EXCEPT !.ans = v, !.ansProj = a.project, !.ansEpoch = lib.epoch,
                    !.st = st2, !.opened = IF st2 = "held" THEN FALSE ELSE f.opened,
                    !.blocked = f.blocked \/ st2 = "flushFailed",
                    !.kept = [f.kept EXCEPT ![a.project] = IF ready /\ PersonCommands THEN lib.epoch ELSE None]]

TLeaveFlushStarted ==
  /\ Focus = "target"
  /\ f.st = "leaving" /\ f.lf = "none" /\ f.from # None /\ Closeable(f.from)
  /\ f' = [f EXCEPT !.lf = "running", !.lfp = f.from]
  /\ keep' = KeepWork
  /\ UNCHANGED <<route, nreq, asks, lib, mod, sess, sreq, fact, dirty, pendingOpen, reg, cnt>>
  /\ act' = Label("LeaveFlushStarted")

TSettled(ok) ==
  f' = IF f.st = "leaving"
         THEN IF ok THEN [f EXCEPT !.lf = "ok", !.st = IF f.req.project = Home THEN "idle" ELSE "opening"]
              ELSE [f EXCEPT !.lf = "failed", !.st = "flushFailed", !.blocked = TRUE]
         ELSE [f EXCEPT !.lf = IF ok THEN "ok" ELSE "failed"]

\* The session being left closed while focus waited: its close flush ran in place of the leave flush.
TLeft ==
  /\ Focus = "target"
  /\ f.st = "leaving" /\ f.lf # "running" /\ LeaveDone
  /\ f' = [f EXCEPT !.st = IF f.req.project = Home THEN "idle" ELSE "opening"]
  /\ UNCHANGED <<route, nreq, asks, lib, mod, sess, sreq, fact, dirty, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("LeaveFlushSettled")

\* `open` carries the request built from the current ready answer (D7).
TOpenAsked ==
  /\ Focus = "target"
  /\ f.st = "opening" /\ ~f.opened /\ f.ans = "ready" /\ Fresh
  /\ \E out \in Outcomes(f.ansProj) :
       /\ RegistryOpen(f.ansProj, Req(f.ansProj, f.ansEpoch), out, cnt)
       /\ f' = IF out = "failed" THEN [f EXCEPT !.st = "held", !.ans = "failed"]
               ELSE [f EXCEPT !.opened = TRUE, !.live = out \in {"spawn", "touch"}]
  /\ keep' = IF sess[f.ansProj] = "none" THEN KeepWork ELSE keep
  /\ UNCHANGED <<route, nreq, asks, lib, mod, dirty, reg>>
  /\ act' = Label("OpenAsked")

\* `opening` joins four facts (D7, R3-F3): access ready for the current epoch, the import, the
\* session live in answer to focus's open, and its two facts each settled or the one open bound passed.
\* The move ends there: the session left can gain no unsaved work while it is not on screen.
TOpenJoined ==
  /\ Focus = "target"
  /\ f.st = "opening" /\ f.opened /\ f.ans = "ready" /\ Fresh
  /\ pendingOpen.project # f.ansProj
  /\ sess[f.ansProj] = "live" /\ mod = "loaded" /\ FactsOk(f.ansProj)
  /\ f' = [f EXCEPT !.st = "focused", !.on = f.ansProj, !.from = None, !.lf = "none", !.lfp = None]
  /\ UNCHANGED <<route, nreq, asks, lib, mod, sess, sreq, fact, dirty, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("OpenJoined")

\* The session focus opened went live and closed before the join: the person's close or a budget
\* close (idle expiry spares it). An open the registry dropped or superseded never went live: its reply
\* sends focus back to TOpenAsked instead. Focus never reopens or closes on its own (I3): it settles on the project, whose state
\* derives `closed` with the reopen offer, a person's open through focus.
TOpenLost ==
  /\ Focus = "target"
  /\ f.st = "opening" /\ f.opened /\ f.live /\ f.ans = "ready"
  /\ sess[f.ansProj] = "none" /\ pendingOpen.project # f.ansProj
  /\ f' = [f EXCEPT !.st = "focused", !.on = f.ansProj, !.from = None, !.lf = "none", !.lfp = None]
  /\ UNCHANGED <<route, nreq, asks, lib, mod, sess, sreq, fact, dirty, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("OpenLost")

\* Focus's open landed on a failed session: the touch after budgetRefused, or an open of a project whose
\* close failed earlier. The session holds its slot but cannot be worked in, so focus does not join:
\* it settles on the project, whose state derives `closed` with the reopen offer, as TOpenLost does.
\* A failed start (nothing in the slot) gives `held` instead (TOpenAsked).
TOpenOnFailed ==
  /\ Focus = "target"
  /\ f.st = "opening" /\ f.opened /\ f.live /\ f.ans = "ready"
  /\ sess[f.ansProj] = "failed" /\ pendingOpen.project # f.ansProj
  /\ f' = [f EXCEPT !.st = "focused", !.on = f.ansProj, !.from = None, !.lf = "none", !.lfp = None]
  /\ UNCHANGED <<route, nreq, asks, lib, mod, sess, sreq, fact, dirty, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("OpenOnFailed")

TRetry ==
  /\ Focus = "target"
  /\ cnt.retries < MaxRetries /\ f.st \in {"flushFailed", "held"}
  /\ f' = IF f.st = "flushFailed"
            THEN [f EXCEPT !.st = "leaving", !.lf = "none", !.blocked = FALSE]
            ELSE [f EXCEPT !.st = "resolving", !.ans = "none", !.ansProj = None, !.ansEpoch = 0, !.opened = FALSE]
  /\ cnt' = [cnt EXCEPT !.retries = @ + 1]
  /\ UNCHANGED <<route, nreq, asks, lib, mod, sess, sreq, fact, dirty, pendingOpen, reg, keep>>
  /\ act' = Label("Retry")

-----------------------------------------------------------------------------
(* Focus, today: ProjectRouteGate's effects (project-route.tsx 141 to 296) *)

\* The access effect re-runs when the requested project, the library revision (`projectManager`
\* carries `libraryRevision`, line 247) or the retry attempt changes; a chat change alone does not
\* re-run it. Its start cancels the previous run (the AbortController, lines 157 and 239).
DDeps == route # NoReq /\ (route.project # f.req.project \/ (route.project \in Projects /\ f.effEpoch # lib.epoch))

\* The layout effect (lines 262 to 273): a bare `open` and `touch` once `resolved` is ready for the
\* route; the registry answers it in the same step. The retained kernel (211 to 219) is not modelled.
BareOpen(p, c) == \E out \in Outcomes(p) : RegistryOpen(p, NoOpenReq, out, c)

\* Run the effect for request r (lines 159 to 238). On Home it flushes the registration and clears
\* `resolved` (160 to 180); otherwise it asks access (184). The import starts beside it (147 to 151).
\* Coming back to the resolved project re-runs the layout effect, whose `open` is a touch.
DStart(r, retry, c) ==
  LET p == r.project
      from2 == IF f.ans = "ready" /\ f.ansProj # p THEN f.ansProj ELSE f.from
      session == RegNow
      newer == p # f.req.project
      unblock == IF newer \/ retry THEN FALSE ELSE f.blocked
  IN /\ IF p = Home
          THEN /\ f' = IF session # None
                         THEN [f EXCEPT !.req = r, !.effEpoch = lib.epoch, !.st = "leaving", !.from = from2,
                                 !.lf = "running", !.lfp = session, !.pend = "none", !.blocked = unblock,
                                 !.err = IF retry THEN FALSE ELSE f.err]
                         ELSE [f EXCEPT !.req = r, !.effEpoch = lib.epoch, !.st = "idle", !.from = from2,
                                 !.ans = "none", !.ansProj = None, !.err = FALSE, !.blocked = unblock]
               /\ asks' = asks
          ELSE /\ f' = [f EXCEPT !.req = r, !.effEpoch = lib.epoch, !.st = "resolving", !.from = from2,
                          !.blocked = unblock, !.err = IF retry THEN FALSE ELSE f.err,
                          !.sup = f.sup \/ (newer /\ f.st = "leaving" /\ f.lf = "running")]
               /\ asks' = asks \cup {[id |-> r.id, project |-> p, epoch |-> lib.epoch]}
     /\ IF p \in Projects /\ p = f.ansProj /\ f.ans = "ready" /\ newer
          THEN BareOpen(p, c) ELSE NoOpen /\ cnt' = c
     /\ mod' = IF p \in Projects THEN Warm ELSE mod

DRerun ==
  /\ Focus = "today"
  /\ DDeps /\ RegFlushed
  /\ DStart(route, FALSE, cnt)
  /\ UNCHANGED <<route, nreq, lib, dirty, reg, keep>>
  /\ act' = Label(IF route.project # f.req.project THEN "RouteHeard" ELSE "AccessAsked")

\* `setResolved` and the layout effect's `open` in one commit (lines 221 to 225, 262 to 273). The
\* layout effect opens only while the route still names the resolved project.
DResolve(g, v, e) ==
  /\ f' = [g EXCEPT !.st = IF v = "ready" THEN "focused" ELSE "held", !.ans = v, !.ansProj = f.req.project,
             !.ansEpoch = e, !.err = FALSE, !.pend = "none",
             !.on = IF v = "ready" THEN f.req.project ELSE f.on]
  /\ IF v = "ready" /\ route.project = f.req.project THEN BareOpen(f.req.project, cnt) ELSE NoOpen /\ cnt' = cnt

\* The answer reaches the run that asked only while that run is not cancelled (lines 196 to 198).
\* The run then flushes the registration it holds when it names another project (199 to 203),
\* reusing a flush already in flight (90 to 100), and resolves.
DAnswered(a) ==
  IF a.id = f.req.id /\ a.epoch = f.effEpoch /\ f.st = "resolving"
    THEN LET v == lib.access[a.project]
             session == RegNow
         IN IF session # None /\ session # f.req.project
              THEN /\ f' = [f EXCEPT !.st = "leaving", !.pend = v, !.pendEpoch = lib.epoch,
                              !.lf = "running", !.lfp = session]
                   /\ NoOpen /\ cnt' = cnt
              ELSE DResolve(f, v, lib.epoch)
    ELSE /\ f' = f
         /\ NoOpen /\ cnt' = cnt

DSettled(ok) ==
  IF f.st = "leaving"
    THEN IF ok
           THEN IF f.req.project = Home
                  THEN /\ f' = [f EXCEPT !.lf = "ok", !.st = "idle", !.ans = "none", !.ansProj = None,
                                  !.err = FALSE]
                       /\ NoOpen /\ cnt' = cnt
                  ELSE DResolve([f EXCEPT !.lf = "ok"], f.pend, f.pendEpoch)
           ELSE /\ f' = [f EXCEPT !.lf = "failed", !.st = "flushFailed", !.err = TRUE, !.blocked = TRUE]
                /\ NoOpen /\ cnt' = [cnt EXCEPT !.flushFails = @ + 1]
    ELSE /\ f' = [f EXCEPT !.lf = IF ok THEN "ok" ELSE "failed"]
         /\ NoOpen /\ cnt' = IF ok THEN cnt ELSE [cnt EXCEPT !.flushFails = @ + 1]

\* The notice's retry bumps the attempt (lines 300 to 303), which re-runs the effect for the route.
DRetry ==
  /\ Focus = "today"
  /\ cnt.retries < MaxRetries /\ f.st \in {"flushFailed", "held"} /\ route # NoReq /\ RegFlushed
  /\ DStart(route, TRUE, [cnt EXCEPT !.retries = @ + 1])
  /\ UNCHANGED <<route, nreq, lib, dirty, reg, keep>>
  /\ act' = Label("Retry")

\* ProjectPersistenceGuard's passive effect (project-live-sessions.tsx 797 to 812, 721): the
\* focused session registers its flush, and the one that lost focus clears it, after the commit.
\* ProjectFocus.today-late-effect.cfg cites 655 and 797 to 812 too.
RegSync ==
  /\ Focus = "today" /\ LateRegistration
  /\ reg # RegTarget
  /\ reg' = RegTarget
  /\ UNCHANGED <<route, nreq, f, asks, lib, mod, sess, sreq, fact, dirty, pendingOpen, keep, cnt>>
  /\ act' = Label("FlushRegistered")

-----------------------------------------------------------------------------
(* Answers and the leave flush: the environment's step, and focus's reaction to it *)

AccessAnswered(a) ==
  /\ a \in asks
  /\ asks' = asks \ {a}
  /\ IF Focus = "target"
       THEN TAnswered(a) /\ pendingOpen' = StandingAfter(f') /\ UNCHANGED <<sess, sreq, fact>> /\ cnt' = cnt
       ELSE DAnswered(a)
  /\ UNCHANGED <<route, nreq, lib, mod, dirty, reg, keep>>
  /\ act' = Label("AccessAnswered")

LeaveFlushSettled(ok) ==
  /\ f.lf = "running"
  /\ ok \/ cnt.flushFails < MaxFlushFails
  /\ dirty' = IF ok THEN dirty \ {f.lfp} ELSE dirty
  /\ IF Focus = "target"
       THEN /\ TSettled(ok) /\ NoOpen
            /\ cnt' = IF ok THEN cnt ELSE [cnt EXCEPT !.flushFails = @ + 1]
       ELSE DSettled(ok)
  /\ UNCHANGED <<route, nreq, asks, lib, mod, reg, keep>>
  /\ act' = Label("LeaveFlushSettled")

-----------------------------------------------------------------------------
(* The person *)

\* Unsaved work appears only in the project whose editor is mounted.
Edit(p) ==
  /\ View = "editor" /\ p = f.ansProj /\ mod = "loaded" /\ sess[p] = "live" /\ p \notin dirty
  /\ dirty' = dirty \cup {p}
  /\ UNCHANGED <<route, nreq, f, asks, lib, mod, sess, sreq, fact, pendingOpen, reg, keep, cnt>>
  /\ act' = Label("Edit")

\* The sidebar's open or a notice's reopen (S39) is a handler send to focus, which sends the request it
\* kept for that project and does not move. A kept request is usable only at the library epoch of
\* its ready answer. A reopen of the focused project joins its facts again.
PersonOpenAsked(p) ==
  /\ cnt.pOpens < MaxPersonOpens
  /\ f.kept[p] = lib.epoch /\ sess[p] = "none"
  /\ \E out \in Outcomes(p) :
       /\ RegistryOpen(p, Req(p, f.kept[p]), out, [cnt EXCEPT !.pOpens = @ + 1])
       /\ f' = CASE f.st = "focused" /\ f.ansProj = p /\ out # "failed" ->
                       [f EXCEPT !.st = "opening", !.opened = TRUE, !.live = out = "spawn"]
                  \* Any outcome displaces the single slot: a wait keeps only the latest destination, and a
                  \* spawn or a failed start into the room clears it (sessions.machine.ts hasRoom). The
                  \* registry sends no reply: focus derives that its own waiting open was displaced,
                  \* because focus itself sends the displacing person's open, and focus asks again.
                  [] FocusPending /\ p # pendingOpen.project -> [f EXCEPT !.opened = FALSE]
                  [] OTHER -> f
  /\ UNCHANGED <<route, nreq, asks, lib, mod, dirty, reg, keep>>
  /\ act' = Label("PersonOpenAsked")

\* A close goes to the registry, whose session runs its close flush.
PersonClosed(p) ==
  /\ cnt.pCloses < MaxPersonCloses
  /\ Closeable(p)
  /\ sess' = [sess EXCEPT ![p] = "closing"]
  /\ keep' = IF keep.proj = p THEN NoKeep ELSE keep
  /\ cnt' = [cnt EXCEPT !.pCloses = @ + 1]
  /\ UNCHANGED <<route, nreq, f, asks, lib, mod, sreq, fact, dirty, pendingOpen, reg>>
  /\ act' = Label("PersonClosed")

\* The person discards a retained session's unsaved work explicitly; its close then runs clean.
PersonDiscarded(p) ==
  /\ cnt.discards < MaxDiscards
  /\ Closeable(p) /\ p \in dirty
  /\ sess' = [sess EXCEPT ![p] = "closing"]
  /\ dirty' = dirty \ {p}
  /\ keep' = IF keep.proj = p THEN NoKeep ELSE keep
  /\ cnt' = [cnt EXCEPT !.discards = @ + 1]
  /\ UNCHANGED <<route, nreq, f, asks, lib, mod, sreq, fact, pendingOpen, reg>>
  /\ act' = Label("PersonDiscarded")

-----------------------------------------------------------------------------

FocusStep ==
  \/ TRouteHeard \/ TAccessAsked \/ TLeaveFlushStarted \/ TLeft \/ TOpenAsked \/ TOpenJoined \/ TRetry
  \/ TOpenLost \/ TOpenOnFailed
  \/ DRerun \/ DRetry \/ RegSync
  \/ \E a \in asks : AccessAnswered(a)
  \/ \E ok \in BOOLEAN : LeaveFlushSettled(ok)
  \/ \E p \in Projects : PersonOpenAsked(p)

Next ==
  \/ \E p \in Places : \E c \in ChatsFor(p) : RouteCommitted(p, c)
  \/ \E p \in Projects : \E v \in AccessValues : LibraryChanged(p, v)
  \/ \E a \in asks : AccessAnswered(a)
  \/ \E ok \in BOOLEAN : LeaveFlushSettled(ok)
  \/ ModuleLoaded
  \/ TRouteHeard \/ TAccessAsked \/ TLeaveFlushStarted \/ TLeft \/ TOpenAsked \/ TOpenJoined \/ TRetry
  \/ TOpenLost \/ TOpenOnFailed
  \/ DRerun \/ DRetry \/ RegSync
  \/ \E p \in Projects :
       \/ ChatReady(p) \/ FirstCheckSettled(p) \/ OpenBoundPassed(p) \/ Edit(p)
       \/ PersonOpenAsked(p) \/ PersonClosed(p) \/ IdleExpired(p)
       \/ BudgetSwitchClose(p) \/ SessionClosed(p) \/ CloseFlushFailed(p) \/ CloseFailed(p) \/ PersonDiscarded(p)

Spec == Init /\ [][Next]_vars

\* Weak fairness of the library, the leave flush, the import and the registry, and of focus's own steps.
LiveSpec ==
  /\ Spec
  /\ WF_vars(TRouteHeard) /\ WF_vars(TAccessAsked) /\ WF_vars(TLeaveFlushStarted) /\ WF_vars(TLeft)
  /\ WF_vars(TOpenAsked) /\ WF_vars(TOpenJoined) /\ WF_vars(TOpenLost) /\ WF_vars(TOpenOnFailed)
  /\ WF_vars(\E a \in asks : AccessAnswered(a))
  /\ WF_vars(\E ok \in BOOLEAN : LeaveFlushSettled(ok))
  /\ WF_vars(ModuleLoaded)
  /\ WF_vars(\E p \in Projects : OpenBoundPassed(p))
  /\ WF_vars(\E p \in Projects : BudgetSwitchClose(p))
  /\ WF_vars(\E p \in Projects : SessionClosed(p))

Symmetry == Permutations(Projects) \cup Permutations(Chats)

-----------------------------------------------------------------------------
(* Safety *)

\* I2. Focused on a project only when it is the newest committed request's, or a newer request has
\* not reached focus yet.
FocusFollowsLatestRequest ==
  f.st = "focused" => (f.ansProj = route.project \/ route.id # f.req.id)

\* I3. Not opening or focused on a project while another project holds unsaved work. Stated over the
\* dirty set, which the person and the flushes own, not over focus's own record of the move.
FlushBeforeLeave ==
  (f.st \in {"opening", "focused"} /\ f.ansProj \in Projects) => \A q \in dirty : q = f.ansProj

\* I3. A failed leave flush holds focus in `flushFailed`, which sends no route open, until the person
\* retries or a newer request for another project arrives.
FailedFlushBlocks == f.blocked => f.st = "flushFailed"

\* I3. No step of focus starts a session's close; only PersonClosed, PersonDiscarded, IdleExpired and
\* BudgetSwitchClose do.
FocusNeverCloses == [][FocusStep => \A p \in Projects : Closeable(p) => sess'[p] = sess[p]]_vars

\* I4. A step that opens a session or fills pendingOpen for a route request does so from a ready answer
\* for the current request's project at the library's current epoch. Ruled: compared by project and by
\* the current library epoch; an earlier ready answer for the same project counts only if no library
\* change has happened since that answer was given (D7). Every open focus sends, a person's included,
\* carries a request for a project the library holds ready at its current epoch.
RouteOpen == (\E p \in Projects : sess[p] = "none" /\ sess'[p] = "live") \/ (pendingOpen' # NoPending /\ pendingOpen' # pendingOpen)
\* Extended to the registry's resume of a request focus sent (SessionClosed spawning pendingOpen's
\* project with its request): focus has not withdrawn it, so it is still opening that project from a
\* ready answer, or keeps a ready request for it (a person's open). Focus withdraws when it moves, when
\* it is held, when it re-asks after a library change and on budgetRefused for the session it is opening
\* (CloseFailed). It covers a resume into a freed slot and a session resumed by its own close. Between LibraryChanged and that re-ask the
\* registry, which cannot see the epoch, may still resume; focus then does not join (TOpenJoined needs
\* a fresh answer). target-resume-window shows that window.
Resumed(q) == pendingOpen.project = q /\ pendingOpen.req # NoOpenReq /\ sess[q] = "none" /\ sess'[q] = "live"
\* Only SessionClosed takes a session from closing to none, so this names its steps cheaply.
Closed == \E v \in Projects : sess[v] = "closing" /\ sess'[v] = "none"
\* The registry's resume of a request waiting for the session that is closing itself: that session's
\* close frees its own slot and SessionClosed respawns it from pendingOpen, closing to live in one step
\* with its unsaved work flushed (a close that failed keeps it dirty instead).
SelfResumed(q) ==
  pendingOpen.project = q /\ pendingOpen.req # NoOpenReq /\ sess[q] = "closing" /\ sess'[q] = "live" /\ q \notin dirty'
ResumeStep(q) == (Closed /\ Resumed(q)) \/ SelfResumed(q)
ResumeStands(q) ==
  \/ f.st = "opening" /\ f.opened /\ f.ans = "ready" /\ f.ansProj = q /\ pendingOpen.req.epoch = f.ansEpoch
  \/ f.kept[q] = pendingOpen.req.epoch
\* The requests an open sends in this step: a session it spawns, or the request it leaves in pendingOpen.
\* Outside SessionClosed only focus's opens, a person's included, do either.
SentReqs ==
  {sreq'[q] : q \in {p \in Projects : sess[p] = "none" /\ sess'[p] = "live"}}
    \cup (IF pendingOpen' # pendingOpen /\ pendingOpen' # NoPending THEN {pendingOpen'.req} ELSE {})
PersonOpenStep == cnt'.pOpens # cnt.pOpens
OpenOnlyOnCurrentAccess ==
  [][/\ (~Closed /\ ~PersonOpenStep /\ RouteOpen)
         => (f'.ans = "ready" /\ f'.ansEpoch = lib.epoch /\ f'.ansProj = f'.req.project)
     /\ ~Closed => \A rq \in SentReqs \ {NoOpenReq} : rq.epoch = lib.epoch /\ lib.access[rq.project] = "ready"
     /\ \A q \in Projects : ResumeStep(q) => ResumeStands(q)]_vars

\* I3, action form: while a failed leave flush blocks, no step of focus opens a session or fills
\* pendingOpen, route open or bare. A person's open (S39) is the person's command to the registry
\* through focus and does not move focus, so it stays allowed; the registry's resume is its own step.
FailedFlushSendsNoOpen == [][(f.blocked /\ ~Closed /\ ~PersonOpenStep) => SentReqs = {}]_vars

\* With RegistryChecksEpoch and no person close: focus never settles on `closed` for a project it holds a
\* fresh ready answer for unless that project's session went live and something closed it. In that
\* config only focus's own open can be closed, and only after the join moved focus elsewhere.
NoSpuriousClosed ==
  ~(f.st = "focused" /\ f.ans = "ready" /\ Fresh /\ f.ansProj \in Projects
    /\ sess[f.ansProj] = "none" /\ pendingOpen.project # f.ansProj)

\* Witness: the target's registry resumes focus's open after a library change focus has not noticed.
StaleResumeUnreached == [][\A q \in Projects : ResumeStep(q) => pendingOpen.req.epoch = lib.epoch]_vars

\* I4. Every open carries a request for its project built from a ready answer: the library's own
\* history (`lib.hist`, the access at each epoch) holds that project ready at the epoch the request
\* names. This covers each live session's input, and the request
\* pendingOpen keeps for the open the registry resumes. A person's open carries the request focus
\* kept for that project.
FromReadyAnswer(p, rq) ==
  rq # NoOpenReq /\ rq.project = p /\ rq.epoch \in 0..lib.epoch /\ lib.hist[rq.epoch + 1][p] = "ready"
OpenCarriesRequest ==
  /\ \A p \in Projects : sess[p] # "none" => FromReadyAnswer(p, sreq[p])
  /\ pendingOpen # NoPending => FromReadyAnswer(pendingOpen.project, pendingOpen.req)

\* The registry answers every displacement of focus's waiting open (resume, stale drop, another open
\* taking the single slot by a wait, a spawn or a failed start): while focus has an open out that has
\* not gone live, it is still waiting in pendingOpen.
OpeningWaitsOrWentLive == (f.st = "opening" /\ f.opened /\ ~f.live) => pendingOpen.project = f.ansProj

\* I20. The editor only when access is ready, the import loaded, the session live and each session
\* fact settled or the open bound passed.
EditorOnlyWhenReady ==
  View = "editor" =>
    /\ f.ans = "ready" /\ mod = "loaded" /\ Live(f.ansProj)
    /\ fact[f.ansProj] \in {"settled", "bound"}

\* I20. Focus enters `focused` with the editor shown only from a ready answer for the library's
\* current epoch.
EditorJoinFresh ==
  [][(f.st # "focused" /\ f'.st = "focused" /\ View' = "editor")
       => (lib.access[f'.ansProj] = "ready" /\ f'.ansEpoch = lib.epoch)]_vars

\* I20. Within one open the editor is derived before the first file check settles only after the
\* open bound passed: the viewer is never followed by a first `filesChecking`.
FirstCheckBeforeEditor == View = "editor" => CheckOk(f.ansProj)

\* I20. A committed request for another project than focus's request derives `resolving`, also
\* before focus has heard any request. Compared by project.
EditorOnlyForCommittedProject ==
  (route # NoReq /\ route.project \in Projects /\ route.project # f.req.project) => View = "resolving"

\* I20. After a commit for the project the editor shows, the editor stays until a commit for another
\* project, a library change or that session's close; focus answers the commit with no leave flush,
\* access question or session-creating open, and with at most one ChatForwarded.
SameProjectKeepsEditor == keep.proj # None => (View = "editor" /\ ~keep.work /\ keep.fwd <= 1)

\* I6. A session leaves the live set only through its own close, whose flush runs first.
CloseAfterFlush ==
  [][\A p \in Projects : (sess[p] # "none" /\ sess'[p] = "none") => (sess[p] = "closing" /\ p \notin dirty')]_vars

\* I6 (ruled): a dirty session never leaves the live set unless its flush succeeded or the person
\* discarded it. A step where the close flush failed (the environment's failure count moves) never
\* takes a dirty session out of the live set, and unsaved work leaves the dirty set only by a
\* successful flush (leave or close) or the person's discard.
DirtyNeverDiscarded ==
  [][/\ \A p \in Projects : (p \in dirty /\ sess[p] # "none" /\ sess'[p] = "none") => cnt'.closeFails = cnt.closeFails
     /\ \A p \in dirty \ dirty' :
          \/ cnt'.discards > cnt.discards
          \/ sess[p] = "closing" /\ sess'[p] # "closing" /\ cnt'.closeFails = cnt.closeFails
          \/ f.lf = "running" /\ f.lfp = p /\ f'.lf = "ok"]_vars

\* I18. An answer for another request changes no focus state.
Stale(a) == IF Focus = "target" THEN a.id # f.req.id ELSE ~(a.id = f.req.id /\ a.epoch = f.effEpoch)
StaleReplyIgnored == [][\A a \in asks : (asks' = asks \ {a} /\ Stale(a)) => f' = f]_vars

(* Liveness *)

Settled ==
  \/ route = NoReq
  \/ route.project = Home /\ f.req = route /\ f.st \in {"idle", "flushFailed"}
  \/ route.project \in Projects /\ f.req = route /\ f.st \in {"focused", "held", "flushFailed"}

\* I2. Once requests stop, focus settles on the last one: focused, held, or a failed leave flush.
RequestEventuallySettles == <>[]Settled

(* Witness: the fifth ruled statement's case. In flushFailed, a person's open waits while the dirty
   session being left is retained after its close failed *)
RetainedUnreached ==
  ~(f.st = "flushFailed" /\ pendingOpen # NoPending /\ cnt.closeFails > 0
    /\ \E p \in dirty : Closeable(p) /\ p = f.from)

(* Witness: today, an edit in the window before ProjectPersistenceGuard registers the flush *)
EditBeforeRegistrationUnreached == ~(\E p \in dirty : reg # p /\ RegTarget = p)

(* Witness: today, a request heard while the leave flush runs, and the newer one then focused *)
SupersededFlushUnreached == ~(f.sup /\ f.st = "focused" /\ f.req.id = route.id)

=============================================================================
