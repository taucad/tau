---------------------------- MODULE LibraryCatalog ----------------------------
(***************************************************************************)
(* One tab's project library: discovery passes and their epoch, the        *)
(* mutations this tab makes, the journal of pending operations and its     *)
(* recovery loop, and the questions a route asks about one project's       *)
(* access (app state orchestration charter D10, D13, invariants I4, I7,    *)
(* I8, I9 and I18). It is the spec for `library-discovery.machine`,        *)
(* `library-recovery.machine` and `library-access.machine` (lane A3a) and   *)
(* lands before them, under formal verification policy rule 1. The         *)
(* machines replay its export suite in                                     *)
(* `library-catalog.conformance.test.ts`.                                  *)
(*                                                                         *)
(* Parties:                                                                *)
(*   storage    the project roots and the journal of pending operations;   *)
(*              durable, so a crash keeps them                             *)
(*   env        every other tab: it may change a root, add a journal row   *)
(*              and settle a row at any step. This tab hears of a root     *)
(*              change through its watch, modelled as an invalidation in   *)
(*              the same step; it sees another tab's row only when it      *)
(*              reads the journal, at start                                *)
(*   discovery  one pass at a time; every pass and every invalidation      *)
(*              moves the epoch. A write stop makes a pass skip its writes *)
(*   recovery   one state per journal row this tab has seen; replays run   *)
(*              one at a time, and a mutation's own row settles beside     *)
(*              them                                                       *)
(*   mutations  create and delete requests from this tab, journaled       *)
(*              before they touch a root                                   *)
(*   workspace  available or not; it gates what a read of storage sees     *)
(*              and is one failure reason of a replay                      *)
(*   access     questions {id, project}, each with a generation. An       *)
(*              answer rests on `Reads` reads; each read is a reply tagged *)
(*              {id, gen} that may complete late: after the epoch or the   *)
(*              recovery set moved, after the question was asked again or  *)
(*              cancelled, or after a crash                                *)
(*                                                                         *)
(* Epochs. The model keeps no epoch counter. Every value stamped with an   *)
(* epoch (the pass in flight, an access question's reads) carries `cur`:   *)
(* its epoch is still the current one. A pass or an invalidation moves     *)
(* the epoch, which clears every `cur` (`Stale`). That is all an epoch     *)
(* comparison reads, and it keeps two runs that differ only in how far a   *)
(* counter got from being two states.                                      *)
(*                                                                         *)
(* The model specifies no lock and adds none. Every tab replays every row  *)
(* it holds, so two tabs may replay one row at once: an inherited risk the *)
(* model reports (`SingleReplay`, a witness), not a property it enforces.  *)
(*                                                                         *)
(* State space. Three projects are cheap under SYMMETRY; the write stop, *)
(* a second crash, the environment and access questions each multiply it *)
(* several times, so the configurations combine them sparingly (README).  *)
(* Every configuration but `wide` runs on the pr tier, in this family's   *)
(* own target, ui:formal:tla:library-catalog (README).                    *)
(*                                                                         *)
(* The model is untimed: the 5 s poll, the observation debounce and the    *)
(* worker round trips are steps. What an operation writes is the root it   *)
(* adds or removes; thumbnails, metadata, cloud projects and the workspace *)
(* connection handshake are abstracted away. A project's root stands for   *)
(* every directory that carries its id: a delete removes one directory,    *)
(* and the root goes only when no other copy remains (`Applied`).          *)
(***************************************************************************)
\* A2 (app state orchestration): the project-manager and workspace-connection actors moved into the
\* `ProjectLibrary` service, which the runtime starts. Discovery, recovery and route access still run in
\* `ProjectManagerProvider` against them, with the same refs and reads, so every action is unchanged.
\* The provider hands the library its binding in render; a port called before it waits for it, and
\* its children are optional, and a connection wait superseded by a later selection rejects; neither
\* changes an action. The observation effect releases and resumes the library's binding around its reads.
\* A3a, after A2: the machines' citations of `use-project-manager.tsx` lines moved with A2's additions
\* above them; the code they name is unchanged, so no action or correspondence changes.
\* A12 (app state orchestration, I21): `createProject` tells the chat store when the first chat it writes
\* holds no message, so that chat shows empty at once. It is a call to the chat store after the operation
\* commits, and the creating callback lists the store among its inputs; no root, row or read changes,
\* so every action is unchanged.
\* A3b: `ProjectLibrary` runs the three machines and the hook delegates to it. The `today` configurations
\* keep describing the hook at 7918b118, before that wiring. A discovery `apply` reports a write it
\* skipped at a write-stop gate, so a stop that ended while the deletes ran redoes the pass at once,
\* as `WriteStopEnded` would (rule 3), and the listing is refetched as a redo starts, as today's skew
\* listener did; a `discovery-required` verification, or a question that skips
\* verification, asks for the bootstrap pass, an `Unmodelled` emission. A mutation's or replay's copy of
\* its operation is dropped once taken; a later attempt reads the journal. A failed pass, journal read or
\* discard rejects with the port's own error, which the library keeps. No action or correspondence changes.
\* A4a: create, duplicate, delete, restore, adopt, repair and rename are `ProjectLibrary` commands
\* (`runtime/project-library-commands.ts`), moved from the hook unchanged with the create-project named lock.
\* They begin, journal, apply and abandon a mutation through the same library calls, so `MutationJournaled`,
\* `MutationApplied` and rule 4's gate keep their correspondence. The delete's quiescence check and session
\* close ask the registry and the chat store, outside the model; the check's chat read is not asked again
\* after a release, as the hook's was not. No action changes.
\* A4b: connecting a workspace, retrying it, choosing a project's directory and repairing workspace
\* bindings are `ProjectLibrary` workspace commands (`runtime/project-library-workspace.ts`), moved from
\* the hook in the same order; choosing a directory now also refetches the listing. The library follows the
\* root file facade the app runtime builds, so no provider binds, releases or resumes it, and a provider
\* unmount no longer releases a held read. The library is the listing's only writer: the hook's
\* refetches after a mutation are the commands' own, a query refetch that moves no epoch, as before. A
\* connection the workspace machine's root `onError` caught a defect on rejects, so the next starts afresh;
\* the workspace machine is outside this model. A stopped library follows no facade again. No action or
\* correspondence changes.
\* DC-10 files-ui (2026-11-16): `ProjectLibrary` and its workspace commands take the `WorkspaceTelemetry`
\* type from `@taucad/files-ui`; only the type import moved. No action or correspondence changes.
\* DC-10 files-ui slice 3 (2026-11-16): `handle-store`, `orphaned-project-route` and `browser.constants` moved
\* to `@taucad/files-ui`; the four sources only re-point their imports. No action or correspondence changes.
\* Project name fit (2026-11-16): `ProjectCommands` keeps a generated name's first line and fits it, and a duplicate's
\* name, to the manifest's 200 code units before the create is journaled. No action or correspondence changes.
\* W30 project lifecycle (2026-11-17): a listing takes a scope (`live`, `trash`, `all`) in place of
\* `includeDeleted`, and a delete of a project no tab has open checks quiescence by leasing each chat's log
\* lock and reading its log, instead of refusing until the project is opened. Both stay outside the model,
\* as the registry and chat store reads did; the journal, apply and gate order is unchanged. No action or
\* correspondence changes.
\* Database recovery (WP9, 2026-11-17): when the journal store cannot open (`VersionError`, a blocked upgrade, an open
\* timeout or `UnknownError`), `ProjectLibrary` lists discovery alone, answers route access from disk, and refuses a
\* mutation before it is journaled. That state is outside the model; no action or correspondence changes.
\* Folder states and Locate (WP3, WP4, 2026-11-17): the workspace commands read a picked folder's evidence for
\* Locate, which re-binds a moved workspace's project bindings in one transaction, and Remove from Tau drops a lost
\* folder's workspace row. Both act on the workspace store, outside the model; no action or correspondence changes.
\* DC-10 files-ui slice 5 (2026-11-17): the three library machines, `project-library.types`,
\* `pending-project-operation.types`, `project-url.utils` and `project-name.utils` moved to `@taucad/files-ui`; the
\* four library sources only re-point (and rewrap) their imports. No action or correspondence changes.
\* DC-10 files-ui slice 6 (2026-11-18): `project-library-storage` and `project-library-observations` moved to
\* `@taucad/files-ui` behind structural facade, object-store and chat-store types; `use-project-manager.tsx` and the
\* three runtime sources re-point their imports, and the app's facade type is now `ProjectLibraryFacade`. No action or
\* correspondence changes.
\* DC-10 files-ui slice 7 (2026-11-18): `project-library-workspace`, the workspace connection machine and
\* `project-library-chat-logs` moved to `@taucad/files-ui`. The machine reports its first fault through an injected
\* `reportFault` service, which `ProjectLibrary` binds to the app's runtime fault reporter; the workspace commands read
\* the facade and journal through structural types. The other sources re-point their imports. No action or
\* correspondence changes.
\* DC-10 files-ui slice 8 (2026-11-18): the project-manager machine moved to `@taucad/files-ui`. It starts the
\* object-store worker through an injected `startObjectStore` and reports through injected `reportFault` and
\* `reportWorkerFailed` services, which `ProjectLibrary` binds to the app's worker factory and reporters; the library
\* reads the started store back as its worker (`runtime/project-library.ts` re-reviewed in its final form, with the
\* typed read-back). `use-project-manager.tsx` re-points a type import. No action or correspondence changes.
\* Tau Cloud naming audit (2026-11-18): `project-library-commands.ts` rewords a refusal sentence; copy only.
\* No action or correspondence changes.
\* DC-10 files-ui slice 9 (2026-11-19): `ProjectLibrary` and `ProjectCommands` moved to `@taucad/files-ui`
\* (`runtime/project-library.ts`, `runtime/project-library-commands.ts`), generic over the worker, facade and
\* projection types. What only the app supplies arrives as injected services: the worker start, the reporters, the
\* build-skew write stop, the chat store, the legacy listing clear, the project templates and kernel lock files, the
\* initial user message, the Tau Cloud backup intent and the projection's catch-up. The app keeps a binding at
\* `apps/ui/app/runtime/project-library.ts` that passes them. Every port, journal, apply and gate call keeps its order;
\* `use-project-manager.tsx` re-points imports. No action or correspondence changes.
\* DC-10 files-ui slice 10 (2026-11-19): the project manager's provider moved to `@taucad/files-ui`
\* (`hooks/project-manager-provider.tsx`, its context in `hooks/use-project-manager.ts`), with the chat permission
\* modes, the project-name client and the first-project tour as injected services; `use-project-manager.tsx` is now
\* the app's binding. Every library command and read keeps its order. No action or correspondence changes.
\* PL7 staging defects FP9 (2026-11-20): `project-library-commands.ts` loads the settled chat-log lease through the
\* code-loading owner (`loadCode`), which hands a failed load to the page's recovery; the import and every command keep
\* their order. No action or correspondence changes.
\* Auto-bring on sign-in removed (2026-11-20): `project-library-commands.ts` stops naming that setting in two
\* comments; comments only. No action or correspondence changes.
\* Layering W5 (2026-11-21): the project library (the three library machines, the project-manager machine, the
\* service, its commands, storage, observations and workspace commands, the provider and listing hooks, and their
\* types) moved unchanged from `@taucad/files-ui` to `@taucad/project-library`; the sources re-point their imports
\* of the files-ui modules that stayed. No action or correspondence changes.
\* W0 copy delete (2026-11-24): a permanent delete removes one exact directory, the copy the person chose or the one
\* the route binds. When it settles while another directory still carries the project id (`settleCopyDelete` in
\* `project-library-storage.ts`), the project lives on there, so the settled "delete" row leaves the project's root;
\* only the last copy's delete removes it. Whether a copy remains is decided when the row settles, not by the row's
\* `copy` flag: a row journaled with `copy: true` removes the root if the other copy went meanwhile, and one journaled
\* without it keeps the root if another copy appeared. The flag only turns a directory found already gone into a
\* conflict or not, a failure the model already allows. The model keeps no directories, so a settled "delete" row,
\* this tab's or another tab's, now removes the root or leaves it (`Applied`), and `Ops` needs no third operation. The
\* gate (`MutationJournaled`, `HeldActive`), the journal-then-apply order and recovery are unchanged; every invariant
\* and property is unchanged and is checked over the larger set of behaviours.
\* Fast-path FW1 (2026-11-25): mutations that change no disk fact stop scanning. Trash, Restore and every chat
\* create, delete, purge and recency touch re-enrich the current pass's listing and write it only while that pass's
\* epoch is current, as a workspace catalog's publish already does, instead of refetching or bumping the epoch; a
\* removed bump is one `EpochBumped` the environment no longer takes, and the listing's projects come only from a
\* pass. A permanent delete's precheck reads its target and root statuses from the current pass (`discover` with
\* `reuse`) and proves another copy with `verifyProjectRoute`, scanning only for a copy no route binds; it runs
\* before `MutationJournaled`, which is unchanged. The refetches after a delete's and a duplicate's settle go: the
\* settled row's `Bump` already owes the pass (`project-library-commands.ts` re-reviewed in its final form). No action
\* or correspondence changes.
\* Name ahead C1 (2026-11-26): a kernel create starts its name request before the worker, storage and template
\* awaits and awaits it at directory allocation, before anything is journaled; `namingImageUrls` is exported. The
\* journal, apply and gate order is unchanged. A caller's `projectName` may be a promise, awaited at the same point.
\* No action or correspondence changes.
\* FW1 over C1 (2026-11-26): `project-library-commands.ts` re-reviewed with both changes in it, C1's name request
\* started ahead of a kernel create and FW1's scan-free commands and permanent-delete precheck; they touch different
\* commands and merged without overlap. No action or correspondence changes.
\* FW1 review (2026-11-26): the permanent-delete precheck counts a route verification as proof of another copy only
\* when the directory it read, which the verification now names (an older authority names none: no proof), is the
\* copy the precheck chose and not the target; a "Use this folder" that moves the route in between leaves `copy`
\* unset, the stricter Trash check. Overlapping `refreshListingRows` calls of one pass publish only the latest call's
\* listing. Both sit before `MutationJournaled` or outside the gate, which are unchanged. No action or correspondence
\* changes.
\* Fast-path FW2 (2026-11-26, the discovery index; index-contract review A1 and A6): a pass reads the authority's
\* index, which may lag storage. `stale` holds the projects whose presence the index has wrong, flipped by a change no
\* evidence reported (`EnvChangedUnheard`) and cleared by evidence (`EvidenceArrived`, the environment's, with no
\* fairness), by this tab's audit (`Audited`, weakly fair under `IndexLiveSpec`), by a settled row, a heard change, a
\* reload or the workspace's return. A pass sees `Seen`, storage with `stale` flipped. `kept` is the ids this device
\* holds state for: a pass at the current epoch adds what it saw, and a settled delete and the pass's orphan sweep
\* remove an id only on `AbsenceProof`'s answer, `verifyAbsent`'s read of storage or (the witness) the index. An access
\* read that finds storage and the index disagreeing feeds the index (`VerifyFeedsIndex`). `CatalogReflectsStorage`
\* becomes `CatalogWithinStale`, which is it when `stale` is empty; `NoReclaimWhileCopy`, `ContradictionIsEvidence` and
\* `CatalogEventuallyCurrent` are new; `AccessMatchedById` lets the epoch move another question's reads in the step a
\* reply feeds the index. With `MaxUnheard = 0` no new action is enabled and every earlier verdict stands. The code:
\* `remainingCopiesAfterDelete`, the orphan sweep, adopt and the orphaned-route release ask `verifyAbsent`
\* (`project-library-storage.ts`, `project-library-commands.ts` re-reviewed in their final form).
\* FW2 code (2026-11-26): `project-library.ts` hands the orphan sweep `verifyAbsent`, and `project-library-commands.ts`
\* passes adopt's remembered id to the authority, which decides under `project:<id>`, and asks `verifyAbsent` before
\* the orphaned-route release; `remainingCopiesAfterDelete` proves the route's copy by the directory it names or asks
\* `verifyAbsent`. That is `AbsenceProof = "storage"`; no action or correspondence changes.
\* FW2 review (2026-11-26): the permanent-delete precheck proves a copy no route binds with `verifyAbsent` (a `present`
\* answer naming another directory) instead of a pass, which reads the index (B1); `project-library.ts` remembers an
\* orphan nominee's undecided proof until the listing changes (M4). Both read storage, `AbsenceProof = "storage"`; the
\* precheck runs before `MutationJournaled`. No action or correspondence changes.
\* Fast-path FW3 (2026-11-26, targeted verification): the authority's permanent delete answers what remains of the id
\* under the same hold of `project:<id>` as the removal: it probes the id's known locations and, when none holds it,
\* runs `verifyAbsent`, and the settle reads that answer (`project-library-storage.ts`'s `remainingCopiesAfterDelete`
\* is gone). The removal and the proof of absence were two holds of the lock; they are one now, which is what
\* `ReplaySettled` already assumed by taking `Applied` and `Absent` over `storage'` in one step, so that residual is
\* closed and the step is the code's. With `copy` set the authority proves the surviving copy again in that hold and
\* refuses when none holds the id: a settle that fails `terminal` or `workspace` with storage unchanged, which
\* `Outcomes` already allows. The permanent-delete precheck proves another copy with a probe in place of
\* `verifyProjectRoute` and `verifyAbsent`, before `MutationJournaled`; "Use this folder" binds a directory a probe
\* reads holding the id instead of starting a pass, one fewer environment `EpochBumped`; the manifest read's fallback
\* probes the known locations before its pass, and a create allocates against a fresh listing of its root's names.
\* No action or correspondence changes.
\* FW3 sole-copy cancel (2026-11-26, the operator's ruling "Cancel and say so"): a copy delete the authority refuses
\* because no other copy holds the id, or none could be read, no longer fails its row. It settles `cancelled`: the row
\* leaves the journal, storage, device state (`kept`) and the catalog are unchanged, and this tab holds nothing for the
\* project, which the person is told about. `ReplaySettled` gains that outcome for a delete row (`Outcomes(r)`),
\* `RowStates` and `Reasons` gain `cancelled`, and `CancelLeavesProjectReachable` is new, with the constant `CancelHolds`
\* and its witness `cancel-holds`. Every earlier configuration sets `CancelHolds = FALSE`.
\* FW3 sole-copy cancel code (2026-11-26): `library-recovery.machine` settles a `cancelled` outcome to its row state
\* `cancelled`, which holds nothing, and emits `rowCancelled`; `project-library.ts` returns the outcome to the delete's
\* caller and keeps a replay's cancel for the person until dismissed; the permanent-delete precheck and "Use this
\* folder" leave out the directories other deletes in the journal are removing (review M2) and degrade to their earlier
\* reads when the authority refuses the probe (review m3). `ReplaySettled`'s `cancelled` branch is the code's, as formatted.
\* FW3 re-review (2026-11-27): a cancel carries whether no other copy holds the id or none could be counted (N1); a row
\* this tab saw fail is not left out of a delete's proof (N2); only the probe's not-served refusal degrades (N3). Every
\* change sits before `MutationJournaled` or inside the authority's answer; no action or correspondence changes.
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Projects,        \* project ids
          Rows,            \* journal row ids, enough for every row a run may write
          InitRows,        \* the rows the journal holds at the start, for any project and operation
          Ops,             \* operations a row may carry: "create", "delete"
          Questions,       \* access question ids
          Reads,           \* reads one access answer rests on
          MaxMutations,    \* mutations the person may ask of this tab
          MaxCrashes,      \* reloads of this tab: volatile state lost, the journal kept
          MaxStops,        \* write stops (a newer build announced itself)
          MaxBumps,        \* invalidations with no storage change behind them
          MaxPolls,        \* passes started with none owed: the 5 s poll, a route's discovery read
          MaxEnvChange,    \* roots another tab adds or removes
          MaxEnvAdd,       \* journal rows another tab writes
          MaxEnvSettle,    \* journal rows another tab settles
          MaxWorkspaceLoss,\* times the workspace goes away
          MaxAsks,         \* times a question is asked again or cancelled
          EnvSettlesReplaying, \* another tab may settle a row this tab is replaying
          CatalogFence,    \* "pass": a pass applies its listing in the step that checks its epoch;
                           \* "ref": the epoch is read when the pass settles and the listing lands in the
                           \* query cache a step later, as getProjectListing does today; "none": no check
          AccessLoop,      \* "target": every answer fenced; "today": getProjectRouteAccess as written
          AccessMatch,     \* "gen": a reply counts only for its question's current generation; "id": by id alone
          Labelled,        \* TRUE: `act` names each step, for the graph export
          MaxUnheard,      \* storage changes no evidence reports to the index (FW2): a lost fact, an offline edit
          AbsenceProof,    \* "storage": a reclaim asks `verifyAbsent`, a read of storage; "index": it trusts the index
          VerifyFeedsIndex,\* TRUE: an access read that contradicts the index corrects it and owes a pass
          AuditOn,         \* TRUE: this tab's audit re-reads what the index holds (`Audited`)
          CancelHolds      \* FALSE: a delete the authority cancels clears its row (FW3); TRUE (witness): it is held failed

ASSUME /\ InitRows \subseteq Rows
       /\ Ops \subseteq {"create", "delete"} /\ Ops # {}
       /\ Reads \in 1..3
       /\ \A b \in {MaxMutations, MaxCrashes, MaxStops, MaxBumps, MaxPolls, MaxEnvChange, MaxEnvAdd, MaxEnvSettle,
                    MaxWorkspaceLoss, MaxAsks} : b \in Nat
       /\ Cardinality(InitRows) + MaxMutations + MaxEnvAdd <= Cardinality(Rows)
       /\ EnvSettlesReplaying \in BOOLEAN /\ Labelled \in BOOLEAN
       /\ CatalogFence \in {"pass", "ref", "none"}
       /\ AccessLoop \in {"target", "today"}
       /\ AccessMatch \in {"gen", "id"}
       /\ AccessLoop = "today" => Reads = 2
       /\ MaxUnheard \in Nat
       /\ AbsenceProof \in {"storage", "index"}
       /\ VerifyFeedsIndex \in BOOLEAN /\ AuditOn \in BOOLEAN /\ CancelHolds \in BOOLEAN

None == "none"
MaxAttempts == 3

VARIABLES
  storage,     \* durable: the project roots on disk
  journal,     \* durable: the rows of the pending-operation journal
  rowProj,     \* durable: each written row's project, or None for an unused id
  rowOp,       \* durable: each written row's operation
  ws,          \* "available" or "unavailable"
  owed,        \* an invalidation or a reload owes a pass
  pass,        \* the pass in flight: its phase, whether its epoch is current, the listing it read
  catalog,     \* the listing this tab shows
  held,        \* CatalogFence = "ref": a listing that passed its epoch check, on its way to the query cache
  stopped,     \* a write stop is in force
  skipped,     \* a pass skipped its writes during the current stop
  redo,        \* ghost: the stop ended after a skipped pass and no pass has started since
  rec,         \* this tab's state of each row: unseen, waiting, replaying, recovered, failed, discarded
  acc,         \* access questions
  replies,     \* access reads in flight, each a reply tagged {id, gen}
  deliveries,  \* ghost: answers delivered to each question, per generation
  n,           \* bounds: mutations, crashes, stops, bumps, env changes, env rows, env settles, losses
  act,         \* the step's label, for the graph export; constant unless Labelled
  stale,       \* the projects whose presence the authority's discovery index has wrong (FW2)
  kept         \* durable: the ids this device holds state for (library rows, chats index, editor layout)

vars == <<storage, journal, rowProj, rowOp, ws, owed, pass, catalog, held, stopped, skipped, redo, rec, acc, replies,
          deliveries, n, act, stale, kept>>

Label(l) == IF Labelled THEN l ELSE "-"

RowStates == {"unseen", "waiting", "replaying", "recovered", "cancelled", "failed", "discarded"}
Active == {"waiting", "replaying"}
Reasons == {"none", "terminal", "workspace", "cancelled"}
Answers == {"recovering", "recovery-failed", "unavailable", "ready", "missing"}
Open == {"asking", "reading", "between"}

\* A row record: its state, the attempts this tab has made, why it failed, and whether its replay is the
\* recovery loop's or a mutation's own.
Unseen == [st |-> "unseen", att |-> 0, why |-> "none", via |-> "journal"]
Loaded == [Unseen EXCEPT !.st = "waiting"]
NoListing == [ok |-> FALSE, roots |-> {}]
Idle == [st |-> "idle", cur |-> FALSE, seen |-> NoListing]
NotHeld == [st |-> "none", cur |-> FALSE, seen |-> NoListing]
\* A question: gen, its generation, moves when it is asked again or cancelled; k reads started; cur: every
\* read since the first was taken at the current epoch; rs: a recovery row for the project started since
\* the first read; val: what the first read saw.
NoQuestion == [st |-> "unasked", p |-> None, gen |-> 0, k |-> 0, cur |-> FALSE, rs |-> FALSE, val |-> None,
               ans |-> None]
Bounds == [mut |-> 0, crash |-> 0, stop |-> 0, bump |-> 0, poll |-> 0, change |-> 0, add |-> 0, settle |-> 0, loss |-> 0,
           ask |-> 0, unheard |-> 0]

\* What a read of storage sees: nothing of the workspace's roots while it is away.
Visible == IF ws = "available" THEN [ok |-> TRUE, roots |-> storage] ELSE NoListing
SymDiff(a, b) == (a \ b) \cup (b \ a)
\* What a pass sees (FW2): the authority's index, storage with the presence of every stale project flipped.
Seen == IF ws = "available" THEN [ok |-> TRUE, roots |-> SymDiff(storage, stale)] ELSE NoListing
\* Whether a reclaim may treat p as gone, by `AbsenceProof`: `verifyAbsent` reads every directory under p's lock, so
\* it answers from storage s, and only while every root is available; the index answers from what a pass saw.
Absent(p, seen, s) == IF AbsenceProof = "storage" THEN ws = "available" /\ p \notin s ELSE p \notin seen.roots
\* The roots a settled row of operation o on p may leave: a create adds p; a delete removes one directory of p, so p's
\* root goes when that was its last copy and stays while another directory carries the id (W0).
Applied(o, p, s) == IF o = "create" THEN {s \cup {p}} ELSE {s \ {p}, s}
FreeRow == CHOOSE r \in Rows : rowProj[r] = None
HasFreeRow == \E r \in Rows : rowProj[r] = None
HeldActive(p) == \E r \in Rows : rowProj[r] = p /\ rec[r].st \in Active
HeldFailed(p) == \E r \in Rows : rowProj[r] = p /\ rec[r].st = "failed"
\* What `recoveriesRef` holds for a project today: any entry, recovering or failed.
HeldAny(p) == HeldActive(p) \/ HeldFailed(p)
Observe(p) == IF ws = "unavailable" THEN "unavailable" ELSE IF p \in storage THEN "ready" ELSE "missing"

\* The epoch moves: nothing stamped with the old one is current any more.
Stale == /\ pass' = [pass EXCEPT !.cur = FALSE]
         /\ acc' = [q \in Questions |-> [acc[q] EXCEPT !.cur = FALSE]]
\* An invalidation: `discoveryEpochRef.current++` and a pass owed (`invalidateProjectsList`). It also
\* invalidates or cancels the `projects` query, so a listing on its way to the cache is dropped.
Bump == /\ Stale
        /\ held' = NotHeld
        /\ owed' = TRUE
\* A recovery row for p starts: every open question about p has seen the recovery set move.
RecoveryStarts(p) == acc' = [q \in Questions |-> IF acc[q].p = p /\ acc[q].st \in Open
                                                   THEN [acc[q] EXCEPT !.rs = TRUE] ELSE acc[q]]

Init ==
  /\ rowProj \in {f \in [Rows -> Projects \cup {None}] : \A r \in Rows : (f[r] = None) <=> (r \notin InitRows)}
  /\ rowOp \in {f \in [Rows -> Ops \cup {None}] : \A r \in Rows : (f[r] = None) <=> (r \notin InitRows)}
  /\ storage \in SUBSET Projects
  /\ journal = InitRows
  /\ ws = "available"
  /\ owed = TRUE
  /\ pass = Idle
  /\ catalog = NoListing
  /\ held = NotHeld
  /\ stopped = FALSE
  /\ skipped = FALSE
  /\ redo = FALSE
  /\ rec = [r \in Rows |-> IF r \in InitRows THEN Loaded ELSE Unseen]
  /\ acc = [q \in Questions |-> NoQuestion]
  /\ replies = {}
  /\ deliveries = [q \in Questions |-> [g \in 0..MaxAsks |-> 0]]
  /\ n = Bounds
  /\ act = Label("Init")
  /\ stale = {}
  /\ kept = {}

-----------------------------------------------------------------------------
(* Discovery *)

\* `runDiscoveryPass`: `++discoveryEpochRef.current`, then the scan (PassRead), which sees storage as it
\* is now. A pass starts when one is owed, or when a poll or a route's read asks for one (bounded by
\* MaxPolls). A new pass moves the epoch without cancelling the `projects` query.
PassStarted ==
  /\ pass.st = "idle"
  /\ owed \/ n.poll < MaxPolls
  /\ n' = IF owed THEN n ELSE [n EXCEPT !.poll = @ + 1]
  /\ pass' = [st |-> "reading", cur |-> TRUE, seen |-> Seen]
  /\ held' = [held EXCEPT !.cur = FALSE]
  /\ acc' = [q \in Questions |-> [acc[q] EXCEPT !.cur = FALSE]]
  /\ owed' = FALSE
  /\ redo' = FALSE
  /\ act' = Label("PassStarted")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, catalog, stopped, skipped, rec, replies, deliveries, stale, kept>>

\* The pass settles and publishes what it read. During a write stop it skips its writes (DF20) and says
\* so. At the current epoch over a complete listing it keeps state for what it saw, and its orphan sweep drops the
\* state of a kept id it did not see once `AbsenceProof` says no directory carries it (FW2).
PassSettled ==
  /\ pass.st = "reading"
  /\ kept' = IF pass.cur /\ pass.seen.ok
               THEN {p \in kept \cup pass.seen.roots : p \in pass.seen.roots \/ ~Absent(p, pass.seen, storage)}
               ELSE kept
  /\ skipped' = (skipped \/ stopped)
  /\ pass' = Idle
  /\ CASE CatalogFence = "pass" ->
            /\ catalog' = IF pass.cur THEN pass.seen ELSE catalog
            /\ held' = held
       [] CatalogFence = "ref" ->
            /\ catalog' = catalog
            /\ held' = IF pass.cur THEN [st |-> "held", cur |-> TRUE, seen |-> pass.seen] ELSE held
       [] CatalogFence = "none" ->
            /\ catalog' = pass.seen
            /\ held' = held
  /\ act' = Label("PassSettled")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, owed, stopped, redo, rec, acc, replies, deliveries, n, stale>>

\* CatalogFence = "ref" only: the listing the epoch check let through reaches the query cache.
CatalogApplied ==
  /\ held.st = "held"
  /\ catalog' = held.seen
  /\ held' = NotHeld
  /\ act' = Label("CatalogApplied")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, owed, pass, stopped, skipped, redo, rec, acc, replies, deliveries, n,
                 stale, kept>>

\* An invalidation with no change behind it: a manifest event, a root-configuration broadcast.
EpochBumped ==
  /\ n.bump < MaxBumps
  /\ n' = [n EXCEPT !.bump = @ + 1]
  /\ Bump
  /\ act' = Label("EpochBumped")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, catalog, stopped, skipped, redo, rec, replies, deliveries, stale,
                 kept>>

WriteStopBegan ==
  /\ ~stopped
  /\ n.stop < MaxStops
  /\ stopped' = TRUE
  /\ n' = [n EXCEPT !.stop = @ + 1]
  /\ act' = Label("WriteStopBegan")
  /\ UNCHANGED held
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, owed, pass, catalog, skipped, redo, rec, acc, replies, deliveries,
                 stale, kept>>

\* DF20: when the stop lifts after a skipped pass, invalidate and owe a fresh pass.
WriteStopEnded ==
  /\ stopped
  /\ stopped' = FALSE
  /\ IF skipped
       THEN /\ skipped' = FALSE
            /\ redo' = TRUE
            /\ Bump
       ELSE UNCHANGED <<skipped, redo, owed, pass, held, acc>>
  /\ act' = Label("WriteStopEnded")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, catalog, rec, replies, deliveries, n, stale, kept>>

-----------------------------------------------------------------------------
(* Mutations and recovery *)

\* The person asks for a mutation and this tab writes its row and starts applying it.
\* RecoveryGatesMutation: not while this tab holds a waiting or replaying row for the project. A request
\* the gate refuses is asked again later, so the model admits it only once the gate is open.
MutationJournaled(p, o) ==
  /\ n.mut < MaxMutations
  /\ ~HeldActive(p)
  /\ HasFreeRow
  /\ n' = [n EXCEPT !.mut = @ + 1]
  /\ LET r == FreeRow IN
       /\ rowProj' = [rowProj EXCEPT ![r] = p]
       /\ rowOp' = [rowOp EXCEPT ![r] = o]
       /\ journal' = journal \cup {r}
       /\ rec' = [rec EXCEPT ![r] = [Unseen EXCEPT !.st = "replaying", !.via = "mutation"]]
  /\ RecoveryStarts(p)
  /\ act' = Label("MutationJournaled")
  /\ UNCHANGED held
  /\ UNCHANGED <<storage, ws, owed, pass, catalog, stopped, skipped, redo, replies, deliveries, stale, kept>>

\* The recovery loop replays one journal row at a time.
ReplayStarted(r) ==
  /\ rec[r].st = "waiting"
  /\ ~\E o \in Rows : rec[o].st = "replaying" /\ rec[o].via = "journal"
  /\ rec' = [rec EXCEPT ![r] = [@ EXCEPT !.st = "replaying", !.att = @ + 1]]
  /\ RecoveryStarts(rowProj[r])
  /\ act' = Label("ReplayStarted")
  /\ UNCHANGED held
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, owed, pass, catalog, stopped, skipped, redo, replies, deliveries, n,
                 stale, kept>>

\* FW3, sole copy: a delete whose journal row waived the Trash for another copy is cancelled by the authority when no
\* other copy holds the id under the lock of its removal, or none could be read. Nothing is removed.
Outcomes(r) == IF ws = "unavailable" THEN {"workspace"}
               ELSE {"ok", "terminal"} \cup (IF rowOp[r] = "delete" THEN {"cancelled"} ELSE {})

\* A replay, or a mutation applying its own row (MutationApplied), settles. `settleRecovery` and
\* `resumePendingProjectOperation`: success removes the row and applies it (`Applied`); any failure marks
\* it failed with its reason and invalidates. A terminal row is never replayed in this tab, so the model keeps no attempts for it
\* (today `recoveryAttemptsRef` keeps them, and nothing reads them again); a row that failed with
\* `workspace-unavailable` keeps its attempts and waits for WorkspaceReturned. Only the recovery loop's
\* replays count an attempt (ReplayStarted, `settleRecovery`); a mutation's own settle counts none.
\* A settled row read its project's directory, so the index holds it as it is (FW2). A settled delete reclaims the
\* id's device state when `AbsenceProof` says no directory still carries it, read after the delete: the authority
\* removes the directory and runs `verifyAbsent` in one hold of `project:<id>` (FW3), which every Tau writer of the id
\* takes, so the removal and its proof are one step for them, as here.
\* A cancelled delete (FW3) removes nothing and changes no device state: its row leaves the journal and this tab holds
\* nothing for it, so the project stays listed and reachable. `CancelHolds` keeps it failed instead, which is the
\* witness that holding it would answer the project's route `recovery-failed` while the project is whole.
ReplaySettled(r) ==
  /\ rec[r].st = "replaying"
  /\ \E out \in Outcomes(r) :
     \E s \in IF out = "ok" THEN Applied(rowOp[r], rowProj[r], storage) ELSE {storage} :
       /\ rec' = [rec EXCEPT ![r] =
                    CASE out = "ok" -> [Unseen EXCEPT !.st = "recovered"]
                      [] out = "terminal" -> [Unseen EXCEPT !.st = "failed", !.why = "terminal"]
                      [] out = "workspace" -> [@ EXCEPT !.st = "failed", !.why = "workspace", !.via = "journal"]
                      [] out = "cancelled" -> [Unseen EXCEPT !.st = IF CancelHolds THEN "failed" ELSE "cancelled",
                                                             !.why = "cancelled"]]
       /\ journal' = IF out = "ok" \/ (out = "cancelled" /\ ~CancelHolds) THEN journal \ {r} ELSE journal
       /\ storage' = s
       /\ stale' = IF out = "ok" THEN stale \ {rowProj[r]} ELSE stale
       /\ kept' = IF out = "ok" /\ rowOp[r] = "delete"
                      /\ Absent(rowProj[r], [ok |-> TRUE, roots |-> SymDiff(s, stale')], s)
                   THEN kept \ {rowProj[r]} ELSE kept
  /\ Bump
  /\ act' = Label(IF rec[r].via = "mutation" THEN "MutationApplied" ELSE "ReplaySettled")
  /\ UNCHANGED <<rowProj, rowOp, ws, catalog, stopped, skipped, redo, replies, deliveries, n>>

PersonDiscarded(r) ==
  /\ rec[r].st = "failed"
  /\ rec' = [rec EXCEPT ![r] = [Unseen EXCEPT !.st = "discarded"]]
  /\ journal' = journal \ {r}
  /\ Bump
  /\ act' = Label("PersonDiscarded")
  /\ UNCHANGED <<storage, rowProj, rowOp, ws, catalog, stopped, skipped, redo, replies, deliveries, n, stale, kept>>

\* The workspace's roots become unreadable; the watch reports it as an invalidation.
WorkspaceLost ==
  /\ ws = "available"
  /\ n.loss < MaxWorkspaceLoss
  /\ ws' = "unavailable"
  /\ n' = [n EXCEPT !.loss = @ + 1]
  /\ Bump
  /\ act' = Label("WorkspaceLost")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, catalog, stopped, skipped, redo, rec, replies, deliveries, stale, kept>>

\* A re-pick republishes the route configuration: an invalidation, and `retryFailedRecoveries` settles
\* every row that failed with `workspace-unavailable` again, unless it has made its third attempt. A re-admitted
\* root is read from storage, so the index is current again (FW2).
WorkspaceReturned ==
  /\ ws = "unavailable"
  /\ ws' = "available"
  /\ rec' = [r \in Rows |-> IF rec[r].st = "failed" /\ rec[r].why = "workspace" /\ rec[r].att < MaxAttempts
                             THEN [rec[r] EXCEPT !.st = "waiting", !.why = "none"] ELSE rec[r]]
  /\ Bump
  /\ stale' = {}
  /\ act' = Label("WorkspaceReturned")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, catalog, stopped, skipped, redo, replies, deliveries, n, kept>>

\* This tab reloads: it keeps storage and the journal, reads every journal row again as waiting with no
\* attempts, and loses its pass, catalog, write-stop flags and open questions. Its index is volatile: the next pass
\* reads every directory from storage (FW2). Device state is durable.
Crash ==
  /\ n.crash < MaxCrashes
  /\ n' = [n EXCEPT !.crash = @ + 1]
  /\ owed' = TRUE
  /\ pass' = Idle
  /\ catalog' = NoListing
  /\ held' = NotHeld
  /\ stopped' = FALSE
  /\ skipped' = FALSE
  /\ redo' = FALSE
  /\ rec' = [r \in Rows |-> IF r \in journal THEN Loaded ELSE Unseen]
  /\ acc' = [q \in Questions |-> IF acc[q].st \in Open
                                 THEN [NoQuestion EXCEPT !.st = "lost", !.p = acc[q].p, !.gen = acc[q].gen]
                                 ELSE acc[q]]
  /\ stale' = {}
  /\ act' = Label("Crash")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, replies, deliveries, kept>>

-----------------------------------------------------------------------------
(* The environment: other tabs *)

\* Another tab changes a root and this tab hears it: its index takes the named directory (FW2).
EnvChangedStorage(p) ==
  /\ n.change < MaxEnvChange
  /\ n' = [n EXCEPT !.change = @ + 1]
  /\ storage' = IF p \in storage THEN storage \ {p} ELSE storage \cup {p}
  /\ stale' = stale \ {p}
  /\ Bump
  /\ act' = Label("EnvChangedStorage")
  /\ UNCHANGED <<journal, rowProj, rowOp, ws, catalog, stopped, skipped, redo, rec, replies, deliveries, kept>>

EnvAddedRow(p, o) ==
  /\ n.add < MaxEnvAdd
  /\ HasFreeRow
  /\ n' = [n EXCEPT !.add = @ + 1]
  /\ LET r == FreeRow IN
       /\ rowProj' = [rowProj EXCEPT ![r] = p]
       /\ rowOp' = [rowOp EXCEPT ![r] = o]
       /\ journal' = journal \cup {r}
  /\ act' = Label("EnvAddedRow")
  /\ UNCHANGED held
  /\ UNCHANGED <<storage, ws, owed, pass, catalog, stopped, skipped, redo, rec, acc, replies, deliveries, stale, kept>>

EnvSettledRow(r) ==
  /\ n.settle < MaxEnvSettle
  /\ r \in journal
  /\ EnvSettlesReplaying \/ rec[r].st # "replaying"
  /\ n' = [n EXCEPT !.settle = @ + 1]
  /\ journal' = journal \ {r}
  /\ storage' \in Applied(rowOp[r], rowProj[r], storage)
  /\ stale' = stale \ {rowProj[r]}
  /\ Bump
  /\ act' = Label("EnvSettledRow")
  /\ UNCHANGED <<rowProj, rowOp, ws, catalog, stopped, skipped, redo, rec, replies, deliveries, kept>>

\* A root changes and no evidence reaches this tab's index: a lost notice, an observer that stopped, an edit while
\* the folder was away (FW2). The index now has p's presence wrong, and no epoch moves.
EnvChangedUnheard(p) ==
  /\ n.unheard < MaxUnheard
  /\ n' = [n EXCEPT !.unheard = @ + 1]
  /\ storage' = IF p \in storage THEN storage \ {p} ELSE storage \cup {p}
  /\ stale' = IF p \in stale THEN stale \ {p} ELSE stale \cup {p}
  /\ act' = Label("EnvChangedUnheard")
  /\ UNCHANGED <<journal, rowProj, rowOp, ws, owed, pass, catalog, held, stopped, skipped, redo, rec, acc, replies,
                 deliveries, kept>>

\* Late evidence reaches the index (a poll, a late observer record) and moves the epoch. The environment's: no
\* fairness.
EvidenceArrived(p) ==
  /\ ws = "available"
  /\ p \in stale
  /\ stale' = stale \ {p}
  /\ Bump
  /\ act' = Label("EvidenceArrived")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, catalog, stopped, skipped, redo, rec, replies, deliveries, n, kept>>

-----------------------------------------------------------------------------
(* Route access *)

\* A route asks about p. Asking again (a navigation, a retry) or cancelling (the route unmounts) replaces
\* the question and moves its generation; the replies of the old one may still complete.
AccessAsked(q, p) ==
  /\ IF acc[q].st = "unasked"
       THEN /\ acc' = [acc EXCEPT ![q] = [NoQuestion EXCEPT !.st = "asking", !.p = p]]
            /\ n' = n
       ELSE /\ n.ask < MaxAsks
            /\ acc' = [acc EXCEPT ![q] = [NoQuestion EXCEPT !.st = "asking", !.p = p, !.gen = acc[q].gen + 1]]
            /\ n' = [n EXCEPT !.ask = @ + 1]
  /\ act' = Label("AccessAsked")
  /\ UNCHANGED held
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, owed, pass, catalog, stopped, skipped, redo, rec,
                 replies, deliveries, stale, kept>>

AccessCancelled(q) ==
  /\ acc[q].st \in Open
  /\ n.ask < MaxAsks
  /\ acc' = [acc EXCEPT ![q] = [NoQuestion EXCEPT !.st = "cancelled", !.p = acc[q].p, !.gen = acc[q].gen + 1]]
  /\ n' = [n EXCEPT !.ask = @ + 1]
  /\ act' = Label("AccessCancelled")
  /\ UNCHANGED held
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, owed, pass, catalog, stopped, skipped, redo, rec,
                 replies, deliveries, stale, kept>>

\* Answer question q. The caller says what becomes of the replies.
Deliver(q, a) ==
  /\ acc' = [acc EXCEPT ![q] = [NoQuestion EXCEPT !.st = "answered", !.p = acc[q].p, !.gen = acc[q].gen, !.ans = a]]
  /\ deliveries' = [deliveries EXCEPT ![q][acc[q].gen] = @ + 1]
  /\ act' = Label("AccessAnswered")

\* Read again from the top of the loop.
Reread(q) ==
  /\ acc' = [acc EXCEPT ![q] = [NoQuestion EXCEPT !.st = "asking", !.p = acc[q].p, !.gen = acc[q].gen]]
  /\ deliveries' = deliveries
  /\ act' = Label("AccessReread")

\* A read goes out, tagged with its question's id and generation, and reads the project it was sent for.
Send(q) == /\ replies' = replies \cup {[id |-> q, gen |-> acc[q].gen, p |-> acc[q].p]}
           /\ deliveries' = deliveries

\* The top of the loop reads the recovery set, with no await: a held row answers at once. Otherwise
\* the first read starts at the current epoch.
AccessTop(q) ==
  /\ acc[q].st = "asking"
  /\ LET p == acc[q].p IN
       IF HeldActive(p) THEN Deliver(q, "recovering") /\ replies' = replies
       ELSE IF HeldFailed(p) THEN Deliver(q, "recovery-failed") /\ replies' = replies
       ELSE /\ acc' = [acc EXCEPT ![q] = [@ EXCEPT !.st = "reading", !.k = 1, !.cur = TRUE, !.rs = FALSE]]
            /\ Send(q)
            /\ act' = Label("AccessRead")
  /\ UNCHANGED held
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, owed, pass, catalog, stopped, skipped, redo, rec, n, stale, kept>>

\* A later read starts (`ensureProjectLibraryState`, `getProjectFileSystemConfig`).
AccessNextRead(q) ==
  /\ acc[q].st = "between"
  /\ acc' = [acc EXCEPT ![q] = [@ EXCEPT !.st = "reading", !.k = @ + 1]]
  /\ Send(q)
  /\ act' = Label("AccessRead")
  /\ UNCHANGED held
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, owed, pass, catalog, stopped, skipped, redo, rec, n, stale, kept>>

\* Target: an answer is delivered only after its last read, and only when every read was taken at the
\* current epoch and no recovery row for the project started since the first; otherwise read again.
TargetReadDone(m) ==
  LET q == m.id
      a == acc[q]
      v == IF a.k = 1 THEN Observe(m.p) ELSE a.val
  IN IF a.k < Reads
       THEN /\ acc' = [acc EXCEPT ![q] = [@ EXCEPT !.st = "between", !.val = v]]
            /\ deliveries' = deliveries
            /\ act' = Label("AccessRead")
     ELSE IF a.cur /\ ~a.rs /\ ~HeldAny(a.p)
       THEN Deliver(q, v)
       ELSE Reread(q)

\* Today (`use-project-manager.tsx` getProjectRouteAccess): the first read is `verifyProjectRoute` or a
\* discovery pass, the second `ensureProjectLibraryState` when the project was found and
\* `getProjectFileSystemConfig` when it was not. Every read is followed by an epoch check against the
\* epoch the read observed; only the found path also checks the recovery set (`recoveryStarted()`).
TodayReadDone(m) ==
  LET q == m.id
      a == acc[q]
      v == IF a.k = 1 THEN Observe(m.p) ELSE a.val
  IN IF a.k = 1
       THEN IF ~a.cur THEN Reread(q)
            ELSE IF v = "unavailable" THEN Deliver(q, "unavailable")
            ELSE /\ acc' = [acc EXCEPT ![q] = [@ EXCEPT !.st = "between", !.val = v]]
                 /\ deliveries' = deliveries
                 /\ act' = Label("AccessRead")
     ELSE IF v = "ready"
       THEN IF ~a.cur \/ HeldAny(a.p) THEN Reread(q) ELSE Deliver(q, "ready")
       ELSE IF ~a.cur THEN Reread(q) ELSE Deliver(q, "missing")

\* A reply counts for the question it answers: "gen" by id and generation, "id" by id alone.
Matches(m) == acc[m.id].st = "reading" /\ (AccessMatch = "id" \/ m.gen = acc[m.id].gen)

\* The first read of a question reads the project's directory (`verifyProjectRoute`); its discovery branch is a pass,
\* which reads the index. They contradict each other while the index has the project wrong (FW2).
Contradicts(m) == Matches(m) /\ acc[m.id].k = 1 /\ ws = "available" /\ m.p \in stale

\* A read that contradicts the index. With `VerifyFeedsIndex` the authority writes what it read into the index and the
\* discovery change moves the epoch, so the question reads again behind a pass; without it the question reads again
\* against the same index.
ContradictionRead(m) ==
  LET q == m.id
      again == [NoQuestion EXCEPT !.st = "asking", !.p = acc[q].p, !.gen = acc[q].gen]
  IN /\ IF VerifyFeedsIndex
          THEN /\ stale' = stale \ {m.p}
               /\ owed' = TRUE
               /\ pass' = [pass EXCEPT !.cur = FALSE]
               /\ held' = NotHeld
               /\ acc' = [x \in Questions |-> IF x = q THEN again ELSE [acc[x] EXCEPT !.cur = FALSE]]
          ELSE /\ acc' = [acc EXCEPT ![q] = again]
               /\ UNCHANGED <<stale, owed, pass, held>>
     /\ deliveries' = deliveries
     /\ act' = Label("AccessContradiction")

\* A read completes. A reply that matches no reading question is dropped.
AccessReadDone(m) ==
  /\ replies' = replies \ {m}
  /\ IF Contradicts(m)
       THEN ContradictionRead(m)
       ELSE /\ IF Matches(m)
                 THEN IF AccessLoop = "target" THEN TargetReadDone(m) ELSE TodayReadDone(m)
                 ELSE /\ UNCHANGED <<acc, deliveries>>
                      /\ act' = Label("AccessStaleReply")
            /\ UNCHANGED <<held, owed, pass, stale>>
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, catalog, stopped, skipped, redo, rec, n, kept>>

\* This tab's audit re-reads a directory the index has wrong, with no evidence asking it to, and moves the epoch (FW2,
\* index-contract review A4). It reads storage, so not while the workspace is away.
Audited(p) ==
  /\ AuditOn
  /\ ws = "available"
  /\ p \in stale
  /\ stale' = stale \ {p}
  /\ Bump
  /\ act' = Label("Audited")
  /\ UNCHANGED <<storage, journal, rowProj, rowOp, ws, catalog, stopped, skipped, redo, rec, replies, deliveries, n, kept>>

-----------------------------------------------------------------------------

TabNext ==
  \/ PassStarted \/ PassSettled \/ CatalogApplied \/ EpochBumped
  \/ WriteStopBegan \/ WriteStopEnded
  \/ \E p \in Projects, o \in Ops : MutationJournaled(p, o)
  \/ \E r \in Rows : ReplayStarted(r) \/ ReplaySettled(r) \/ PersonDiscarded(r)
  \/ WorkspaceLost \/ WorkspaceReturned \/ Crash
  \/ \E q \in Questions : AccessTop(q) \/ AccessNextRead(q) \/ AccessCancelled(q)
  \/ \E m \in replies : AccessReadDone(m)
  \/ \E q \in Questions, p \in Projects : AccessAsked(q, p)
  \/ \E p \in Projects : Audited(p)

EnvNext ==
  \/ \E p \in Projects : EnvChangedStorage(p) \/ EnvChangedUnheard(p) \/ EvidenceArrived(p)
  \/ \E p \in Projects, o \in Ops : EnvAddedRow(p, o)
  \/ \E r \in Rows : EnvSettledRow(r)

Next == TabNext \/ EnvNext

Spec == Init /\ [][Next]_vars

\* Storage, the replay and this tab's discovery are fair; the person, the environment, a crash and the
\* workspace are not.
Fairness ==
  /\ \A r \in Rows : WF_vars(ReplayStarted(r)) /\ WF_vars(ReplaySettled(r))
  /\ WF_vars(PassStarted) /\ WF_vars(PassSettled) /\ WF_vars(CatalogApplied)

LiveSpec == Spec /\ Fairness

\* FW2: the audit is this tab's own action and carries the fairness that evidence, the environment's, cannot.
IndexLiveSpec == LiveSpec /\ \A p \in Projects : WF_vars(Audited(p))

\* Projects are interchangeable; safety configurations may declare SYMMETRY ProjectSymmetry.
ProjectSymmetry == Permutations(Projects)

-----------------------------------------------------------------------------
(* Properties *)

Listings == [ok : BOOLEAN, roots : SUBSET Projects]

TypeOK ==
  /\ storage \subseteq Projects
  /\ journal \subseteq Rows
  /\ rowProj \in [Rows -> Projects \cup {None}]
  /\ rowOp \in [Rows -> Ops \cup {None}]
  /\ \A r \in journal : rowProj[r] # None
  /\ ws \in {"available", "unavailable"}
  /\ owed \in BOOLEAN /\ stopped \in BOOLEAN /\ skipped \in BOOLEAN /\ redo \in BOOLEAN
  /\ pass \in [st : {"idle", "reading"}, cur : BOOLEAN, seen : Listings]
  /\ held \in [st : {"none", "held"}, cur : BOOLEAN, seen : Listings]
  /\ catalog \in Listings
  /\ rec \in [Rows -> [st : RowStates, att : 0..MaxAttempts, why : Reasons, via : {"journal", "mutation"}]]
  /\ \A q \in Questions : acc[q].st \in {"unasked", "answered", "cancelled", "lost"} \cup Open
                          /\ acc[q].ans \in Answers \cup {None}
                          /\ acc[q].gen \in 0..MaxAsks
  /\ replies \subseteq [id : Questions, gen : 0..MaxAsks, p : Projects]
  /\ deliveries \in [Questions -> [0..MaxAsks -> Nat]]
  /\ stale \subseteq Projects
  /\ kept \subseteq Projects

\* I7. The catalog is replaced only by a pass whose epoch equals the current epoch. A reload, which
\* forgets the catalog, replaces nothing.
NoStaleReconcile ==
  [][(catalog' # catalog /\ n'.crash = n.crash) => IF held.st = "held" /\ held'.st = "none" THEN held.cur
                                                   ELSE pass.cur]_vars

\* I8. A mutation on project p is not journaled while this tab holds a row for p in waiting or replaying.
RecoveryGatesMutation ==
  [][\A r \in Rows : (rowProj[r] = None /\ rowProj'[r] # None /\ rec'[r].via = "mutation")
                       => ~HeldActive(rowProj'[r])]_vars

\* I8. Every row this tab has seen is in exactly one of waiting, replaying, recovered, failed or
\* discarded (one field, so exactly one), and leaves them only when the tab reloads. A row becomes failed
\* only on a terminal reason, on workspace-unavailable, or on its third settled attempt (in this tab), and
\* discarded only by PersonDiscarded, which removes its journal row and nothing else.
RowAccounted ==
  /\ [](\A r \in Rows : rec[r].st \in RowStates)
  /\ [][\A r \in Rows :
          /\ (rec[r].st # "unseen" /\ rec'[r].st = "unseen") => n'.crash > n.crash
          /\ (rec[r].st # "failed" /\ rec'[r].st = "failed")
               => (rec'[r].why \in {"terminal", "workspace", "cancelled"} \/ rec[r].att = MaxAttempts)
          /\ (rec[r].st # "discarded" /\ rec'[r].st = "discarded")
               => (r \notin journal' /\ UNCHANGED <<storage, rowProj>>)]_vars

\* I8. No ReplayStarted(row) follows a terminal failure of that row, in this tab.
TerminalStops ==
  [][\A r \in Rows : (rec[r].st = "failed" /\ rec[r].why = "terminal" /\ n'.crash = n.crash)
                       => rec'[r].st \in {"failed", "discarded"}]_vars

\* I8. A row that failed with workspace-unavailable is replayed again only after WorkspaceReturned, in
\* this tab.
RetryOnlyWhenCleared ==
  [][\A r \in Rows : (rec[r].st = "failed" /\ rec[r].why = "workspace" /\ rec'[r].st \in Active
                        /\ n'.crash = n.crash)
                       => (ws = "unavailable" /\ ws' = "available")]_vars

\* I9. If a pass was skipped during a write stop, a pass starts after the stop ends and before the
\* catalog is reported current.
\* The catalog is reported current when no pass is in flight or owed and no pass has skipped its writes:
\* nothing owed with no pass in flight means the last pass settled at the current epoch.
ReportedCurrent == pass.st = "idle" /\ ~owed /\ ~skipped
SkippedPassRedone == redo => ~ReportedCurrent

\* I7. When no pass, mutation or replay is in flight, the epoch is settled and the environment is quiet,
\* the catalog equals storage (as a read of it sees it). The environment acts in single steps, so it is
\* quiet in every state.
Settled == /\ pass.st = "idle"
           /\ held.st = "none"
           /\ \A r \in Rows : rec[r].st # "replaying"
           /\ ~owed
\* FW2: the catalog differs from storage at most in the projects the index has wrong. With `stale` empty this is the
\* former `CatalogReflectsStorage`, `Settled => catalog = Visible`.
CatalogWithinStale ==
  Settled => IF ws = "available" THEN catalog.ok /\ SymDiff(catalog.roots, storage) \subseteq stale ELSE catalog = Visible

\* I4, D10. An answer is delivered only for the current epoch, from reads all taken at it, with no
\* recovery row for the project started since the first of them; it is recovering or recovery-failed
\* exactly when this tab holds such a row.
Fenced(q) ==
  LET a == acc'[q]
      p == acc[q].p
  IN /\ a.ans \in {"recovering", "recovery-failed"} \/ (acc[q].cur /\ ~acc[q].rs)
     /\ (a.ans = "recovering") <=> HeldActive(p)
     /\ (a.ans = "recovery-failed") <=> (HeldFailed(p) /\ ~HeldActive(p))
AccessAnswerFenced ==
  [][\A q \in Questions : (acc[q].st # "answered" /\ acc'[q].st = "answered") => Fenced(q)]_vars

\* I18. A reply changes only its own question, and only while that question is reading under the reply's
\* generation and about the reply's project; an answer is delivered at most once per question {id,
\* generation}, to the question open under that id and generation.
\* FW2: a reply that feeds the index moves the epoch, which may also make another question's reads stale; that is the
\* epoch's change, not the reply's.
AccessMatchedById ==
  [][/\ \A m \in replies \ replies', x \in Questions :
          acc'[x] # acc[x] => \/ (x = m.id /\ acc[x].st = "reading" /\ m.gen = acc[x].gen /\ m.p = acc[x].p)
                              \/ acc'[x] = [acc[x] EXCEPT !.cur = FALSE]
     /\ \A q \in Questions, g \in 0..MaxAsks :
          deliveries'[q][g] # deliveries[q][g] =>
            /\ deliveries'[q][g] = 1
            /\ g = acc[q].gen /\ acc'[q].gen = g
            /\ acc[q].st \in {"asking", "reading"} /\ acc'[q].p = acc[q].p]_vars

\* Witness of the inherited risk: a row this tab replays is still in the journal, so no other tab has
\* settled it. Expected to be violated when the environment may settle a row this tab holds.
SingleReplay == \A r \in Rows : rec[r].st = "replaying" => r \in journal

\* Liveness. Under weak fairness of storage and the replay, with the workspace available and the
\* environment quiet, every row becomes recovered, failed or discarded. Quiescence: `RowsQuiescent`.
RowSettled(r) == rec[r].st \in {"unseen", "recovered", "cancelled", "failed", "discarded"}
RowsQuiescent == \A r \in Rows : RowSettled(r)
Calm == ws = "available"
RowEventuallySettled == <>[]Calm => <>[]RowsQuiescent

\* FW3. A delete the authority cancelled removed nothing, so its project stays reachable: a route question is never
\* answered `recovery-failed` on a row that was cancelled. `cancel-holds` shows holding the row would break it.
CancelLeavesProjectReachable ==
  [][\A q \in Questions :
       (acc[q].st # "answered" /\ acc'[q].st = "answered" /\ acc'[q].ans = "recovery-failed")
         => \E r \in Rows : rowProj[r] = acc[q].p /\ rec[r].st = "failed" /\ rec[r].why # "cancelled"]_vars

\* S2, S11 (FW2). An id's device state is dropped only in a step after which no directory carries it.
NoReclaimWhileCopy == [][\A p \in Projects : (p \in kept /\ p \notin kept') => p \notin storage']_vars

\* Index-contract review F7. A read that finds storage and the index disagreeing leaves the project out of `stale` and
\* a pass owed, so the pass the question then waits for reads the directory instead of answering from the same entry.
ContradictionIsEvidence == [][\A m \in replies \ replies' : Contradicts(m) => (m.p \notin stale' /\ owed')]_vars

\* Liveness (FW2). Under weak fairness of the audit, the replay and discovery (`IndexLiveSpec`), with the workspace
\* available and the bounded environment quiet, the index comes to hold storage and the catalog to show it.
\* Quiescence: `CatalogQuiescent`.
CatalogQuiescent == stale = {} /\ Settled
CatalogEventuallyCurrent == <>[]Calm => <>[](CatalogQuiescent /\ catalog = Visible)

=============================================================================
