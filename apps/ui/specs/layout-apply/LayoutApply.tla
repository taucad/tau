---------------------------- MODULE LayoutApply ----------------------------
(***************************************************************************)
(* How the workbench arrangement record is applied to Dockview (app state *)
(* orchestration charter D13, D18, invariants I10 to I14). It is the spec *)
(* for `workbench-layout.machine` (A8a) and lands before that machine,    *)
(* under formal verification policy rule 1.                               *)
(*                                                                         *)
(* Parties:                                                                *)
(*   record    the publications `recordSync` emits for the layout file:   *)
(*             bytes and an attributed origin, own or foreign. Any bytes  *)
(*             with any origin, so a misattributed echo of the store's    *)
(*             own write is one of them                                   *)
(*   person    rearranges panes while an adapter is attached              *)
(*   adapters  the workbench and the viewer Dockview, each detached,      *)
(*             attaching or attached; a phone has the viewer only         *)
(*   intents   pane requests (open a file, reveal a model) for one        *)
(*             adapter, queued until applied or dropped with a reason     *)
(*   restore   commands from the arrange-workbench card, each with the    *)
(*             arrangement it expects and the one it restores; the card   *)
(*             may send any number of them, a stale one included          *)
(*   route     the route key; a change drops what was queued before it    *)
(*   host      Today only: the React host remounts and replaces its store *)
(*                                                                         *)
(* The model is untimed. `recordSync` itself is not modelled               *)
(* (`RecordSync.tla` is reused unchanged): the layout starts where its    *)
(* publications come out. An arrangement is an opaque value with no       *)
(* geometry, and what the attached adapters show is that one value. A     *)
(* file pane's dependency on its file opening is one "target available"   *)
(* flag, which the environment lowers at any step (`DropUnavailable`).    *)
(*                                                                         *)
(* Edit count. Only comparisons of the count are observable, so the model *)
(* keeps, for the latest publication and for the apply in flight, whether *)
(* the count has moved since (`fresh`), and `edited`, whether this step   *)
(* counted an edit. "An apply computed at an edit count lower than the    *)
(* current one" is an apply that is not `fresh`.                          *)
(*                                                                         *)
(* Revisions. Only "the latest publication" and "an older one" are        *)
(* observable, so `applied` is Unknown, "latest" or "older", and an apply *)
(* knows whether its publication is still the latest.                     *)
(*                                                                         *)
(* Design rules the target holds (README.md, Rules for A8a):              *)
(*   1. Every local change of the arrangement (a person's edit, an        *)
(*      applied intent, an applied restore) counts one edit.              *)
(*   2. An apply carries the edit count at the step its publication       *)
(*      arrived, and lands only while that publication is the latest and  *)
(*      the count is unchanged; otherwise it is discarded.                *)
(*   3. An own publication whose bytes the arrangement already holds is   *)
(*      not re-applied; any other publication, own or foreign, is applied *)
(*      under rules 2 and 8. It may be acknowledged either way.           *)
(*   4. A revision is acknowledged only while an adapter is attached, no  *)
(*      apply is in flight and the arrangement holds its bytes; any       *)
(*      detach makes the applied revision unknown.                        *)
(*   5. A restore is settled against the arrangement at that step, and is *)
(*      refused while a local edit is unwritten.                          *)
(*   6. A route key change drops every queued intent in the same step.    *)
(*   7. A workbench intent while the workbench lane is closed, or on a    *)
(*      device with none, is dropped `workbenchClosed`.                   *)
(*   8. A publication that arrives while a local edit is unwritten does   *)
(*      not hold the edit, whatever edit count it arrived at: it is       *)
(*      fenced at arrival (`held`) and its apply never lands. The         *)
(*      record's rebase of the edit (`recordSync`, not modelled) comes    *)
(*      back as a later publication, which rule 3 applies.                *)
(*   9. An apply, and any adapter change event it causes, never counts as *)
(*      an edit.                                                          *)
(*   10. An adapter detaches either for a remount, after which it         *)
(*      attaches again, or because its lane closes.                       *)
(*                                                                         *)
(* Switches. The first value of each is the target.                       *)
(*   EditCount  TRUE: rule 2's count. FALSE: an apply lands whatever was  *)
(*              edited since its publication (no-edit-count, a limit).    *)
(*   Expected   TRUE: rule 5. FALSE: a restore is applied without         *)
(*              comparing (no-expected, a limit).                         *)
(*   Unwritten  TRUE: rule 8. FALSE: the apply of a publication that      *)
(*              arrived over an unwritten edit, at the current edit       *)
(*              count, lands (no-unwritten, a limit; A0.3 host I10 row).  *)
(*   Today      FALSE: the record session is a runtime child of the       *)
(*              project actor and outlives any mount (I13). TRUE: the     *)
(*              store as built in `workbench-record-host.tsx` (inventory  *)
(*              Y3): `useMemo` creates and starts a new store in the      *)
(*              render of a remounted host (`HostRemounted`); the old     *)
(*              store is disposed in a microtask after the effect cleanup *)
(*              (`OldStoreDisposed`), and a write it had in flight still  *)
(*              lands (`OrphanWriteLanded`).                              *)
(*   Labelled   TRUE: `act` names each step, for the graph export and the *)
(*              covering suite. FALSE: `act` is constant.                 *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Bytes,         \* the arrangements a record can hold
          InitialBytes,  \* the arrangement shown and recorded at the start
          Adapters,      \* the adapters this device has: a nonempty subset of {"workbench", "viewer"}
          MaxPubs,       \* publications from `recordSync`
          MaxEdits,      \* the person's edits
          MaxIntents,    \* pane intents
          MaxRestores,   \* restore commands
          MaxAttaches,   \* attach cycles per adapter
          MaxRoutes,     \* route key changes
          MaxRemounts,   \* Today: host remounts
          Unknown,       \* a model value: the applied revision while none is known
          EditCount, Expected, Unwritten, Today, Labelled

ASSUME /\ InitialBytes \in Bytes
       /\ Adapters \subseteq {"workbench", "viewer"} /\ Adapters # {}
       /\ \A n \in {MaxPubs, MaxEdits, MaxIntents, MaxRestores, MaxAttaches, MaxRoutes, MaxRemounts} :
            n \in Nat
       /\ EditCount \in BOOLEAN /\ Expected \in BOOLEAN /\ Unwritten \in BOOLEAN /\ Today \in BOOLEAN /\ Labelled \in BOOLEAN
       /\ ~Today => MaxRemounts = 0

VARIABLES
  rec,       \* the latest publication: bytes, attributed origin, `fresh` (no edit counted since it arrived),
             \* `done` (its apply landed or was discarded); ghost `same`: its bytes were the arrangement when
             \* it arrived
  shown,     \* the arrangement
  edited,    \* ghost: this step counted an edit (rule 1)
  pending,   \* the apply in flight: its bytes, `fresh`, `latest` (its publication is still the latest),
             \* `same`; `state` is "computed", or how the last one ended ("none", "landed", "discarded")
  applied,   \* the acknowledged revision: Unknown, "latest" or "older"
  adapter,   \* adapter -> "detached", "attaching" or "attached"
  wbOpen,    \* the workbench lane is open
  intent,    \* intent id -> its state and target
  restore,   \* restore id -> its state and command
  route,     \* route key changes so far
  sessions,  \* [writing: a local edit is not yet written to the record (rule 8); Today only: live: stores
             \* started and not disposed; oldWriting: an undisposed replaced store has a write in flight;
             \* lingering: disposed stores whose write is in flight]
  bound,     \* counters for the bounds
  act        \* the step's label, for the graph export; constant unless Labelled

vars == <<rec, shown, edited, pending, applied, adapter, wbOpen, intent, restore, route, sessions, bound, act>>

Label(l) == IF Labelled THEN l ELSE "-"

Targets == {"workbench", "viewer"}
Reasons == {"routeChanged", "workbenchClosed", "unavailable"}
Settled == {"applied"} \cup Reasons
IntentIds == 1..MaxIntents
RestoreIds == 1..MaxRestores
NoApply == [state |-> "none", bytes |-> InitialBytes, fresh |-> TRUE, held |-> FALSE, latest |-> FALSE, same |-> FALSE]
NoIntent == [state |-> "unsent", target |-> "viewer", applies |-> 0]
NoRestore == [state |-> "unsent", expected |-> InitialBytes, to |-> InitialBytes]

Attached == {a \in Adapters : adapter[a] = "attached"}
AnyAttached == Attached # {}

\* The number of record sessions for the file: stores that run, and disposed stores whose write is in flight.
SessionCount == sessions.live + sessions.lingering

TypeOK ==
  /\ rec \in [bytes : Bytes, origin : {"own", "foreign"}, fresh : BOOLEAN, held : BOOLEAN, done : BOOLEAN,
              same : BOOLEAN]
  /\ shown \in Bytes
  /\ edited \in BOOLEAN
  /\ pending \in [state : {"none", "computed", "landed", "discarded"}, bytes : Bytes, fresh : BOOLEAN, held : BOOLEAN,
                  latest : BOOLEAN, same : BOOLEAN]
  /\ applied \in {Unknown, "latest", "older"}
  /\ adapter \in [Adapters -> {"detached", "attaching", "attached"}]
  /\ wbOpen \in BOOLEAN
  /\ intent \in [IntentIds -> [state : {"unsent", "queued"} \cup Settled, target : Targets, applies : Nat]]
  /\ restore \in [RestoreIds -> [state : {"unsent", "asked", "applied", "refused"}, expected : Bytes, to : Bytes]]
  /\ route \in Nat
  /\ sessions \in [live : Nat, oldWriting : BOOLEAN, lingering : Nat, writing : BOOLEAN]
  /\ act \in STRING

Init ==
  /\ rec = [bytes |-> InitialBytes, origin |-> "own", fresh |-> TRUE, held |-> FALSE, done |-> TRUE, same |-> TRUE]
  /\ shown = InitialBytes
  /\ edited = FALSE
  /\ pending = NoApply
  /\ applied = Unknown
  /\ adapter = [a \in Adapters |-> "detached"]
  /\ wbOpen = ("workbench" \in Adapters)
  /\ intent = [i \in IntentIds |-> NoIntent]
  /\ restore = [k \in RestoreIds |-> NoRestore]
  /\ route = 0
  /\ sessions = [live |-> 1, oldWriting |-> FALSE, lingering |-> 0, writing |-> FALSE]
  /\ bound = [pubs |-> 0, edits |-> 0, attaches |-> [a \in Adapters |-> 0], remounts |-> 0]
  /\ act = Label("Init")

\* Rule 1: a local change counts an edit, and is unwritten until its write lands (rule 8).
Counted ==
  /\ edited' = TRUE
  /\ rec' = [rec EXCEPT !.fresh = FALSE]
  /\ pending' = [pending EXCEPT !.fresh = FALSE]
  /\ sessions' = [sessions EXCEPT !.writing = TRUE]

\* An adapter leaves: rule 4, and an apply in flight has nowhere to land once none is attached; if it
\* was for the latest publication, that publication's apply is computed again on the next attach.
Leave(as) ==
  /\ adapter' = [a \in Adapters |-> IF a \in as THEN "detached" ELSE adapter[a]]
  /\ applied' = Unknown
  /\ IF (\E a \in Adapters \ as : adapter[a] = "attached") \/ pending.state # "computed"
     THEN UNCHANGED <<pending, rec>>
     ELSE /\ pending' = NoApply
          /\ rec' = IF pending.latest THEN [rec EXCEPT !.done = FALSE] ELSE rec

-----------------------------------------------------------------------------
(* Record *)

Published ==
  /\ bound.pubs < MaxPubs
  /\ \E b \in Bytes, o \in {"own", "foreign"} :
       rec' = [bytes |-> b, origin |-> o, fresh |-> TRUE, held |-> sessions.writing,
               done |-> (o = "own" /\ b = shown), same |-> (b = shown)]
  /\ pending' = [pending EXCEPT !.latest = FALSE]
  /\ applied' = IF applied = "latest" THEN "older" ELSE applied
  /\ edited' = FALSE
  /\ bound' = [bound EXCEPT !.pubs = @ + 1]
  /\ act' = Label("Published")
  /\ UNCHANGED <<shown, adapter, wbOpen, intent, restore, route, sessions>>

\* Rule 3: an own publication whose bytes the arrangement already holds is born `done`; any other
\* publication is applied under rules 2 and 8. An apply of the latest publication replaces one in flight
\* for an older publication.
ApplyComputed ==
  /\ AnyAttached
  /\ ~rec.done
  /\ ~(pending.state = "computed" /\ pending.latest)
  /\ pending' = [state |-> "computed", bytes |-> rec.bytes, fresh |-> rec.fresh, held |-> rec.held,
                 latest |-> TRUE, same |-> rec.same]
  /\ rec' = [rec EXCEPT !.done = TRUE]
  /\ edited' = FALSE
  /\ act' = Label("ApplyComputed")
  /\ UNCHANGED <<shown, applied, adapter, wbOpen, intent, restore, route, sessions, bound>>

\* Rules 2 and 8.
Current == pending.latest /\ (EditCount => pending.fresh) /\ (Unwritten => ~pending.held)

ApplyLanded ==
  /\ pending.state = "computed"
  /\ AnyAttached
  /\ Current
  /\ shown' = pending.bytes
  /\ pending' = [NoApply EXCEPT !.state = "landed"]
  /\ edited' = FALSE
  /\ act' = Label("ApplyLanded")
  /\ UNCHANGED <<rec, applied, adapter, wbOpen, intent, restore, route, sessions, bound>>

ApplyDiscarded ==
  /\ pending.state = "computed"
  /\ ~Current
  /\ pending' = [NoApply EXCEPT !.state = "discarded"]
  /\ edited' = FALSE
  /\ act' = Label("ApplyDiscarded")
  /\ UNCHANGED <<rec, shown, applied, adapter, wbOpen, intent, restore, route, sessions, bound>>

\* Rule 4.
Acknowledged ==
  /\ AnyAttached
  /\ pending.state # "computed"
  /\ shown = rec.bytes
  /\ applied # "latest"
  /\ applied' = "latest"
  /\ edited' = FALSE
  /\ act' = Label("Acknowledged")
  /\ UNCHANGED <<rec, shown, pending, adapter, wbOpen, intent, restore, route, sessions, bound>>

-----------------------------------------------------------------------------
(* Person and adapters *)

PersonEdited ==
  /\ AnyAttached
  /\ bound.edits < MaxEdits
  /\ \E b \in Bytes \ {shown} : shown' = b
  /\ Counted
  /\ bound' = [bound EXCEPT !.edits = @ + 1]
  /\ act' = Label("PersonEdited")
  /\ UNCHANGED <<applied, adapter, wbOpen, intent, restore, route>>

\* Opening an adapter opens its lane; it is seeded with the arrangement.
AdapterAttaching(a) ==
  /\ adapter[a] = "detached"
  /\ bound.attaches[a] < MaxAttaches
  /\ adapter' = [adapter EXCEPT ![a] = "attaching"]
  /\ wbOpen' = (wbOpen \/ a = "workbench")
  /\ edited' = FALSE
  /\ bound' = [bound EXCEPT !.attaches[a] = @ + 1]
  /\ act' = Label("AdapterAttaching")
  /\ UNCHANGED <<rec, shown, pending, applied, intent, restore, route, sessions>>

AdapterAttached(a) ==
  /\ adapter[a] = "attaching"
  /\ adapter' = [adapter EXCEPT ![a] = "attached"]
  /\ edited' = FALSE
  /\ act' = Label("AdapterAttached")
  /\ UNCHANGED <<rec, shown, pending, applied, wbOpen, intent, restore, route, sessions, bound>>

\* A remount: the adapter leaves and will attach again, so it detaches only while it has an attach cycle
\* left. The workbench's last detach is `WorkbenchClosed`; the viewer pane has no lane to close.
AdapterDetached(a) ==
  /\ adapter[a] # "detached"
  /\ bound.attaches[a] < MaxAttaches
  /\ Leave({a})
  /\ edited' = FALSE
  /\ act' = Label("AdapterDetached")
  /\ UNCHANGED <<shown, wbOpen, intent, restore, route, sessions, bound>>

-----------------------------------------------------------------------------
(* Intents *)

\* A settled intent keeps only its state and how often it was applied.
Settle(x, s) == [NoIntent EXCEPT !.state = s, !.applies = x.applies + (IF s = "applied" THEN 1 ELSE 0)]

IntentSent(i) ==
  /\ intent[i].state = "unsent"
  /\ \A j \in IntentIds : j < i => intent[j].state # "unsent"
  /\ \E t \in Targets : intent' = [intent EXCEPT ![i] = [state |-> "queued", target |-> t, applies |-> 0]]
  /\ edited' = FALSE
  /\ act' = Label("IntentSent")
  /\ UNCHANGED <<rec, shown, pending, applied, adapter, wbOpen, restore, route, sessions, bound>>

\* Rule 1: an applied intent is a local change of the arrangement.
IntentApplied(i) ==
  /\ intent[i].state = "queued"
  /\ intent[i].target \in Adapters
  /\ adapter[intent[i].target] = "attached"
  /\ \E b \in Bytes \ {shown} : shown' = b
  /\ intent' = [intent EXCEPT ![i] = Settle(intent[i], "applied")]
  /\ Counted
  /\ act' = Label("IntentApplied")
  /\ UNCHANGED <<applied, adapter, wbOpen, restore, route, bound>>

\* The target-available flag falls: the file the pane would show did not open.
DropUnavailable(i) ==
  /\ intent[i].state = "queued"
  /\ intent' = [intent EXCEPT ![i] = Settle(intent[i], "unavailable")]
  /\ edited' = FALSE
  /\ act' = Label("IntentDropped")
  /\ UNCHANGED <<rec, shown, pending, applied, adapter, wbOpen, restore, route, sessions, bound>>

\* Rule 7.
DropClosed(i) ==
  /\ intent[i].state = "queued"
  /\ intent[i].target = "workbench"
  /\ ~wbOpen
  /\ intent' = [intent EXCEPT ![i] = Settle(intent[i], "workbenchClosed")]
  /\ edited' = FALSE
  /\ act' = Label("IntentDropped")
  /\ UNCHANGED <<rec, shown, pending, applied, adapter, wbOpen, restore, route, sessions, bound>>

IntentDropped(i) == DropUnavailable(i) \/ DropClosed(i)

\* Rule 6.
RouteKeyChanged ==
  /\ route < MaxRoutes
  /\ route' = route + 1
  /\ intent' = [i \in IntentIds |->
                  IF intent[i].state = "queued" THEN Settle(intent[i], "routeChanged") ELSE intent[i]]
  /\ edited' = FALSE
  /\ act' = Label("RouteKeyChanged")
  /\ UNCHANGED <<rec, shown, pending, applied, adapter, wbOpen, restore, sessions, bound>>

\* Rule 7 for the intents queued when the person closes the lane, whether its adapter is attached or
\* between a remount's detach and attach. Only `AdapterAttaching` reopens the lane, so the workbench's
\* attach cycles bound the closes.
WorkbenchClosed ==
  /\ wbOpen
  /\ "workbench" \in Adapters
  /\ wbOpen' = FALSE
  /\ Leave({"workbench"})
  /\ intent' = [i \in IntentIds |->
                  IF intent[i].state = "queued" /\ intent[i].target = "workbench"
                  THEN Settle(intent[i], "workbenchClosed") ELSE intent[i]]
  /\ edited' = FALSE
  /\ act' = Label("WorkbenchClosed")
  /\ UNCHANGED <<shown, restore, route, sessions, bound>>

-----------------------------------------------------------------------------
(* Restore *)

\* Any expected arrangement: a card may repeat an earlier command after the arrangement moved. One command
\* is outstanding at a time; with `expected` free this loses no interleaving of an ask with its settle.
RestoreAsked(k) ==
  /\ restore[k].state = "unsent"
  /\ \A j \in RestoreIds : j < k => restore[j].state \notin {"unsent", "asked"}
  /\ \E e \in Bytes : \E t \in Bytes \ {e} : restore' = [restore EXCEPT ![k] = [state |-> "asked", expected |-> e, to |-> t]]
  /\ edited' = FALSE
  /\ act' = Label("RestoreAsked")
  /\ UNCHANGED <<rec, shown, pending, applied, adapter, wbOpen, intent, route, sessions, bound>>

\* Rule 5, and rule 1 for an applied restore. As built (`store.restore`), a restore is also refused while a
\* local edit is unwritten.
RestoreSettled(k) ==
  /\ restore[k].state = "asked"
  /\ IF (~Expected \/ shown = restore[k].expected) /\ ~sessions.writing
     THEN /\ restore' = [restore EXCEPT ![k] = [NoRestore EXCEPT !.state = "applied"]]
          /\ shown' = restore[k].to
          /\ Counted
     ELSE /\ restore' = [restore EXCEPT ![k] = [NoRestore EXCEPT !.state = "refused"]]
          /\ edited' = FALSE
          /\ UNCHANGED <<shown, rec, pending, sessions>>
  /\ act' = Label("RestoreSettled")
  /\ UNCHANGED <<applied, adapter, wbOpen, intent, route, bound>>

-----------------------------------------------------------------------------
(* The store's lifetime as built (Today only) *)

\* The store's write of the local edits lands; its echo is one of the `Published` steps.
EditWritten ==
  /\ sessions.writing
  /\ sessions' = [sessions EXCEPT !.writing = FALSE]
  /\ edited' = FALSE
  /\ act' = Label("EditWritten")
  /\ UNCHANGED <<rec, shown, pending, applied, adapter, wbOpen, intent, restore, route, bound>>

\* The remount's render: `useMemo` creates and starts a new store; the old store keeps any write in flight.
HostRemounted ==
  /\ Today
  /\ bound.remounts < MaxRemounts
  /\ sessions' = [live |-> sessions.live + 1, oldWriting |-> sessions.oldWriting \/ sessions.writing,
                  lingering |-> sessions.lingering, writing |-> FALSE]
  /\ edited' = FALSE
  /\ bound' = [bound EXCEPT !.remounts = @ + 1]
  /\ act' = Label("HostRemounted")
  /\ UNCHANGED <<rec, shown, pending, applied, adapter, wbOpen, intent, restore, route>>

\* `storeMounts` reaches 0 in the microtask after the effect cleanup: `dispose` closes the old store's
\* actor, and a write already passed to `writeFileChecked` is not recalled.
OldStoreDisposed ==
  /\ sessions.live > 1
  /\ sessions' = [sessions EXCEPT !.live = @ - 1, !.oldWriting = FALSE,
                                  !.lingering = IF sessions.oldWriting THEN @ + 1 ELSE @]
  /\ edited' = FALSE
  /\ act' = Label("OldStoreDisposed")
  /\ UNCHANGED <<rec, shown, pending, applied, adapter, wbOpen, intent, restore, route, bound>>

OrphanWriteLanded ==
  /\ \/ sessions.lingering > 0 /\ sessions' = [sessions EXCEPT !.lingering = @ - 1]
     \/ sessions.oldWriting /\ sessions' = [sessions EXCEPT !.oldWriting = FALSE]
  /\ edited' = FALSE
  /\ act' = Label("OrphanWriteLanded")
  /\ UNCHANGED <<rec, shown, pending, applied, adapter, wbOpen, intent, restore, route, bound>>

-----------------------------------------------------------------------------

Next ==
  \/ Published \/ ApplyComputed \/ ApplyLanded \/ ApplyDiscarded \/ Acknowledged \/ PersonEdited
  \/ \E a \in Adapters : AdapterAttaching(a) \/ AdapterAttached(a) \/ AdapterDetached(a)
  \/ \E i \in IntentIds : IntentSent(i) \/ IntentApplied(i) \/ IntentDropped(i)
  \/ RouteKeyChanged \/ WorkbenchClosed
  \/ \E k \in RestoreIds : RestoreAsked(k) \/ RestoreSettled(k)
  \/ EditWritten \/ HostRemounted \/ OldStoreDisposed \/ OrphanWriteLanded

Spec == Init /\ [][Next]_vars

\* A detached adapter whose lane is open attaches again: the end of a remount (`AdapterDetached`).
Reattach(a) == (a = "viewer" \/ wbOpen) /\ AdapterAttaching(a)

\* Weak fairness of the adapters (an adapter with an open lane attaches) and of the intent queue (an
\* intent its adapter can take is taken; a workbench intent with the lane closed is dropped).
Fairness ==
  /\ \A a \in Adapters : WF_vars(Reattach(a)) /\ WF_vars(AdapterAttached(a))
  /\ \A i \in IntentIds : WF_vars(IntentApplied(i)) /\ WF_vars(DropClosed(i))

LiveSpec == Spec /\ Fairness

\* The state the checker keeps. Dropped: the ghosts `act` and `edited`; how the last apply ended; how a
\* settled intent or restore ended; a publication's origin, which only `Published` reads; once its apply
\* is done, everything of a publication but its bytes, since while it can be computed again (rule 4) the
\* apply in flight holds the same `fresh`, `held` and `same`; and everything of an apply in flight that
\* can no longer land (`Current` only falls), which is only discarded or replaced. Each dropped part is
\* read by no enabled action and by a property only in the step that sets it, so two states that differ
\* only there have the same behaviours. Not used by the liveness configuration.
View == <<IF rec.done THEN [bytes |-> rec.bytes, done |-> TRUE] ELSE [rec EXCEPT !.origin = "own"], shown,
          IF pending.state # "computed" THEN NoApply
          ELSE IF Current THEN pending
          ELSE [NoApply EXCEPT !.state = "computed", !.latest = pending.latest],
          applied, adapter, wbOpen,
          [i \in IntentIds |-> IF intent[i].state \in Settled THEN "settled" ELSE intent[i]],
          [k \in RestoreIds |-> IF restore[k].state \in {"applied", "refused"} THEN "settled" ELSE restore[k]],
          route, sessions, bound>>

\* Arrangements are opaque: every action and property compares them only for equality, so any
\* permutation of `Bytes` maps behaviours to behaviours. Not used by the liveness configuration.
Symmetry == Permutations(Bytes)

-----------------------------------------------------------------------------
(* Safety *)

\* The step lands an apply.
Lands == pending.state = "computed" /\ pending'.state = "landed"

\* I10: `ApplyLanded` never happens for an apply computed at an edit count lower than the current one.
PersonEditNotReverted == [][Lands => pending.fresh]_vars

\* I11: every intent id is `applied` at most once, and leaves `queued` only by `IntentApplied` or by
\* `IntentDropped` with a reason; a settled intent stays settled.
IntentAccounted ==
  [][\A i \in IntentIds :
       /\ intent'[i].applies <= 1
       /\ (intent[i].state = "queued" /\ intent'[i].state # "queued") => intent'[i].state \in Settled
       /\ intent[i].state \in Settled => intent'[i].state = intent[i].state]_vars

\* I11: after `RouteKeyChanged`, every intent queued before it is `dropped{routeChanged}`.
RouteChangeDrops ==
  [][route' # route => \A i \in IntentIds : intent[i].state = "queued" => intent'[i].state = "routeChanged"]_vars

\* I10, as A0.3's host I10 row states it: no apply of a publication that arrived while a local edit was
\* unwritten lands, including one that arrived at the current edit count. `held` is the fact at arrival.
UnwrittenEditKept == [][Lands => ~pending.held]_vars

\* I12: `Acknowledged(r)` only when an adapter is attached and the arrangement reflects `r`.
AckMeansApplied ==
  [][(applied' = "latest" /\ applied # "latest") => (\E a \in Adapters : adapter'[a] = "attached") /\ shown' = rec'.bytes]_vars

\* I12: while no adapter is attached, the applied revision is `unknown`.
UnknownWhileDetached == ~AnyAttached => applied = Unknown

\* Witness for today-store-orphan-write: no store that was disposed still has a write in flight.
NoWriteAfterDispose == sessions.lingering = 0

\* I13: the number of record sessions for a file is at most one.
SingleSession == SessionCount <= 1

\* I14: `RestoreSettled(id, applied)` only if the arrangement equals the command's `expected` at that step;
\* otherwise it is `refused` and the arrangement is unchanged.
StaleRestoreRefused ==
  [][\A k \in RestoreIds :
       /\ (restore[k].state = "asked" /\ restore'[k].state = "applied") => shown = restore[k].expected
       /\ (restore[k].state = "asked" /\ restore'[k].state = "refused") => shown' = shown]_vars

\* D18: a publication with the wrong `origin` and bytes equal to the current arrangement changes neither
\* the arrangement nor the edit count: not in the step it arrives, and not in the step an apply of it
\* lands. "Current" is the arrangement when it arrives (`same`). Checked for either origin, so for the
\* wrong one.
IdenticalBytesHarmless ==
  [][/\ (bound'.pubs # bound.pubs /\ rec'.same) => (shown' = shown /\ ~edited')
     /\ (Lands /\ pending.same) => (shown' = shown /\ ~edited')]_vars

-----------------------------------------------------------------------------
(* Liveness *)

\* Quiescence predicate of IntentEventuallyAccounted: no intent is queued.
IntentsSettled == \A i \in IntentIds : intent[i].state # "queued"

\* Under weak fairness of the adapter, every intent becomes applied or dropped once an adapter stays
\* attached and the route key stops changing (it changes at most MaxRoutes times).
IntentEventuallyAccounted ==
  \A i \in IntentIds : (<>[]AnyAttached) => [](intent[i].state = "queued" => <>(intent[i].state # "queued"))

=============================================================================
