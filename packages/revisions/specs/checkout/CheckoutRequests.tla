--------------------------- MODULE CheckoutRequests ---------------------------
(***************************************************************************)
(* One checkout: its cut queue, its mint, its head and branch, the root    *)
(* that routes head facts to it, and the registry that re-announces the    *)
(* records it read once at open. W5 (RM-S1), promoted from the charter    *)
(* draft. Knobs select today's code or the W5 target.                      *)
(*                                                                         *)
(* Heads are counters per branch that only grow: refs move only forward    *)
(* by compare-and-swap (sync charter I2). `feature` starts at `main`'s     *)
(* head, the state right after *New branch*.                               *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  TurnReqs,        \* request ids of turn cuts; never coalesced (R13)
  SaveReqs,        \* request ids of trigger-only cuts (save, idle, close)
  Coalesce,        \* "replace" (today, R13 keeps the newest) | "keepAll" (RM-R2)
  RegistryHeads,   \* "adopt" (today: announcements re-head the actor) | "ignore" (RM-R5)
  MoveDuringMint,  \* "abortSilent" (today) | "abortAnswer" (W0.9 as written) | "defer" (RM-R6)
  HeadFacts,       \* "adoptHead" (today: head only, branch kept) | "reread" (RM-R5)
  CasChecksBranch, \* FALSE (today) | TRUE (RM-R6)
  Cancellable,     \* FALSE (today) | TRUE (`cancelCut`, RM-R4)
  MaxExternal,     \* head moves by other writers (sync fast-forward, another tab)
  MaxAnnounce      \* registry re-announcements

Reqs     == TurnReqs \cup SaveReqs
Branches == {"main", "feature"}
Registry == [branch |-> "main", head |-> 1]   \* read once at `loading`, re-announced as is
NoCas    == [branch |-> "none", expected |-> 0]

VARIABLES
  ref,       \* the store: each branch's head
  disk,      \* the branch the checkout's files and HEAD are on
  actor,     \* the checkout actor's belief [branch, head]
  rootRec,   \* the root's record of the checkout (today)
  queue,     \* queued cut entries, each a set of request ids
  mint,      \* [phase, reqs, branch, expected]
  orphan,    \* a compare-and-swap the actor stopped waiting for
  deferred,  \* a head fact that arrived during a mint (target)
  facts,     \* head facts from a producer to the root, in order
  sent, nAns, last, cancelled,
  ghost,     \* a revision was published for a request after it was answered otherwise
  foreign,   \* a mint moved a branch the checkout's files are not on
  unseen,    \* another writer moved the checkout's branch and no one told the actor
  ext, ann, switched,
  act        \* the step's action label, for the conformance graph (W1 export)

vars == <<ref, disk, actor, rootRec, queue, mint, orphan, deferred, facts,
          sent, nAns, last, cancelled, ghost, foreign, unseen, ext, ann, switched, act>>

Idle == [phase |-> "idle", reqs |-> {}, branch |-> "none", expected |-> 0]
(* No mint runs, but a re-read of the head is in flight (`rereading`); requests queue behind it. *)
Reading == [Idle EXCEPT !.phase = "rereading"]

Init ==
  /\ ref = [b \in Branches |-> 1]
  /\ disk = "main"
  /\ actor = [branch |-> "main", head |-> 1]
  /\ rootRec = [branch |-> "main", head |-> 1]
  /\ queue = <<>>
  /\ mint = Idle
  /\ orphan = NoCas
  /\ deferred = FALSE
  /\ facts = <<>>
  /\ sent = {}
  /\ nAns = [r \in Reqs |-> 0]
  /\ last = [r \in Reqs |-> "none"]
  /\ cancelled = {}
  /\ ghost = FALSE
  /\ foreign = FALSE
  /\ unseen = FALSE
  /\ ext = 0
  /\ ann = 0
  /\ switched = FALSE
  /\ act = <<"Init">>

Answer(S, a) ==
  /\ nAns' = [r \in Reqs |-> IF r \in S THEN nAns[r] + 1 ELSE nAns[r]]
  /\ last' = [r \in Reqs |-> IF r \in S THEN a ELSE last[r]]

(* What a re-read of the head returns: today `readHead` has no branch. *)
Reread(r) ==
  IF HeadFacts = "reread" THEN [branch |-> disk, head |-> r[disk]]
  ELSE [branch |-> actor.branch, head |-> r[disk]]

(* The page's view: today the root's record for the branch and the actor's *)
(* status for the head; in the target both come from the actor (RM-R5).    *)
View == IF RegistryHeads = "adopt" THEN [branch |-> rootRec.branch, head |-> actor.head] ELSE actor

(* A mint or read that ends clean or dirty starts the next queued entry in *)
(* the same step, from the actor's new belief (the machine's `always` after *)
(* `minting` and `rereading`). Reads actor'.                                *)
Promote ==
  IF queue = <<>>
    THEN /\ mint' = Idle
         /\ UNCHANGED queue
    ELSE /\ mint' = [phase |-> "cutting", reqs |-> Head(queue), branch |-> actor'.branch, expected |-> actor'.head]
         /\ queue' = Tail(queue)

-----------------------------------------------------------------------------
(* Requests. R13 today: a trigger-only cut replaces a queued trigger-only  *)
(* cut, and the replaced requester is never answered (L7 D-L7-2).          *)

(* An idle checkout starts minting at once; a busy one queues. *)
Request(r) ==
  /\ r \notin sent
  /\ act' = <<"Request", r>>
  /\ sent' = sent \cup {r}
  /\ IF mint.phase = "idle" /\ queue = <<>>
       THEN /\ mint' = [phase |-> "cutting", reqs |-> {r}, branch |-> actor.branch, expected |-> actor.head]
            /\ UNCHANGED queue
       ELSE /\ queue' = IF r \in SaveReqs /\ queue # <<>> /\ queue[Len(queue)] \cap TurnReqs = {}
                          THEN [queue EXCEPT ![Len(queue)] = IF Coalesce = "keepAll" THEN @ \cup {r} ELSE {r}]
                          ELSE Append(queue, {r})
            /\ UNCHANGED mint
  /\ UNCHANGED <<ref, disk, actor, rootRec, orphan, deferred, facts, nAns, last,
                 cancelled, ghost, foreign, unseen, ext, ann, switched>>

(* RM-R4: a turn withdraws its cut; a queued one is answered `cancelled`, *)
(* a running one is answered by the mint's own outcome.                  *)
Cancel(r) ==
  /\ Cancellable
  /\ r \in TurnReqs /\ r \in sent /\ r \notin cancelled /\ nAns[r] = 0
  /\ act' = <<"Cancel", r>>
  /\ cancelled' = cancelled \cup {r}
  /\ IF \E i \in 1..Len(queue) : r \in queue[i]
       THEN /\ queue' = SelectSeq([i \in 1..Len(queue) |-> queue[i] \ {r}], LAMBDA e : e # {})
            /\ Answer({r}, "cancelled")
       ELSE UNCHANGED <<queue, nAns, last>>
  /\ UNCHANGED <<ref, disk, actor, rootRec, mint, orphan, deferred, facts, sent,
                 ghost, foreign, unseen, ext, ann, switched>>

-----------------------------------------------------------------------------
(* The mint: fence, cut, write, then compare-and-swap the branch's ref.    *)

(* A mint that ends with a head fact deferred re-reads before the queue moves (RM-R6). *)
EndMint ==
  IF deferred THEN /\ mint' = Reading
                   /\ UNCHANGED queue
              ELSE Promote

MintNothing ==
  /\ mint.phase = "cutting"
  /\ act' = <<"MintNothing">>
  /\ Answer(mint.reqs, "nothing")
  /\ actor' = actor
  /\ EndMint
  /\ deferred' = FALSE
  /\ UNCHANGED <<ref, disk, rootRec, orphan, facts, sent, cancelled, ghost, foreign,
                 unseen, ext, ann, switched>>

WriteDone ==
  /\ mint.phase = "cutting"
  /\ act' = <<"WriteDone">>
  /\ mint' = [mint EXCEPT !.phase = "publishing"]
  /\ UNCHANGED <<ref, disk, actor, rootRec, queue, orphan, deferred, facts, sent, nAns, last,
                 cancelled, ghost, foreign, unseen, ext, ann, switched>>

Cas ==
  /\ mint.phase = "publishing"
  /\ act' = <<"Cas">>
  /\ LET b      == mint.branch
         ok     == ref[b] = mint.expected /\ (CasChecksBranch => disk = b)
         newRef == IF ok THEN [ref EXCEPT ![b] = @ + 1] ELSE ref
     IN /\ ref' = newRef
        /\ foreign' = (foreign \/ (ok /\ b # disk))
        /\ Answer(mint.reqs, IF ok THEN "minted" ELSE "casLost")
        /\ actor' = IF ok THEN [branch |-> b, head |-> newRef[b]] ELSE actor
        /\ unseen' = IF ok /\ ~deferred /\ b = disk THEN FALSE ELSE unseen
        (* A lost CAS re-reads (D24); so does a fact deferred during the mint. *)
        /\ IF ok THEN EndMint
                 ELSE /\ mint' = Reading
                      /\ UNCHANGED queue
  /\ deferred' = FALSE
  /\ UNCHANGED <<disk, rootRec, orphan, facts, sent, cancelled, ghost, ext, ann, switched>>

(* A compare-and-swap whose waiter left still reaches the store (abort does *)
(* not stop a started write, `revision-effects.ts:686-699`).               *)
OrphanLands ==
  /\ orphan # NoCas
  /\ act' = <<"OrphanLands">>
  /\ LET b  == orphan.branch
         ok == ref[b] = orphan.expected /\ (CasChecksBranch => disk = b)
     IN /\ ref' = IF ok THEN [ref EXCEPT ![b] = @ + 1] ELSE ref
        /\ ghost' = (ghost \/ ok)
        /\ foreign' = (foreign \/ (ok /\ b # disk))
        /\ unseen' = (unseen \/ (ok /\ b = disk))
  /\ orphan' = NoCas
  /\ UNCHANGED <<disk, actor, rootRec, queue, mint, deferred, facts, sent, nAns, last,
                 cancelled, ext, ann, switched>>

(* The re-read lands: the head and branch on disk now. A fact that arrived *)
(* during the read asks for another (`rereading` re-entered).              *)
ReadDone ==
  /\ mint.phase = "rereading"
  /\ act' = <<"ReadDone">>
  /\ actor' = Reread(ref)
  /\ unseen' = FALSE
  /\ IF deferred THEN UNCHANGED <<mint, queue>> ELSE Promote
  /\ deferred' = FALSE
  /\ UNCHANGED <<ref, disk, rootRec, orphan, facts, sent, nAns, last, cancelled, ghost, foreign,
                 ext, ann, switched>>

-----------------------------------------------------------------------------
(* Producers that move the checkout: a switch applied to it and a sync     *)
(* fast-forward. Both apply under the checkout fence, so never mid-mint (a  *)
(* re-read holds no fence);                                                 *)
(* their fact reaches the root later. Another tab's mint sends no fact.    *)

SwitchApply ==
  /\ ~switched /\ mint.phase \in {"idle", "rereading"}
  /\ act' = <<"SwitchApply">>
  /\ switched' = TRUE
  /\ disk' = "feature"
  /\ facts' = Append(facts, [branch |-> "feature", head |-> ref["feature"]])
  /\ UNCHANGED <<ref, actor, rootRec, queue, mint, orphan, deferred, sent, nAns, last,
                 cancelled, ghost, foreign, unseen, ext, ann>>

FastForward ==
  /\ ext < MaxExternal /\ mint.phase \in {"idle", "rereading"}
  /\ act' = <<"FastForward">>
  /\ ext' = ext + 1
  /\ ref' = [ref EXCEPT ![disk] = @ + 1]
  /\ facts' = Append(facts, [branch |-> disk, head |-> ref[disk] + 1])
  /\ UNCHANGED <<disk, actor, rootRec, queue, mint, orphan, deferred, sent, nAns, last,
                 cancelled, ghost, foreign, unseen, ann, switched>>

OtherWriter(b) ==
  /\ ext < MaxExternal
  /\ act' = <<"OtherWriter", b>>
  /\ ext' = ext + 1
  /\ ref' = [ref EXCEPT ![b] = @ + 1]
  /\ unseen' = (unseen \/ b = disk)
  /\ UNCHANGED <<disk, actor, rootRec, queue, mint, orphan, deferred, facts, sent, nAns, last,
                 cancelled, ghost, foreign, ann, switched>>

(* The actor told that its head moved to `h`. *)
Moved(h) ==
  IF mint.phase = "idle"
    THEN IF HeadFacts = "reread"
           THEN /\ mint' = Reading
                /\ UNCHANGED <<actor, unseen, queue, orphan, deferred, nAns, last>>
           ELSE /\ actor' = [actor EXCEPT !.head = h]
                /\ UNCHANGED <<mint, queue, orphan, deferred, unseen, nAns, last>>
  (* A read in flight is re-read after it lands; nothing is aborted. *)
  ELSE IF MoveDuringMint = "defer" \/ mint.phase = "rereading"
    THEN /\ deferred' = TRUE
         /\ UNCHANGED <<actor, mint, queue, orphan, unseen, nAns, last>>
  (* Today `headChanged` exits `minting`; W0.9 as written answers `superseded`. *)
  ELSE /\ orphan' = IF mint.phase = "publishing" THEN [branch |-> mint.branch, expected |-> mint.expected] ELSE orphan
       /\ actor' = IF HeadFacts = "reread" THEN Reread(ref) ELSE [actor EXCEPT !.head = h]
       /\ Promote
       /\ unseen' = IF HeadFacts = "reread" THEN FALSE ELSE unseen
       /\ IF MoveDuringMint = "abortAnswer" THEN Answer(mint.reqs, "superseded") ELSE UNCHANGED <<nAns, last>>
       /\ UNCHANGED deferred

(* The root receives a producer's fact (`checkoutChanged`). *)
DeliverFact ==
  /\ facts # <<>>
  /\ act' = <<"DeliverFact">>
  /\ LET f == Head(facts)
     IN /\ Moved(f.head)
        /\ rootRec' = IF RegistryHeads = "adopt" THEN f ELSE rootRec
  /\ facts' = Tail(facts)
  /\ UNCHANGED <<ref, disk, sent, cancelled, ghost, foreign, ext, ann, switched>>

(* A registry announcement (after any lease write) carries the records it *)
(* read at `loading`; today the root replaces its records wholesale and   *)
(* re-heads the actor when the head differs (L7 D-L7-1).                  *)
RegistryAnnounce ==
  /\ ann < MaxAnnounce
  /\ ann' = ann + 1
  /\ act' = <<"RegistryAnnounce">>
  /\ IF RegistryHeads = "adopt"
       THEN /\ rootRec' = Registry
            /\ IF rootRec.head # Registry.head
                 THEN Moved(Registry.head)
                 ELSE UNCHANGED <<actor, mint, queue, orphan, deferred, unseen, nAns, last>>
       ELSE UNCHANGED <<rootRec, actor, mint, queue, orphan, deferred, unseen, nAns, last>>
  /\ UNCHANGED <<ref, disk, facts, sent, cancelled, ghost, foreign, ext, switched>>

-----------------------------------------------------------------------------

Next ==
  \/ \E r \in Reqs : Request(r) \/ Cancel(r)
  \/ MintNothing \/ WriteDone \/ Cas \/ OrphanLands \/ ReadDone
  \/ SwitchApply \/ FastForward \/ \E b \in Branches : OtherWriter(b)
  \/ DeliverFact \/ RegistryAnnounce

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties (I24 and the two W0 hazards). *)

Rest == queue = <<>> /\ mint.phase = "idle" /\ orphan = NoCas /\ facts = <<>> /\ ~deferred

(* Nightly simulation keeps the behaviours that come to rest (W1 `formal nightly`). *)
Quiescent == Rest

AnsweredAtMostOnce == \A r \in Reqs : nAns[r] <= 1

(* I24, first half: every requester is answered. *)
EveryRequesterAnswered == Rest => \A r \in sent : nAns[r] = 1

(* No revision is published for a request after it was answered otherwise. *)
NoPublishAfterAnswer == ~ghost

(* A mint moves only the branch the checkout's files are on. *)
MintsOnOwnBranch == ~foreign

(* At rest, and unless another writer moved it unseen, the page's view is the store's. *)
ViewAgreesAtRest == Rest /\ ~unseen => View = [branch |-> disk, head |-> ref[disk]]

(* I24, second half: an announcement never moves a head backwards on its branch. *)
HeadNeverRegresses ==
  [][ /\ (actor'.branch = actor.branch => actor'.head >= actor.head)
      /\ (View'.branch = View.branch => View'.head >= View.head) ]_vars

=============================================================================
