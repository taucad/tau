---------------------------- MODULE LogLeadership ----------------------------
(***************************************************************************)
(* One chat's durable log, led by one of several agent-host workers (one   *)
(* per tab) through a Web Lock, with commands forwarded from a follower    *)
(* over a BroadcastChannel (apps/ui/app/workers/agent-host.impl.ts,        *)
(* agent-host-leader.ts; packages/agent-host/src/log/event-sequence.ts).   *)
(*                                                                         *)
(* A Web Lock is an election, not a fence: `steal` hands the lock to a new *)
(* context while the old holder keeps running until its lock promise      *)
(* rejects (Notice), and a dead context's lock is released only           *)
(* eventually. Each acquisition mints a monotonic epoch. Every row carries *)
(* the epoch its writer believed it led under. Where the epoch is checked  *)
(* is the knob `Fence`:                                                    *)
(*   "local"       only the leader's own belief (leadership map) is checked *)
(*   "firstAppend" the store refuses a closed epoch; a new epoch closes the *)
(*                 older one with its first row (createEventSequence)      *)
(*   "claim"       a new leader fences the store before it reads the log   *)
(*                                                                         *)
(* Frames are broadcast: a frame reaches the workers that led when it was  *)
(* sent; each recipient handles it once; a worker that no longer leads     *)
(* drops it. The follower (a tab that lost the ifAvailable race) waits for *)
(* an answer. When its wait ends unanswered (a refusal, or an expired wait) *)
(* forwardCommand takes the lock itself if it is free and runs the command *)
(* locally, or else re-broadcasts it; today once (the replay), the target   *)
(* until answered. `WaitOnAnyHeartbeat` is today's wait: any generation's   *)
(* heartbeat keeps it alive; the target's wait is per addressed generation. *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
    Workers,            \* agent-host workers that may lead the chat's log
    Keys,               \* follower commands; the key is the command's subject (run id)
    MaxEpoch,           \* lock acquisitions per behaviour
    MaxCrashes,
    MaxSends,           \* frames the follower may broadcast
    Steal,              \* some context may take the lock with {steal: true}
    Fence,              \* "local" | "firstAppend" | "claim"
    IdemKeys,           \* a leader answers an already-applied key from its log without applying it
    MustAnswer,         \* a frame for a stale generation is refused (answered), never dropped
    WaitOnAnyHeartbeat  \* the follower's wait is kept alive by any leader's heartbeat (today)

ASSUME Fence \in {"local", "firstAppend", "claim"}
ASSUME {Steal, IdemKeys, MustAnswer, WaitOnAnyHeartbeat} \subseteq BOOLEAN

None == "none"
Follower == "f"   \* the follower's own tab, when ensureLeadership wins the lock for it

VARIABLES
    lock,       \* the Web Lock holder, or None
    lockEpoch,  \* the epoch the current holder's acquisition minted (0 = none)
    epochs,     \* epochs minted so far
    alive, lead, claimed, view, pending,
    \* lead[w]    epoch w believes it leads under (0 = it does not lead)
    \* claimed[w] w has opened the log (read it; with Fence = "claim", fenced the store first)
    \* view[w]    keys w's appender knows are applied: its read of the log plus its own rows
    \* pending[w] frame w applied and has not answered yet (0 = none)
    fence,      \* the store's fence register (Fence = "claim")
    log,        \* rows [e: epoch, k: key, w: writer]
    lockNotFence, \* history: some row was appended under an epoch that was not the lock holder's
    frames,     \* broadcast command frames [id, k, g: target generation (0 = any), to: recipients]
    done,       \* frames each worker has handled
    status,     \* follower: "idle" | "waiting" | "answered" | "failed"
    latest,     \* follower: the id of each key's latest frame
    refused,    \* follower: its latest frame came back refused; re-address it
    heard,      \* follower: the generation of the last heartbeat it heard
    tries,      \* follower: broadcasts made for each key
    crashes, sends

vars == <<lock, lockEpoch, epochs, alive, lead, claimed, view, pending, fence, log, lockNotFence,
          frames, done, status, latest, refused, heard, tries, crashes, sends>>
workerVars == <<alive, lead, claimed, view, pending>>
followerVars == <<frames, status, latest, refused, heard, tries, sends>>

Init ==
    /\ lock = None /\ lockEpoch = 0 /\ epochs = 0
    /\ alive = [w \in Workers |-> TRUE] /\ lead = [w \in Workers |-> 0]
    /\ claimed = [w \in Workers |-> FALSE] /\ view = [w \in Workers |-> {}]
    /\ pending = [w \in Workers |-> 0]
    /\ fence = 0 /\ log = <<>> /\ lockNotFence = FALSE
    /\ frames = {} /\ done = [w \in Workers |-> {}]
    /\ status = [k \in Keys |-> "idle"] /\ latest = [k \in Keys |-> 0]
    /\ refused = [k \in Keys |-> FALSE] /\ heard = 0 /\ tries = [k \in Keys |-> 0]
    /\ crashes = 0 /\ sends = 0

Frame(id) == CHOOSE f \in frames : f.id = id
KeysIn(l) == {l[i].k : i \in 1..Len(l)}
StoreEpoch == IF log = <<>> THEN 0 ELSE log[Len(log)].e
Believers == {w \in Workers : alive[w] /\ lead[w] > 0}

\* ---------------- election ----------------
Mint(w) ==
    /\ lock' = w /\ lockEpoch' = epochs + 1 /\ epochs' = epochs + 1
    /\ lead' = [lead EXCEPT ![w] = epochs + 1] /\ claimed' = [claimed EXCEPT ![w] = FALSE]

Acquire(w) ==   \* navigator.locks.request(name, {ifAvailable: true})
    /\ alive[w] /\ lock = None /\ lead[w] = 0 /\ epochs < MaxEpoch
    /\ Mint(w)
    /\ UNCHANGED <<alive, view, pending, fence, log, lockNotFence, done, followerVars, crashes>>

StealLock(w) ==   \* {steal: true}: the old holder is not told synchronously and keeps running
    /\ Steal /\ alive[w] /\ lead[w] = 0 /\ lock \notin {None, w} /\ epochs < MaxEpoch
    /\ Mint(w)
    /\ UNCHANGED <<alive, view, pending, fence, log, lockNotFence, done, followerVars, crashes>>

Notice(w) ==   \* the lock promise rejects; the worker relinquishes the chat
    /\ lead[w] > 0 /\ lock # w
    /\ lead' = [lead EXCEPT ![w] = 0] /\ claimed' = [claimed EXCEPT ![w] = FALSE]
    /\ UNCHANGED <<lock, lockEpoch, epochs, alive, view, pending, fence, log, lockNotFence, done, followerVars, crashes>>

Crash(w) ==   \* the tab dies; its lock is released only eventually
    /\ alive[w] /\ crashes < MaxCrashes
    /\ alive' = [alive EXCEPT ![w] = FALSE] /\ lead' = [lead EXCEPT ![w] = 0]
    /\ claimed' = [claimed EXCEPT ![w] = FALSE] /\ view' = [view EXCEPT ![w] = {}]
    /\ pending' = [pending EXCEPT ![w] = 0] /\ crashes' = crashes + 1
    /\ UNCHANGED <<lock, lockEpoch, epochs, fence, log, lockNotFence, done, followerVars>>

ReleaseDead(w) ==
    /\ lock = w /\ ~alive[w]
    /\ lock' = None /\ lockEpoch' = 0
    /\ UNCHANGED <<epochs, workerVars, fence, log, lockNotFence, done, followerVars, crashes>>

Restart(w) ==   \* a fresh worker for the tab; it never sees frames broadcast before it led
    /\ ~alive[w] /\ lock # w
    /\ alive' = [alive EXCEPT ![w] = TRUE]
    /\ UNCHANGED <<lock, lockEpoch, epochs, lead, claimed, view, pending, fence, log, lockNotFence, done, followerVars, crashes>>

Claim(w) ==   \* open the log: read it, and with Fence = "claim" fence the store first
    /\ alive[w] /\ lead[w] > 0 /\ ~claimed[w]
    /\ IF Fence = "claim" /\ lead[w] < fence
         THEN /\ lead' = [lead EXCEPT ![w] = 0]   \* a newer generation fenced the store: LEADERSHIP_LOST
              /\ UNCHANGED <<claimed, fence, view>>
         ELSE /\ claimed' = [claimed EXCEPT ![w] = TRUE]
              /\ fence' = IF Fence = "claim" THEN lead[w] ELSE fence
              /\ view' = [view EXCEPT ![w] = KeysIn(log)]
              /\ UNCHANGED lead
    /\ UNCHANGED <<lock, lockEpoch, epochs, alive, pending, log, lockNotFence, done, followerVars, crashes>>

Heartbeat(w) ==   \* 1 Hz `leader` frames; a stale leader keeps sending until it notices
    /\ alive[w] /\ lead[w] > 0 /\ heard # lead[w]
    /\ heard' = lead[w]
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, log, lockNotFence, frames, done, status, latest, refused,
                   tries, crashes, sends>>

\* ---------------- the leader serves forwarded commands ----------------
StoreAccepts(w) ==
    CASE Fence = "local" -> TRUE
      [] Fence = "firstAppend" -> lead[w] >= StoreEpoch
      [] Fence = "claim" -> lead[w] = fence

Answered(k) == status' = [status EXCEPT ![k] = IF status[k] = "waiting" THEN "answered" ELSE status[k]]

Process(w, id) ==
    LET m == Frame(id) IN
    /\ alive[w] /\ w \in m.to /\ id \notin done[w] /\ pending[w] = 0
    /\ lead[w] = 0 \/ claimed[w]
    /\ done' = [done EXCEPT ![w] = @ \cup {id}]
    /\ IF lead[w] = 0
         THEN UNCHANGED <<lead, claimed, view, pending, log, lockNotFence, status, refused>>   \* no leadership state: dropped
       ELSE IF m.g # 0 /\ m.g # lead[w]
         THEN /\ refused' = IF MustAnswer THEN [refused EXCEPT ![m.k] = TRUE] ELSE refused
              /\ UNCHANGED <<lead, claimed, view, pending, log, lockNotFence, status>>        \* LEADER_GENERATION_STALE
       ELSE IF IdemKeys /\ m.k \in view[w]
         THEN /\ Answered(m.k)                                                   \* replayed outcome
              /\ UNCHANGED <<lead, claimed, view, pending, log, lockNotFence, refused>>
       ELSE IF StoreAccepts(w)
         THEN /\ log' = Append(log, [e |-> lead[w], k |-> m.k, w |-> w])
              /\ lockNotFence' = (lockNotFence \/ lead[w] # lockEpoch)
              /\ view' = [view EXCEPT ![w] = @ \cup {m.k}]
              /\ pending' = [pending EXCEPT ![w] = id]
              /\ UNCHANGED <<lead, claimed, status, refused>>
         ELSE /\ lead' = [lead EXCEPT ![w] = 0] /\ claimed' = [claimed EXCEPT ![w] = FALSE]
              /\ refused' = [refused EXCEPT ![m.k] = TRUE]                       \* LEADERSHIP_LOST, answered
              /\ UNCHANGED <<view, pending, log, lockNotFence, status>>
    /\ UNCHANGED <<lock, lockEpoch, epochs, alive, fence, frames, latest, heard, tries, crashes, sends>>

Answer(w) ==   \* the response frame for a command whose effect is already in the log
    /\ alive[w] /\ pending[w] # 0
    /\ Answered(Frame(pending[w]).k)
    /\ pending' = [pending EXCEPT ![w] = 0]
    /\ UNCHANGED <<lock, lockEpoch, epochs, alive, lead, claimed, view, fence, log, lockNotFence, frames, done,
                   latest, refused, heard, tries, crashes, sends>>

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
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, log, lockNotFence, done, refused, heard, crashes>>

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
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, log, lockNotFence, done, status, heard, crashes>>

SelfLead(k) ==   \* ensureLeadership won: the follower's tab leads, opens the log and runs the command itself
    /\ status[k] = "waiting" /\ Unanswered(k) /\ MayLead
    /\ lock' = Follower /\ lockEpoch' = epochs + 1 /\ epochs' = epochs + 1
    /\ fence' = IF Fence = "claim" THEN epochs + 1 ELSE fence
    /\ log' = IF IdemKeys /\ k \in KeysIn(log) THEN log ELSE Append(log, [e |-> epochs + 1, k |-> k, w |-> Follower])
    /\ status' = [status EXCEPT ![k] = "answered"]
    /\ UNCHANGED <<workerVars, lockNotFence, frames, done, latest, refused, heard, tries, crashes, sends>>

TimeOut(k) ==   \* nothing left to try: LEADER_RESPONSE_TIMEOUT (or the refusal itself), surfaced
    /\ status[k] = "waiting" /\ Unanswered(k) /\ ~MayReaddress(k) /\ ~MayLead
    /\ status' = [status EXCEPT ![k] = "failed"]
    /\ UNCHANGED <<lock, lockEpoch, epochs, workerVars, fence, log, lockNotFence, frames, done, latest, refused, heard,
                   tries, crashes, sends>>

Next ==
    \/ \E w \in Workers :
        \/ Acquire(w) \/ StealLock(w) \/ Notice(w) \/ Crash(w) \/ ReleaseDead(w) \/ Restart(w)
        \/ Claim(w) \/ Heartbeat(w) \/ Answer(w) \/ \E id \in 1..sends : Process(w, id)
    \/ \E k \in Keys : Send(k) \/ Retry(k) \/ SelfLead(k) \/ TimeOut(k)

Fairness ==
    /\ \A w \in Workers :
        /\ WF_vars(Acquire(w)) /\ WF_vars(Notice(w)) /\ WF_vars(ReleaseDead(w)) /\ WF_vars(Restart(w))
        /\ WF_vars(Claim(w)) /\ WF_vars(Heartbeat(w)) /\ WF_vars(Answer(w))
        /\ WF_vars(\E id \in 1..sends : Process(w, id))
    /\ \A k \in Keys : WF_vars(Retry(k)) /\ WF_vars(SelfLead(k)) /\ WF_vars(TimeOut(k))

Spec == Init /\ [][Next]_vars /\ Fairness

\* ---------------- properties ----------------
TypeOK ==
    /\ lock \in Workers \cup {None, Follower} /\ lockEpoch \in 0..MaxEpoch /\ epochs \in 0..MaxEpoch
    /\ lead \in [Workers -> 0..MaxEpoch] /\ fence \in 0..MaxEpoch
    /\ status \in [Keys -> {"idle", "waiting", "answered", "failed"}]

\* A closed epoch never appends again: rows' epochs never go backwards (store validity).
EpochsMonotone == \A i, j \in 1..Len(log) : i < j => log[i].e <= log[j].e
\* One writer per epoch.
OneWriterPerEpoch == \A i, j \in 1..Len(log) : log[i].e = log[j].e => log[i].w = log[j].w
\* A command's effect is applied at most once.
AtMostOnceEffect == \A i, j \in 1..Len(log) : (i # j) => log[i].k # log[j].k
\* Expected to FAIL under steal: the lock does not fence (the row's epoch is not the holder's).
RowEpochIsLockEpoch == ~lockNotFence

EveryCommandAnswered == \A k \in Keys : status[k] = "waiting" ~> status[k] \in {"answered", "failed"}

TraceView == [lock |-> lock, lockEpoch |-> lockEpoch, lead |-> lead, claimed |-> claimed, fence |-> fence,
              log |-> [i \in 1..Len(log) |-> <<log[i].e, log[i].k, log[i].w>>],
              status |-> status, refused |-> refused, heard |-> heard, tries |-> tries, alive |-> alive,
              pending |-> pending, frames |-> {<<f.id, f.k, f.g>> : f \in frames}]
=====================================================================================
