---------------------------- MODULE LogLeadership ----------------------------
(***************************************************************************)
(* One chat's durable log, led by one of several agent-host workers (one   *)
(* per tab) through a Web Lock, with commands forwarded from a follower    *)
(* over a BroadcastChannel (packages/agent-host/src/launchers/leadership/  *)
(* leadership.machine.ts, src/browser/leadership.ts; src/log/              *)
(* event-sequence.ts).                                                     *)
(*                                                                         *)
(* A Web Lock is an election, not a fence: `steal` hands the lock to a new *)
(* context while the old holder keeps running until its lock promise      *)
(* rejects (Notice), and a dead context's lock is released only           *)
(* eventually. Each acquisition mints a monotonic epoch. Where the store   *)
(* checks a writer is the knob `Fence`. S4's fences stamp rows with the    *)
(* lock epoch its writer believed it led under:                            *)
(*   "local"       only the leader's own belief (leadership map) is checked *)
(*   "firstAppend" the store refuses a closed epoch; a new epoch closes the *)
(*                 older one with its first row (createEventSequence)      *)
(*   "claim"       a new leader fences a register before it reads the log  *)
(*                 (S4's abstraction: a browser has no atomic cross-tab     *)
(*                 register)                                               *)
(* W3's storage fences (CL-S13) stamp rows with the log's own epoch: the    *)
(* read takes one above the log's highest epoch, and a claim row (key "c")  *)
(* opens the term.                                                         *)
(*   "lazy"        the read only reads; the claim row rides the term's     *)
(*                 first append, and every append is conditional on the    *)
(*                 log still being the writer's view (recommended; CL-R11)  *)
(*   "handle"      the OPFS exclusive sync handle: reading needs the handle *)
(*                 free and writes the claim row at once; only the holder  *)
(*                 appends; a notice or a crash releases it                 *)
(*   "mint"        mutant: the eager claim row with no conditional append  *)
(*   "lazynocas"   mutant: the lazy claim with no conditional append       *)
(*                                                                         *)
(* Frames are broadcast: a frame reaches the workers that led when it was  *)
(* sent; each recipient handles it once; a worker that no longer leads     *)
(* drops it. The follower (a tab that lost the ifAvailable race) waits for *)
(* an answer. When its wait ends unanswered (a refusal, or an expired wait) *)
(* forwardCommand takes the lock itself if it is free and runs the command *)
(* locally, or else re-broadcasts it; today once (the replay), the target   *)
(* until answered. `WaitOnAnyHeartbeat` is today's wait: any generation's   *)
(* heartbeat keeps it alive; the target's wait is per addressed generation. *)
(*                                                                         *)
(* W6's resident-host extensions (RH-S1; EQ4, RH-R8, RH-R12, RH-R16,       *)
(* RV7-F1..F4) add runs the workers themselves need a writer for (Want,    *)
(* then Start, End or Abandon rows), the lock's scope, builds, and tabs    *)
(* that freeze. They are definitions carrying today's values, so S4's and  *)
(* W3's configurations need no new lines; W6's configurations override     *)
(* them (`Scope = "run"`, `Build <- CrossBuild`):                          *)
(*   Scope       "lifetime": a leader keeps the lock while it lives, and a *)
(*               worker takes a free lock unprompted (today); "run": only  *)
(*               from a grant for a write until M1 is quiescent (RH-R8)    *)
(*   Build       each worker's build; a leader admits runs only for its    *)
(*               own build and never forwards across builds (I32)          *)
(*   MaxFreezes  page-lifecycle freezes; a frozen tab runs nothing and     *)
(*               keeps its lock and handle                                 *)
(*   MaxWants    runs the workers want started; MaxQueues queued reconcile *)
(*               requests, kept only while the tab is visible (RH-R16)     *)
(*   StealRule   "any": S4's adversary; "timer": a worker with a pending   *)
(*               write whose heartbeat timer fired, whatever the holder    *)
(*               (RV7-F1); "silent": only from a frozen or dead holder     *)
(*               (RH-R12 with W4 T9's frozen-time rule)                    *)
(*   HeardRule   a grantee posts a heartbeat in its grant callback, and a  *)
(*               worker steals only from a holder it heard (RH-R12)        *)
(*   SplitRead   the read is two steps (readView invoked, then view.read), *)
(*               so Notice can cancel it (RV7-F4)                          *)
(*   NoticeFirst a steal notice queued while a tab was frozen runs before  *)
(*               any read or append the tab starts after it thaws (RH-Q10) *)
(*   FairThaw    frozen tabs eventually thaw                               *)
(* After a refused append M2 rereads while it believes it holds the lock   *)
(* (no notice yet), because it cannot observe the lock itself (RV7-F4).    *)
(*                                                                         *)
(* Implementation grain: each action is one M2 event (W6 T4).              *)
(*   Acquire, StealLock, GrantQueued   lock.granted                        *)
(*   Notice                            lock.lost                           *)
(*   Read (after ReadStart)            view.read                           *)
(*   Claim (named, not in Next): the first append of a term, the Process, *)
(*          Start or Abandon step carrying the claim row: first appended   *)
(*   Refused, Process's LOG_FENCED     append.fenced                       *)
(*   Release                           m1.quiescent                        *)
(*   Send, Answer                      cmd, ans                            *)
(*   TimeOut                           silent                              *)
(*                                                                         *)
(* The lazy fences refine LogFence (`FenceRefined`), whose inductive       *)
(* invariant Apalache checks (MC_LogFence.tla). The eager claim row of     *)
(* "handle" and "mint" is a read and an append in one step, which LogFence *)
(* has no action for, so those fences do not refine it as written. The    *)
(* follower's SelfLead releases no handle it never took (simplification).  *)
(*                                                                         *)
(* A holder draining its project (T3) answers a forwarded Start `HOST_CLOSED`*)
(* and the follower keeps it for that holder's Release or a successor's   *)
(* heartbeat, bounded by C11 (W6.r1 round 4). Unmodelled: here that holder *)
(* simply has not answered yet, and the command is still in `msgs`.        *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
    Workers,            \* agent-host workers that may lead the chat's log
    Keys,               \* follower commands; the key is the command's subject (run id)
    MaxEpoch,           \* lock acquisitions per behaviour
    MaxCrashes,
    MaxSends,           \* frames the follower may broadcast
    Steal,              \* some context may take the lock with {steal: true}
    Fence,              \* see above
    IdemKeys,           \* a leader answers an already-applied key from its log without applying it
    MustAnswer,         \* a frame for a stale generation is refused (answered), never dropped
    WaitOnAnyHeartbeat  \* the follower's wait is kept alive by any leader's heartbeat (today)

\* ---------------- W6 extensions: today's values (see above) ----------------
Scope == "lifetime"
Build(w) == "a"
CrossBuild(w) == IF w = "w1" THEN "a" ELSE "b"   \* two builds, for `Build <- CrossBuild`
MaxFreezes == 0
MaxWants == 0
MaxQueues == 0
StealRule == "any"
HeardRule == FALSE
SplitRead == FALSE
NoticeFirst == FALSE
FairThaw == FALSE

S4Fences == {"local", "firstAppend", "claim"}
ASSUME Fence \in S4Fences \cup {"lazy", "handle", "mint", "lazynocas"}
ASSUME {Steal, IdemKeys, MustAnswer, WaitOnAnyHeartbeat} \subseteq BOOLEAN
ASSUME Scope \in {"lifetime", "run"} /\ StealRule \in {"any", "timer", "silent"}
ASSUME {HeardRule, SplitRead, NoticeFirst, FairThaw} \subseteq BOOLEAN
ASSUME MaxWants > 0 => Fence \notin S4Fences   \* runs are modelled over the storage fences only

None == "none"
Follower == "f"   \* the follower's own tab, when ensureLeadership wins the lock for it
ClaimKey == "c"   \* a storage fence's claim row; not a command
Terminal == {"end", "abandon"}

VARIABLES
    lock,       \* the Web Lock holder, or None
    lockEpoch,  \* the epoch the current holder's acquisition minted (0 = none)
    epochs,     \* epochs minted so far
    alive, lead, claimed, view, vlen, mine, pending,
    \* lead[w]    epoch w believes it leads under (0 = it does not lead)
    \* claimed[w] w has read the log (with Fence = "claim", fenced the store first)
    \* view[w]    keys w's appender knows are applied: its read of the log plus its own rows
    \* vlen[w]    storage fences: the log length w's view has (its read plus its own rows)
    \* mine[w]    storage fences: the log epoch w's term writes under
    \* pending[w] frame w applied and has not answered yet (0 = none)
    fence,      \* the store's fence register (Fence = "claim")
    handle,     \* the OPFS sync handle's holder, or None (Fence = "handle")
    log,        \* rows [e: epoch, k: key, w: writer, r: run (0 = none), f: requester]
    lockNotFence, \* history: some row was appended under an epoch that was not the lock holder's
    frames,     \* broadcast command frames [id, k, g: target generation (0 = any), to: recipients]
    done,       \* frames each worker has handled
    status,     \* follower: "idle" | "waiting" | "answered" | "failed"
    latest,     \* follower: the id of each key's latest frame
    refused,    \* follower: its latest frame came back refused; re-address it
    heard,      \* the generation of the last heartbeat heard on the channel
    tries,      \* follower: broadcasts made for each key
    crashes, sends,
    \* W6 extensions
    frozen, freezes,
    reading,    \* reading[w]: readView is in flight (SplitRead)
    noticeDue,  \* noticeDue[w]: w thawed with a steal notice queued (NoticeFirst)
    queued, nqueues,  \* queued[w]: w waits in the lock's queue for a reconcile grant
    want, wants,      \* want[w]: w needs a run started, by itself or its build's leader
    drives,     \* drives[w]: the run w's M1 drives (0 = none)
    run,        \* the chat's run [id, s: "none" | "live" | "ended" | "abandoned", d: driver]
    nruns,
    zombie      \* history: a worker without the lock abandoned the run its holder drives

vars == <<lock, lockEpoch, epochs, alive, lead, claimed, view, vlen, mine, pending, fence, handle, log, lockNotFence,
          frames, done, status, latest, refused, heard, tries, crashes, sends,
          frozen, freezes, reading, noticeDue, queued, nqueues, want, wants, drives, run, nruns, zombie>>
workerVars == <<alive, lead, claimed, view, vlen, mine, pending>>
sendVars == <<frames, status, latest, refused, tries, sends>>
followerVars == <<frames, status, latest, refused, heard, tries, sends>>
tabVars == <<frozen, freezes, queued, nqueues>>
runVars == <<want, wants, run, nruns, zombie>>
scopeVars == <<frozen, freezes, reading, noticeDue, queued, nqueues, want, wants, drives, run, nruns, zombie>>

Init ==
    /\ lock = None /\ lockEpoch = 0 /\ epochs = 0
    /\ alive = [w \in Workers |-> TRUE] /\ lead = [w \in Workers |-> 0]
    /\ claimed = [w \in Workers |-> FALSE] /\ view = [w \in Workers |-> {}]
    /\ vlen = [w \in Workers |-> 0] /\ mine = [w \in Workers |-> 0]
    /\ pending = [w \in Workers |-> 0]
    /\ fence = 0 /\ handle = None /\ log = <<>> /\ lockNotFence = FALSE
    /\ frames = {} /\ done = [w \in Workers |-> {}]
    /\ status = [k \in Keys |-> "idle"] /\ latest = [k \in Keys |-> 0]
    /\ refused = [k \in Keys |-> FALSE] /\ heard = 0 /\ tries = [k \in Keys |-> 0]
    /\ crashes = 0 /\ sends = 0
    /\ frozen = [w \in Workers |-> FALSE] /\ freezes = 0
    /\ reading = [w \in Workers |-> FALSE] /\ noticeDue = [w \in Workers |-> FALSE]
    /\ queued = [w \in Workers |-> FALSE] /\ nqueues = 0
    /\ want = [w \in Workers |-> FALSE] /\ wants = 0
    /\ drives = [w \in Workers |-> 0] /\ run = [id |-> 0, s |-> "none", d |-> None] /\ nruns = 0
    /\ zombie = FALSE

Frame(id) == CHOOSE f \in frames : f.id = id
Row(e, k, w, r, f) == [e |-> e, k |-> k, w |-> w, r |-> r, f |-> f]
KeysIn(l) == {l[i].k : i \in 1..Len(l)}
StoreEpoch == IF log = <<>> THEN 0 ELSE log[Len(log)].e
MaxE(l) == IF Len(l) = 0 THEN 0 ELSE CHOOSE m \in {l[i].e : i \in 1..Len(l)} : \A i \in 1..Len(l) : l[i].e <= m
Believers == {w \in Workers : alive[w] /\ lead[w] > 0}
RowEpoch(w) == IF Fence \in S4Fences THEN lead[w] ELSE mine[w]
ReleaseHandle(w) == IF handle = w THEN None ELSE handle
Up(w) == alive[w] /\ ~frozen[w]   \* the worker runs code
NoneQueued == \A x \in Workers : ~queued[x]
Hb(e) == heard' = IF HeardRule THEN e ELSE heard   \* HeardRule: the grant callback posts a heartbeat

\* Relinquish: no term, no run driven, no read in flight; the writer (and its OPFS handle) closes.
StepDown(w) ==
    /\ lead' = [lead EXCEPT ![w] = 0] /\ claimed' = [claimed EXCEPT ![w] = FALSE]
    /\ drives' = [drives EXCEPT ![w] = 0] /\ reading' = [reading EXCEPT ![w] = FALSE]
    /\ noticeDue' = [noticeDue EXCEPT ![w] = FALSE]
    /\ handle' = ReleaseHandle(w)

\* ---------------- election ----------------
Mint(w) ==
    /\ lock' = w /\ lockEpoch' = epochs + 1 /\ epochs' = epochs + 1
    /\ lead' = [lead EXCEPT ![w] = epochs + 1] /\ claimed' = [claimed EXCEPT ![w] = FALSE]

Acquire(w) ==   \* navigator.locks.request(name, {ifAvailable: true}); under Scope = "run" only for a write
    /\ Up(w) /\ lock = None /\ lead[w] = 0 /\ epochs < MaxEpoch /\ NoneQueued
    /\ Scope = "lifetime" \/ want[w]
    /\ Mint(w) /\ Hb(epochs + 1)
    /\ UNCHANGED <<alive, view, vlen, mine, pending, fence, handle, log, lockNotFence, done, sendVars, crashes, scopeVars>>

StealGuard(w) ==
    /\ CASE StealRule = "any" -> TRUE
         [] StealRule = "timer" -> want[w]
         [] StealRule = "silent" -> want[w] /\ lock \in Workers /\ (frozen[lock] \/ ~alive[lock])
    /\ HeardRule => heard = lockEpoch

StealLock(w) ==   \* {steal: true}: the old holder is not told synchronously and keeps running
    /\ Steal /\ Up(w) /\ lead[w] = 0 /\ lock \notin {None, w} /\ epochs < MaxEpoch /\ StealGuard(w)
    /\ Mint(w) /\ Hb(epochs + 1)
    /\ queued' = [queued EXCEPT ![w] = FALSE]   \* a steal replaces a queued request
    /\ UNCHANGED <<alive, view, vlen, mine, pending, fence, handle, log, lockNotFence, done, sendVars, crashes,
                   frozen, freezes, reading, noticeDue, nqueues, drives, runVars>>

Notice(w) ==   \* the lock promise rejects; the worker relinquishes the chat and closes the log
    /\ Up(w) /\ lead[w] > 0 /\ lock # w
    /\ StepDown(w)
    /\ UNCHANGED <<lock, lockEpoch, epochs, alive, view, vlen, mine, pending, fence, log, lockNotFence, done,
                   followerVars, crashes, tabVars, runVars>>

Crash(w) ==   \* the tab dies; its lock is released only eventually
    /\ alive[w] /\ crashes < MaxCrashes
    /\ alive' = [alive EXCEPT ![w] = FALSE] /\ view' = [view EXCEPT ![w] = {}]
    /\ pending' = [pending EXCEPT ![w] = 0] /\ crashes' = crashes + 1
    /\ StepDown(w)
    /\ frozen' = [frozen EXCEPT ![w] = FALSE] /\ queued' = [queued EXCEPT ![w] = FALSE]
    /\ want' = [want EXCEPT ![w] = FALSE]
    /\ UNCHANGED <<lock, lockEpoch, epochs, vlen, mine, fence, log, lockNotFence, done, followerVars,
                   freezes, nqueues, wants, run, nruns, zombie>>

ReleaseDead(w) ==
    /\ lock = w /\ ~alive[w]
    /\ lock' = None /\ lockEpoch' = 0
    /\ UNCHANGED <<epochs, workerVars, fence, handle, log, lockNotFence, done, followerVars, crashes, scopeVars>>

Restart(w) ==   \* a fresh worker for the tab; it never sees frames broadcast before it led
    /\ ~alive[w] /\ lock # w
    /\ alive' = [alive EXCEPT ![w] = TRUE]
    /\ UNCHANGED <<lock, lockEpoch, epochs, lead, claimed, view, vlen, mine, pending, fence, handle, log, lockNotFence,
                   done, followerVars, crashes, scopeVars>>

\* A storage fence's read: the term's epoch is one above the log's highest.
ReadLog(w) ==
    /\ claimed' = [claimed EXCEPT ![w] = TRUE]
    /\ mine' = [mine EXCEPT ![w] = MaxE(log) + 1]
    /\ view' = [view EXCEPT ![w] = KeysIn(log)]

\* The eager claim row, written at once ("handle", "mint").
ClaimRow(w) ==
    /\ log' = Append(log, Row(MaxE(log) + 1, ClaimKey, w, 0, w))
    /\ vlen' = [vlen EXCEPT ![w] = Len(log) + 1]

ReadStart(w) ==   \* SplitRead: readView is invoked; Notice cancels it (claiming's lock.lost)
    /\ SplitRead /\ Up(w) /\ lead[w] > 0 /\ ~claimed[w] /\ ~reading[w] /\ ~noticeDue[w]
    /\ reading' = [reading EXCEPT ![w] = TRUE]
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, handle, log, lockNotFence, done, followerVars, crashes,
                   tabVars, noticeDue, drives, runVars>>

Read(w) ==   \* open the log (view.read); a read started before a freeze may complete after the thaw
    /\ Up(w) /\ lead[w] > 0 /\ ~claimed[w]
    /\ IF SplitRead THEN reading[w] ELSE ~noticeDue[w]
    /\ reading' = [reading EXCEPT ![w] = FALSE]
    /\ CASE Fence \in S4Fences ->   \* read it; with Fence = "claim" fence the store first
              /\ IF Fence = "claim" /\ lead[w] < fence
                   THEN /\ lead' = [lead EXCEPT ![w] = 0]   \* a newer generation fenced the store: LEADERSHIP_LOST
                        /\ UNCHANGED <<claimed, fence, view>>
                   ELSE /\ claimed' = [claimed EXCEPT ![w] = TRUE]
                        /\ fence' = IF Fence = "claim" THEN lead[w] ELSE fence
                        /\ view' = [view EXCEPT ![w] = KeysIn(log)]
                        /\ UNCHANGED lead
              /\ UNCHANGED <<vlen, mine, handle, log>>
         [] Fence \in {"lazy", "lazynocas"} ->   \* read only; the claim row rides the first append
              /\ ReadLog(w)
              /\ vlen' = [vlen EXCEPT ![w] = Len(log)]
              /\ UNCHANGED <<lead, fence, handle, log>>
         [] Fence = "mint" ->
              /\ ReadLog(w) /\ ClaimRow(w)
              /\ UNCHANGED <<lead, fence, handle>>
         [] Fence = "handle" ->   \* createSyncAccessHandle succeeds only while no handle is open
              /\ handle = None /\ handle' = w
              /\ ReadLog(w) /\ ClaimRow(w)
              /\ UNCHANGED <<lead, fence>>
    /\ UNCHANGED <<lock, lockEpoch, epochs, alive, pending, lockNotFence, done, followerVars, crashes,
                   tabVars, noticeDue, drives, runVars>>

Heartbeat(w) ==   \* 1 Hz `leader` frames; a stale leader keeps sending until it notices
    /\ Up(w) /\ lead[w] > 0 /\ heard # lead[w]
    /\ heard' = lead[w]
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, handle, log, lockNotFence, frames, done, status, latest,
                   refused, tries, crashes, sends, scopeVars>>

\* ---------------- the leader serves forwarded commands ----------------
StoreAccepts(w) ==
    CASE Fence = "local" -> TRUE
      [] Fence = "firstAppend" -> lead[w] >= StoreEpoch
      [] Fence = "claim" -> lead[w] = fence
      [] Fence = "lazy" -> vlen[w] = Len(log)
      [] Fence = "handle" -> handle = w /\ vlen[w] = Len(log)
      [] Fence \in {"mint", "lazynocas"} -> TRUE

\* The rows one append writes: its row, after the lazy claim row when it opens the term (Claim).
NewRows(w, k, r, f) ==
    LET row == <<Row(RowEpoch(w), k, w, r, f)>> IN
    IF Fence \in {"lazy", "lazynocas"} /\ mine[w] > MaxE(log)
      THEN <<Row(mine[w], ClaimKey, w, 0, w)>> \o row
      ELSE row

Answered(k) == status' = [status EXCEPT ![k] = IF status[k] = "waiting" THEN "answered" ELSE status[k]]

Process(w, id) ==
    LET m == Frame(id) IN
    /\ Up(w) /\ ~noticeDue[w] /\ w \in m.to /\ id \notin done[w] /\ pending[w] = 0
    /\ lead[w] = 0 \/ claimed[w]
    /\ done' = [done EXCEPT ![w] = @ \cup {id}]
    /\ IF lead[w] = 0
         THEN UNCHANGED <<lead, claimed, view, vlen, pending, log, lockNotFence, status, refused>>   \* no leadership state: dropped
       ELSE IF m.g # 0 /\ m.g # lead[w]
         THEN /\ refused' = IF MustAnswer THEN [refused EXCEPT ![m.k] = TRUE] ELSE refused
              /\ UNCHANGED <<lead, claimed, view, vlen, pending, log, lockNotFence, status>>        \* LEADER_GENERATION_STALE
       ELSE IF IdemKeys /\ m.k \in view[w]
         THEN /\ Answered(m.k)                                                   \* replayed outcome
              /\ UNCHANGED <<lead, claimed, view, vlen, pending, log, lockNotFence, refused>>
       ELSE IF StoreAccepts(w)
         THEN /\ log' = log \o NewRows(w, m.k, 0, Follower)
              \* Storage fences stamp the log's epoch, never the lock's: the history is S4's.
              /\ lockNotFence' = (lockNotFence \/ (Fence \in S4Fences /\ lead[w] # lockEpoch))
              /\ view' = [view EXCEPT ![w] = @ \cup {m.k}]
              /\ vlen' = IF Fence \in S4Fences THEN vlen ELSE [vlen EXCEPT ![w] = @ + Len(NewRows(w, m.k, 0, Follower))]
              /\ pending' = [pending EXCEPT ![w] = id]
              /\ UNCHANGED <<lead, claimed, status, refused>>
       ELSE IF Fence \in S4Fences
         THEN /\ lead' = [lead EXCEPT ![w] = 0] /\ claimed' = [claimed EXCEPT ![w] = FALSE]
              /\ refused' = [refused EXCEPT ![m.k] = TRUE]                       \* LEADERSHIP_LOST, answered
              /\ UNCHANGED <<view, vlen, pending, log, lockNotFence, status>>
         ELSE \* LOG_FENCED: nothing written, answered; the holder reads again
              /\ claimed' = [claimed EXCEPT ![w] = FALSE]
              /\ refused' = [refused EXCEPT ![m.k] = TRUE]
              /\ UNCHANGED <<lead, view, vlen, pending, log, lockNotFence, status>>
    /\ UNCHANGED <<lock, lockEpoch, epochs, alive, mine, fence, handle, frames, latest, heard, tries, crashes, sends,
                   scopeVars>>

Answer(w) ==   \* the response frame for a command whose effect is already in the log
    /\ Up(w) /\ pending[w] # 0
    /\ Answered(Frame(pending[w]).k)
    /\ pending' = [pending EXCEPT ![w] = 0]
    /\ UNCHANGED <<lock, lockEpoch, epochs, alive, lead, claimed, view, vlen, mine, fence, handle, log, lockNotFence,
                   frames, done, latest, refused, heard, tries, crashes, sends, scopeVars>>

\* ---------------- the follower ----------------
Broadcast(k, g) ==
    /\ frames' = frames \cup {[id |-> sends + 1, k |-> k, g |-> g, to |-> Believers]}
    /\ latest' = [latest EXCEPT ![k] = sends + 1]
    /\ tries' = [tries EXCEPT ![k] = @ + 1]
    /\ sends' = sends + 1

Send(k) ==   \* forwardCommand: only a tab that lost the ifAvailable race forwards, so the lock is held
    /\ status[k] = "idle" /\ sends < MaxSends /\ lock # None
    /\ status' = [status EXCEPT ![k] = "waiting"]
    /\ Broadcast(k, heard)
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, handle, log, lockNotFence, done, refused, heard, crashes,
                   scopeVars>>

\* Some recipient of the frame can still answer it.
FrameLive(id) ==
    \E w \in Frame(id).to : alive[w] /\ ((lead[w] > 0 /\ id \notin done[w]) \/ pending[w] = id)

\* The wait for the key's latest frame ends unanswered: a refusal, or an expired wait. Today's wait
\* (awaitWhileLeaderLives) expires only when no leader heartbeats at all; a per-generation wait also
\* expires when the generation it addressed can no longer answer.
Unanswered(k) ==
    \/ refused[k]
    \/ IF WaitOnAnyHeartbeat THEN Believers = {} ELSE ~FrameLive(latest[k])

\* forwardCommand re-broadcasts only after losing the lock race; today exactly once (the replay,
\* addressed to no generation), the target until answered.
MayReaddress(k) == sends < MaxSends /\ lock # None /\ (WaitOnAnyHeartbeat => tries[k] = 1)
MayLead == lock = None /\ epochs < MaxEpoch

Retry(k) ==
    /\ status[k] = "waiting" /\ Unanswered(k) /\ MayReaddress(k)
    /\ Broadcast(k, IF WaitOnAnyHeartbeat THEN 0 ELSE heard)
    /\ refused' = [refused EXCEPT ![k] = FALSE]
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, handle, log, lockNotFence, done, status, heard, crashes,
                   scopeVars>>

\* The follower's own term: S4's fences stamp the new lock epoch; a storage fence claims the log's
\* next epoch with a claim row, in the same locked step as its read (LogFence's ReadAppend).
SelfLeadLog(k) ==
    LET e == IF Fence \in S4Fences THEN epochs + 1 ELSE MaxE(log) + 1
        claimRow == IF Fence \in S4Fences THEN <<>> ELSE <<Row(e, ClaimKey, Follower, 0, Follower)>>
        effect == IF IdemKeys /\ k \in KeysIn(log) THEN <<>> ELSE <<Row(e, k, Follower, 0, Follower)>>
    IN log \o claimRow \o effect

SelfLead(k) ==   \* ensureLeadership won: the follower's tab leads, opens the log and runs the command itself
    /\ status[k] = "waiting" /\ Unanswered(k) /\ MayLead
    /\ Fence = "handle" => handle = None
    /\ lock' = Follower /\ lockEpoch' = epochs + 1 /\ epochs' = epochs + 1
    /\ fence' = IF Fence = "claim" THEN epochs + 1 ELSE fence
    /\ log' = SelfLeadLog(k)
    /\ status' = [status EXCEPT ![k] = "answered"]
    /\ UNCHANGED <<workerVars, handle, lockNotFence, frames, done, latest, refused, heard, tries, crashes, sends,
                   scopeVars>>

TimeOut(k) ==   \* nothing left to try: LEADER_RESPONSE_TIMEOUT (or the refusal itself), surfaced
    /\ status[k] = "waiting" /\ Unanswered(k) /\ ~MayReaddress(k) /\ ~MayLead
    /\ status' = [status EXCEPT ![k] = "failed"]
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, handle, log, lockNotFence, frames, done, latest, refused,
                   heard, tries, crashes, sends, scopeVars>>

\* ---------------- W6: the workers' own runs, lock scope and the page lifecycle ----------------
SameWant(w) == \E x \in Workers : want[x] /\ alive[x] /\ Build(x) = Build(w)
\* w has an append to make: end its run, abandon one it does not drive, or admit its build's run.
Busy(w) ==
    \/ drives[w] > 0
    \/ run.s = "live" /\ drives[w] # run.id
    \/ run.s # "live" /\ SameWant(w)

\* One append of the term: the claim row first when it opens the term.
Put(w, k, r, f) ==
    LET rows == NewRows(w, k, r, f) IN
    /\ log' = log \o rows
    /\ vlen' = [vlen EXCEPT ![w] = @ + Len(rows)]

\* What an append leaves alone.
AppendFrame == <<lock, lockEpoch, epochs, alive, lead, claimed, view, mine, pending, fence, handle, lockNotFence,
                 done, followerVars, crashes, tabVars, reading, noticeDue>>

Want(w) ==   \* a write that needs the writer: start a run
    /\ Up(w) /\ ~want[w] /\ wants < MaxWants
    /\ want' = [want EXCEPT ![w] = TRUE] /\ wants' = wants + 1
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, handle, log, lockNotFence, done, followerVars, crashes,
                   tabVars, reading, noticeDue, drives, run, nruns, zombie>>

Start(w, x) ==   \* admit a run for a requester of the writer's own build: its intent row
    /\ Up(w) /\ claimed[w] /\ ~noticeDue[w] /\ StoreAccepts(w) /\ drives[w] = 0 /\ run.s # "live"
    /\ want[x] /\ alive[x] /\ Build(x) = Build(w)
    /\ Put(w, "admit", nruns + 1, x)
    /\ run' = [id |-> nruns + 1, s |-> "live", d |-> w] /\ nruns' = nruns + 1
    /\ drives' = [drives EXCEPT ![w] = nruns + 1] /\ want' = [want EXCEPT ![x] = FALSE]
    /\ UNCHANGED <<AppendFrame, wants, zombie>>

End(w) ==
    /\ Up(w) /\ claimed[w] /\ ~noticeDue[w] /\ drives[w] > 0 /\ StoreAccepts(w)
    /\ Put(w, "end", drives[w], w)
    /\ run' = IF run.id = drives[w] /\ run.s = "live" THEN [run EXCEPT !.s = "ended"] ELSE run
    /\ drives' = [drives EXCEPT ![w] = 0]
    /\ UNCHANGED <<AppendFrame, want, wants, nruns, zombie>>

Abandon(w) ==   \* M1's idle choice: a live run this writer does not drive (RH-R9)
    /\ Up(w) /\ claimed[w] /\ ~noticeDue[w] /\ StoreAccepts(w) /\ run.s = "live" /\ drives[w] # run.id
    /\ Put(w, "abandon", run.id, w)
    /\ run' = [run EXCEPT !.s = "abandoned"]
    /\ zombie' = (zombie \/ (lock # w /\ lock \in Workers /\ Up(lock) /\ drives[lock] = run.id))
    /\ UNCHANGED <<AppendFrame, drives, want, wants, nruns>>

Refused(w) ==   \* LOG_FENCED: nothing written; M2 has had no notice, so it believes it holds the lock and reads again
    /\ Up(w) /\ claimed[w] /\ ~noticeDue[w] /\ ~StoreAccepts(w) /\ Busy(w)
    /\ claimed' = [claimed EXCEPT ![w] = FALSE]
    /\ drives' = [drives EXCEPT ![w] = 0]   \* M1 is fenced; its run is orphaned
    /\ UNCHANGED <<lock, lockEpoch, epochs, alive, lead, view, vlen, mine, pending, fence, handle, log, lockNotFence,
                   done, followerVars, crashes, tabVars, reading, noticeDue, runVars>>

\* The term's first append (M2's first `appended`), named for conformance; not a step of its own and
\* not in Next: the Process, Start or Abandon step whose rows carry the lazy claim row. With the eager
\* fences ("handle", "mint") the claim row is written by Read instead.
Claim(w) ==
    /\ Fence \in {"lazy", "lazynocas"} /\ mine[w] > MaxE(log)
    /\ \/ \E id \in 1..sends : Process(w, id)
       \/ \E x \in Workers : Start(w, x)
       \/ Abandon(w)
    /\ Len(log') > Len(log)

Release(w) ==   \* RH-R8: M1 is quiescent and no write of this build waits; writes nothing
    /\ Scope = "run" /\ Up(w) /\ lock = w /\ lead[w] > 0 /\ drives[w] = 0 /\ pending[w] = 0 /\ ~SameWant(w)
    /\ lock' = None /\ lockEpoch' = 0
    /\ StepDown(w)
    /\ UNCHANGED <<epochs, alive, view, vlen, mine, pending, fence, log, lockNotFence, done, followerVars, crashes,
                   tabVars, runVars>>

QueueReconcile(w) ==   \* RH-R16: another tab leads a chat with a live run; wait in the lock's queue
    /\ nqueues < MaxQueues /\ Up(w) /\ ~queued[w] /\ lead[w] = 0 /\ lock \notin {None, w} /\ run.s = "live"
    /\ queued' = [queued EXCEPT ![w] = TRUE] /\ nqueues' = nqueues + 1
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, handle, log, lockNotFence, done, followerVars, crashes,
                   frozen, freezes, reading, noticeDue, drives, runVars>>

GrantQueued(w) ==   \* the lock manager grants the queued request; a queued tab is visible, so it runs
    /\ queued[w] /\ alive[w] /\ lock = None /\ lead[w] = 0 /\ epochs < MaxEpoch
    /\ Mint(w) /\ Hb(epochs + 1)
    /\ queued' = [queued EXCEPT ![w] = FALSE]
    /\ UNCHANGED <<alive, view, vlen, mine, pending, fence, handle, log, lockNotFence, done, sendVars, crashes,
                   frozen, freezes, reading, noticeDue, nqueues, drives, runVars>>

Freeze(w) ==   \* hiding precedes a freeze: the tab's queued request is dropped (RH-R16)
    /\ Up(w) /\ freezes < MaxFreezes
    /\ frozen' = [frozen EXCEPT ![w] = TRUE] /\ freezes' = freezes + 1
    /\ queued' = [queued EXCEPT ![w] = FALSE]
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, handle, log, lockNotFence, done, followerVars, crashes,
                   nqueues, reading, noticeDue, drives, runVars>>

\* Thaw resumes a hidden tab but does not request the lock again for reconciliation alone.
Thaw(w) ==
    /\ alive[w] /\ frozen[w]
    /\ frozen' = [frozen EXCEPT ![w] = FALSE]
    /\ noticeDue' = [noticeDue EXCEPT ![w] = NoticeFirst /\ lead[w] > 0 /\ lock # w]
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, handle, log, lockNotFence, done, followerVars, crashes,
                   freezes, queued, nqueues, reading, drives, runVars>>

Next ==
    \/ \E w \in Workers :
        \/ Acquire(w) \/ StealLock(w) \/ Notice(w) \/ Crash(w) \/ ReleaseDead(w) \/ Restart(w)
        \/ ReadStart(w) \/ Read(w) \/ Heartbeat(w) \/ Answer(w) \/ \E id \in 1..sends : Process(w, id)
        \/ Want(w) \/ \E x \in Workers : Start(w, x)
        \/ End(w) \/ Abandon(w) \/ Refused(w) \/ Release(w)
        \/ QueueReconcile(w) \/ GrantQueued(w) \/ Freeze(w) \/ Thaw(w)
    \/ \E k \in Keys : Send(k) \/ Retry(k) \/ SelfLead(k) \/ TimeOut(k)

\* W6's fairness is off with MaxWants = 0, so today's configurations keep their temporal formula.
ScopeFairness ==
    \A w \in Workers :
        /\ WF_vars(ReadStart(w)) /\ WF_vars(End(w)) /\ WF_vars(Abandon(w)) /\ WF_vars(Refused(w))
        /\ WF_vars(Release(w)) /\ WF_vars(GrantQueued(w)) /\ \A x \in Workers : WF_vars(Start(w, x))
        /\ (StealRule # "any" => WF_vars(StealLock(w)))
        /\ (FairThaw => WF_vars(Thaw(w)))

Fairness ==
    /\ \A w \in Workers :
        /\ WF_vars(Acquire(w)) /\ WF_vars(Notice(w)) /\ WF_vars(ReleaseDead(w)) /\ WF_vars(Restart(w))
        /\ WF_vars(Read(w)) /\ WF_vars(Heartbeat(w)) /\ WF_vars(Answer(w))
        /\ WF_vars(\E id \in 1..sends : Process(w, id))
    /\ \A k \in Keys : WF_vars(Retry(k)) /\ WF_vars(SelfLead(k)) /\ WF_vars(TimeOut(k))
    /\ (MaxWants > 0 => ScopeFairness)

Spec == Init /\ [][Next]_vars /\ Fairness

\* ---------------- refinement of the fence alone (W3 CL-S13, FM-Q12) ----------------
\* With a lazy fence every step is a LogFence step or leaves its variables unchanged, so
\* LogFence's inductive invariant carries I1 and I2 over to this election. The follower's
\* SelfLead is LogFence's ReadAppend; its view, epoch and claim stay at their initial values.
CoreWriters == Workers \cup {Follower}
Core == INSTANCE LogFence WITH
    Writers <- CoreWriters,
    Conditional <- (Fence \notin {"mint", "lazynocas"}),
    log <- [i \in 1..Len(log) |-> [e |-> log[i].e, w |-> log[i].w]],
    vlen <- [w \in CoreWriters |-> IF w = Follower THEN 0 ELSE vlen[w]],
    mine <- [w \in CoreWriters |-> IF w = Follower THEN 0 ELSE mine[w]],
    claimed <- [w \in CoreWriters |-> IF w = Follower THEN FALSE ELSE claimed[w]]
FenceRefined == Core!Init /\ [][Core!Next]_(Core!vars)
CoreIndInv == Core!IndInv

\* ---------------- properties ----------------
TypeOK ==
    /\ lock \in Workers \cup {None, Follower} /\ lockEpoch \in 0..MaxEpoch /\ epochs \in 0..MaxEpoch
    /\ lead \in [Workers -> 0..MaxEpoch] /\ fence \in 0..MaxEpoch /\ handle \in Workers \cup {None}
    /\ status \in [Keys -> {"idle", "waiting", "answered", "failed"}]

\* A closed epoch never appends again: rows' epochs never go backwards (store validity).
EpochsMonotone == \A i, j \in 1..Len(log) : i < j => log[i].e <= log[j].e
\* One writer per epoch.
OneWriterPerEpoch == \A i, j \in 1..Len(log) : log[i].e = log[j].e => log[i].w = log[j].w
\* A command's effect is applied at most once (claim rows are not commands).
AtMostOnceEffect == \A i, j \in 1..Len(log) : (i # j /\ log[i].k \in Keys) => log[i].k # log[j].k
\* Expected to FAIL under steal: the lock does not fence (the row's epoch is not the holder's).
RowEpochIsLockEpoch == ~lockNotFence
\* With the OPFS handle, only the handle's holder has an open claim.
SingleOpenWriter == Fence = "handle" => (handle # None => \A w \in Workers : claimed[w] => w = handle)

EveryCommandAnswered == \A k \in Keys : status[k] = "waiting" ~> status[k] \in {"answered", "failed"}

\* W6 (runs): one terminal row per run; I13, a run is abandoned only in a later epoch than its admission;
\* I32, a writer admits only its own build's runs.
OneTerminalPerRun == \A i, j \in 1..Len(log) :
    (i # j /\ log[i].k \in Terminal /\ log[j].k \in Terminal) => log[i].r # log[j].r
AbandonAfterFence == \A i, j \in 1..Len(log) :
    (log[i].k = "abandon" /\ log[j].k = "admit" /\ log[j].r = log[i].r) => log[j].e < log[i].e
SameBuildWriter == \A i \in 1..Len(log) : log[i].k = "admit" => Build(log[i].w) = Build(log[i].f)
\* RV7: a run is abandoned only after some tab froze or died (a `limit` under false suspicion, F1),
\* only after one died (on OPFS a freeze alone must not cost a run, F3), and never by a worker
\* without the lock while the lock's holder is up and driving it (F4).
NoAbandonWithoutFault == run.s = "abandoned" => (crashes > 0 \/ freezes > 0)
NoAbandonWithoutCrash == run.s = "abandoned" => crashes > 0
NoZombieAbandon == ~zombie
\* EQ4, no wedge: a running worker's write is eventually served.
Served == \A w \in Workers : want[w] ~> (~want[w] \/ ~alive[w] \/ frozen[w])

TraceView == [lock |-> lock, lockEpoch |-> lockEpoch, lead |-> lead, claimed |-> claimed, fence |-> fence,
              mine |-> mine, vlen |-> vlen, handle |-> handle,
              log |-> [i \in 1..Len(log) |-> <<log[i].e, log[i].k, log[i].w, log[i].r>>],
              status |-> status, refused |-> refused, heard |-> heard, tries |-> tries, alive |-> alive,
              pending |-> pending, frames |-> {<<f.id, f.k, f.g>> : f \in frames},
              frozen |-> frozen, reading |-> reading, noticeDue |-> noticeDue, queued |-> queued, want |-> want,
              drives |-> drives, run |-> run]
=====================================================================================
