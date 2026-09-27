---
revisions: minor
agent-host: minor
host: minor
---

Turns are placed and settled through one port. `@taucad/revisions/turn-placement` exports `createTurnPlacementPort`, which serves the agent host's `TurnPlacementPort` (admit, complete, abandon, reconcile, acknowledge, settlements) over a project's revision root. Every verb is keyed by the attempt and answered `applied`, `replayed` or `refused`, and a turn's tools are revoked once it completes or is abandoned. The shipped API differs from the TS-S0 design in four ways:

- `TurnPlacementPortOptions` is `{ revisions, openTools }`. `revisions` is the `createProjectRevisionsActor` result (its `actor` and `turns`), because the port reads the lease directory, a checkout's files and a settlement's graph facts, which the root actor does not expose.
- `createProjectRevisionsActor` now returns `ProjectRevisions`: `{ actor, settled, turns }`, where `turns` is a `TurnStore` (`leases()`, `open(checkoutId)`, `describe(settlement)`).
- `openTools` also receives the attempt's `checkout`.
- `TurnPlacementAdapter` is exported: the six verbs plus `fence()`, which the owner of a replaced placement session calls to refuse its requests and revoke its tools.

`@taucad/revisions/turn-machine` also exports `selectTurnAnnouncement`.

`@taucad/agent-host/wire` exports `turnSettlementSchema` and `turnPlacementSchema`. `turnSettlementSchema` is the one shape every `turn.*` settlement row is written in, with the attempt required. In `agent-host`:

- The run actor appends a settlement the placement port publishes only in that shape. A row that does not match is refused `EVENT_INVALID`.
- A settlement row keeps the attempt its body states, so a late settlement no longer settles the attempt a quick Resume opened.
- `TauAgentHost.recordSettlement`, `HostSettlementEvent`, the launcher's `append` and `record-settlement` command, and `HostAuthoredLogEvent` are removed: the run actor is the only writer of settlement rows.
- A host without `placement` refuses every start and resume `REVISIONS_UNAVAILABLE`, with no effect.
- When a chat opens, the run actor reconciles through `reconcile` before it serves a command. It acknowledges each held lease whose attempt the log already settled, and settles each held lease of an ended run as that run's current attempt. A lease that names attempt 0 (written before attempts were recorded) stands for every attempt of its run. A lease whose run the chat's log does not hold is left for its owner and reported with `console.warn`.
- A grant that fails after the base is minted is refused with the base as `details.revisionId`, and the `turn.failed` row names it.
- `ExternalAgentTurn` gains `root`: the directory the attempt's placement rooted its files in.

In `host`, revision verbs, the registry wait and the close flush wait for the machines' own answer instead of a timer. A switch or discard no longer answers "did not answer in time". Closing a project whose registry lists no live checkout rejects with "This project has no live checkout to record at close."

The host now places and settles every turn itself, and the page-side and epoch-based paths are removed without a deprecation phase:

- `host`: `createProjectHost` places every turn through the project's own revision root unless `turnPlacement` is given, so the daemon and the desktop need no factory of their own. `ProjectRevisions.record(launcher)` and the `authorityEpoch` options of `createProjectRevisions` and `openProjectRevisions` are removed; the per-project authority record is no longer written. A host that starts after a crash between a turn's cut and its settlement row appends the row and retires the lease through `reconcile`.
- `revisions`: the epoch lease sweep is removed: the root's `sweepLeases` effect, the `recovering` state, the `leaseStale` event, `staleRunIds` and a lease record's `authorityEpoch` (a legacy record's field is ignored on read). The checkout registry lists leases at open. The `legacy` admission flag and the root's self-acknowledgement of a settlement are removed: a settled turn keeps its lease until the host acknowledges it, and a refused cut holds the attempt with its lease. The placement adapter's `root` option maps the live checkout to the host's workspace, `openTools` receives it, and `admit` reads the chat's checkout from its record.

A revision root now holds a Web Lock for as long as it runs, and stamps its instance as `holder` on each lease it writes (`TurnLease.holder`; absent on older records). `TurnStore` gains `claim`, `retire` and `holderReleased`, and `RevisionActors` gains `release`. A placement session refuses to settle or retire an attempt another live root holds: `complete` answers `LEASE_HELD_ELSEWHERE`, a fresh `admit` answers `TURN_ALREADY_LEASED`, and an acknowledge without the attempt's actor leaves the lease. Once that root stops, the session publishes a `leaseHeld` fact so the host reconciles. An acknowledge without an actor answers only after the lease is deleted. `admissionMilliseconds` is removed.

`revisions` also drops the `branchRegistryMilliseconds` and `publishPushMilliseconds` exports: no machine or caller waits on them. In `host`, the revision channel's `createBranch` answers with the branch's `{ branch, checkoutId, checkoutRoot }`, or rejects with the branch machine's code, instead of answering `null` and leaving the caller to read the toast.
