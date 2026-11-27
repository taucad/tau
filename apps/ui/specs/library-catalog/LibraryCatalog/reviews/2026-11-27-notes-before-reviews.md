Moved from the notes above `EXTENDS` in `LibraryCatalog.tla` by `formal review-notes`.

```text
A2 (app state orchestration): the project-manager and workspace-connection actors moved into the
`ProjectLibrary` service, which the runtime starts. Discovery, recovery and route access still run in
`ProjectManagerProvider` against them, with the same refs and reads, so every action is unchanged.
The provider hands the library its binding in render; a port called before it waits for it, and
its children are optional, and a connection wait superseded by a later selection rejects; neither
changes an action. The observation effect releases and resumes the library's binding around its reads.
A3a, after A2: the machines' citations of `use-project-manager.tsx` lines moved with A2's additions
above them; the code they name is unchanged, so no action or correspondence changes.
A12 (app state orchestration, I21): `createProject` tells the chat store when the first chat it writes
holds no message, so that chat shows empty at once. It is a call to the chat store after the operation
commits, and the creating callback lists the store among its inputs; no root, row or read changes,
so every action is unchanged.
A3b: `ProjectLibrary` runs the three machines and the hook delegates to it. The `today` configurations
keep describing the hook at 7918b118, before that wiring. A discovery `apply` reports a write it
skipped at a write-stop gate, so a stop that ended while the deletes ran redoes the pass at once,
as `WriteStopEnded` would (rule 3), and the listing is refetched as a redo starts, as today's skew
listener did; a `discovery-required` verification, or a question that skips
verification, asks for the bootstrap pass, an `Unmodelled` emission. A mutation's or replay's copy of
its operation is dropped once taken; a later attempt reads the journal. A failed pass, journal read or
discard rejects with the port's own error, which the library keeps. No action or correspondence changes.
A4a: create, duplicate, delete, restore, adopt, repair and rename are `ProjectLibrary` commands
(`runtime/project-library-commands.ts`), moved from the hook unchanged with the create-project named lock.
They begin, journal, apply and abandon a mutation through the same library calls, so `MutationJournaled`,
`MutationApplied` and rule 4's gate keep their correspondence. The delete's quiescence check and session
close ask the registry and the chat store, outside the model; the check's chat read is not asked again
after a release, as the hook's was not. No action changes.
A4b: connecting a workspace, retrying it, choosing a project's directory and repairing workspace
bindings are `ProjectLibrary` workspace commands (`runtime/project-library-workspace.ts`), moved from
the hook in the same order; choosing a directory now also refetches the listing. The library follows the
root file facade the app runtime builds, so no provider binds, releases or resumes it, and a provider
unmount no longer releases a held read. The library is the listing's only writer: the hook's
refetches after a mutation are the commands' own, a query refetch that moves no epoch, as before. A
connection the workspace machine's root `onError` caught a defect on rejects, so the next starts afresh;
the workspace machine is outside this model. A stopped library follows no facade again. No action or
correspondence changes.
DC-10 files-ui (2026-11-16): `ProjectLibrary` and its workspace commands take the `WorkspaceTelemetry`
type from `@taucad/files-ui`; only the type import moved. No action or correspondence changes.
DC-10 files-ui slice 3 (2026-11-16): `handle-store`, `orphaned-project-route` and `browser.constants` moved
to `@taucad/files-ui`; the four sources only re-point their imports. No action or correspondence changes.
Project name fit (2026-11-16): `ProjectCommands` keeps a generated name's first line and fits it, and a duplicate's
name, to the manifest's 200 code units before the create is journaled. No action or correspondence changes.
W30 project lifecycle (2026-11-17): a listing takes a scope (`live`, `trash`, `all`) in place of
`includeDeleted`, and a delete of a project no tab has open checks quiescence by leasing each chat's log
lock and reading its log, instead of refusing until the project is opened. Both stay outside the model,
as the registry and chat store reads did; the journal, apply and gate order is unchanged. No action or
correspondence changes.
Database recovery (WP9, 2026-11-17): when the journal store cannot open (`VersionError`, a blocked upgrade, an open
timeout or `UnknownError`), `ProjectLibrary` lists discovery alone, answers route access from disk, and refuses a
mutation before it is journaled. That state is outside the model; no action or correspondence changes.
Folder states and Locate (WP3, WP4, 2026-11-17): the workspace commands read a picked folder's evidence for
Locate, which re-binds a moved workspace's project bindings in one transaction, and Remove from Tau drops a lost
folder's workspace row. Both act on the workspace store, outside the model; no action or correspondence changes.
DC-10 files-ui slice 5 (2026-11-17): the three library machines, `project-library.types`,
`pending-project-operation.types`, `project-url.utils` and `project-name.utils` moved to `@taucad/files-ui`; the
four library sources only re-point (and rewrap) their imports. No action or correspondence changes.
DC-10 files-ui slice 6 (2026-11-18): `project-library-storage` and `project-library-observations` moved to
`@taucad/files-ui` behind structural facade, object-store and chat-store types; `use-project-manager.tsx` and the
three runtime sources re-point their imports, and the app's facade type is now `ProjectLibraryFacade`. No action or
correspondence changes.
DC-10 files-ui slice 7 (2026-11-18): `project-library-workspace`, the workspace connection machine and
`project-library-chat-logs` moved to `@taucad/files-ui`. The machine reports its first fault through an injected
`reportFault` service, which `ProjectLibrary` binds to the app's runtime fault reporter; the workspace commands read
the facade and journal through structural types. The other sources re-point their imports. No action or
correspondence changes.
DC-10 files-ui slice 8 (2026-11-18): the project-manager machine moved to `@taucad/files-ui`. It starts the
object-store worker through an injected `startObjectStore` and reports through injected `reportFault` and
`reportWorkerFailed` services, which `ProjectLibrary` binds to the app's worker factory and reporters; the library
reads the started store back as its worker (`runtime/project-library.ts` re-reviewed in its final form, with the
typed read-back). `use-project-manager.tsx` re-points a type import. No action or correspondence changes.
Tau Cloud naming audit (2026-11-18): `project-library-commands.ts` rewords a refusal sentence; copy only.
No action or correspondence changes.
DC-10 files-ui slice 9 (2026-11-19): `ProjectLibrary` and `ProjectCommands` moved to `@taucad/files-ui`
(`runtime/project-library.ts`, `runtime/project-library-commands.ts`), generic over the worker, facade and
projection types. What only the app supplies arrives as injected services: the worker start, the reporters, the
build-skew write stop, the chat store, the legacy listing clear, the project templates and kernel lock files, the
initial user message, the Tau Cloud backup intent and the projection's catch-up. The app keeps a binding at
`apps/ui/app/runtime/project-library.ts` that passes them. Every port, journal, apply and gate call keeps its order;
`use-project-manager.tsx` re-points imports. No action or correspondence changes.
DC-10 files-ui slice 10 (2026-11-19): the project manager's provider moved to `@taucad/files-ui`
(`hooks/project-manager-provider.tsx`, its context in `hooks/use-project-manager.ts`), with the chat permission
modes, the project-name client and the first-project tour as injected services; `use-project-manager.tsx` is now
the app's binding. Every library command and read keeps its order. No action or correspondence changes.
PL7 staging defects FP9 (2026-11-20): `project-library-commands.ts` loads the settled chat-log lease through the
code-loading owner (`loadCode`), which hands a failed load to the page's recovery; the import and every command keep
their order. No action or correspondence changes.
Auto-bring on sign-in removed (2026-11-20): `project-library-commands.ts` stops naming that setting in two
comments; comments only. No action or correspondence changes.
Layering W5 (2026-11-21): the project library (the three library machines, the project-manager machine, the
service, its commands, storage, observations and workspace commands, the provider and listing hooks, and their
types) moved unchanged from `@taucad/files-ui` to `@taucad/project-library`; the sources re-point their imports
of the files-ui modules that stayed. No action or correspondence changes.
W0 copy delete (2026-11-24): a permanent delete removes one exact directory, the copy the person chose or the one
the route binds. When it settles while another directory still carries the project id (`settleCopyDelete` in
`project-library-storage.ts`), the project lives on there, so the settled "delete" row leaves the project's root;
only the last copy's delete removes it. Whether a copy remains is decided when the row settles, not by the row's
`copy` flag: a row journaled with `copy: true` removes the root if the other copy went meanwhile, and one journaled
without it keeps the root if another copy appeared. The flag only turns a directory found already gone into a
conflict or not, a failure the model already allows. The model keeps no directories, so a settled "delete" row,
this tab's or another tab's, now removes the root or leaves it (`Applied`), and `Ops` needs no third operation. The
gate (`MutationJournaled`, `HeldActive`), the journal-then-apply order and recovery are unchanged; every invariant
and property is unchanged and is checked over the larger set of behaviours.
Fast-path FW1 (2026-11-25): mutations that change no disk fact stop scanning. Trash, Restore and every chat
create, delete, purge and recency touch re-enrich the current pass's listing and write it only while that pass's
epoch is current, as a workspace catalog's publish already does, instead of refetching or bumping the epoch; a
removed bump is one `EpochBumped` the environment no longer takes, and the listing's projects come only from a
pass. A permanent delete's precheck reads its target and root statuses from the current pass (`discover` with
`reuse`) and proves another copy with `verifyProjectRoute`, scanning only for a copy no route binds; it runs
before `MutationJournaled`, which is unchanged. The refetches after a delete's and a duplicate's settle go: the
settled row's `Bump` already owes the pass (`project-library-commands.ts` re-reviewed in its final form). No action
or correspondence changes.
Name ahead C1 (2026-11-26): a kernel create starts its name request before the worker, storage and template
awaits and awaits it at directory allocation, before anything is journaled; `namingImageUrls` is exported. The
journal, apply and gate order is unchanged. A caller's `projectName` may be a promise, awaited at the same point.
No action or correspondence changes.
FW1 over C1 (2026-11-26): `project-library-commands.ts` re-reviewed with both changes in it, C1's name request
started ahead of a kernel create and FW1's scan-free commands and permanent-delete precheck; they touch different
commands and merged without overlap. No action or correspondence changes.
FW1 review (2026-11-26): the permanent-delete precheck counts a route verification as proof of another copy only
when the directory it read, which the verification now names (an older authority names none: no proof), is the
copy the precheck chose and not the target; a "Use this folder" that moves the route in between leaves `copy`
unset, the stricter Trash check. Overlapping `refreshListingRows` calls of one pass publish only the latest call's
listing. Both sit before `MutationJournaled` or outside the gate, which are unchanged. No action or correspondence
changes.
Fast-path FW2 (2026-11-26, the discovery index; index-contract review A1 and A6): a pass reads the authority's
index, which may lag storage. `stale` holds the projects whose presence the index has wrong, flipped by a change no
evidence reported (`EnvChangedUnheard`) and cleared by evidence (`EvidenceArrived`, the environment's, with no
fairness), by this tab's audit (`Audited`, weakly fair under `IndexLiveSpec`), by a settled row, a heard change, a
reload or the workspace's return. A pass sees `Seen`, storage with `stale` flipped. `kept` is the ids this device
holds state for: a pass at the current epoch adds what it saw, and a settled delete and the pass's orphan sweep
remove an id only on `AbsenceProof`'s answer, `verifyAbsent`'s read of storage or (the witness) the index. An access
read that finds storage and the index disagreeing feeds the index (`VerifyFeedsIndex`). `CatalogReflectsStorage`
becomes `CatalogWithinStale`, which is it when `stale` is empty; `NoReclaimWhileCopy`, `ContradictionIsEvidence` and
`CatalogEventuallyCurrent` are new; `AccessMatchedById` lets the epoch move another question's reads in the step a
reply feeds the index. With `MaxUnheard = 0` no new action is enabled and every earlier verdict stands. The code:
`remainingCopiesAfterDelete`, the orphan sweep, adopt and the orphaned-route release ask `verifyAbsent`
(`project-library-storage.ts`, `project-library-commands.ts` re-reviewed in their final form).
FW2 code (2026-11-26): `project-library.ts` hands the orphan sweep `verifyAbsent`, and `project-library-commands.ts`
passes adopt's remembered id to the authority, which decides under `project:<id>`, and asks `verifyAbsent` before
the orphaned-route release; `remainingCopiesAfterDelete` proves the route's copy by the directory it names or asks
`verifyAbsent`. That is `AbsenceProof = "storage"`; no action or correspondence changes.
FW2 review (2026-11-26): the permanent-delete precheck proves a copy no route binds with `verifyAbsent` (a `present`
answer naming another directory) instead of a pass, which reads the index (B1); `project-library.ts` remembers an
orphan nominee's undecided proof until the listing changes (M4). Both read storage, `AbsenceProof = "storage"`; the
precheck runs before `MutationJournaled`. No action or correspondence changes.
Fast-path FW3 (2026-11-26, targeted verification): the authority's permanent delete answers what remains of the id
under the same hold of `project:<id>` as the removal: it probes the id's known locations and, when none holds it,
runs `verifyAbsent`, and the settle reads that answer (`project-library-storage.ts`'s `remainingCopiesAfterDelete`
is gone). The removal and the proof of absence were two holds of the lock; they are one now, which is what
`ReplaySettled` already assumed by taking `Applied` and `Absent` over `storage'` in one step, so that residual is
closed and the step is the code's. With `copy` set the authority proves the surviving copy again in that hold and
refuses when none holds the id: a settle that fails `terminal` or `workspace` with storage unchanged, which
`Outcomes` already allows. The permanent-delete precheck proves another copy with a probe in place of
`verifyProjectRoute` and `verifyAbsent`, before `MutationJournaled`; "Use this folder" binds a directory a probe
reads holding the id instead of starting a pass, one fewer environment `EpochBumped`; the manifest read's fallback
probes the known locations before its pass, and a create allocates against a fresh listing of its root's names.
No action or correspondence changes.
FW3 sole-copy cancel (2026-11-26, the operator's ruling "Cancel and say so"): a copy delete the authority refuses
because no other copy holds the id, or none could be read, no longer fails its row. It settles `cancelled`: the row
leaves the journal, storage, device state (`kept`) and the catalog are unchanged, and this tab holds nothing for the
project, which the person is told about. `ReplaySettled` gains that outcome for a delete row (`Outcomes(r)`),
`RowStates` and `Reasons` gain `cancelled`, and `CancelLeavesProjectReachable` is new, with the constant `CancelHolds`
and its witness `cancel-holds`. Every earlier configuration sets `CancelHolds = FALSE`.
FW3 sole-copy cancel code (2026-11-26): `library-recovery.machine` settles a `cancelled` outcome to its row state
`cancelled`, which holds nothing, and emits `rowCancelled`; `project-library.ts` returns the outcome to the delete's
caller and keeps a replay's cancel for the person until dismissed; the permanent-delete precheck and "Use this
folder" leave out the directories other deletes in the journal are removing (review M2) and degrade to their earlier
reads when the authority refuses the probe (review m3). `ReplaySettled`'s `cancelled` branch is the code's, as formatted.
FW3 re-review (2026-11-27): a cancel carries whether no other copy holds the id or none could be counted (N1); a row
this tab saw fail is not left out of a delete's proof (N2); only the probe's not-served refusal degrades (N3). Every
change sits before `MutationJournaled` or inside the authority's answer; no action or correspondence changes.
Fast-path FW4 (2026-11-27, I/O lanes): `project-library.ts` asks for the orphan sweep's `verifyAbsent` in the
background lane, and hands the chat store and the listing's library-row recovery the record client whose connections
declared that lane. A lane orders the authority's provider calls and is an untimed step here: no action or
correspondence changes.
```

```sha256
566b216a4131225eebf7a33c1e35f733b64daeafcb3cd42a1ba2222133e7d897  apps/libs/project-library/src/hooks/project-manager-provider.tsx
1227083a7798d63266441263049a45181d356931c98e5bee0a409cbc869cb539  apps/libs/project-library/src/machines/library-access.machine.ts
6a5cd1451c900aa184f254e719421363ef49b13834acf7f53f7bceea486b00fd  apps/libs/project-library/src/machines/library-discovery.machine.ts
d069d1455aed69058f5e98c08f24e3ae3630fd09cd610896e2e49d5524a6e005  apps/libs/project-library/src/machines/library-recovery.machine.ts
6386c0f82b445614cf2cc6292b901597a6f2a4ea958910d805e6b296a4598f75  apps/libs/project-library/src/runtime/project-library-commands.ts
e9ab2a6156c421d2b023a065a0305a9f596bcdaaae9e20160272345f40731c29  apps/libs/project-library/src/runtime/project-library-workspace.ts
7baf7eb3df9b06cdfacd0fc9a9de3cc56a07b64148e7acee19d6cb8e9f045401  apps/libs/project-library/src/runtime/project-library.ts
```
