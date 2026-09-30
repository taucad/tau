---------------------------- MODULE ChatRunSlot ----------------------------
(***************************************************************************)
(* The run actor M1 (W7 run-actor blueprint): one chat, its run slot, the  *)
(* host API, the drivers and the chat log. Promoted from the W7 draft      *)
(* (lanes/b7) and extended with the blueprint's "W7 spec" additions.      *)
(*                                                                         *)
(* Runs: T = "r1" is a native Tau run (started, later resumed); X = "r2"   *)
(* is an external-agent run. Every await of today's host is its own        *)
(* action, so any other action can run in between. The host may crash     *)
(* between any two actions: memory is lost, the log is kept, and the page  *)
(* re-sends every command it has not seen answered. A person's gestures    *)
(* (`send`) and the environment (crash, freeze, relinquish, close, a stale *)
(* writer) have no fairness; every other step belongs to a live process.   *)
(*                                                                         *)
(* Action names are M1's event names where M1 has one: start, resume,      *)
(* cancel, steer, interrupt, resolveInterrupt (commands); admission-       *)
(* Prepared, admissionRefused, resumePrepared, resumeRefused, rows-        *)
(* Committed(k) (the decision batch of command k is durable), placed,      *)
(* placementRefused, agentEnded, approvalRequested, abandon (the           *)
(* driverStopBound timer enqueues W8's abandon), abandoned, markAbandoned, *)
(* logOpened, logFenced, complete, settlementPublished, acknowledge,       *)
(* invocationResolved, close, logClosed, relinquish, crash, restart.       *)
(* Environment and driver steps: send (a gesture or the page's send),      *)
(* hostClosed (the registry's HOST_CLOSED), driverSteered, toolStart,      *)
(* toolWrite, modelCall, gatewaySettles, replyShown, replyLost, freeze,    *)
(* staleAppend, quiescent (M1's quiescent tag, W6 releases the lock).      *)
(* Today-only steps: releaseEarly, commitRow, attach, pauseRecorded,       *)
(* rearmed; each is enabled only while its switch is FALSE.                *)
(*                                                                         *)
(* Phases: pc[k] per command handler ("idle" never sent, "resend" sent and *)
(* unanswered, then check, extGap, admit, placing, commit, live, rsRow,    *)
(* construct, bind, rearm, applied, wait, pausing, act, "done");           *)
(* drivers and ending for the drivers; alive, opened, claimed and          *)
(* hostState for the incarnation; callState for the model call; ghost for  *)
(* the stale writer.                                                       *)
(*                                                                         *)
(* Switches (S4 style): FALSE is today's behaviour, all TRUE is M1.        *)
(*   BoundaryExclusive  the append gate refuses a row that opens a run    *)
(*                      while another run of the chat is open (L2a D3)     *)
(*   HoldUntilRows      the external path keeps the reservation until its  *)
(*                      rows land and its driver is registered (L2a D2)    *)
(*   ReleaseOnFailure   a failed construction releases (L2a D1)           *)
(*   PayloadFirst       the admitted row carries the payload (L2a D5, I12) *)
(*   AtomicAbandon      the slot owner checks and abandons in one step,    *)
(*                      only with no reservation and no driver (L2a D4)    *)
(*   KeyedCommands      every command id is in the applied set (D15, I14)  *)
(*   AckAfterRow        steer is answered after its row is durable (I18)   *)
(*   SingleDecider      M1 writes [requested, paused] after the driver     *)
(*                      ended; no session `cancelled` first (L2a D8)       *)
(*   DurablePause       the pending set is folded from the log, and resume *)
(*                      of a pending pause is refused INTERRUPT_PENDING    *)
(*                      instead of holding the slot (L2a D9, D10, D11)     *)
(*   LazyClaim          with feature "opening": abandonment only at        *)
(*                      opening, as the claiming append conditional on the *)
(*                      read; the store refuses a lower epoch; a new term  *)
(*                      is a new incarnation (D5, I13, L2a D12)            *)
(*   SettlePerAttempt   every attempt is completed with cut = executed,    *)
(*                      settled and acknowledged before the next, and M1   *)
(*                      is quiescent only after acknowledge (D9, D10, EQ4) *)
(*   StopFence          drivers await their tools on every outcome; at the *)
(*                      stop bound abandon revokes the tool port before    *)
(*                      the ending row; the gate refuses later rows (D13)  *)
(*   CloseBarrier       close refuses commands HOST_CLOSED, stops drivers  *)
(*                      and closes the log last (L2a D14)                  *)
(*   ResolveFirst       a failure message is never completion; every       *)
(*                      unresolved attempt is resolved and its charge      *)
(*                      recorded before a new prepared row (I16, EQ1)      *)
(*   OrphanCoded        an external pause orphaned by a restart is         *)
(*                      resolved EXTERNAL_AGENT_RECOVERY_UNKNOWN (W10)     *)
(*                                                                         *)
(* Features select the part a configuration explores: "external" (X),     *)
(* "resume", "steer", "cancel", "interrupt", "extpause" (X asks for        *)
(* approval), "opening" (M1's opening and epochs), "stale" (a frozen       *)
(* leader, relinquish), "placement" (W8 per attempt), "stop" (tools and    *)
(* the stop bound), "close", "gateway" (an abstract model gateway).        *)
(* Without "opening" the orphan is abandoned by the draft's attach, which  *)
(* over-approximates M1's opening: moving recovery into the opening only   *)
(* removes behaviours, so the draft's safety results carry over.           *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
    Features, MaxCrashes,
    BoundaryExclusive, HoldUntilRows, ReleaseOnFailure, PayloadFirst,
    AtomicAbandon, KeyedCommands, AckAfterRow,
    SingleDecider, DurablePause, LazyClaim, SettlePerAttempt, StopFence,
    CloseBarrier, ResolveFirst, OrphanCoded

Has(f) == f \in Features
None == "none"
T == "r1"
X == "r2"
Runs == {T, X}
Resume == "resume"
Steer == "steer"
Cancel == "cancel"
Interrupt == "interrupt"
Resolve == "resolve"
Attach == "attach"
Cmds == Runs \cup {Resume, Steer, Cancel, Interrupt, Resolve, Attach}
Sendable == Cmds \ {Attach}
Inv == 1..3                       \* funded model attempt ids (abstract keys)
NoGhost == [a |-> 0, e |-> 0]
Final == {"applied", "replayed", "refused", "a0"}   \* "error" is an uncoded answer

VARIABLES
    log,        \* durable rows [t, r, a, k, p, v, e]: type, run, attempt, command id,
                \*   flag (payload on admitted, executed on ending rows, charged on
                \*   settled), invocation id, epoch
    res,        \* memory: the run holding the chat's reservation, or None
    drivers,    \* memory: runs with a live driver
    steerQ,     \* memory: steers handed to the driver and not yet written
    ending,     \* memory: why a live driver is being stopped (slot.ending)
    waiters,    \* memory: today's in-memory pause waiters (the interrupt inbox)
    tools,      \* memory: runs with an early-started tool call in flight
    pc,         \* phase of each command handler
    answered,   \* what the page has seen
    alive, crashes,
    epoch,      \* the incarnation's term (W6's read: the log's highest + 1)
    readLen,    \* the log length at the incarnation's read
    claimed,    \* the incarnation's first append landed
    opened,     \* the incarnation serves commands (opening done)
    ghost,      \* a frozen leader's live attempt [a, e], or NoGhost
    revoked,    \* attempt keys whose tool port W8 revoked
    lease,      \* attempt keys with a lease record (W8, durable)
    started,    \* attempt keys whose driver started (M1 writes it as `executed`)
    completes,  \* complete{key, cut} calls made
    acked,      \* attempt keys acknowledged (lease retired)
    lockFree,   \* M1 reported quiescent, so W6 released the chat lock
    gw,         \* the gateway's state per attempt id
    call, callState, lostCount,   \* the native driver's model call
    hostState, closeAt            \* the registry's close barrier

memVars == <<res, drivers, steerQ, ending, waiters, tools>>
termVars == <<epoch, readLen, opened, ghost>>
placeVars == <<lease, started, completes, acked, lockFree>>
gwVars == <<gw, call, callState, lostCount>>
closeVars == <<hostState, closeAt>>
vars == <<log, claimed, revoked, memVars, pc, answered, alive, crashes,
          termVars, placeVars, gwVars, closeVars>>

----------------------------------------------------------------------------
\* Log reading

Max(S) == CHOOSE x \in S : \A y \in S : y <= x
Min(S) == CHOOSE x \in S : \A y \in S : x <= y
Row(t, r, a, k, p, v, e) == [t |-> t, r |-> r, a |-> a, k |-> k, p |-> p, v |-> v, e |-> e]

LifeTypes == {"admitted", "running", "paused", "completed", "cancelled", "failed",
              "abandoned", "unrecoverable"}
Terminals == {"completed", "cancelled", "failed", "abandoned", "unrecoverable"}

LifeIdx(r) == {i \in DOMAIN log : log[i].r = r /\ log[i].t \in LifeTypes}
LastOf(r) == IF LifeIdx(r) = {} THEN None ELSE log[Max(LifeIdx(r))].t
Att(r) == IF LifeIdx(r) = {} THEN 0 ELSE Max({log[i].a : i \in LifeIdx(r)})
AttEpoch(r) ==
    LET is == {i \in DOMAIN log : log[i].r = r /\ log[i].a = Att(r)}
    IN IF is = {} THEN epoch ELSE log[Min(is)].e
MaxE == IF log = <<>> THEN 0 ELSE Max({log[i].e : i \in DOMAIN log})

Live(r) == LastOf(r) \in {"admitted", "running"}
Open(r) == Live(r) \/ LastOf(r) = "paused"
Admitted(r) == LastOf(r) # None
Terminal(r) == LastOf(r) \in Terminals
OthersClosed(r) == \A o \in Runs \ {r} : ~Open(o)
ChatFree == \A r \in Runs : ~Open(r)
HasRow(t, r) == \E i \in DOMAIN log : log[i].t = t /\ log[i].r = r
Pending(r) == HasRow("req", r) /\ ~HasRow("resolved", r) /\ ~HasRow("recovered", r)
Wrote(k) == \E i \in DOMAIN log : log[i].k = k
\* A native pause ends its attempt; an external run's pause is the same attempt waiting.
EndingRow(i) == log[i].t \in Terminals \/ (log[i].t = "paused" /\ log[i].r = T)
EndedAttempt(r) == \E i \in DOMAIN log : log[i].r = r /\ log[i].a = Att(r) /\ EndingRow(i)
Resumable == LastOf(T) \in {"failed", "abandoned", "paused"}
  \/ (LastOf(T) = "cancelled" /\ log[Max(LifeIdx(T))].k = Cancel /\ HasRow("commit", T))   \* W3's reopen predicate

Key(r) == [r |-> r, a |-> Att(r)]
Executed(r) == ~Has("placement") \/ Key(r) \in started
EndIdxOf(k) == {i \in DOMAIN log : log[i].r = k.r /\ log[i].a = k.a /\ EndingRow(i)}
EndedKey(k) == EndIdxOf(k) # {}
TurnRow(k) == \E i \in DOMAIN log : log[i].t = "turn" /\ log[i].r = k.r /\ log[i].a = k.a
Completed(k) == \E c \in completes : c.key = k
Unsettled == \E k \in lease : EndedKey(k)

Prepared(n) == \E i \in DOMAIN log : log[i].t = "prepared" /\ log[i].v = n
Replied(n) == \E i \in DOMAIN log : log[i].t = "reply" /\ log[i].v = n
Resolved(n) == Replied(n) \/ \E i \in DOMAIN log : log[i].t = "settled" /\ log[i].v = n
Unresolved == {n \in Inv : Prepared(n) /\ ~Resolved(n)}
PendingAttempt == \E n \in Unresolved : gw[n] = "pending"
StepDone == \E i \in DOMAIN log : log[i].t = "reply"
PrepAtt(n) == log[CHOOSE i \in DOMAIN log : log[i].t = "prepared" /\ log[i].v = n].a
\* Today's lookup reads only the last prepared row, and a failure message counts as completion.
InDoubt ==
    LET ps == {i \in DOMAIN log : log[i].t = "prepared"}
    IN /\ ps # {}
       /\ LET n == log[Max(ps)].v
          IN ~\E i \in DOMAIN log : log[i].t \in {"reply", "failmsg"} /\ log[i].v = n

----------------------------------------------------------------------------
\* The host

Claiming == LazyClaim /\ Has("opening")
EpochsOn == Has("opening") \/ Has("stale")
\* The term's first append lands only if the log is unchanged since the read (D5).
CanAppend ==
    /\ ~Claiming \/ claimed \/ Len(log) = readLen
    /\ CloseBarrier => hostState # "closed"
Barred == CloseBarrier /\ hostState # "open"
Serving == alive /\ opened /\ ~Barred
Busy == res # None \/ drivers # {}
\* CHAT_RUN_LIVE{settling}, retry class `wait`: start, resume, cancel and a decision are held while the attempt
\* settles, and the page re-sends each until it is admitted (M1's `settling` state answers all four; W8.r1 item 6).
Held == SettlePerAttempt /\ Unsettled

H(t, r, a, k, p, v) == Row(t, r, a, k, p, v, epoch)
\* Session rows keep the epoch their attempt started under; external rows take the current one (L2a D12).
D(t, r, a, k, p, v) == Row(t, r, a, k, p, v, IF r = T THEN AttEpoch(T) ELSE epoch)
Put(rows) == log' = log \o rows /\ claimed' = TRUE
Answer(k, how) == answered' = [answered EXCEPT ![k] = how]
Go(k, p) == pc' = [pc EXCEPT ![k] = p]
AnsGo(k, how, p) == Answer(k, how) /\ Go(k, p)
Holders(r) == IF r = T THEN {T, Resume} ELSE {r}
Sent(k) == pc[k] # "idle"
Reset == [k \in Cmds |-> IF k = Attach THEN "idle"
                         ELSE IF pc[k] \in {"idle", "done"} THEN pc[k]
                         ELSE IF answered[k] = None THEN "resend" ELSE "done"]

Orphan(r) ==
    \/ Live(r) /\ r \notin drivers
    \/ OrphanCoded /\ r = X /\ LastOf(X) = "paused" /\ Pending(X) /\ X \notin drivers
Orphans == {r \in Runs : Orphan(r)}
AbandonRows(r) ==
    IF r = X /\ LastOf(X) = "paused"
      THEN <<H("recovered", X, Att(X), None, FALSE, 0), H("unrecoverable", X, Att(X), None, TRUE, 0)>>
      ELSE <<H("abandoned", r, Att(r), None, Executed(r), 0)>>
RecoveryRows ==
    IF Has("gateway") /\ ResolveFirst /\ Unresolved # {}
      THEN LET n == Min(Unresolved) IN <<H("settled", T, PrepAtt(n), None, gw[n] = "charged", n)>>
      ELSE <<>>

TypeOK ==
    /\ res \in Runs \cup {None} /\ drivers \subseteq Runs /\ steerQ \subseteq {Steer}
    /\ ending \in [Runs -> {None, "cancel", "interrupt", "close"}]
    /\ waiters \subseteq Runs /\ tools \subseteq Runs
    /\ answered \in [Cmds -> {None, "applied", "replayed", "refused", "a0", "error"}]
    /\ alive \in BOOLEAN /\ crashes \in 0..MaxCrashes
    /\ lease \subseteq started
    /\ gw \in [Inv -> {"none", "pending", "charged", "free"}]
    /\ callState \in {"idle", "inflight", "lost", "failed"}
    /\ hostState \in {"open", "closing", "closed"}

Init ==
    /\ log = <<>> /\ res = None /\ drivers = {} /\ steerQ = {}
    /\ ending = [r \in Runs |-> None] /\ waiters = {} /\ tools = {}
    /\ pc = [k \in Cmds |-> "idle"] /\ answered = [k \in Cmds |-> None]
    /\ alive = TRUE /\ crashes = 0
    /\ epoch = 1 /\ readLen = 0 /\ claimed = FALSE /\ opened = TRUE /\ ghost = NoGhost
    /\ revoked = {}
    /\ lease = {} /\ started = {} /\ completes = {} /\ acked = {} /\ lockFree = FALSE
    /\ gw = [n \in Inv |-> "none"] /\ call = 0 /\ callState = "idle" /\ lostCount = 0
    /\ hostState = "open" /\ closeAt = 0

----------------------------------------------------------------------------
\* The page and the person

send(k) ==   \* a gesture; the page re-sends unanswered commands itself after a crash
    /\ pc[k] = "idle" /\ answered[k] = None
    /\ CASE k = T -> TRUE
         [] k = X -> Has("external")
         [] k = Resume -> Has("resume") /\ Admitted(T) /\ T \notin drivers /\ OthersClosed(T)
         [] k = Steer -> Has("steer")
         [] k = Cancel -> Has("cancel")
         [] k = Interrupt -> Has("interrupt")
         [] k = Resolve -> \E r \in Runs : Pending(r)   \* the approval card shows the durable request
         [] OTHER -> FALSE
    /\ Go(k, "resend")
    /\ UNCHANGED <<log, claimed, revoked, memVars, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

hostClosed(k) ==   \* the registry refuses HOST_CLOSED after the barrier (RA-R16)
    /\ Barred /\ pc[k] = "resend"
    /\ AnsGo(k, "refused", "done")
    /\ UNCHANGED <<log, claimed, revoked, memVars, alive, crashes, termVars, placeVars, gwVars, closeVars>>

----------------------------------------------------------------------------
\* start (admit) and the reservation

start(r) ==
    /\ Serving /\ pc[r] = "resend" /\ ~Held
    /\ IF Admitted(r)
         THEN AnsGo(r, "replayed", "done") /\ UNCHANGED res                 \* applied set; RUN_ID_TAKEN today
         ELSE IF Busy
           THEN AnsGo(r, "refused", "done") /\ UNCHANGED res                \* CHAT_RUN_LIVE
           ELSE res' = r /\ Go(r, "check") /\ UNCHANGED answered
    /\ lockFree' = FALSE
    /\ UNCHANGED <<log, claimed, revoked, drivers, steerQ, ending, waiters, tools, alive, crashes,
                   termVars, lease, started, completes, acked, gwVars, closeVars>>

admissionPrepared(r) ==   \* the ledger read and the session construction succeed; nothing written
    /\ alive /\ pc[r] = "check" /\ ChatFree /\ ~Barred
    /\ Go(r, IF r = X /\ ~HoldUntilRows THEN "extGap" ELSE "admit")
    /\ UNCHANGED <<log, claimed, revoked, memVars, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

admissionRefused(r) ==   \* CHAT_RUN_LIVE, HOST_CLOSED, or (native) HOST_MODEL_UNAVAILABLE and friends
    /\ alive /\ pc[r] = "check" /\ (~ChatFree \/ Barred \/ r = T)
    /\ res' = IF ~ChatFree \/ Barred \/ ReleaseOnFailure THEN None ELSE res
    /\ AnsGo(r, "refused", "done")
    /\ UNCHANGED <<log, claimed, revoked, drivers, steerQ, ending, waiters, tools, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

releaseEarly(r) ==   \* today: the external path releases before it registers (tau-agent-host.ts:2209-2212)
    /\ alive /\ pc[r] = "extGap"
    /\ res' = None /\ Go(r, "admit")
    /\ UNCHANGED <<log, claimed, revoked, drivers, steerQ, ending, waiters, tools, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

rowsCommitted(k) ==   \* the decision batch of command k is durable, then k is answered
    /\ alive /\ CanAppend
    /\ \/ /\ k \in Runs /\ pc[k] = "admit"
          /\ IF BoundaryExclusive /\ ~ChatFree
               THEN /\ res' = IF res = k THEN None ELSE res
                    /\ AnsGo(k, "refused", "done") /\ UNCHANGED <<log, claimed>>
               ELSE /\ Put(<<H("admitted", k, 1, k, k = X \/ PayloadFirst, 0)>>)
                    /\ AnsGo(k, "applied", "placing") /\ UNCHANGED res
          /\ UNCHANGED steerQ
       \/ /\ k = Resume /\ pc[Resume] = "rsRow"
          /\ IF BoundaryExclusive /\ ~OthersClosed(T)
               THEN /\ res' = None
                    /\ AnsGo(Resume, "refused", "done") /\ UNCHANGED <<log, claimed>>
               ELSE /\ Put(<<H("running", T, Att(T) + 1, Resume, TRUE, 0)>> \o RecoveryRows)
                    /\ Go(Resume, "construct") /\ UNCHANGED <<res, answered>>
          /\ UNCHANGED steerQ
       \/ /\ k = Steer /\ pc[Steer] = "applied"
          /\ IF AckAfterRow
               THEN \/ Wrote(Steer) /\ Answer(Steer, "applied")
                    \/ ~Wrote(Steer) /\ Steer \notin steerQ /\ Answer(Steer, "refused")   \* STEER_NOT_DELIVERED
               ELSE Answer(Steer, "applied")
          /\ Go(Steer, "done") /\ UNCHANGED <<log, claimed, res, steerQ>>
    /\ UNCHANGED <<revoked, drivers, ending, waiters, tools, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

placed(k) ==   \* W8's admit answered (trivially without "placement"); the driver starts
    /\ alive
    /\ \/ k = T /\ pc[T] = "placing"
       \/ k = X /\ pc[X] = "placing"
       \/ k = Resume /\ pc[Resume] = "bind"
    /\ LET r == IF k = X THEN X ELSE T
           place == Has("placement") /\ r = T
       IN /\ drivers' = drivers \cup {r}
          /\ res' = IF k = X /\ res = X THEN None ELSE res
          /\ pc' = [pc EXCEPT ![k] = IF k = T /\ ~PayloadFirst THEN "commit" ELSE "live"]
          /\ answered' = IF k = Resume THEN [answered EXCEPT ![Resume] = "applied"] ELSE answered
          /\ IF place /\ k = T
               THEN CanAppend /\ Put(<<H("running", T, 1, None, TRUE, 0)>>)   \* running{attempt: 1, placement}
               ELSE UNCHANGED <<log, claimed>>
          /\ lease' = IF place THEN lease \cup {Key(r)} ELSE lease
          /\ started' = IF place THEN started \cup {Key(r)} ELSE started
    /\ lostCount' = 0
    /\ UNCHANGED <<revoked, steerQ, ending, waiters, tools, alive, crashes, termVars,
                   completes, acked, lockFree, gw, call, callState, closeVars>>

placementRefused(k) ==   \* no lease remains: [failed{executed: false}, turn.failed], no complete
    /\ Has("placement") /\ alive /\ CanAppend
    /\ \/ k = T /\ pc[T] = "placing"
       \/ k = Resume /\ pc[Resume] = "bind"
    /\ Put(<<H("failed", T, Att(T), None, FALSE, 0), H("turn", T, Att(T), None, FALSE, 0)>>)
    /\ res' = None
    /\ AnsGo(k, "applied", "done")
    /\ UNCHANGED <<revoked, drivers, steerQ, ending, waiters, tools, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

commitRow ==   \* today: the message rides the commit row, after start-of-turn compaction (L2a D5)
    /\ alive /\ pc[T] = "commit" /\ CanAppend
    /\ Put(<<D("commit", T, Att(T), None, TRUE, 0)>>) /\ Go(T, "live")
    /\ UNCHANGED <<revoked, memVars, answered, alive, crashes, termVars, placeVars, gwVars, closeVars>>

----------------------------------------------------------------------------
\* resume of T

resume ==
    /\ Serving /\ pc[Resume] = "resend" /\ ~Held
    /\ IF KeyedCommands /\ Wrote(Resume)
         THEN AnsGo(Resume, "replayed", "done") /\ UNCHANGED <<res, waiters>>
       ELSE IF T \in drivers
         THEN AnsGo(Resume, "a0", "done") /\ UNCHANGED <<res, waiters>>           \* the run already continued
       ELSE IF Busy \/ ~OthersClosed(T) \/ ~Resumable
         THEN AnsGo(Resume, "refused", "done") /\ UNCHANGED <<res, waiters>>      \* CHAT_RUN_LIVE, RESUME_UNAVAILABLE
       ELSE IF LastOf(T) = "paused" /\ Pending(T)
         THEN IF DurablePause
                THEN AnsGo(Resume, "refused", "done") /\ UNCHANGED <<res, waiters>> \* INTERRUPT_PENDING
                ELSE /\ res' = T /\ waiters' = waiters \cup {T}                  \* today: re-arm holds the slot (L2a D10)
                     /\ Go(Resume, "rearm") /\ UNCHANGED answered
       ELSE IF Has("gateway") /\ ResolveFirst /\ PendingAttempt
         THEN FALSE                                                             \* MODEL_ATTEMPT_PENDING: the page waits
       ELSE IF Has("gateway") /\ ~ResolveFirst /\ InDoubt
         THEN AnsGo(Resume, "error", "done") /\ UNCHANGED <<res, waiters>>        \* "has no durable result" (L4 D-086)
       ELSE res' = T /\ Go(Resume, "rsRow") /\ UNCHANGED <<answered, waiters>>
    /\ lockFree' = FALSE
    /\ UNCHANGED <<log, claimed, revoked, drivers, steerQ, ending, tools, alive, crashes,
                   termVars, lease, started, completes, acked, gwVars, closeVars>>

rearmed ==   \* today: the re-armed resume continues once someone resolves the pause
    /\ alive /\ pc[Resume] = "rearm" /\ ~Pending(T)
    /\ Go(Resume, "rsRow")
    /\ UNCHANGED <<log, claimed, revoked, memVars, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

resumePrepared ==
    /\ alive /\ pc[Resume] = "construct"
    /\ Go(Resume, "bind")
    /\ UNCHANGED <<log, claimed, revoked, memVars, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

resumeRefused ==   \* construction fails after the reopening row: M1 releases and ends the attempt
    /\ alive /\ pc[Resume] = "construct"
    /\ res' = IF ReleaseOnFailure THEN None ELSE res
    /\ IF ReleaseOnFailure
         THEN CanAppend /\ Put(<<H("failed", T, Att(T), None, FALSE, 0)>>)
         ELSE UNCHANGED <<log, claimed>>
    /\ AnsGo(Resume, "refused", "done")
    /\ UNCHANGED <<revoked, drivers, steerQ, ending, waiters, tools, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

----------------------------------------------------------------------------
\* The drivers

agentEnded(r) ==   \* the driver reports its outcome; M1 is the only lifecycle decider
    /\ alive /\ r \in drivers /\ CanAppend
    /\ (StopFence \/ ending[r] # "cancel") => r \notin tools   \* early tools are awaited (today not on cancel, D16)
    /\ (r = T /\ Has("gateway")) => callState \in {"idle", "failed"}
    /\ LET a == Att(r)
           x == Executed(r)
           why == ending[r]
           outs == IF r = T /\ Has("gateway")
                     THEN (IF callState = "idle" /\ StepDone THEN {"completed"} ELSE {"failed"})
                     ELSE {"completed", "failed"}
           prefix == IF r = X /\ Pending(X) THEN <<H("resolved", X, a, None, FALSE, 0)>> ELSE <<>>
       IN \E out \in outs :
          /\ Put(CASE why = "interrupt" /\ SingleDecider ->
                        <<H("req", T, a, Interrupt, TRUE, 0), H("paused", T, a, Interrupt, x, 0)>>
                   [] why = "interrupt" -> <<D("cancelled", T, a, None, x, 0)>>   \* the session's row (L2a D8)
                   [] why = "cancel" -> <<H("cancelled", r, a, Cancel, x, 0)>>
                   [] why = "close" -> <<H("failed", r, a, None, x, 0)>>          \* RUN_ABANDONED, host close
                   [] OTHER -> prefix \o <<D(out, r, a, None, x, 0)>>)
          /\ answered' = CASE why = "interrupt" /\ SingleDecider -> [answered EXCEPT ![Interrupt] = "applied"]
                           [] why = "cancel" -> [answered EXCEPT ![Cancel] = "applied"]
                           [] OTHER -> answered
          /\ pc' = [k \in Cmds |->
                      IF k \in Holders(r) /\ pc[k] \in {"commit", "live"} THEN "done"
                      ELSE IF (k = Interrupt /\ why = "interrupt" /\ SingleDecider) \/ (k = Cancel /\ why = "cancel")
                        THEN "done" ELSE pc[k]]
    /\ drivers' = drivers \ {r}
    /\ res' = IF res = r THEN None ELSE res
    /\ steerQ' = {}   \* an unconsumed steer dies with the run
    /\ ending' = [ending EXCEPT ![r] = None]
    /\ callState' = IF r = T THEN "idle" ELSE callState
    /\ call' = IF r = T THEN 0 ELSE call
    /\ UNCHANGED <<revoked, waiters, tools, alive, crashes, termVars, placeVars, gw, lostCount, closeVars>>

approvalRequested ==   \* the external driver waits on a durable vendor request (running.awaitingDecision)
    /\ Has("extpause") /\ alive /\ X \in drivers /\ Live(X) /\ ~HasRow("req", X) /\ CanAppend
    /\ Put(<<H("req", X, Att(X), None, TRUE, 0), H("paused", X, Att(X), None, TRUE, 0)>>)
    /\ UNCHANGED <<revoked, memVars, pc, answered, alive, crashes, termVars, placeVars, gwVars, closeVars>>

toolStart(r) ==
    /\ Has("stop") /\ alive /\ r \in drivers /\ r \notin tools /\ ~HasRow("tool", r) /\ ~EndedAttempt(r)
    /\ tools' = tools \cup {r}
    /\ UNCHANGED <<log, claimed, revoked, res, drivers, steerQ, ending, waiters, pc, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

toolWrite(r) ==   \* the tool's result row, through the tool port and the append gate
    /\ alive /\ r \in tools /\ CanAppend
    /\ tools' = tools \ {r}
    /\ IF Key(r) \in revoked \/ (StopFence /\ EndedAttempt(r))
         THEN UNCHANGED <<log, claimed>>
         ELSE Put(<<D("tool", r, Att(r), None, TRUE, 0)>>)
    /\ UNCHANGED <<revoked, res, drivers, steerQ, ending, waiters, pc, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

abandon(r) ==   \* driverStopBound in ending.stopping: W8's abandon revokes the tool port (D13)
    /\ StopFence /\ alive /\ r = T /\ r \in drivers /\ ending[r] = "cancel" /\ Key(r) \notin revoked
    /\ revoked' = revoked \cup {Key(r)}
    /\ UNCHANGED <<log, claimed, memVars, pc, answered, alive, crashes, termVars, placeVars, gwVars, closeVars>>

abandoned(r) ==   \* ending.fencing: the port answered; the ending batch appends, then cancel is answered
    /\ alive /\ r \in drivers /\ Key(r) \in revoked /\ CanAppend
    /\ Put(<<H("cancelled", r, Att(r), Cancel, Executed(r), 0)>>)
    /\ answered' = [answered EXCEPT ![Cancel] = "applied"]
    /\ pc' = [k \in Cmds |-> IF (k \in Holders(r) /\ pc[k] \in {"commit", "live"}) \/ k = Cancel
                             THEN "done" ELSE pc[k]]
    /\ drivers' = drivers \ {r}
    /\ res' = IF res = r THEN None ELSE res
    /\ steerQ' = {}
    /\ ending' = [ending EXCEPT ![r] = None]
    /\ UNCHANGED <<revoked, waiters, tools, alive, crashes, termVars, placeVars, gwVars, closeVars>>

----------------------------------------------------------------------------
\* steer (native runs only)

steer ==
    /\ Serving /\ pc[Steer] = "resend"
    /\ ~(res # None /\ res \notin drivers)   \* held while reserving (the totality matrix's Q)
    /\ IF KeyedCommands /\ Wrote(Steer)
         THEN AnsGo(Steer, "replayed", "done") /\ UNCHANGED steerQ
       ELSE IF T \in drivers /\ ending[T] = None
         THEN steerQ' = {Steer} /\ Go(Steer, "applied") /\ UNCHANGED answered   \* steerDriver
       ELSE AnsGo(Steer, "refused", "done") /\ UNCHANGED steerQ                  \* RUN_NOT_LIVE
    /\ lockFree' = FALSE
    /\ UNCHANGED <<log, claimed, revoked, res, drivers, ending, waiters, tools, alive, crashes,
                   termVars, lease, started, completes, acked, gwVars, closeVars>>

driverSteered ==   \* the session consumes the steer and writes the message steer:<commandId>
    /\ alive /\ T \in drivers /\ Steer \in steerQ /\ CanAppend
    /\ Put(<<D("steer", T, Att(T), Steer, TRUE, 0)>>) /\ steerQ' = {}
    /\ UNCHANGED <<revoked, res, drivers, ending, waiters, tools, pc, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

----------------------------------------------------------------------------
\* cancel, interrupt and resolveInterrupt (native run T; resolve also X)

cancel ==
    /\ Serving /\ pc[Cancel] = "resend" /\ ~Held
    /\ ~(res # None /\ res \notin drivers)     \* held while reserving
    /\ ~(T \in drivers /\ ending[T] # None)    \* held while ending
    /\ ~(Live(T) /\ T \notin drivers)          \* held while orphaned (only without "opening")
    /\ IF KeyedCommands /\ Wrote(Cancel)
         THEN AnsGo(Cancel, "replayed", "done") /\ UNCHANGED <<log, claimed, ending>>
       ELSE IF T \in drivers
         THEN /\ ending' = [ending EXCEPT ![T] = "cancel"] /\ Go(Cancel, "wait")
              /\ UNCHANGED <<log, claimed, answered>>
       ELSE IF LastOf(T) = "paused" /\ DurablePause
         THEN /\ CanAppend
              /\ Put((IF Pending(T) THEN <<H("resolved", T, Att(T), Cancel, FALSE, 0)>> ELSE <<>>)
                     \o <<H("cancelled", T, Att(T), Cancel, Executed(T), 0)>>)
              /\ AnsGo(Cancel, "applied", "done") /\ UNCHANGED ending
       ELSE IF LastOf(T) = "paused"   \* today: no active run, so cancel returns (tau-agent-host.ts:2224-2227; L2a D9)
         THEN AnsGo(Cancel, "applied", "done") /\ UNCHANGED <<log, claimed, ending>>
       ELSE AnsGo(Cancel, IF Admitted(T) THEN "a0" ELSE "refused", "done")                    \* A0, NO_RUN_ADMITTED
            /\ UNCHANGED <<log, claimed, ending>>
    /\ lockFree' = FALSE
    /\ UNCHANGED <<revoked, res, drivers, steerQ, waiters, tools, alive, crashes,
                   termVars, lease, started, completes, acked, gwVars, closeVars>>

interrupt ==   \* native: abort the driver, wait for it to end, then [requested, paused]
    /\ Serving /\ pc[Interrupt] = "resend"
    /\ IF KeyedCommands /\ Wrote(Interrupt)
         THEN AnsGo(Interrupt, "replayed", "done") /\ UNCHANGED ending
       ELSE IF T \in drivers /\ ending[T] = None
         THEN /\ ending' = [ending EXCEPT ![T] = "interrupt"]
              /\ Go(Interrupt, IF SingleDecider THEN "wait" ELSE "pausing") /\ UNCHANGED answered
       ELSE AnsGo(Interrupt, "refused", "done") /\ UNCHANGED ending                  \* RUN_NOT_LIVE
    /\ lockFree' = FALSE
    /\ UNCHANGED <<log, claimed, revoked, res, drivers, steerQ, waiters, tools, alive, crashes,
                   termVars, lease, started, completes, acked, gwVars, closeVars>>

pauseRecorded ==   \* today: after the session recorded `cancelled`, the host writes paused (L2a D8)
    /\ alive /\ pc[Interrupt] = "pausing" /\ T \notin drivers /\ LastOf(T) = "cancelled" /\ CanAppend
    /\ Put(<<H("paused", T, Att(T), Interrupt, TRUE, 0), H("req", T, Att(T), Interrupt, TRUE, 0)>>)
    /\ waiters' = waiters \cup {T}
    /\ AnsGo(Interrupt, "applied", "done")
    /\ UNCHANGED <<revoked, res, drivers, steerQ, ending, tools, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

resolveInterrupt ==
    /\ Serving /\ pc[Resolve] = "resend"
    /\ IF KeyedCommands /\ Wrote(Resolve)
         THEN AnsGo(Resolve, "replayed", "done") /\ UNCHANGED <<log, claimed, waiters>>
       ELSE IF Pending(T) /\ (DurablePause \/ T \in waiters)
         THEN /\ CanAppend
              /\ \/ Put(<<H("resolved", T, Att(T), Resolve, TRUE, 0)>>)   \* approve: the paused attempt continues
                 \/ /\ DurablePause                                       \* deny (V8): the paused attempt ends
                    /\ Put(<<H("resolved", T, Att(T), Resolve, TRUE, 0), H("cancelled", T, Att(T), Resolve, Executed(T), 0)>>)
              /\ AnsGo(Resolve, "applied", "done") /\ waiters' = waiters \ {T}
       ELSE IF Pending(X) /\ X \in drivers
         THEN /\ CanAppend   \* [resolved, running{same attempt}], then decideApproval
              /\ Put(<<H("resolved", X, Att(X), Resolve, TRUE, 0), H("running", X, Att(X), Resolve, TRUE, 0)>>)
              /\ AnsGo(Resolve, "applied", "done") /\ UNCHANGED waiters
       ELSE /\ AnsGo(Resolve, "refused", "done")   \* INTERRUPT_NOT_PENDING; today also for a durable request
            /\ UNCHANGED <<log, claimed, waiters>>  \* the in-memory port lost (tau-agent-host.ts:2168-2176)
    /\ lockFree' = FALSE
    /\ UNCHANGED <<revoked, res, drivers, steerQ, ending, tools, alive, crashes,
                   termVars, lease, started, completes, acked, gwVars, closeVars>>

----------------------------------------------------------------------------
\* Recovery: today's launcher attach, or M1's opening

attach ==   \* today: waitForAdmission(chatId), then markAbandoned as a separate step
    /\ ~AtomicAbandon /\ ~Claiming /\ alive /\ pc[Attach] = "idle" /\ res = None
    /\ Go(Attach, "act")
    /\ UNCHANGED <<log, claimed, revoked, memVars, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeVars>>

markAbandoned ==   \* idle.orphaned: the abandonment rows
    /\ alive /\ CanAppend
    /\ \/ /\ Claiming /\ ~opened                       \* at opening, as the claim or after it (I13)
          /\ \E r \in Orphans : Put(AbandonRows(r))
          /\ UNCHANGED pc
       \/ /\ ~Claiming /\ AtomicAbandon /\ res = None /\ drivers = {}   \* the draft's atomic attach
          /\ \E r \in Orphans : Put(AbandonRows(r))
          /\ UNCHANGED pc
       \/ /\ ~Claiming /\ ~AtomicAbandon /\ pc[Attach] = "act"          \* run-keyed maps only (:2406-2421)
          /\ IF \E r \in Runs : Live(r) /\ r \notin drivers
               THEN \E r \in {q \in Runs : Live(q) /\ q \notin drivers} :
                      Put(<<H("abandoned", r, Att(r), None, Executed(r), 0)>>)
               ELSE UNCHANGED <<log, claimed>>
          /\ Go(Attach, "done")
    /\ UNCHANGED <<revoked, memVars, answered, alive, crashes, termVars, placeVars, gwVars, closeVars>>

logOpened ==   \* the idle choice finds no orphan: M1 serves
    /\ Claiming /\ alive /\ ~opened /\ Orphans = {}
    /\ opened' = TRUE
    /\ UNCHANGED <<log, claimed, revoked, memVars, pc, answered, alive, crashes,
                   epoch, readLen, ghost, placeVars, gwVars, closeVars>>

logFenced ==   \* the claim was refused LOG_FENCED: M1 fences, W6 rereads, a new incarnation opens
    /\ Claiming /\ alive /\ ~claimed /\ Len(log) # readLen
    /\ res' = None /\ drivers' = {} /\ steerQ' = {} /\ ending' = [r \in Runs |-> None]
    /\ waiters' = {} /\ tools' = {}
    /\ pc' = Reset   \* LEADERSHIP_LOST (wait): the page re-sends
    /\ epoch' = MaxE + 1 /\ readLen' = Len(log) /\ opened' = FALSE
    /\ lockFree' = FALSE /\ call' = 0 /\ callState' = "idle" /\ lostCount' = 0
    /\ UNCHANGED <<log, claimed, revoked, answered, alive, crashes, ghost,
                   lease, started, completes, acked, gw, closeVars>>

----------------------------------------------------------------------------
\* Crash, restart, a stale writer, relinquish

crash ==
    /\ alive /\ crashes < MaxCrashes
    /\ alive' = FALSE /\ crashes' = crashes + 1
    /\ res' = None /\ drivers' = {} /\ steerQ' = {} /\ ending' = [r \in Runs |-> None]
    /\ waiters' = {} /\ tools' = {}
    /\ pc' = Reset
    /\ lockFree' = FALSE /\ call' = 0 /\ callState' = "idle" /\ lostCount' = 0
    /\ UNCHANGED <<log, claimed, revoked, answered, termVars, lease, started, completes, acked, gw, closeVars>>

restart ==   \* W6 starts a new incarnation: it reads under the lock and writes nothing
    /\ ~alive /\ ~Barred
    /\ alive' = TRUE
    /\ epoch' = IF EpochsOn THEN MaxE + 1 ELSE epoch
    /\ readLen' = Len(log) /\ claimed' = FALSE /\ opened' = ~Claiming
    /\ UNCHANGED <<log, revoked, memVars, pc, answered, crashes, ghost, placeVars, gwVars, closeVars>>

freeze ==   \* the leader freezes with a live driver; a second host takes the chat
    /\ Has("stale") /\ alive /\ T \in drivers /\ ghost = NoGhost /\ crashes < MaxCrashes
    /\ ghost' = [a |-> Att(T), e |-> AttEpoch(T)]
    /\ crashes' = crashes + 1
    /\ res' = None /\ drivers' = {} /\ steerQ' = {} /\ ending' = [r \in Runs |-> None]
    /\ waiters' = {} /\ tools' = {}
    /\ pc' = Reset
    /\ epoch' = MaxE + 1 /\ readLen' = Len(log) /\ claimed' = FALSE /\ opened' = ~Claiming
    /\ lockFree' = FALSE /\ call' = 0 /\ callState' = "idle" /\ lostCount' = 0
    /\ UNCHANGED <<log, revoked, answered, alive, lease, started, completes, acked, gw, closeVars>>

staleAppend ==   \* the frozen leader thaws and its driver's ending row reaches the store
    /\ ghost # NoGhost
    /\ ghost' = NoGhost
    /\ IF Claiming /\ ghost.e < MaxE
         THEN UNCHANGED log                                   \* the store refuses a lower epoch (D5)
         ELSE log' = Append(log, Row("completed", T, ghost.a, None, TRUE, 0, ghost.e))
    /\ UNCHANGED <<claimed, revoked, memVars, pc, answered, alive, crashes, epoch, readLen, opened,
                   placeVars, gwVars, closeVars>>

relinquish ==   \* leadership moves while the host runs
    /\ Has("stale") /\ alive /\ drivers # {} /\ crashes < MaxCrashes
    /\ crashes' = crashes + 1
    /\ IF Claiming
         THEN \* fenced: abandon the live attempt's port, stop the drivers, write nothing; W6 rereads
              /\ res' = None /\ drivers' = {} /\ steerQ' = {} /\ ending' = [r \in Runs |-> None]
              /\ waiters' = {} /\ tools' = {}
              /\ pc' = Reset
              /\ epoch' = MaxE + 1 /\ readLen' = Len(log) /\ claimed' = FALSE /\ opened' = FALSE
              /\ lockFree' = FALSE /\ call' = 0 /\ callState' = "idle" /\ lostCount' = 0
         ELSE \* today: assumeLeadership with a new generation, in place (tau-agent-host.ts:2534-2542)
              /\ epoch' = epoch + 1
              /\ UNCHANGED <<memVars, pc, readLen, claimed, opened, lockFree, call, callState, lostCount>>
    /\ UNCHANGED <<log, revoked, answered, alive, ghost, lease, started, completes, acked, gw, closeVars>>

----------------------------------------------------------------------------
\* Placement and settlement per attempt (W8)

complete ==   \* complete{key, cut}
    /\ \E k \in lease :
         /\ EndedKey(k) /\ ~Completed(k) /\ (SettlePerAttempt => alive)
         /\ LET e == log[Min(EndIdxOf(k))]
            IN completes' = completes \cup
                 {[key |-> k, cut |-> IF SettlePerAttempt THEN e.p ELSE e.t = "completed"]}
    /\ UNCHANGED <<log, claimed, revoked, memVars, pc, answered, alive, crashes, termVars,
                   lease, started, acked, lockFree, gwVars, closeVars>>

settlementPublished ==   \* the key's settlement fact; the turn.* row appends unless the ledger has one
    /\ alive /\ CanAppend
    /\ \E k \in lease : Completed(k) /\ ~TurnRow(k) /\ Put(<<H("turn", k.r, k.a, None, TRUE, 0)>>)
    /\ UNCHANGED <<revoked, memVars, pc, answered, alive, crashes, termVars, placeVars, gwVars, closeVars>>

acknowledge ==   \* acknowledge{key}: the lease retires, only after the turn.* row is durable (I19)
    /\ \E k \in lease :
         /\ Completed(k) /\ TurnRow(k) /\ (SettlePerAttempt => alive)
         /\ lease' = lease \ {k} /\ acked' = acked \cup {k}
    /\ UNCHANGED <<log, claimed, revoked, memVars, pc, answered, alive, crashes, termVars,
                   started, completes, lockFree, gwVars, closeVars>>

quiescent ==   \* M1's quiescent tag; W6 releases the chat lock (EQ4)
    /\ Has("placement") /\ alive /\ opened /\ ~lockFree
    /\ res = None /\ drivers = {} /\ \A k \in Sendable : pc[k] \in {"idle", "done"}
    /\ SettlePerAttempt => lease = {}
    /\ lockFree' = TRUE
    /\ UNCHANGED <<log, claimed, revoked, memVars, pc, answered, alive, crashes, termVars,
                   lease, started, completes, acked, gwVars, closeVars>>

----------------------------------------------------------------------------
\* An abstract model gateway (W11) for T's one model step

modelCall ==   \* the prepared row (the intent row) precedes the call
    /\ Has("gateway") /\ alive /\ T \in drivers /\ ending[T] = None /\ callState = "idle" /\ ~StepDone
    /\ ResolveFirst => Unresolved = {}
    /\ CanAppend
    /\ \E n \in Inv :
         /\ gw[n] = "none" /\ \A m \in Inv : m < n => gw[m] # "none"
         /\ Put(<<D("prepared", T, Att(T), None, TRUE, n)>>)
         /\ gw' = [gw EXCEPT ![n] = "pending"] /\ call' = n /\ callState' = "inflight"
    /\ UNCHANGED <<revoked, memVars, pc, answered, alive, crashes, termVars, placeVars, lostCount, closeVars>>

gatewaySettles ==   \* the supplier finished (charged) or the client left first (free)
    /\ \E n \in Inv : gw[n] = "pending" /\ \E s \in {"charged", "free"} : gw' = [gw EXCEPT ![n] = s]
    /\ UNCHANGED <<log, claimed, revoked, memVars, pc, answered, alive, crashes, termVars, placeVars,
                   call, callState, lostCount, closeVars>>

replyShown ==
    /\ alive /\ T \in drivers /\ callState = "inflight" /\ gw[call] = "charged" /\ CanAppend
    /\ Put(<<D("reply", T, Att(T), None, TRUE, call)>>)
    /\ callState' = "idle" /\ call' = 0
    /\ UNCHANGED <<revoked, memVars, pc, answered, alive, crashes, termVars, placeVars, gw, lostCount, closeVars>>

replyLost ==   \* the stream fails; the reply is lost whatever the gateway did
    /\ alive /\ T \in drivers /\ callState = "inflight"
    /\ callState' = "lost"
    /\ UNCHANGED <<log, claimed, revoked, memVars, pc, answered, alive, crashes, termVars, placeVars,
                   gw, call, lostCount, closeVars>>

invocationResolved ==   \* the driver resolves the failed call (target) or writes a failure message (today)
    /\ alive /\ T \in drivers /\ callState = "lost" /\ CanAppend
    /\ IF ~ResolveFirst
         THEN /\ Put(<<D("failmsg", T, Att(T), None, TRUE, call)>>)
              /\ callState' = "failed" /\ UNCHANGED lostCount
       ELSE IF gw[call] = "pending"
         THEN callState' = "failed" /\ UNCHANGED <<log, claimed, lostCount>>   \* ends RUN_ABANDONED
       ELSE IF gw[call] = "charged"
         THEN /\ Put(<<D("settled", T, Att(T), None, TRUE, call)>>)          \* EQ1: record, then a new key
              /\ callState' = IF lostCount >= 1 THEN "failed" ELSE "idle"    \* lostReplyRetries = 1
              /\ lostCount' = lostCount + 1
       ELSE /\ Put(<<D("settled", T, Att(T), None, FALSE, call)>>)
            /\ callState' = "idle" /\ UNCHANGED lostCount
    /\ call' = 0
    /\ UNCHANGED <<revoked, memVars, pc, answered, alive, crashes, termVars, placeVars, gw, closeVars>>

----------------------------------------------------------------------------
\* Close barrier (L2a D14)

close ==
    /\ Has("close") /\ hostState = "open"
    /\ hostState' = "closing"
    /\ ending' = IF CloseBarrier
                   THEN [r \in Runs |-> IF r \in drivers /\ ending[r] = None THEN "close" ELSE ending[r]]
                   ELSE ending
    /\ UNCHANGED <<log, claimed, revoked, res, drivers, steerQ, waiters, tools, pc, answered, alive, crashes,
                   termVars, placeVars, gwVars, closeAt>>

logClosed ==
    /\ hostState = "closing"
    /\ CloseBarrier => \/ ~alive
                       \/ /\ res = None /\ drivers = {} /\ tools = {}
                          /\ \A k \in Sendable : pc[k] \in {"idle", "done", "resend"}
    /\ hostState' = "closed" /\ closeAt' = Len(log)
    /\ UNCHANGED <<log, claimed, revoked, memVars, pc, answered, alive, crashes, termVars, placeVars, gwVars>>

----------------------------------------------------------------------------

Next ==
    \/ \E k \in Sendable : send(k) \/ hostClosed(k)
    \/ \E r \in Runs : \/ start(r) \/ admissionPrepared(r) \/ admissionRefused(r) \/ releaseEarly(r)
                      \/ agentEnded(r) \/ toolStart(r) \/ toolWrite(r) \/ abandon(r) \/ abandoned(r)
    \/ \E k \in {T, X, Resume, Steer} : rowsCommitted(k)
    \/ \E k \in {T, X, Resume} : placed(k) \/ placementRefused(k)
    \/ commitRow \/ resume \/ rearmed \/ resumePrepared \/ resumeRefused
    \/ approvalRequested \/ steer \/ driverSteered
    \/ cancel \/ interrupt \/ pauseRecorded \/ resolveInterrupt
    \/ attach \/ markAbandoned \/ logOpened \/ logFenced
    \/ crash \/ restart \/ freeze \/ staleAppend \/ relinquish
    \/ complete \/ settlementPublished \/ acknowledge \/ quiescent
    \/ modelCall \/ gatewaySettles \/ replyShown \/ replyLost \/ invocationResolved
    \/ close \/ logClosed

\* Weak fairness on live host, driver, gateway and page-resend steps; none on a person's
\* gesture, crash, freeze, relinquish, close or the stale writer (FM-R17).
Fairness ==
    /\ \A k \in Sendable : WF_vars(hostClosed(k))
    /\ \A r \in Runs :
         /\ WF_vars(start(r)) /\ WF_vars(admissionPrepared(r) \/ admissionRefused(r))
         /\ WF_vars(releaseEarly(r)) /\ WF_vars(agentEnded(r)) /\ WF_vars(toolWrite(r))
         /\ WF_vars(abandon(r)) /\ WF_vars(abandoned(r))
    /\ \A k \in {T, X, Resume, Steer} : WF_vars(rowsCommitted(k))
    /\ \A k \in {T, X, Resume} : WF_vars(placed(k) \/ placementRefused(k))
    /\ WF_vars(commitRow) /\ WF_vars(resume) /\ WF_vars(rearmed) /\ WF_vars(resumePrepared \/ resumeRefused)
    /\ WF_vars(steer) /\ WF_vars(driverSteered)
    /\ WF_vars(cancel) /\ WF_vars(interrupt) /\ WF_vars(pauseRecorded) /\ WF_vars(resolveInterrupt)
    /\ WF_vars(attach) /\ WF_vars(markAbandoned) /\ WF_vars(logOpened) /\ WF_vars(logFenced) /\ WF_vars(restart)
    /\ WF_vars(complete) /\ WF_vars(settlementPublished) /\ WF_vars(acknowledge)
    /\ WF_vars(gatewaySettles) /\ WF_vars(replyShown \/ replyLost) /\ WF_vars(invocationResolved)
    /\ WF_vars(logClosed)

Spec == Init /\ [][Next]_vars /\ Fairness

----------------------------------------------------------------------------
\* Safety: the draft's six (charter class M)

ChatSingleRun == Cardinality({r \in Runs : Open(r)}) <= 1                                    \* I8
ReservationHasHolder ==                                                                     \* I11 (safety form)
    res # None => \E k \in Holders(res) : pc[k] \notin {"idle", "done", "resend"}
PayloadDurable == \A r \in Runs : (Admitted(r) /\ r \notin drivers) =>                       \* I12
    \E i \in DOMAIN log : log[i].r = r /\ (log[i].t = "commit" \/ (log[i].t = "admitted" /\ log[i].p))
AbandonOnlyOrphans == \A r \in drivers : LastOf(r) # "abandoned"                              \* I13
AtMostOnceEffect ==                                                                         \* I14
    \A k \in {Resume, Steer} : Cardinality({i \in DOMAIN log : log[i].k = k}) <= 1
AckAfterDurable ==                                                                          \* I18, RA-R10
    /\ answered[Steer] = "applied" => Wrote(Steer)
    /\ answered[Cancel] = "applied" => \E i \in DOMAIN log : log[i].k = Cancel /\ log[i].t \in Terminals
    /\ answered[Resolve] = "applied" => \E i \in DOMAIN log : log[i].k = Resolve /\ log[i].t = "resolved"

\* Safety: the W7 additions

\* I35: a terminal row is never followed by `paused` in the same attempt (L2a D8, S5 D4).
NoTransientTerminal ==
    \A i, j \in DOMAIN log :
        ~(i < j /\ log[i].t \in Terminals /\ log[j].t = "paused" /\ log[i].r = log[j].r /\ log[i].a = log[j].a)

\* I13: an abandonment is the claim or follows it, so no earlier writer appends after it.
AbandonIsClaim ==
    \A i, j \in DOMAIN log : (i < j /\ log[i].t \in {"abandoned", "unrecoverable"}) => log[j].e >= log[i].e

\* L2a D12: every row of a live attempt carries the epoch the attempt started under.
AttemptTypes == {"admitted", "running", "paused", "completed", "cancelled", "failed", "commit",
                 "steer", "tool", "req", "resolved", "prepared", "reply", "failmsg"}
LiveRowOf(i) ==
    /\ log[i].t \in AttemptTypes
    /\ ~\E j \in DOMAIN log : j < i /\ log[j].r = log[i].r /\ log[j].a = log[i].a /\ EndingRow(j)
FencedAttempt ==
    \A i, j \in DOMAIN log :
        (LiveRowOf(i) /\ LiveRowOf(j) /\ log[i].r = log[j].r /\ log[i].a = log[j].a) => log[i].e = log[j].e

\* TS-R10: a held lease belongs to the latest attempt; the next attempt waits for acknowledge.
OpensAttempt(i) == log[i].t = "admitted" \/ (log[i].t = "running" /\ log[i].k = Resume)
AckBeforeNextAttempt ==
    \A k \in lease :
        LET os == {i \in DOMAIN log : OpensAttempt(i)}
        IN os # {} /\ log[Max(os)].r = k.r /\ log[Max(os)].a = k.a
QuiescentAfterAck == lockFree => lease = {}                                                  \* EQ4
CutIffExecuted == \A c \in completes : c.cut = (c.key \in started)                           \* D10, TS-R11
AckAfterTurnRow == \A k \in acked : TurnRow(k)                                               \* I19, the host's half

\* D13: nothing of an attempt lands after the row that ended it.
NoRowAfterEnding ==
    \A i, j \in DOMAIN log :
        ~(i < j /\ EndingRow(i) /\ log[j].t \in {"tool", "steer", "commit", "prepared", "reply"}
          /\ log[j].r = log[i].r /\ log[j].a = log[i].a)

NothingAfterClose == hostState = "closed" => Len(log) = closeAt                               \* L2a D14

NeverResendKnownAttempt == Cardinality({n \in Inv : gw[n] = "pending"}) <= 1                \* I16
ChargeAfterRecordedLoss ==                                                                  \* W11, EQ1
    \A i, j \in DOMAIN log :
        (i < j /\ log[i].t = "prepared" /\ log[j].t = "prepared"
         /\ gw[log[i].v] = "charged" /\ ~Replied(log[i].v))
          => \E s \in (i + 1)..(j - 1) : log[s].t = "settled" /\ log[s].v = log[i].v

\* W10: once M1 serves, no external request is pending without its driver.
OrphanApprovalCoded == ~(alive /\ opened /\ Pending(X) /\ X \notin drivers)

Safety ==
    /\ ChatSingleRun /\ ReservationHasHolder /\ PayloadDurable /\ AbandonOnlyOrphans
    /\ AtMostOnceEffect /\ AckAfterDurable
    /\ NoTransientTerminal /\ AbandonIsClaim /\ FencedAttempt /\ AckBeforeNextAttempt
    /\ QuiescentAfterAck /\ CutIffExecuted /\ AckAfterTurnRow /\ NoRowAfterEnding
    /\ NothingAfterClose /\ NeverResendKnownAttempt /\ ChargeAfterRecordedLoss /\ OrphanApprovalCoded

----------------------------------------------------------------------------
\* Liveness under weak fairness of live processes (policy rule 5). Each names its quiescence.

\* Quiescence: RunsAtRest. A run a closed host left open is reconciled when a host next starts (D10).
RunsAtRest == hostState = "closed" \/ \A r \in Runs : ~Live(r)
AdmittedRunEnds == \A r \in Runs : Live(r) ~> (~Live(r) \/ hostState = "closed")               \* I35

\* Quiescence: ReservationSettled.
ReservationSettled == res = None \/ res \in drivers
ReservationEnds == (res # None) ~> ReservationSettled                                        \* I11

\* Quiescence: CommandsAnswered.
CommandsAnswered == \A k \in Sendable : ~Sent(k) \/ answered[k] \in Final
EveryCommandAnswered == \A k \in Sendable : Sent(k) ~> (answered[k] \in Final)                \* I15

\* Quiescence: CancelSettled.
CancelSettled == Terminal(T) \/ answered[Cancel] \in {"refused", "a0"}
CancelEnds == (Sent(Cancel) /\ answered[Cancel] = None /\ Open(T)) ~> CancelSettled          \* I35 (L2a L2)

\* Quiescence: NothingPending.
NothingPending == \A r \in Runs : ~Pending(r)
WaitersSettle == \A r \in Runs : (Sent(Resolve) /\ Pending(r)) ~> ~Pending(r)                  \* I35 (L2a L4)

\* Quiescence: CommandsAnswered (for resume): an offered Resume completes or is refused with a code.
ResumeAnswered == Sent(Resume) ~> (answered[Resume] \in Final)                                \* L4 P-L2
=============================================================================
