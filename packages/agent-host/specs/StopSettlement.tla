---------------------------- MODULE StopSettlement ----------------------------
(***************************************************************************)
(* The seam between a stopped run, the gateway attempt it cut, and the     *)
(* next request that must resolve that attempt first (EQ1, RA-S11). The    *)
(* incident fixed by taucad/tau#851: Send now cut a live attempt, the next *)
(* run's first step found it `pending`, ended `MODEL_ATTEMPT_PENDING`, and *)
(* the page showed "Chat paused". ChatRunSlot has one native run, so it    *)
(* cannot start a native successor after a stop; this module can.          *)
(*                                                                         *)
(*   attempt  one gateway attempt A, live when the run starts. A stop cuts *)
(*            it (the client closes the stream); the API notices the cut   *)
(*            within Notice ticks (`finish()` on the closed reply). A lost *)
(*            reply leaves it `pending` with no cut; the run retries once  *)
(*            in place (EQ1), and the retry's `prepareInvocation` looks A  *)
(*            up first while the run stays running. The recovery sweep     *)
(*            settles any unresolved attempt at Due (due_at + grace).      *)
(*   next     after a stop or a pause the user starts a run (Send now, a   *)
(*            new message) or resumes. Either looks A up first. A start    *)
(*            runs `settledInvocation` (session.ts); a resume runs         *)
(*            `resolveInvocations` (tau-agent-host.ts). A pending answer   *)
(*            waits and asks again while the wait budget lasts or, when    *)
(*            the gateway states `settlesBy` (= Due, W2), until Due; else  *)
(*            a start or retry ends `RUN_ABANDONED` (paused) and a resume  *)
(*            is refused `MODEL_ATTEMPT_PENDING` (the pending card).       *)
(*   page     "checking" while a lookup runs. A paused or stopped run      *)
(*            offers Resume. After a refused Resume the run's own card     *)
(*            ("Chat paused", "You stopped this turn") outranks the        *)
(*            pending refusal (`selectVisibleChatError`) and offers Resume *)
(*            again; `pending` marks that refusal.                         *)
(*                                                                         *)
(* Time is a tick counter from A's start; one wait is one tick. ASSUME     *)
(* Notice < Budget < Due: the API notices a cut well inside the host's     *)
(* short waits (Budget, `pendingAttemptWaits`), and recovery is minutes    *)
(* away, beyond them; only the gateway's `settlesBy` reaches it (W2, D2).  *)
(*                                                                         *)
(* Knobs (all TRUE is the implementation):                                 *)
(*   ImmediateCut  the API terminalizes a noticed client cut at once, as   *)
(*                 it does for a stopping process (taucad/tau#851)         *)
(*   StartWaits    a start's lookup waits within the budget (#851)         *)
(*   ResumeWaits   a resume's lookup waits within the budget               *)
(*   SettlesBy     the gateway states `settlesBy` on a pending answer and  *)
(*                 the host keeps waiting until it (W2)                    *)
(***************************************************************************)
EXTENDS Integers

CONSTANTS Notice, Budget, Due, ImmediateCut, StartWaits, ResumeWaits, SettlesBy

ASSUME Notice \in Nat /\ Budget \in Nat /\ Due \in Nat /\ Notice < Budget /\ Budget < Due

VARIABLES
    att,      \* "live" | "cut" | "lost" | "settled": the gateway's row for A
    noticed,  \* the API has noticed the client cut
    cutAt,    \* the tick the stop cut A (0 when never cut)
    cause,    \* "none" | "stop" | "loss": how A's run ended
    clock,    \* ticks since A started
    req,      \* "none" | "start" | "resume" | "retry": the request resolving A
    first,    \* the tick that request first looked A up
    last,     \* the tick of its latest lookup (-1 before the first)
    page      \* "running" | "stopped" | "paused" | "pending" | "checking" | "proceeded"

vars == <<att, noticed, cutAt, cause, clock, req, first, last, page>>

Init ==
    /\ att = "live" /\ noticed = FALSE /\ cutAt = 0 /\ cause = "none"
    /\ clock = 0 /\ req = "none" /\ first = 0 /\ last = -1 /\ page = "running"

TypeOK ==
    /\ att \in {"live", "cut", "lost", "settled"}
    /\ noticed \in BOOLEAN /\ cutAt \in 0..Due /\ cause \in {"none", "stop", "loss"}
    /\ clock \in 0..Due /\ req \in {"none", "start", "resume", "retry"}
    /\ first \in 0..Due /\ last \in -1..Due
    /\ page \in {"running", "stopped", "paused", "pending", "checking", "proceeded"}

\* A start and the in-run retry both look A up in `prepareInvocation`.
Waits(r) == IF r = "resume" THEN ResumeWaits ELSE StartWaits

\* A pending answer is asked again: within the short waits, or until the stated `settlesBy` (W2).
KeepsWaiting == clock < first + Budget \/ (SettlesBy /\ clock < Due)

\* The page offers Resume.
Offered == page \in {"stopped", "paused", "pending"}

\* ---------------- the first run ----------------
Stop ==   \* Stop, or Send now's targeted cancel: the client closes A's stream
    /\ page = "running" /\ att = "live"
    /\ att' = "cut" /\ cutAt' = clock /\ cause' = "stop" /\ page' = "stopped"
    /\ UNCHANGED <<noticed, clock, req, first, last>>

LoseReply ==   \* the reply never arrives while A stays pending; the live run retries, looking A up first (EQ1)
    /\ page = "running" /\ att = "live" /\ req = "none"
    /\ att' = "lost" /\ cause' = "loss" /\ req' = "retry" /\ first' = clock /\ last' = -1
    /\ UNCHANGED <<noticed, cutAt, clock, page>>

StopRetry ==   \* Stop while the live run waits on A: the wait is aborted, A stays as it is
    /\ req = "retry"
    /\ page' = "stopped" /\ req' = "none" /\ last' = -1
    /\ UNCHANGED <<att, noticed, cutAt, cause, clock, first>>

\* ---------------- the API ----------------
ApiNotice ==   \* `finish()` sees the closed client
    /\ att = "cut" /\ ~noticed
    /\ noticed' = TRUE
    /\ att' = IF ImmediateCut THEN "settled" ELSE "cut"
    /\ UNCHANGED <<cutAt, cause, clock, req, first, last, page>>

Recover ==   \* the sweep settles an unresolved attempt at due_at + grace
    /\ att \in {"cut", "lost"} /\ clock = Due
    /\ att' = "settled"
    /\ UNCHANGED <<noticed, cutAt, cause, clock, req, first, last, page>>

Tick ==   \* time passes; the API notices a cut within Notice ticks
    /\ clock < Due
    /\ ~(att = "cut" /\ ~noticed /\ clock >= cutAt + Notice)
    /\ clock' = clock + 1
    /\ UNCHANGED <<att, noticed, cutAt, cause, req, first, last, page>>

\* ---------------- the user ----------------
Send ==   \* Send now or a new message: a successor run starts
    /\ page \in {"stopped", "paused", "pending"} /\ req = "none"
    /\ req' = "start" /\ first' = clock /\ last' = -1 /\ page' = "checking"
    /\ UNCHANGED <<att, noticed, cutAt, cause, clock>>

Resume ==
    /\ Offered /\ req = "none"
    /\ req' = "resume" /\ first' = clock /\ last' = -1 /\ page' = "checking"
    /\ UNCHANGED <<att, noticed, cutAt, cause, clock>>

\* ---------------- the host ----------------
Lookup ==   \* resolve-first: one `resolveInvocation` answer
    /\ req # "none"
    /\ clock > last \/ clock = Due   \* asks again after a wait; the clock stops at Due, time does not
    /\ IF att = "settled"
       THEN /\ page' = "proceeded" /\ req' = "none" /\ last' = -1
       ELSE IF Waits(req) /\ KeepsWaiting
            THEN /\ last' = clock /\ UNCHANGED <<page, req>>
            ELSE /\ page' = IF req = "resume" THEN "pending" ELSE "paused"
                 /\ req' = "none" /\ last' = -1
    /\ UNCHANGED <<att, noticed, cutAt, cause, clock, first>>

Done ==   \* the run proceeded: nothing left to model
    /\ page = "proceeded"
    /\ UNCHANGED vars

Next == Stop \/ LoseReply \/ StopRetry \/ ApiNotice \/ Recover \/ Tick \/ Send \/ Resume \/ Lookup \/ Done

\* The system's processes are weakly fair; the user is not.
Spec == Init /\ [][Next]_vars /\ WF_vars(ApiNotice) /\ WF_vars(Recover) /\ WF_vars(Tick) /\ WF_vars(Lookup)

\* A user who keeps taking the action the page offers.
LiveSpec == Spec /\ WF_vars(Resume)

\* ---------------- properties ----------------

\* The incident: a run started after a stop never ends paused on the attempt the stop cut.
StopNeverPauses == page = "paused" => cause = "loss"

\* A Resume after a stop is never refused on the attempt the stop cut.
StopNeverRefuses == page = "pending" => cause = "loss"

\* I3 (W2): no run ends on a wait code, and no Resume is refused one, while the gateway's
\* stated settlement time (Due) is still ahead.
NoWaitEndBeforeSettlesBy == page \in {"paused", "pending"} => clock >= Due

\* Every lookup the host starts is answered: a successor leaves admission.
LookupAnswered == (req # "none") ~> (req = "none")

\* A user who keeps taking the offered action gets the chat moving, even after a lost reply.
PausedProceeds == (page \in {"paused", "pending"}) ~> (page = "proceeded")

=============================================================================
