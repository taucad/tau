/**
 * The effects behind the revision machines: one actor set per project.
 *
 * The machines own the lifecycle and nothing else; everything that touches a
 * filesystem, a revision store or the clock is here, injected through each
 * machine's own `provide({ actors })`. It is host-neutral — a page, a daemon and
 * the Electron utility pass their own `RevisionPort` and their own way of
 * opening a checkout's tree, and get the same behaviour.
 *
 * The fence here is in-process only: it serialises this host's own mints of one
 * checkout. Across processes the fence is the expected-old ref update inside
 * `casHead` — which orders *ref advancement*, not the file writes `applyTree`
 * performs while merging. W9 decides whether a disk host needs more than that.
 *
 * This module replaces `TurnRevisionRecorder`: prepare, capture, merge and
 * finalize are the same four steps, minus the lifecycle state the class also
 * held (which is now the machines') and minus branch-per-chat placement, which
 * is gone (D7/I18: a turn attaches to a checkout, it never creates one).
 *
 * **A turn is never rehydrated from disk.** `.tau/runs/<runId>.json` is a lease
 * record, not a resumable turn: a host that died mid-turn leaves an orphan, and
 * {@link RevisionActors.checkouts}' `sweepLeases` retires it against the
 * authority epoch on the next open (F13, R15).
 */

import type { PathPolicy, RootedFileSystem } from '@taucad/filesystem';
import { randomUuid } from '@taucad/utils/id';
import { walk } from '@taucad/filesystem/content-ops';
import {
  captureRevisionTree,
  createCaptureMemo,
  ImmutableRevisionTree,
  mergeRevisionTrees,
  renderConflictMarkers,
  revisionId,
} from '#algorithms/index.js';
import type { CaptureMemo, RevisionId, RevisionTreeInput } from '#algorithms/index.js';
import { createApplyTreeEffects } from '#apply-tree.js';
import { caseCollisions } from '#case-collisions.js';
import { createChatEffects, storageRefusalOf } from '#chat-effects.js';
import { revisionTreeId } from '#git-tree-id.js';
import { createHandles } from '#handle-table.js';
import { conflictLabels, materializeConflict, readConflictTerms } from '#revision-conflict.js';
import type { RevisionConflictTerms } from '#revision-conflict.js';
import { integrationOf, mergeBaseHeads, mergeBaseOf } from '#revision-log-order.js';
import { resolutionMachine } from '#resolution.machine.js';
import type {
  ResolutionActors,
  ResolutionApplyActorInput,
  ResolutionFinishActorOutput,
  ResolutionLoadActorInput,
  ResolutionLoadActorOutput,
  ResolutionMaterializeActorOutput,
  ResolutionSeedTurnActorOutput,
} from '#resolution.machine.js';
import type { ResolutionSide } from '#resolution.types.js';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { AnyEventObject, AsyncActorLogic, AsyncLogicFunction } from 'xstate';

import { checkoutMachine } from '#checkout.machine.js';
import type {
  CheckoutActors,
  CheckoutCasHeadActorInput,
  CheckoutCasHeadActorOutput,
  CheckoutCutActorInput,
  CheckoutCutActorOutput,
  CheckoutCutTrigger,
  CheckoutFenceActorInput,
  CheckoutHead,
  CheckoutWriteRevisionActorInput,
} from '#checkout.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import { branchMachine } from '#branch.machine.js';
import type {
  BranchActors,
  BranchApplySwitchActorOutput,
  BranchCheckActorInput,
  BranchCheckActorOutput,
  BranchMergeActorOutput,
  BranchRenameActorOutput,
} from '#branch.machine.js';
import type {
  AddCheckoutActorOutput,
  CheckoutsActors,
  ListCheckoutsActorOutput,
  SweepLeasesActorOutput,
} from '#checkouts.machine.js';
import { chatIdOfRef, chatRefName, chatRefPrefix, projectChats } from '#chat-ref.js';
import { LfsQuotaError } from '#lfs-client.js';
import { cleanLargeObjects } from '#lfs.js';
import type { ObjectFormat } from '#object-hash.js';
import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import { publishMachine } from '#publish.machine.js';
import type {
  PublishActors,
  PublishPushActorInput,
  PublishPushActorOutput,
  PublishTagActorInput,
  PublishVersionsActorOutput,
} from '#publish.machine.js';
import type { PublishPublicationActorInput, PublishPublicationActorOutput } from '#publish.types.js';
import { remoteMachine } from '#remote.machine.js';
import type {
  RemoteActors,
  RemoteAuthorizeActorInput,
  RemoteInitialSyncActorInput,
  RemoteInitialSyncActorOutput,
  RemoteReadActorOutput,
  RemoteValidateActorInput,
  RemoteValidateActorOutput,
  RemoteWriteActorInput,
  RemoteWriteActorOutput,
} from '#remote.machine.js';
import { isHostLocalRef, remoteOf, remoteTrackingRef, tauRemoteName } from '#remotes.js';
import { createSyncQueue } from '#sync-queue.js';
import { latestRevisionTarget, restoreMachine } from '#restore.machine.js';
import { syncMachine } from '#sync.machine.js';
import {
  generatedGitattributesContent,
  generatedGitattributesPath,
  generatedIgnoreContent,
  generatedIgnorePath,
  tauRevisionPolicy,
} from '#workspace-config.js';
import type {
  SyncActors,
  SyncFastForwardActorOutput,
  SyncFetchActorInput,
  SyncFetchActorOutput,
  SyncIntegrateActorInput,
  SyncMergeActorOutput,
  SyncPushActorInput,
  SyncPushActorOutput,
  SyncReadPendingActorInput,
  SyncReadRemoteActorOutput,
  SyncWritePendingActorInput,
} from '#sync.machine.js';
import type { SyncFacet, SyncQueueRecord, SyncRefOutcome } from '#sync.types.js';
import type {
  RestoreActors,
  RestoreApplyPlanActorOutput,
  RestoreComputePlanActorInput,
  RestoreComputePlanActorOutput,
} from '#restore.machine.js';
import type { RevisionActor, RevisionProvenance } from '#revision-authority.js';
import { RevisionPortError } from '#revision-port.js';
import type {
  Checkout,
  CheckoutRecord,
  RemoteStorageRefusal,
  RevisionEngineDescriptor,
  RevisionPort,
  RevisionTag,
} from '#revision-port.js';
import { turnMachine } from '#turn.machine.js';
import type {
  TurnActors,
  TurnCaptureActorInput,
  TurnLeaseActorInput,
  TurnMergeActorOutput,
  TurnPrepareActorInput,
  TurnFailureCode,
  TurnOutcome,
  TurnPrepareActorOutput,
  TurnRetireLeaseActorInput,
  TurnSettlement,
  TurnWriteLeaseActorInput,
} from '#turn.machine.js';

/**
 * Opens the tree of one checkout.
 *
 * A host, not this module, knows what a checkout's `root` means: an absolute
 * directory on a disk host, a `/projects/<id>` or `/checkouts/<id>` route in a
 * page. One function rather than one filesystem, because a linked checkout is a
 * different tree from the live one and capturing the wrong one is silent.
 *
 * @public
 */
export type RevisionFileSystem = Omit<RootedFileSystem, 'watch'>;

/** Open the revision read/write capability for one checkout. @public */
export type CheckoutFileSystems = (checkout: Checkout) => RevisionFileSystem | Promise<RevisionFileSystem>;

/**
 * Run one checkout filesystem operation inside its host-owned admission lifetime.
 *
 * Disk hosts use this seam to admit a linked checkout before placement is
 * published, then revoke that temporary reachability when the operation
 * settles. Browser hosts may omit it and use {@link CheckoutFileSystems}
 * directly.
 *
 * @public
 */
export type UseCheckoutFileSystem = <Result>(
  checkout: Checkout,
  operation: (filesystem: RevisionFileSystem) => Promise<Result>,
) => Promise<Result>;

/** One turn's lease record, as `.tau/runs/<runId>.json` holds it (S7). @public */
export type TurnLease = Readonly<{
  runId: string;
  turnId: string;
  chatId: string;
  checkoutId: string;
  /** The revision the turn descends from, absent on an unborn branch. */
  baseRevisionId?: string;
  /** The host authority that wrote it; any other epoch's lease is stale (N3). */
  authorityEpoch: string;
  /** Milliseconds since the Unix epoch. */
  startedAt: number;
}>;

/**
 * Where one turn was placed, that its lease is now held, or why it could not be
 * placed at all.
 *
 * `leased` matters to a host with a fast turn: a completion that arrives while
 * the turn is still `preparing` is dropped by the machine, whose wait set for
 * `turnCompleted` is `leased`. A host holds the completion until this says the
 * lease is held.
 *
 * @public
 */
export type TurnPlacement = Readonly<{ runId: string }> &
  (
    | Readonly<{
        status: 'placed';
        turnId: string;
        chatId: string;
        /** The checkout this turn attaches to; never one this call created. */
        checkout: Checkout;
        baseRevisionId: string | undefined;
      }>
    | Readonly<{ status: 'leased'; checkoutId: string }>
    | Readonly<{ status: 'refused'; turnId: string; chatId: string; reason: string }>
  );

/**
 * The host-attested settlement of one turn (A4, D9, S9).
 *
 * **One schema on every host.** `turn.machine` emits the settlement on the
 * browser, the daemon, the Electron utility and the cloud alike, and
 * {@link describeTurnSettlement} fills in the two graph facts the machine does
 * not carry — so a revision card is projected from one shape wherever the turn
 * ran, rather than from a per-host record the client has to learn.
 *
 * @public
 */
export type TurnFinalizedEvent = Readonly<{
  type: 'turn.finalized';
  /** The client's own stable user-message id for the turn. */
  turnId: string;
  runId: string;
  chatId: string;
  projectId: string;
  checkoutId: string | undefined;
  /** Absent when the turn changed nothing, so nothing was minted (I5). */
  revisionId?: string;
  /** The branch the checkout tracks, absent when it is detached. */
  branch?: string;
  changedPaths: readonly string[];
  /** Object id of the recorded **tree**, not of the revision that carries it. */
  treeId?: string;
  trigger: 'turn';
  /** Every lease on the checkout when the turn was placed (AC9). */
  runIds: readonly string[];
}>;

/** A turn whose writes could not be merged into the checkout it ran on. @public */
export type TurnConflictedEvent = Readonly<{
  type: 'turn.conflicted';
  turnId: string;
  runId: string;
  chatId: string;
  checkoutId: string | undefined;
}>;

/** A turn that ran and ended without a revision: no outcome is silent. @public */
export type TurnFailedEvent = Readonly<{
  type: 'turn.failed';
  turnId: string;
  runId: string;
  chatId: string;
  checkoutId: string | undefined;
  /** The diagnostic a console reads. Never shown to a person (Rule 1, E5). */
  reason: string;
  /**
   * What the failure was, for the page that phrases it (P4): a
   * `TurnFailureCode`, or `TURN_RELEASED` for a turn let go before it recorded
   * anything. A string because it crosses the worker boundary and the durable
   * log, both of which carry codes as text.
   */
  code?: string;
}>;

/**
 * Fill in the two facts a settlement does not carry, and shape it for the wire.
 *
 * `changedPaths` and `treeId` are graph questions, so they are asked of the
 * store rather than carried through a machine: the diff is tree-free and the
 * tree id is a header on the commit. The diff runs against the revision's own
 * first parent, which the store knows — a turn's base can move between
 * placement and settlement (a dirty checkout is minted into a base revision
 * *after* the turn is placed), so a host-side copy of it would diff against
 * the wrong tree.
 *
 * @param port - The store the revision was recorded in.
 * @param projectId - The project the turn ran in.
 * @param settlement - What `turn.machine` emitted.
 * @returns The event every host publishes for this turn.
 * @public
 */
export const describeTurnSettlement = async (
  port: RevisionPort,
  projectId: string,
  settlement: TurnSettlement,
): Promise<TurnFinalizedEvent> => {
  const record =
    settlement.revisionId === undefined ? undefined : await port.readRevision(revisionId(settlement.revisionId));
  const changes = record === undefined ? [] : await port.diff({ from: record.parents[0], to: record.id });
  /* R7: the settling checkout's own branch. HEAD is the *live* checkout's, and
   * a turn on a linked checkout would be labelled with the wrong one. */
  const head = settlement.branch === undefined ? await port.readHead() : undefined;
  const branch = settlement.branch ?? head?.branch;
  return Object.freeze<TurnFinalizedEvent>({
    type: 'turn.finalized',
    turnId: settlement.turnId,
    runId: settlement.runId,
    chatId: settlement.chatId,
    projectId,
    checkoutId: settlement.checkoutId,
    ...(settlement.revisionId === undefined ? {} : { revisionId: settlement.revisionId }),
    ...(branch === undefined ? {} : { branch }),
    /* Sorted here, at the one producer: the log compares a repeated settlement
     * by value, arrays in order, so two views must spell one fact one way. */
    changedPaths: changes.map(({ path }) => path).toSorted(),
    ...(record?.treeId === undefined ? {} : { treeId: record.treeId }),
    trigger: 'turn',
    runIds: settlement.runIds.toSorted(),
  });
};

/** The started root of one project's revision actor tree. @public */
export type ProjectRevisionsActor = ReturnType<typeof createActor<ReturnType<typeof projectRevisionsMachine.provide>>>;

/**
 * Shape a turn that ran and recorded nothing for the wire.
 *
 * The root emits `turnReleased` for every turn that ends `failed` or
 * `released`, so a host subscribes to it exactly as it does to the two
 * settlements. This replaces `watchFailedTurns`, which polled each turn actor
 * because the emit did not exist (W5 report §9).
 *
 * @param event - The root's `turnReleased` fact.
 * @returns The event a host publishes, or `undefined` for an outcome that
 *   settles through `turnFinalized` / `turnConflicted` instead.
 * @public
 */
export const describeTurnRelease = (
  event: Readonly<{
    turnId: string;
    chatId: string;
    runId: string;
    checkoutId: string | undefined;
    outcome: TurnOutcome;
    reason?: string;
    code?: TurnFailureCode;
  }>,
): TurnFailedEvent | undefined =>
  event.outcome === 'finalized' || event.outcome === 'conflicted'
    ? undefined
    : Object.freeze<TurnFailedEvent>({
        type: 'turn.failed',
        turnId: event.turnId,
        runId: event.runId,
        chatId: event.chatId,
        checkoutId: event.checkoutId,
        reason: event.reason ?? 'The turn ended before it recorded a revision.',
        /* Absent rather than `undefined`: this object is compared by value in
         * the log and validated by the worker's command frame. A release is a
         * category of its own, not an unclassified failure. */
        ...(event.code === undefined
          ? event.outcome === 'released'
            ? { code: 'TURN_RELEASED' }
            : {}
          : { code: event.code }),
      });

/** Dependencies one project's actor set is built from. @public */
export type RevisionActorsOptions = Readonly<{
  /** The content-addressed store every revision id comes from. */
  port: RevisionPort;
  filesystem: CheckoutFileSystems;
  /** Optional host-owned admission wrapper around checkout tree reads and writes. */
  useFileSystem?: UseCheckoutFileSystem;
  projectId: string;
  /**
   * The authority this host holds the project under.
   *
   * A lease written under any other epoch belongs to a process that no longer
   * owns this project, so it is stale and `sweepLeases` retires it. W19 moves
   * the value under `project-session`; until then a host mints one per process.
   */
  authorityEpoch: string;
  /** Milliseconds since the Unix epoch. Defaults to `Date.now`. */
  clock?: () => number;
  /** Actor recorded on every revision this host mints. */
  actorId?: string;
  /**
   * The session → actor mapping this host resolved (S37, A26).
   *
   * Read per mint rather than captured once, because signing in, signing out
   * and turning anonymity on all change the answer inside one session. The host
   * owns the mapping — a page reads it from the session, a daemon from the
   * machine's own user — and the anonymity setting is applied *here*, before
   * the revision is written, so no later change rewrites a recorded identity.
   *
   * An agent turn is resolved by `runId`, which is how the model behind a turn
   * reaches the revision at all.
   */
  actor?: (input: Readonly<{ runId: string | undefined; trigger: CheckoutCutTrigger }>) => RevisionActor | undefined;
  /**
   * The classifier this project's layout answers with (EQ6, D6).
   *
   * Injected for the same reason the composed view's is: the mask is the
   * mechanism and the layout is data. Defaults to Tau's own, which is the one
   * place in this package that reads the registry — every site below asks this
   * value, so a project opened under another layout cannot have Tau's rows
   * quietly applied to its files.
   *
   * A non-default policy must also hand its rows to
   * `generatedIgnoreContent`, or the generated ignore block and the capture
   * disagree (PP5); `tauRevisionPolicy` keeps the pair together.
   */
  policy?: PathPolicy;
  /**
   * Called when a turn's placement settles, before its lease is written.
   *
   * Both outcomes: a host has to root the turn's agent where the placement put
   * it, and has to refuse a turn it could not place rather than run it
   * unrecorded (I-EDIT).
   */
  onPlacement?: (placement: TurnPlacement) => void;
  /**
   * Reports chat records only after a remote ref tree has been projected into
   * this checkout's protected `.tau/chats/**` files.
   */
  onChatsProjected?: (chatIds: readonly string[]) => void;
  /**
   * Brackets tree materialization so a disk host can ignore its own watcher
   * events instead of reporting them as editor changes.
   */
  onApplyingTree?: (checkout: Checkout, paths: readonly string[]) => (() => void) | void;
  /**
   * Where this project's Tau Cloud repository is.
   *
   * Host knowledge: only the host knows which API origin it is signed in to,
   * and the URL is the whole of what *Tau Cloud* means to the port (S34).
   * Without it, connecting to Tau Cloud is refused rather than guessed.
   */
  remoteUrl?: (projectId: string) => string | undefined;
  /**
   * What the remote says this project costs against its plan (S35).
   *
   * Not part of the git protocol: the Tau API answers it and a third-party Git
   * remote does not, so the Sync region shows the storage row only when a host
   * can fill it in. W11a/W13 wire the reader.
   */
  remoteStorage?: (remote: string) => Promise<Readonly<{ used: number; quota: number }> | undefined>;
  /**
   * Registers this project on Tau Cloud, at *Connect* (P51, W18 DEF-1).
   *
   * Host knowledge for the same reason {@link RevisionEffectOptions.remoteUrl}
   * is: only the host knows which API it is signed in to and how it
   * authenticates there — a cookie in the page, a bearer on a disk host. No
   * credential passes through this module.
   *
   * Connecting is the verb that makes a project exist on the remote: until it
   * runs, nothing has written the `project` row the git server authorizes
   * against, so both advertisements answer `404` and the connection can never
   * take. It must be idempotent — a retried *Connect* calls it again — and
   * without it connecting Tau Cloud proceeds unregistered, which is what every
   * host did before P51.
   */
  registerRemoteProject?: (projectId: string) => Promise<void>;
  /**
   * Records one publication on Tau Cloud (S32, A21).
   *
   * Host knowledge for the same reason `remoteUrl` is: only the host knows
   * which API it is signed in to and how it authenticates there — a cookie in
   * the page, a bearer on a disk host. No credential passes through this
   * module. Without it, publishing is refused rather than attempted.
   */
  publishPublication?: (input: PublishPublicationActorInput) => Promise<PublishPublicationActorOutput>;
  /**
   * This host's stable identity among the devices writing one chat (W13, W17).
   *
   * It names a *log segment* — `events/<deviceId>.jsonl` inside the chat ref's
   * tree — so it must be stable across reloads of one profile and different
   * between two. In the browser it is `apps/ui/app/lib/device-id.ts` and
   * nothing else; on a disk host the host's own machine identity. Without it
   * this module writes **no** chat refs at all, because a host that cannot say
   * which device it is cannot write a per-device segment without risking
   * overwriting another's.
   *
   * A reader rather than a value, because the browser's id lives in
   * `localStorage`, which a worker cannot see: the page sends it once the port
   * is open, and every read after that answers.
   *
   * @returns This device's id, or `undefined` before the host knows it.
   */
  deviceId?: () => string | undefined;
  /**
   * Whether this host can reach anything, as it changes (S41's three exits).
   *
   * Injected rather than read: the page has
   * `apps/ui/app/hooks/use-network-connectivity.tsx`, a worker has
   * `globalThis`'s own `online`/`offline`, and a daemon has neither — so the
   * scheduler is told, and a host that says nothing is a host that is online.
   *
   * @param report - Called with the new value on every change.
   * @returns The unsubscribe the actor runs when it stops.
   */
  connectivity?: (report: (online: boolean) => void) => () => void;
  /**
   * Remember the history set's push, for a host that can re-send one (A32, S41).
   *
   * The `pagehide` keepalive offers a POST the `hidden` flush already built, and
   * D28/S41 say which POST that is: the **history-set** pack, never a chat ref's.
   * Nothing in a receive-pack request says which set it carries — every ref goes
   * to the same endpoint — so the scheduler marks the one push that is the
   * history one rather than leaving a recorder to guess from a URL (review 2 R3).
   *
   * Absent on every host that cannot re-send anything at all (Node spawns `git`;
   * there is no `pagehide`), and then this is the identity function.
   *
   * @param run - The history-set push.
   * @returns Whatever the push answered.
   */
  recordHistoryPush?: <Result>(run: () => Promise<Result>) => Promise<Result>;
}>;

/** The actor sets `projectRevisionsMachine.provide` needs. @public */
export type RevisionActors = Readonly<{
  checkout: CheckoutActors;
  turn: TurnActors;
  restore: RestoreActors;
  checkouts: CheckoutsActors;
  remote: RemoteActors;
  /** The branch verbs' own effects (W7 minus `merge`, which W10 completed). */
  branch: BranchActors;
  /** Per-file conflict resolution, one spawned child per conflicted revision (W10). */
  resolution: ResolutionActors;
  /** Naming, pushing and recording one publication (W8). */
  publish: PublishActors;
  /**
   * Continuous sync: the queue's two record effects, the two transport effects
   * and the apply (W13).
   *
   * Both divergence paths use the same three-way merge and conflict record.
   */
  sync: SyncActors;
  /**
   * Resolves once nothing this module started is still writing to the project.
   *
   * Stopping the actor tree cancels no promise: the store's own creation
   * outlives it, so a host that closes and then removes the project directory
   * has to wait for this first.
   */
  settled: () => Promise<void>;
}>;

/**
 * One resolved conflicted path: which side won, and the bytes when a person typed them.
 *
 * Held by the effects module rather than by `resolution.machine`, because a
 * machine's context carries choices and never bytes (I29).
 */
type ChosenSide = Readonly<{ side: ResolutionSide; content?: Uint8Array<ArrayBuffer> }>;

/** Where leases live, relative to the project. A `records` row in the registry. */
const leaseDirectory = '.tau/runs';
/** The trunk: a project's live tree starts on it and a turn records onto it. */
const mainBranch = 'main';
/** Identity every revision this host records is committed under. */
const hostAuthor = Object.freeze({ name: 'Tau', email: 'noreply@tau.new' });
/**
 * How far back a pull looks to decide fast-forward from divergence.
 *
 * ponytail: a bounded walk read by `mergeBaseOf` — W10's, so there is one idea
 * of "base" in the package. A base further back than this reads as diverged,
 * which is the safe answer: it merges instead of fast-forwarding.
 */
const divergenceWalkLimit = 1000;

const textEncoder = new TextEncoder();
const generatedSetupTree = new ImmutableRevisionTree([
  [generatedGitattributesPath, generatedGitattributesContent(undefined)],
  [generatedIgnorePath, generatedIgnoreContent(undefined)],
]);

/* Moved to `#git-tree-id.js` (W10.1); re-exported at its old position so
 * `@taucad/revisions/revision-effects` keeps the surface it published. */
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- keeping a published `@public` symbol at its own subpath across an internal move; `unicorn/prefer-export-from` demands this form and `no-barrel-files` forbids it outside index.ts (the recorded conflict).
export { revisionTreeId } from '#git-tree-id.js';

/**
 * Build one project's actor implementations over a port and its checkouts.
 *
 * @param options - The store, how to open a checkout, and the host's identity.
 * @returns The four actor sets, ready for `provide`.
 * @public
 *
 * @example <caption>Provide one machine's effects directly</caption>
 * ```typescript
 * import { NodeFsProvider } from '@taucad/filesystem/backend/node';
 * import { createRevisionActors } from '@taucad/revisions/revision-effects';
 * import { createNativeGitRevisionPort } from '@taucad/revisions/node';
 * import { restoreMachine } from '@taucad/revisions/restore-machine';
 * import { createActor } from 'xstate';
 *
 * const actors = createRevisionActors({
 *   port: createNativeGitRevisionPort({ repositoryPath: '/srv/project' }),
 *   projectId: 'project-1',
 *   authorityEpoch: 'epoch-1',
 *   filesystem: (checkout) => new NodeFsProvider(checkout.root),
 * });
 * const restore = createActor(restoreMachine.provide({ actors: actors.restore }), {
 *   input: { projectId: 'project-1', checkoutId: 'live' },
 * });
 * restore.start();
 * ```
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one closure over one project's port; splitting it would thread the same six values through every half.
export const createRevisionActors = (options: RevisionActorsOptions): RevisionActors => {
  const { port, filesystem, projectId, authorityEpoch } = options;
  const policy = options.policy ?? tauRevisionPolicy.policy;
  const useFileSystem: UseCheckoutFileSystem =
    options.useFileSystem ?? (async (checkout, operation) => operation(await filesystem(checkout)));
  const actorId = options.actorId ?? 'tau-host';
  /* A host that cannot re-send a push remembers none: the identity function. */
  const recordHistoryPush = options.recordHistoryPush ?? (async <Result>(run: () => Promise<Result>) => run());
  const clock = options.clock ?? Date.now;
  let lastReading = 0;
  /* Monotonic per process: a bounded `log` walk stops on committer time, so a
   * clock that went backwards would truncate a history (W3a review R39). */
  const now = (): number => {
    lastReading = Math.max(lastReading, clock());
    return lastReading;
  };

  const cuts = createHandles<{ tree: ImmutableRevisionTree; treeId: string }>('cut');
  /**
   * The side chosen for each conflicted path, by conflicted revision.
   *
   * ponytail: in memory, dropped when the resolution finishes. A person who
   * reloads mid-resolution starts choosing again, which is the honest outcome of
   * holding nothing on disk — the alternative is a fourth record type for a
   * decision that takes seconds. Persist it under `.tau/` if a real conflict
   * ever takes long enough for that to matter.
   */
  const resolutions = new Map<string, Map<string, ChosenSide>>();
  const captures = createHandles<ImmutableRevisionTree>('capture');
  const plans = createHandles<{ checkoutId: string; revisionId: string; tree: ImmutableRevisionTree }>('plan');
  const fences = new Map<string, Promise<void>>();
  const activeOperations = new Set<Promise<unknown>>();
  /**
   * What each open checkout's captures may reuse instead of reading (EQ7).
   *
   * One memo per checkout, because `(path, size, mtimeMs)` only identifies bytes
   * within one tree; it is dropped when the checkout is, and with this closure.
   */
  const captureMemos = new Map<string, CaptureMemo>();
  const memoOf = (checkoutId: string): CaptureMemo => {
    const memo = captureMemos.get(checkoutId) ?? createCaptureMemo();
    captureMemos.set(checkoutId, memo);
    return memo;
  };
  /** Checkouts this process has already swept the litter of an interrupted apply from. */
  const swept = new Set<string>();

  const fromAuthorityPromise = <Output, Input>(
    effect: AsyncLogicFunction<Output, Input>,
  ): AsyncActorLogic<Output, Input> =>
    createAsyncLogic<Output, Input>({
      run: async (arguments_, enqueue) => {
        const operation = (async (): Promise<Output> => {
          arguments_.signal.throwIfAborted();
          return effect(arguments_, enqueue);
        })();
        activeOperations.add(operation);
        try {
          return await operation;
        } finally {
          activeOperations.delete(operation);
        }
      },
    });

  const acquireCheckoutFence = (checkoutId: string): Readonly<{ granted: Promise<void>; release: () => void }> => {
    const granted = fences.get(checkoutId) ?? Promise.resolve();
    let unlock = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const queued = (async (): Promise<void> => {
      await granted;
      await held;
    })();
    fences.set(checkoutId, queued);
    return {
      granted,
      release: () => {
        unlock();
      },
    };
  };

  const withCheckoutFence = async <Result>(checkoutId: string, operation: () => Promise<Result>): Promise<Result> => {
    const fence = acquireCheckoutFence(checkoutId);
    await fence.granted;
    try {
      return await operation();
    } finally {
      fence.release();
    }
  };

  let opened: Promise<void> | undefined;
  /* The store is created — with the ignore file the registry generates — before
   * the first question is asked of it. Idempotent on both legs. */
  const ensureStore = async (): Promise<void> => {
    opened ??= port.init({ author: hostAuthor });
    await opened;
  };

  /* The store's creation is the only effect that can outlive a stopped actor
   * tree: every other one is awaited inside the actor that started it. */
  const settled = async (): Promise<void> => {
    try {
      await opened;
    } catch {
      /* A store that could not be created is reported where it was asked for,
       * never from the close that waits for it. */
    }
    while (activeOperations.size > 0) {
      // oxlint-disable-next-line no-await-in-loop -- operations may admit another tracked authority operation before settling.
      await Promise.allSettled(activeOperations);
    }
  };

  /* One id per push this process makes, so a settlement can name exactly one. */
  let pushSequence = 0;

  /**
   * The Tau Cloud remote this project publishes to, created if it has none.
   *
   * Publishing is *ensure the graph is on the Tau Hosted Remote* (A21), so a
   * project nobody connected by hand still publishes — but only where the host
   * knows which API it is signed in to, which is `remoteUrl`'s whole job.
   *
   * @returns The remote's name.
   * @throws RevisionPortError When this host cannot name the project's remote.
   */
  const publishRemote = async (): Promise<string> => {
    const remotes = await port.listRemotes();
    const tau = remotes.find((remote) => remote.kind === 'tau');
    if (tau !== undefined) {
      return tau.name;
    }
    const url = options.remoteUrl?.(projectId);
    if (url === undefined) {
      throw new RevisionPortError(
        'INVALID_TRANSPORT',
        'This host does not know where this project’s Tau Cloud repository is.',
      );
    }
    await port.setRemote({ name: tauRemoteName, url });
    return tauRemoteName;
  };

  let described: Promise<RevisionEngineDescriptor> | undefined;
  const describePort = async (): Promise<RevisionEngineDescriptor> => {
    described ??= port.describe();
    return described;
  };
  const formatOf = async (): Promise<ObjectFormat> => {
    const descriptor = await describePort();
    return descriptor.objectFormat;
  };

  /**
   * The tree this store will record, which is the only one worth hashing.
   *
   * A store that pointerises large objects records a different tree than the
   * one captured from disk, and the I5 gate compares a cut against a recorded
   * head — so the cut runs the same host-neutral clean step the writer does.
   *
   * @param tree - The captured tree.
   * @returns The tree as the store will hold it.
   */
  const recordedTree = async (tree: ImmutableRevisionTree): Promise<ImmutableRevisionTree> => {
    const descriptor = await describePort();
    return descriptor.largeObjects ? cleanLargeObjects(tree).tree : tree;
  };

  /*
   * Every place this project's files are.
   *
   * A port without the `checkouts` capability has exactly one: the live tree it
   * was constructed over.
   */
  const listPlaces = async (): Promise<readonly Checkout[]> => {
    /* Before any question is asked of the store, including the first sweep:
     * an engine that has no repository yet cannot answer what its object
     * format is, let alone where its checkouts are. */
    await ensureStore();
    /* The advertised capability, not the presence of the method: an adapter
     * that has one but was constructed without a checkouts directory refuses
     * the call, and this project still has exactly one place. */
    const descriptor = await describePort();
    if (port.listCheckouts !== undefined && descriptor.checkouts) {
      return port.listCheckouts();
    }
    const head = await port.readHead();
    return [
      Object.freeze<Checkout>({
        id: 'live',
        projectId,
        root: `/projects/${projectId}`,
        kind: 'live',
        branch: head?.branch,
        baseRevisionId: head?.head,
      }),
    ];
  };

  const placeOf = async (checkoutId: string): Promise<Checkout> => {
    const places = await listPlaces();
    const place = places.find((candidate) => candidate.id === checkoutId);
    if (place === undefined) {
      throw new RevisionPortError('CHECKOUT_CONFLICT', 'Those files are not open in this project.');
    }
    return place;
  };

  const headOf = async (place: Checkout): Promise<string | undefined> =>
    place.baseRevisionId ?? (place.branch === undefined ? undefined : await port.readRef(place.branch));

  /* Tau-owned siblings carry their role in the reserved name, so recovery can
   * distinguish unpublished staging bytes from the only copy of a backup. */
  const temporarySibling = (path: string, role: 'staged' | 'backup'): string => {
    const separator = path.lastIndexOf('/');
    const directory = separator === -1 ? '' : path.slice(0, separator + 1);
    const name = path.slice(separator + 1);
    return `${directory}.${name}.tau-${role}.${randomUuid()}.tmp`;
  };
  const temporarySiblingPattern =
    /^\.(.+)\.tau-(staged|backup)\.[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.tmp$/u;
  const parseTemporarySibling = (
    path: string,
  ): Readonly<{ originalPath: string; role: 'staged' | 'backup' }> | undefined => {
    const separator = path.lastIndexOf('/');
    const directory = separator === -1 ? '' : path.slice(0, separator + 1);
    const match = temporarySiblingPattern.exec(path.slice(separator + 1));
    const role = match?.[2];
    return match === null || (role !== 'staged' && role !== 'backup')
      ? undefined
      : { originalPath: `${directory}${match[1]!}`, role };
  };

  /**
   * Remove the staged and backup siblings a killed apply left behind.
   *
   * They are ordinary authored paths to the registry, so the first capture after
   * a process died inside `applyTree` would record them as the person's own
   * files. Once per checkout per process, before that first capture (W8f).
   *
   * @param place - The checkout being opened.
   * @param live - Its tree.
   */
  const sweepTemporarySiblings = async (place: Checkout, live: RevisionFileSystem): Promise<void> => {
    if (swept.has(place.id)) {
      return;
    }
    swept.add(place.id);
    try {
      for await (const entry of walk(live, '', { admits: (path) => policy.classify(path).versioned })) {
        const temporary = entry.kind === 'file' ? parseTemporarySibling(entry.relativePath) : undefined;
        if (temporary !== undefined) {
          // oxlint-disable-next-line no-await-in-loop -- each sibling is recovered as the walk reaches it.
          const originalPresent = await live.exists(temporary.originalPath);
          // oxlint-disable-next-line no-await-in-loop -- a backup is the only copy when its original is absent.
          await (temporary.role === 'backup' && !originalPresent
            ? live.rename(entry.relativePath, temporary.originalPath)
            : unlinkIfPresent(live, entry.relativePath));
        }
      }
    } catch (error) {
      /* A listing is a snapshot: an entry can be gone before the sweep reaches
       * it. Litter nobody removed is swept at the next open, so a vanished
       * directory is not a project that cannot be opened. */
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        (error as { name?: unknown }).name !== 'NotFoundError'
      ) {
        throw error;
      }
    }
  };

  /**
   * Remove one path, tolerating one that is already gone.
   *
   * @param live - The checkout tree.
   * @param path - Root-relative path to remove.
   * @returns When removal or the not-found result settles.
   */
  const unlinkIfPresent = async (live: RevisionFileSystem, path: string): Promise<void> => {
    await live.unlink(path).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    });
  };

  /**
   * Capture one already-open checkout filesystem.
   *
   * @param rooted - The checkout tree.
   * @param basis - Recorded modes to inherit where the provider has none.
   * @param captureOptions - This checkout's memo and whether reuse is safe.
   * @returns The complete versioned tree.
   */
  const captureFileSystem = async (
    rooted: RevisionFileSystem,
    basis: ImmutableRevisionTree | undefined,
    captureOptions: Readonly<{ memo: CaptureMemo; bypassMemo: boolean }>,
  ): Promise<ImmutableRevisionTree> => {
    /* The reading comes first, so a file whose timestamp the stats then report
     * as this recent is racily clean and is read rather than trusted (EQ7). */
    const observedAt = now();
    const memoOptions = captureOptions.memo.unchanged(
      await rooted.statTree?.('', { admits: (path) => policy.classify(path).versioned }),
      observedAt,
    );
    const tree = await captureRevisionTree(rooted, {
      exclude: (path) => !policy.classify(path).versioned || parseTemporarySibling(path) !== undefined,
      inheritedMode: (path) => basis?.mode(path),
      reuse: captureOptions.bypassMemo ? undefined : memoOptions.reuse,
      onRead: memoOptions.onRead,
    });
    const collisions = caseCollisions(tree);
    if (collisions.length > 0) {
      throw new RevisionPortError(
        'ENGINE_FAILED',
        `These paths differ only by case and cannot be checked out together: ${collisions.join(', ')}`,
      );
    }
    return tree;
  };

  const captureCheckout = async (
    place: Checkout,
    modeBasis: ImmutableRevisionTree | undefined,
    bypassMemo: boolean,
  ): Promise<ImmutableRevisionTree> =>
    useFileSystem(place, async (rooted) => {
      await sweepTemporarySiblings(place, rooted);
      return captureFileSystem(
        rooted,
        modeBasis ??
          (await (async () => {
            const head = await headOf(place);
            return head === undefined ? undefined : port.readTree(revisionId(head));
          })()),
        { memo: memoOf(place.id), bypassMemo },
      );
    });
  /* The versioned tree of one checkout: every path the registry versions. */
  const capture = async (place: Checkout, modeBasis?: ImmutableRevisionTree): Promise<ImmutableRevisionTree> =>
    captureCheckout(place, modeBasis, false);
  /* A decision that discards or replaces a working copy on the strength of
   * "nothing here is unrevisioned" never trusts metadata an external replacement
   * can preserve (same size, restored mtime). The turn's own captures keep the
   * memo: that is git's racy-index limit, and re-reading every file twice a turn
   * is what the memo exists to stop. */
  const captureFresh = async (place: Checkout, modeBasis?: ImmutableRevisionTree): Promise<ImmutableRevisionTree> =>
    captureCheckout(place, modeBasis, true);

  /* The tree object id of one revision, as the store recorded it. */
  const treeIdOf = async (revision: string | undefined): Promise<string | undefined> => {
    if (revision === undefined) {
      return undefined;
    }
    const record = await port.readRevision(revisionId(revision));
    return record?.treeId;
  };

  const { equalEntry, entryOf, materializeTree } = createApplyTreeEffects({
    useFileSystem,
    capture,
    onApplyingTree: options.onApplyingTree,
    policy,
    withCheckoutFence,
    recordedTree,
    formatOf,
    temporarySibling,
    unlinkIfPresent,
  });

  /**
   * The project's *Sync chats* answer, read per push (D25, W17).
   *
   * Read, never written: the toggle is W17's writer and the person's choice, and
   * a scheduler that cached it would keep pushing chats for the rest of a
   * session after they turned it off. Absent means on.
   */
  /**
   * Both `tau.json` answers, from one read (C23).
   *
   * Read per push and never cached across one, because the toggles are the
   * person's and a scheduler that remembered them would keep pushing chats for
   * the rest of a session after they were turned off (D25, W17). Reading the
   * same file twice to answer two booleans is the part that was not paying for
   * itself.
   *
   * @returns Whether chats and generated exports are synced. Chats default on,
   *   exports default off; an unreadable manifest is both defaults.
   */
  const projectSyncPreferences = async (): Promise<Readonly<{ syncChats: boolean; syncLargeExports: boolean }>> => {
    const records = await recordsFileSystem();
    try {
      const manifest: unknown = JSON.parse(await records.readFile('tau.json', 'utf8'));
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a parsed manifest is `unknown` until read.
      const record = manifest as Readonly<{ syncChats?: unknown; syncLargeExports?: unknown }>;
      return { syncChats: record.syncChats !== false, syncLargeExports: record.syncLargeExports === true };
    } catch {
      return { syncChats: true, syncLargeExports: false };
    }
  };

  const evidenceRefName = 'refs/tau/evidence/exports';
  const isSyncedEvidencePath = (path: string): boolean =>
    path === '.tau' ||
    path === '.tau/artifacts' ||
    path === '.tau/tool-results' ||
    path === '.tau/offloaded-tool-results' ||
    path === 'exports' ||
    path === 'thumbnail.webp' ||
    path.startsWith('exports/') ||
    path.startsWith('.tau/artifacts/') ||
    path.startsWith('.tau/tool-results/') ||
    path.startsWith('.tau/offloaded-tool-results/');

  /** A brand-new device learns the preference from the fetched project manifest. */
  const fetchedProjectSyncsLargeExports = async (remote: string, branch: string): Promise<boolean> => {
    const records = await recordsFileSystem();
    if (await records.exists('tau.json')) {
      return false;
    }
    const head = await port.readRef(remoteTrackingRef(remote, `refs/heads/${branch}`));
    const tree = head === undefined ? undefined : await port.readTree(head);
    const manifest = tree?.get('tau.json');
    if (manifest === undefined) {
      return false;
    }
    try {
      return (
        (JSON.parse(new TextDecoder().decode(manifest)) as { syncLargeExports?: unknown }).syncLargeExports === true
      );
    } catch {
      return false;
    }
  };

  /** Record generated evidence on its own ref; authored history stays clean. */
  const recordEvidence = async (enabled: boolean, remoteHead?: string): Promise<readonly SyncRefOutcome[]> => {
    if (!enabled) {
      return [];
    }
    try {
      const records = await recordsFileSystem();
      const tree = await captureRevisionTree(records, { exclude: (path) => !isSyncedEvidencePath(path) });
      const current = await port.readRef(evidenceRefName);
      if (current === undefined && tree.size === 0) {
        return [];
      }
      const currentTreeId = await treeIdOf(current);
      if (
        currentTreeId === revisionTreeId(await recordedTree(tree), await formatOf()) &&
        (remoteHead === undefined || current === remoteHead)
      ) {
        return [{ name: evidenceRefName, status: 'upToDate', head: current }];
      }
      const parents = [...new Set([current, remoteHead].filter((head): head is string => head !== undefined))];
      const receipt = await port.writeRevision({
        parents: parents.map((head) => revisionId(head)),
        tree,
        provenance: provenanceOf('save', [], undefined),
        summary: Object.freeze({ generated: 'Backed up generated exports' }),
      });
      const head = revisionId(receipt.commitId);
      const updated = await port.updateRef({ name: evidenceRefName, expectedHead: current, head });
      return [
        {
          name: evidenceRefName,
          status: updated.status === 'updated' ? 'upToDate' : 'rejected',
          head: updated.status === 'updated' ? head : current,
          ...(updated.status === 'updated' ? {} : { reason: 'Generated exports changed while they were recorded.' }),
        },
      ];
    } catch (error) {
      return [
        {
          name: evidenceRefName,
          status: 'rejected',
          head: await port.readRef(evidenceRefName).catch(() => undefined),
          reason: error instanceof Error ? error.message : 'Generated exports could not be recorded.',
        },
      ];
    }
  };

  /** Restore generated evidence, retaining a differing local value before replacement. */
  const projectEvidence = async (
    references: ReadonlyArray<Readonly<{ name: string; head: string }>>,
    signal: AbortSignal,
  ) => {
    const ref = references.find(
      (candidate) => candidate.name === evidenceRefName || candidate.name.endsWith('/tau/evidence/exports'),
    );
    if (ref === undefined) {
      return;
    }
    const tree = await port.readTree(revisionId(ref.head));
    if (tree === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', 'The generated-export record has no tree.');
    }
    const collisions = caseCollisions(tree);
    const invalid = tree
      .entries()
      .find((entry) => !isSyncedEvidencePath(entry.path) || policy.classify(entry.path).class !== 'records');
    if (invalid !== undefined || collisions.length > 0) {
      throw new RevisionPortError(
        'UNSUPPORTED_OPERATION',
        invalid === undefined
          ? `Generated export paths collide on a supported filesystem: ${collisions.join(', ')}`
          : `Generated export record contains a reserved path: ${invalid.path}`,
      );
    }
    const records = await recordsFileSystem();
    for (const entry of tree.entries()) {
      signal.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- each record is reconciled before the next.
      const current = await entryOf(records, entry.path);
      if (equalEntry(current, entry)) {
        continue;
      }
      if (current !== undefined) {
        const conflictBase = `.tau/artifacts/sync-conflicts/${encodeURIComponent(entry.path)}.${ref.head.slice(0, 12)}`;
        let conflictPath: string | undefined;
        let attempt = 0;
        let retained: Awaited<ReturnType<typeof entryOf>>;
        while (conflictPath === undefined) {
          const candidate = attempt === 0 ? conflictBase : `${conflictBase}.${attempt}`;
          // oxlint-disable-next-line no-await-in-loop -- finds a non-colliding retention path.
          retained = tree.has(candidate) ? undefined : await entryOf(records, candidate);
          if (!tree.has(candidate) && (retained === undefined || equalEntry(retained, current))) {
            conflictPath = candidate;
          } else {
            attempt += 1;
          }
        }
        if (retained === undefined) {
          signal.throwIfAborted();
          // oxlint-disable-next-line no-await-in-loop -- preserve-before-replace is ordered deliberately.
          await records.writeFile(conflictPath, current.content);
          if (records.setFileMode !== undefined) {
            // oxlint-disable-next-line no-await-in-loop -- mode belongs to the preceding write.
            await records.setFileMode(conflictPath, current.mode);
          }
        }
      }
      signal.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- replacement follows successful retention.
      await records.writeFile(entry.path, entry.content);
      if (records.setFileMode !== undefined) {
        // oxlint-disable-next-line no-await-in-loop -- mode belongs to the preceding write.
        await records.setFileMode(entry.path, entry.mode);
      }
    }
  };

  const leasePathOf = (runId: string): string => `${leaseDirectory}/${encodeURIComponent(runId)}.json`;

  /* The project's own root: `.tau/runs` is a records row inside the project. */
  const recordsFileSystem = async (): Promise<RevisionFileSystem> => {
    const places = await listPlaces();
    const live = places.find((place) => place.kind === 'live') ?? places[0];
    if (live === undefined) {
      throw new RevisionPortError('INVALID_REPOSITORY', 'This project has no files open to record this run against.');
    }
    return filesystem(live);
  };

  const { chatContext, offerOf, outcomeOf, pushRecordRef, recordChats, refusedAll, replayRejectedChat, staysPerRef } =
    createChatEffects({
      port,
      recordsFileSystem,
      deviceId: options.deviceId,
      actor: options.actor,
      onChatsProjected: options.onChatsProjected,
      actorId,
      now,
    });

  const { readPendingQueue, writePendingQueue } = createSyncQueue({ recordsFileSystem });

  /*
   * Every lease on disk.
   *
   * Read leniently, one file at a time: a half-written or foreign record holds
   * nothing, and must never be able to fail the sweep that reads it.
   */
  const readLeases = async (): Promise<readonly TurnLease[]> => {
    const records = await recordsFileSystem();
    if (!(await records.exists(leaseDirectory))) {
      return [];
    }
    const entries = await records.readdir(leaseDirectory);
    const files = entries.filter((name) => name.endsWith('.json'));
    const leases = await Promise.all(
      files.toSorted().map(async (name): Promise<readonly TurnLease[]> => {
        try {
          const stored: unknown = JSON.parse(await records.readFile(`${leaseDirectory}/${name}`, 'utf8'));
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- validated field by field below.
          const lease = stored as Partial<TurnLease>;
          return typeof lease.runId === 'string' && typeof lease.authorityEpoch === 'string'
            ? [Object.freeze({ ...lease, runId: lease.runId, authorityEpoch: lease.authorityEpoch } as TurnLease)]
            : [];
        } catch {
          return [];
        }
      }),
    );
    return leases.flat();
  };

  /* Delete one lease. Retiring one that is already gone resolves (R17). */
  const dropLease = async (runId: string): Promise<void> => {
    const records = await recordsFileSystem();
    try {
      await records.unlink(leasePathOf(runId));
    } catch {
      /* A lease that was never written, or that another pass already retired,
       * is exactly the state the caller wanted. */
    }
  };

  /**
   * When a merged branch's checkout becomes offerable for removal (A25).
   *
   * Thirty days, and the offer is *data*: the pane shows it and a person
   * decides. Nothing is ever removed silently, and no local garbage collection
   * exists at all — Restore-by-id, chat cards and conflict evidence all reach
   * revisions that no branch names.
   */
  const removalOfferMilliseconds = 30 * 24 * 60 * 60 * 1000;

  /**
   * Which revisions the live tree's branch already contains, and when each landed.
   *
   * One walk for a whole listing: a linked checkout whose branch is inside this
   * history has nothing left of its own, which is what makes it offerable.
   *
   * ponytail: one unbounded `log` per `listCheckouts`, to compute a 30-day
   * *offer*. The bound to add when a long history costs a pane its open is the
   * oldest linked checkout's head — nothing older can change an answer.
   *
   * @returns Creation time by revision id, over everything the live branch reaches.
   */
  const mergedHistory = async (): Promise<ReadonlyMap<string, number>> => {
    const head = await port.readHead();
    if (head?.head === undefined) {
      return new Map();
    }
    const walked = await port.log({ heads: [head.head] });
    return new Map(walked.map((entry) => [entry.id, entry.provenance.createdAt]));
  };

  const recordOf = async (
    place: Checkout,
    leases: readonly TurnLease[],
    merged: ReadonlyMap<string, number> = new Map(),
  ): Promise<CheckoutRecord> => {
    const headRevisionId = await headOf(place);
    const headTreeId = await treeIdOf(headRevisionId);
    const mergedAt = headRevisionId === undefined ? undefined : merged.get(headRevisionId);
    /* One commit read: a head that records a conflict is the whole of what
     * *Needs resolution* needs to appear, on this host and after a reload. */
    const conflicted = headRevisionId === undefined ? undefined : await port.conflicts(revisionId(headRevisionId));
    return Object.freeze<CheckoutRecord>({
      id: place.id,
      projectId: place.projectId,
      root: place.root,
      kind: place.kind,
      branch: place.branch,
      ...(headRevisionId === undefined ? {} : { headRevisionId }),
      ...(headTreeId === undefined ? {} : { headTreeId }),
      leaseRunIds: leases.filter((lease) => lease.checkoutId === place.id).map((lease) => lease.runId),
      leaseChatIds: [...new Set(leases.filter((lease) => lease.checkoutId === place.id).map((lease) => lease.chatId))],
      /* Offered, never acted on: a linked checkout whose branch the live one
       * already contains, last touched more than a month ago (A25). */
      ...(place.kind === 'linked' && mergedAt !== undefined && now() - mergedAt > removalOfferMilliseconds
        ? { removable: true }
        : {}),
      ...(conflicted === undefined ? {} : { conflicted: true }),
    });
  };

  /**
   * The branch one revision is the head of, when one names it.
   *
   * A conflicted revision is *on* a branch, and every verb that finishes it has
   * to move that branch — so the name is read from the refs rather than carried
   * through a machine's context, where a branch that moved would leave it stale.
   *
   * @param revision - The revision to look for.
   * @returns The branch name, or `undefined` when no branch names it.
   */
  const branchNaming = async (revision: string): Promise<string | undefined> => {
    const references = await port.listRefs();
    return references.find((reference) => reference.head === revision)?.name;
  };

  /**
   * One conflicted revision's terms, or a named refusal.
   *
   * @param revision - The conflicted revision.
   * @returns Its three trees, labels and what did not settle.
   * @throws RevisionPortError When the revision records no conflict.
   */
  const conflictTermsOf = async (revision: string): Promise<RevisionConflictTerms> => {
    await ensureStore();
    const terms = await readConflictTerms(port, revision);
    if (terms === undefined) {
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'That revision records no conflict to resolve.');
    }
    return terms;
  };

  /**
   * Move one branch under the lease the merge read it with.
   *
   * A ref that moved while the merge ran is the one case where finishing would
   * lose someone's work, so it is refused rather than forced (D29's
   * compare-and-set, the same rule every other ref write here follows).
   *
   * @param branch - The branch to move.
   * @param expectedHead - Where it stood when the merge read it.
   * @param head - Where it must stand now.
   * @throws RevisionPortError When it moved underneath.
   */
  const publishMerge = async (branch: string, expectedHead: string | undefined, head: string): Promise<void> => {
    const published = await port.updateRef({
      name: branch,
      expectedHead: expectedHead === undefined ? undefined : revisionId(expectedHead),
      head: revisionId(head),
    });
    if (published.status === 'conflicted') {
      throw new RevisionPortError('ENGINE_FAILED', `${branch} moved while the merge was running. Try again.`);
    }
  };

  const provenanceOf = (
    trigger: CheckoutCutTrigger,
    leaseIds: readonly string[],
    turnId: string | undefined,
  ): RevisionProvenance => {
    const [only] = leaseIds;
    const actor = options.actor?.({ runId: only, trigger });
    return Object.freeze({
      source: trigger === 'turn' ? 'agent' : trigger === 'restore' ? 'restore' : trigger === 'merge' ? 'merge' : 'user',
      /* One id, not two: `actorId` *is* the actor's id whenever the host could
       * resolve one, so nothing has to decide which of the pair to believe. */
      actorId: actor?.id ?? actorId,
      /* The head of the set is the run that minted (`writeLease` puts its own
       * run first), and that attribution is what a card shows today. Dropping it
       * when a second chat holds the same checkout would lose attribution in
       * exactly AC9's scenario. */
      ...(only === undefined ? {} : { runId: only }),
      /* The turn a card hangs under, durable on the revision itself: the graph
       * is the only record a reload has, on every host (I3, S10). */
      ...(turnId === undefined ? {} : { turnId }),
      /* S37: who, in the shape stock `git log` renders, and what asked (S30). */
      ...(actor === undefined ? {} : { actor }),
      trigger,
      createdAt: now(),
    });
  };

  type MergeBranchesInput = Readonly<{
    branch: string;
    into: string;
    conflictBranch?: string;
    sourceLabel?: string;
  }>;

  /** Compose one branch into another, recording conflicts on the source side. */
  const mergeBranches = async (input: MergeBranchesInput): Promise<BranchMergeActorOutput> => {
    await ensureStore();
    if (input.into === '' || input.into === input.branch) {
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'A branch cannot be merged into itself.');
    }
    const theirs = await port.readRef(input.branch);
    const sourceLabel = input.sourceLabel ?? input.branch;
    if (theirs === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', `${sourceLabel} has no revision yet.`);
    }
    const ours = await port.readRef(input.into);
    const places = await listPlaces();
    const target = places.find((place) => place.branch === input.into) ?? places.find((place) => place.kind === 'live');
    if (target === undefined) {
      throw new RevisionPortError('UNSUPPORTED_OPERATION', 'This project has no files open to merge into.');
    }
    const live = await captureFresh(target);
    const headTreeId = await treeIdOf(await headOf(target));
    if (headTreeId !== revisionTreeId(await recordedTree(live), await formatOf())) {
      throw new RevisionPortError(
        'UNSUPPORTED_OPERATION',
        'The files you have open have changes that are not in a revision yet. Save a revision before merging.',
      );
    }
    const validateTarget = async (current: ImmutableRevisionTree): Promise<void> => {
      const currentTreeId = revisionTreeId(await recordedTree(current), await formatOf());
      if (currentTreeId !== headTreeId) {
        throw new RevisionPortError(
          'CHECKOUT_CONFLICT',
          'The files you have open changed while the merge was being prepared. Save a revision and try again.',
        );
      }
    };

    const base =
      ours === undefined
        ? undefined
        : mergeBaseOf(await port.log({ heads: mergeBaseHeads(ours, theirs) }), ours, theirs);
    if (base === theirs) {
      return { status: 'merged', revisionId: ours ?? theirs };
    }
    if (ours === undefined || base === ours) {
      const fastForward = await port.readTree(theirs);
      if (fastForward === undefined) {
        throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for ${sourceLabel}.`);
      }
      await materializeTree(target, fastForward, {
        validate: validateTarget,
        publish: async () => publishMerge(input.into, ours, theirs),
      });
      return { status: 'merged', revisionId: theirs };
    }

    const [baseTree, oursTree, theirsTree] = await Promise.all([
      base === undefined ? new ImmutableRevisionTree([]) : port.readTree(base),
      port.readTree(ours),
      port.readTree(theirs),
    ]);
    if (baseTree === undefined || oursTree === undefined || theirsTree === undefined) {
      throw new RevisionPortError('UNKNOWN_REVISION', 'This project no longer holds both sides of that merge.');
    }
    const merged = mergeRevisionTrees(baseTree, oursTree, theirsTree);
    if (merged.status === 'conflicted') {
      const paths = merged.conflicts.map((conflict) => conflict.path);
      const conflictBranch = input.conflictBranch ?? input.branch;
      const previousConflictHead = conflictBranch === input.branch ? theirs : await port.readRef(conflictBranch);
      /* D55: a pull that runs again while this conflict waits (Sync now, a
       * reconnect) finds the same two sides. The waiting revision already
       * records them, and writing another would move the card to a new
       * revision and drop every side the person had already chosen. */
      if (previousConflictHead !== undefined && previousConflictHead !== theirs) {
        const recent = await port.log({ heads: [previousConflictHead], limit: 3 });
        const waiting = recent.find((entry) => entry.id === previousConflictHead);
        if (waiting?.conflicted === true && waiting.parents.join(',') === [theirs, ours].join(',')) {
          return { status: 'conflicted', paths };
        }
      }
      const [oursTreeId, baseTreeId, theirsTreeId] = await Promise.all([
        treeIdOf(ours),
        treeIdOf(base),
        treeIdOf(theirs),
      ]);
      const receipt = await port.writeRevision({
        parents: [theirs, ours],
        tree: theirsTree,
        provenance: provenanceOf('merge', [], undefined),
        summary: Object.freeze({ generated: `Merging ${sourceLabel} into ${input.into} needs resolution` }),
        conflict: {
          trees: [oursTreeId ?? '', baseTreeId ?? '', theirsTreeId ?? ''],
          labels: conflictLabels({ ours: input.into, theirs: sourceLabel }),
        },
      });
      const conflictRevision = revisionId(receipt.commitId);
      await publishMerge(conflictBranch, previousConflictHead, conflictRevision);
      const descriptor = await describePort();
      /* D55: a conflict that moved on (either side has a new revision) keeps
       * the checkout the earlier one opened; a second `addCheckout` for the
       * same branch is refused, and the pull failed on it every retry. */
      const waitingPlace = places.find((place) => place.branch === conflictBranch);
      if (conflictBranch !== input.branch && waitingPlace !== undefined) {
        await materializeTree(waitingPlace, theirsTree);
      } else if (conflictBranch !== input.branch && port.addCheckout !== undefined && descriptor.checkouts) {
        await port.addCheckout({ branch: conflictBranch, from: conflictRevision });
      }
      return { status: 'conflicted', paths };
    }

    const receipt = await port.writeRevision({
      parents: [ours, theirs],
      tree: merged.tree,
      provenance: provenanceOf('merge', [], undefined),
      summary: Object.freeze({ generated: `Merged ${sourceLabel} into ${input.into}` }),
    });
    await materializeTree(target, merged.tree, {
      validate: validateTarget,
      publish: async () => publishMerge(input.into, ours, revisionId(receipt.commitId)),
    });
    return { status: 'merged', revisionId: receipt.commitId };
  };

  return {
    settled,
    checkout: {
      cut: fromAuthorityPromise<CheckoutCutActorOutput, CheckoutCutActorInput>(async ({ input }) => {
        const place = await placeOf(input.checkoutId);
        const tree = await capture(place);
        const treeId = revisionTreeId(await recordedTree(tree), await formatOf());
        return { treeId, cutId: cuts.put(input.checkoutId, { tree, treeId }) };
      }),

      writeRevision: fromAuthorityPromise<Readonly<{ revisionId: string }>, CheckoutWriteRevisionActorInput>(
        async ({ input }) => {
          const held = cuts.take(input.cutId);
          /*
           * A request that names no lease is not a request made in a vacuum.
           *
           * A `save`, an `idle` mint, and a turn's dirty-base pre-mint (whose
           * own lease is not written yet) all absorb whatever the chats holding
           * this checkout had in flight. Recording the leases that were held is
           * what keeps the History row truthful with two chats on one checkout
           * (AC9) instead of crediting a person for an agent's bytes.
           */
          const heldLeases: readonly TurnLease[] = input.leaseIds.length > 0 ? [] : await readLeases();
          const leaseIds =
            input.leaseIds.length > 0
              ? input.leaseIds
              : heldLeases.filter((lease) => lease.checkoutId === input.checkoutId).map((lease) => lease.runId);
          const receipt = await port.writeRevision({
            parents: input.parents.map((parent) => revisionId(parent)),
            tree: held.tree,
            provenance: provenanceOf(input.trigger, leaseIds, input.turnId),
            summary: Object.freeze({
              generated: input.turnId === undefined ? `Saved changes (${input.trigger})` : `Agent turn ${input.turnId}`,
            }),
          });
          /* The claim {@link revisionTreeId} makes, checked where it is cheap:
           * a tree id this host computed differently from the engine's would
           * hold the I5 gate open forever and mint an identical revision per
           * turn, silently. */
          const recorded = await treeIdOf(receipt.commitId);
          if (recorded !== input.treeId) {
            throw new RevisionPortError(
              'ENGINE_FAILED',
              `The store recorded tree ${String(recorded)} for a cut computed as ${input.treeId}.`,
            );
          }
          return { revisionId: receipt.commitId };
        },
      ),

      casHead: fromAuthorityPromise<CheckoutCasHeadActorOutput, CheckoutCasHeadActorInput>(async ({ input }) => {
        /* A detached checkout names no branch, so there is nothing to publish:
         * the revision is recorded and reachable by id (A2). */
        if (input.branch === undefined) {
          return { status: 'updated', head: input.head };
        }
        const result = await port.updateRef({
          name: input.branch,
          expectedHead: input.expectedHead === undefined ? undefined : revisionId(input.expectedHead),
          head: revisionId(input.head),
        });
        return result.status === 'updated'
          ? { status: 'updated', head: result.head }
          : { status: 'conflicted', head: result.actualHead };
      }),

      readHead: fromAuthorityPromise<CheckoutHead, CheckoutFenceActorInput>(async ({ input }) => {
        const place = await placeOf(input.checkoutId);
        const head = await headOf(place);
        return { revisionId: head, treeId: await treeIdOf(head) };
      }),

      /*
       * Node has no cross-process live-tree lock, and does not need one: the
       * expected-old ref update inside `casHead` is the fence two processes
       * actually meet at (I7). This one serializes the mints of one checkout
       * inside this process, which is what keeps two chats from cutting the
       * same tree at once. The browser's is a Web Lock (W3d).
       */
      fence: createCallbackLogic<AnyEventObject, CheckoutFenceActorInput>(({ input, sendBack }) => {
        let live = true;
        const fence = acquireCheckoutFence(input.checkoutId);
        const grant = async (): Promise<void> => {
          await fence.granted;
          if (live) {
            sendBack({ type: 'fenceGranted' });
          }
        };
        // async-iife: bootstrap -- the fence grants when its turn in the queue comes; the actor's cleanup ends it.
        void grant();
        return (): void => {
          live = false;
          fence.release();
        };
      }),
    },

    turn: {
      prepare: fromAuthorityPromise<TurnPrepareActorOutput, TurnPrepareActorInput>(async ({ input }) => {
        const { turnId, chatId, runId } = input;
        try {
          await ensureStore();
          const places = await listPlaces();
          const place =
            input.checkoutId === undefined
              ? (places.find((candidate) => candidate.kind === 'live') ?? places[0])
              : places.find((candidate) => candidate.id === input.checkoutId);
          /* Placement never branches (D7/I18): a chat attaches to the checkout
           * it names or to the live one, and a name that matches nothing is a
           * refusal, not a new branch. */
          if (place === undefined) {
            throw new RevisionPortError(
              'CHECKOUT_CONFLICT',
              'That chat is working in files this project does not have open.',
            );
          }
          const storedHead = await port.readHead();
          const branch = place.branch ?? storedHead?.branch ?? mainBranch;
          const baseRevisionId = await headOf(place);
          const headTreeId = await treeIdOf(baseRevisionId);
          /* A dirty base costs a second capture, since `checkout.cut` takes its
           * own — ponytail: reusing this one needs an invalidation the seam does
           * not have yet, and `changed` is the upgrade path (W6). */
          const tree = await capture(place);
          const format = await formatOf();
          const dirty =
            headTreeId === undefined ? tree.size > 0 : headTreeId !== revisionTreeId(await recordedTree(tree), format);
          const leases = await readLeases();
          const staleRunIds = leases
            .filter((lease) => lease.authorityEpoch !== authorityEpoch)
            .map((lease) => lease.runId);
          options.onPlacement?.({ turnId, chatId, runId, status: 'placed', checkout: place, baseRevisionId });
          return { checkoutId: place.id, branch, baseRevisionId, dirty, staleRunIds };
        } catch (error) {
          /* A turn a host could not place is refused, never run unrecorded
           * (I-EDIT); the host learns here, because a `turn` that never
           * prepared raises nothing else it can see. */
          options.onPlacement?.({
            turnId,
            chatId,
            runId,
            status: 'refused',
            reason: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }),

      writeLease: fromAuthorityPromise<Readonly<{ leaseIds: readonly string[] }>, TurnWriteLeaseActorInput>(
        async ({ input }) =>
          withCheckoutFence(input.checkoutId, async () => {
            const records = await recordsFileSystem();
            const lease: TurnLease = Object.freeze({
              runId: input.runId,
              turnId: input.turnId,
              chatId: input.chatId,
              checkoutId: input.checkoutId,
              ...(input.baseRevisionId === undefined ? {} : { baseRevisionId: input.baseRevisionId }),
              authorityEpoch,
              startedAt: now(),
            });
            await records.writeFile(leasePathOf(input.runId), `${JSON.stringify(lease, undefined, 2)}\n`);
            /* Every lease on this checkout, this turn's included and first: the
             * provenance set (AC9), never a retirement list. The order carries
             * the attribution — `provenanceOf` records the head of the set as the
             * run that minted, and a directory read has no order of its own. */
            const leases = await readLeases();
            const held = leases
              .filter((lease) => lease.checkoutId === input.checkoutId)
              .map((lease) => lease.runId)
              .filter((runId) => runId !== input.runId);
            return { leaseIds: [input.runId, ...held] };
          }),
      ),

      retireLease: fromAuthorityPromise<void, TurnRetireLeaseActorInput>(async ({ input }) => {
        await dropLease(input.runId);
      }),

      capture: fromAuthorityPromise<Readonly<{ captureId: string }>, TurnCaptureActorInput>(async ({ input }) => ({
        captureId: captures.put(input.turnId, await capture(await placeOf(input.checkoutId))),
      })),

      merge: fromAuthorityPromise<
        TurnMergeActorOutput,
        Readonly<{ checkoutId: string; captureId: string; baseRevisionId: string | undefined }>
      >(async ({ input }) => {
        const agent = captures.take(input.captureId);
        const place = await placeOf(input.checkoutId);
        const base =
          input.baseRevisionId === undefined
            ? new ImmutableRevisionTree([])
            : ((await port.readTree(revisionId(input.baseRevisionId))) ?? new ImmutableRevisionTree([]));
        /* One walk of the live tree for the whole settlement (CI4): the merge's
         * third side and the apply's `from` are the same capture, taken inside
         * the fence that the apply will run under — so there is no window left
         * between them for a second mint to change what was merged. */
        return withCheckoutFence(place.id, async () => {
          const live = await capture(place);
          /* A file where the other side has a directory used to throw out of here
           * (W3a re-review); it is a typed `file-directory` conflict now, so a
           * conflicted turn is one return rather than an exception (W10). */
          const merged = mergeRevisionTrees(base, live, agent);
          if (merged.status === 'conflicted') {
            return { status: 'conflicted' };
          }
          await materializeTree(place, merged.tree, { before: live });
          return { status: 'recorded' };
        });
      }),

      /*
       * Leases are plural (S6, AC9): two chats hold one checkout at the same
       * time, so this grants on sight. The record is `.tau/runs/<runId>.json`
       * and the only exclusion in the system is the mint fence above.
       */
      lease: createCallbackLogic<AnyEventObject, TurnLeaseActorInput>(({ input, sendBack }) => {
        options.onPlacement?.({ runId: input.runId, status: 'leased', checkoutId: input.checkoutId });
        sendBack({ type: 'leaseGranted' });
        return (): void => undefined;
      }),
    },

    restore: {
      computePlan: fromAuthorityPromise<RestoreComputePlanActorOutput, RestoreComputePlanActorInput>(
        async ({ input }) => {
          await ensureStore();
          const place = await placeOf(input.checkoutId);
          const head = await headOf(place);
          const target = input.target === latestRevisionTarget ? head : input.target;
          if (target === undefined) {
            throw new RevisionPortError('UNKNOWN_REVISION', 'There is no revision to return these files to.');
          }
          const tree = await port.readTree(revisionId(target));
          if (tree === undefined) {
            throw new RevisionPortError('UNKNOWN_REVISION', `No recorded revision to restore: ${target}`);
          }
          const live = await captureFresh(place);
          const headTree = head === undefined ? undefined : await port.readTree(revisionId(head));
          const removed = live.entries().filter(({ path }) => !tree.has(path));
          const graph = await port.log();
          const position = graph.findIndex((entry) => entry.id === target);
          const headTreeId = await treeIdOf(head);
          return {
            planId: plans.put(input.checkoutId, { checkoutId: input.checkoutId, revisionId: target, tree }),
            revisionId: target,
            /* `Rev N` is the ordinal in the recorded order, oldest first (I3). */
            revisionNumber: position === -1 ? graph.length : graph.length - position,
            removedPathCount: removed.length,
            dirty: headTreeId !== revisionTreeId(await recordedTree(live), await formatOf()),
            /* A path this restore deletes that no revision on the way here holds
             * cannot be brought back by another restore. */
            unrecoverable: removed.filter(({ path }) => headTree?.has(path) !== true).map(({ path }) => path),
          };
        },
      ),

      applyPlan: fromAuthorityPromise<RestoreApplyPlanActorOutput, Readonly<{ checkoutId: string; planId: string }>>(
        async ({ input }) => {
          const plan = plans.take(input.planId);
          const place = await placeOf(plan.checkoutId);
          /* The checkout tracks the restored revision's branch, or nothing when
           * no branch names it — detached (A2). */
          const references = await port.listRefs();
          const branch = references.find((reference) => reference.head === plan.revisionId)?.name;
          await materializeTree(place, plan.tree, {
            publish: branch !== undefined && place.kind === 'live' ? async () => port.setHead(branch) : undefined,
          });
          const treeId = await treeIdOf(plan.revisionId);
          return { revisionId: plan.revisionId, treeId: treeId ?? '', branch };
        },
      ),
    },

    checkouts: {
      listCheckouts: fromAuthorityPromise<ListCheckoutsActorOutput, Readonly<{ projectId: string }>>(async () => {
        await ensureStore();
        const leases = await readLeases();
        const places = await listPlaces();
        const merged = await mergedHistory();
        return { checkouts: await Promise.all(places.map(async (place) => recordOf(place, leases, merged))) };
      }),

      addCheckout: fromAuthorityPromise<
        AddCheckoutActorOutput,
        Readonly<{ projectId: string; branch: string; from: string }>
      >(async ({ input }) => {
        if (port.addCheckout === undefined) {
          throw new RevisionPortError('UNSUPPORTED_OPERATION', 'This project cannot open another set of files.');
        }
        const added = await port.addCheckout({
          branch: input.branch,
          ...(input.from === '' ? {} : { from: revisionId(input.from) }),
        });
        return { checkout: await recordOf(added, await readLeases()) };
      }),

      /* Discard is gated on the tree equalling its head (A25, S36): a checkout
       * with work in it that no revision holds is the one thing removal can
       * destroy, so the answer is "save a revision first" rather than a
       * confirmation dialog nobody reads. */
      removeCheckout: fromAuthorityPromise<void, Readonly<{ projectId: string; id: string }>>(async ({ input }) => {
        if (port.removeCheckout === undefined) {
          throw new RevisionPortError('UNSUPPORTED_OPERATION', 'This project has no open files to close.');
        }
        const place = await placeOf(input.id);
        const headTreeId = await treeIdOf(await headOf(place));
        if (headTreeId !== revisionTreeId(await recordedTree(await captureFresh(place)), await formatOf())) {
          throw new RevisionPortError(
            'CHECKOUT_CONFLICT',
            'This branch has changes that are not in a revision yet. Save a revision before discarding it.',
          );
        }
        await port.removeCheckout(input.id);
        /* The bytes a closed checkout's captures could reuse describe a tree
         * this process can no longer reach (EQ7). */
        captureMemos.delete(input.id);
        swept.delete(input.id);
      }),

      /* F13: a lease from a superseded epoch belongs to a process that no longer
       * owns this project — a crashed daemon, a previous window — and is retired
       * on open. A live turn is never rehydrated from one. */
      sweepLeases: fromAuthorityPromise<SweepLeasesActorOutput, Readonly<{ projectId: string }>>(async () => {
        const leases = await readLeases();
        const stale = leases.filter((lease) => lease.authorityEpoch !== authorityEpoch);
        await Promise.all(stale.map(async (lease) => dropLease(lease.runId)));
        return { retiredRunIds: stale.map((lease) => lease.runId) };
      }),

      retireLease: fromAuthorityPromise<void, Readonly<{ projectId: string; runId: string }>>(async ({ input }) => {
        await dropLease(input.runId);
      }),
    },

    /*
     * The branch verbs (S42, W7). `create` and `discard` are not here: they are
     * the checkout registry's `addCheckout`/`removeCheckout`, which
     * `branch.machine` asks for through its parent so the registry stays the one
     * writer of those records.
     */
    branch: {
      /* D10, answered where the trees are. *Switch* into a branch that already
       * has a checkout re-roots and asks nothing; into one that does not, the
       * live tree is rewritten — so it asks exactly when that would throw away
       * work no revision holds (A25). */
      checkBranch: fromAuthorityPromise<BranchCheckActorOutput, BranchCheckActorInput>(async ({ input }) => {
        await ensureStore();
        if (input.operation !== 'switch') {
          return { needsConfirmation: false };
        }
        const places = await listPlaces();
        const linked = places.find((place) => place.branch === input.branch && place.kind === 'linked');
        if (linked !== undefined) {
          return { needsConfirmation: false, checkoutId: linked.id, mode: 'reroot' };
        }
        const live = places.find((place) => place.kind === 'live');
        if (live === undefined) {
          return { needsConfirmation: false };
        }
        const headTreeId = await treeIdOf(await headOf(live));
        const dirty = headTreeId !== revisionTreeId(await recordedTree(await captureFresh(live)), await formatOf());
        return dirty
          ? {
              needsConfirmation: true,
              question: 'The files you have open have changes that are not in a revision yet. Moving replaces them.',
              checkoutId: live.id,
              mode: 'applyToLive',
            }
          : { needsConfirmation: false, checkoutId: live.id, mode: 'applyToLive' };
      }),

      /* Apply-to-live: the *other* half of one verb a person never
       * distinguishes (D10). The tree the branch names replaces the working
       * copy and the live head follows the branch — the same two writes
       * `restore` makes, through the same `applyTree`, so one checkout has one
       * way of being rewritten (I20). */
      applySwitch: fromAuthorityPromise<
        BranchApplySwitchActorOutput,
        Readonly<{ projectId: string; branch: string; checkoutId: string | undefined }>
      >(async ({ input }) => {
        await ensureStore();
        const places = await listPlaces();
        const place =
          input.checkoutId === undefined
            ? places.find((candidate) => candidate.kind === 'live')
            : await placeOf(input.checkoutId);
        if (place === undefined) {
          throw new RevisionPortError('UNSUPPORTED_OPERATION', 'This project has no files open to move.');
        }
        const head = await port.readRef(input.branch);
        if (head === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', `${input.branch} has no revision yet.`);
        }
        const tree = await port.readTree(head);
        if (tree === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for ${input.branch}.`);
        }
        await materializeTree(place, tree, {
          publish: place.kind === 'live' ? async () => port.setHead(input.branch) : undefined,
        });
        return {
          checkoutId: place.id,
          revisionId: head,
          treeId: (await treeIdOf(head)) ?? '',
          branch: input.branch,
        };
      }),

      /*
       * *Merge into `<current>`* — the verb that was unrendered until W10,
       * because composing two lines needs a merge base and nothing in the tree
       * computed one (W7-a2 report).
       *
       * Three outcomes, and only one of them writes a file: already-merged and
       * fast-forward move a ref (and the working copy, for the latter); a real
       * three-way merge that settles records a merge revision; one that does
       * not settle mints a **conflicted revision on the source branch** and
       * touches neither `<current>` nor its checkout (A22, AC14). The conflict
       * terms travel in `jj:trees`, so the graph alone says what collided.
       */
      merge: fromAuthorityPromise<
        BranchMergeActorOutput,
        Readonly<{ projectId: string; branch: string; into: string }>
      >(async ({ input }) => mergeBranches(input)),
      /* A rename is two ref writes, in the order that cannot lose the head: the
       * new name is born first, and only a ref that still points where we read
       * it is removed (D29's compare-and-set). */
      rename: fromAuthorityPromise<
        BranchRenameActorOutput,
        Readonly<{ projectId: string; branch: string; name: string }>
      >(async ({ input }) => {
        await ensureStore();
        const head = await port.readRef(input.branch);
        if (head === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', `${input.branch} has no revision yet.`);
        }
        const taken = await port.readRef(input.name);
        if (taken !== undefined) {
          throw new RevisionPortError('CHECKOUT_CONFLICT', `${input.name} is already a branch of this project.`);
        }
        const created = await port.updateRef({ name: input.name, expectedHead: undefined, head });
        if (created.status !== 'updated') {
          throw new RevisionPortError('CHECKOUT_CONFLICT', `${input.name} was created while the branch was renamed.`);
        }
        const live = await port.readHead();
        if (live?.branch === input.branch) {
          await port.setHead(input.name);
        }
        const removed = await port.updateRef({ name: input.branch, expectedHead: head });
        if (removed.status !== 'updated') {
          throw new RevisionPortError('CHECKOUT_CONFLICT', `${input.branch} moved while the branch was renamed.`);
        }
        return { branch: input.name };
      }),
    },

    /*
     * Resolving one conflicted revision (S33, W10).
     *
     * Everything a person chooses is a *choice*, held here by revision and path
     * until `finishMerge` composes the tree — so no checkout ever holds marker
     * bytes and the conflicted revision stays exactly what the merge recorded
     * (A22, AC14).
     */
    resolution: {
      loadConflict: fromAuthorityPromise<ResolutionLoadActorOutput, ResolutionLoadActorInput>(async ({ input }) => {
        const terms = await conflictTermsOf(input.revisionId);
        const references = await port.listRefs();
        const branch = references.find((reference) => reference.head === input.revisionId)?.name;
        /* A conflicted revision no branch names any more is finished or
           abandoned, so the sides chosen for it are dead. `finishMerge` drops
           its own; this drops the ones nobody ever finished (review R12). */
        const named = new Set<string>(references.map((reference) => reference.head));
        for (const key of resolutions.keys()) {
          if (!named.has(key)) {
            resolutions.delete(key);
          }
        }
        const places = await listPlaces();
        return {
          branch,
          labels: terms.labels,
          paths: terms.conflicts.map((conflict) => ({
            path: conflict.path,
            /* *Open in editor* only where there is text to edit: a binary or
             * parametric file and a file-versus-directory collision are
             * choose-one (A22, canvas "Conflicts"). */
            openable:
              conflict.type !== 'file-directory' &&
              renderConflictMarkers({
                base: terms.base.get(conflict.path),
                ours: terms.ours.get(conflict.path),
                theirs: terms.theirs.get(conflict.path),
                labels: terms.labels,
              }) !== undefined,
          })),
          checkoutId: branch === undefined ? undefined : places.find((place) => place.branch === branch)?.id,
        };
      }),

      materialize: fromAuthorityPromise<
        ResolutionMaterializeActorOutput,
        Readonly<{ projectId: string; revisionId: string; path: string }>
      >(async ({ input }) => {
        await ensureStore();
        /* One read of the terms answers both questions a person can ask of a
           conflicted file: what the markers say, and what each side says on its
           own (*Compare* — A27, D19). */
        const terms = await conflictTermsOf(input.revisionId);
        const decoder = new TextDecoder();
        return {
          path: input.path,
          text: await materializeConflict(port, input),
          ours: decoder.decode(terms.ours.get(input.path)),
          theirs: decoder.decode(terms.theirs.get(input.path)),
        };
      }),

      applyResolution: fromAuthorityPromise<void, ResolutionApplyActorInput>(async ({ input }) => {
        const terms = await conflictTermsOf(input.revisionId);
        const conflict = terms.conflicts.find((entry) => entry.path === input.path);
        if (conflict === undefined) {
          throw new RevisionPortError('UNSUPPORTED_OPERATION', `${input.path} is not one of this conflict's files.`);
        }
        if (input.side === 'editor') {
          if (input.content === undefined) {
            throw new RevisionPortError('UNSUPPORTED_OPERATION', `No resolved text arrived for ${input.path}.`);
          }
          if (conflict.type === 'file-directory') {
            throw new RevisionPortError(
              'UNSUPPORTED_OPERATION',
              `${input.path} is a file on one side and a folder on the other. Keep one side.`,
            );
          }
        }
        const chosen = resolutions.get(input.revisionId) ?? new Map<string, ChosenSide>();
        chosen.set(input.path, {
          side: input.side,
          ...(input.content === undefined ? {} : { content: textEncoder.encode(input.content) }),
        });
        resolutions.set(input.revisionId, chosen);
      }),

      finishMerge: fromAuthorityPromise<
        ResolutionFinishActorOutput,
        Readonly<{ projectId: string; revisionId: string }>
      >(async ({ input }) => {
        const terms = await conflictTermsOf(input.revisionId);
        const chosen = resolutions.get(input.revisionId) ?? new Map<string, ChosenSide>();
        const entries = new Map(
          terms.merged
            .entries()
            .map((entry) => [entry.path, [entry.path, entry.content, entry.mode] as RevisionTreeInput]),
        );
        for (const conflict of terms.conflicts) {
          const choice = chosen.get(conflict.path);
          if (choice === undefined) {
            throw new RevisionPortError('UNSUPPORTED_OPERATION', `Choose a side for ${conflict.path} first.`);
          }
          if (choice.side === 'editor' && choice.content !== undefined) {
            entries.set(conflict.path, [conflict.path, choice.content, terms.ours.mode(conflict.path) ?? '100644']);
            continue;
          }
          const side = choice.side === 'mine' ? terms.ours : terms.theirs;
          if (conflict.type === 'file-directory') {
            /* The chosen *shape* wins: either the file at that path, or every
             * path that side holds under it. The two can never both be in one
             * tree, which is what made this a conflict. */
            for (const entry of side.entries()) {
              if (entry.path === conflict.path || entry.path.startsWith(`${conflict.path}/`)) {
                entries.set(entry.path, [entry.path, entry.content, entry.mode]);
              }
            }
            continue;
          }
          const bytes = side.get(conflict.path);
          if (bytes === undefined) {
            /* That side deleted it, which is a resolution like any other. */
            entries.delete(conflict.path);
          } else {
            entries.set(conflict.path, [conflict.path, bytes, side.mode(conflict.path) ?? '100644']);
          }
        }

        /* D58: a conflict no branch names any more was superseded — resolving
         * it would move nothing, and answering success left *Merge into* inert. */
        const branch = await branchNaming(input.revisionId);
        if (branch === undefined) {
          throw new RevisionPortError(
            'UNKNOWN_REVISION',
            'This conflict changed since it was opened. Reload the project to see the current one.',
          );
        }
        const receipt = await port.writeRevision({
          parents: [revisionId(input.revisionId)],
          tree: new ImmutableRevisionTree(entries.values()),
          provenance: provenanceOf('merge', [], undefined),
          summary: Object.freeze({
            generated: `Resolved ${String(terms.conflicts.length)} ${terms.conflicts.length === 1 ? 'file' : 'files'} between ${terms.labels.ours} and ${terms.labels.theirs}`,
          }),
        });
        const places = await listPlaces();
        const place = places.find((candidate) => candidate.branch === branch);
        if (place === undefined) {
          await publishMerge(branch, input.revisionId, receipt.commitId);
        } else {
          const tree = await port.readTree(revisionId(receipt.commitId));
          if (tree === undefined) {
            throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for ${receipt.commitId}.`);
          }
          await materializeTree(place, tree, {
            publish: async () => publishMerge(branch, input.revisionId, receipt.commitId),
          });
        }
        resolutions.delete(input.revisionId);
        return { revisionId: receipt.commitId, branch };
      }),

      seedTurn: fromAuthorityPromise<
        ResolutionSeedTurnActorOutput,
        Readonly<{ projectId: string; revisionId: string }>
      >(async ({ input }) => {
        const terms = await conflictTermsOf(input.revisionId);
        const branch = await branchNaming(input.revisionId);
        const places = await listPlaces();
        return {
          checkoutId: branch === undefined ? undefined : places.find((place) => place.branch === branch)?.id,
          paths: terms.conflicts.map((conflict) => conflict.path),
        };
      }),
    },

    remote: {
      /* Git's own remotes list is the record (D29). One remote is exposed; the
       * list can hold several and a later program can show them (A23). */
      readRemote: fromAuthorityPromise<RemoteReadActorOutput, Readonly<{ projectId: string }>>(async () => {
        await ensureStore();
        const [remote] = await port.listRemotes();
        return { remote };
      }),

      writeRemote: fromAuthorityPromise<RemoteWriteActorOutput, RemoteWriteActorInput>(async ({ input }) => {
        await ensureStore();
        /* A GitHub destination gets an identity-stable remote name. If it is
         * replaced while an old request is settling, that request can only
         * finish against (or fail with) the retired name; it can never resolve
         * `origin` again and be redirected into the new repository. */
        const name =
          input.kind === 'tau'
            ? tauRemoteName
            : input.provider === 'github' && input.repositoryId !== undefined
              ? `github-${input.repositoryId}`
              : 'origin';
        const url = input.url ?? (input.kind === 'tau' ? options.remoteUrl?.(input.projectId) : undefined);
        if (url === undefined) {
          throw new RevisionPortError(
            'INVALID_TRANSPORT',
            'This host does not know where this project’s Tau Cloud repository is.',
          );
        }
        const [current] = await port.listRemotes();
        if (
          current !== undefined &&
          (current.name !== name ||
            current.url !== url ||
            current.provider !== input.provider ||
            current.repositoryId !== input.repositoryId)
        ) {
          await port.removeRemote(current.name);
        }
        await port.setRemote({
          name,
          url,
          ...(input.provider === undefined ? {} : { provider: input.provider }),
          ...(input.repositoryId === undefined ? {} : { repositoryId: input.repositoryId }),
          ...(input.fetchOnly === true ? { fetchOnly: true } : {}),
        });
        return {
          remote: remoteOf(name, url, {
            ...(input.provider === undefined ? {} : { provider: input.provider }),
            ...(input.repositoryId === undefined ? {} : { repositoryId: input.repositoryId }),
            ...(input.fetchOnly === true ? { fetchOnly: true } : {}),
          }),
        };
      }),

      /*
       * Disconnecting is a config edit and nothing else (C12).
       *
       * It used to also delete every `refs/remotes/<name>/*` and empty the
       * durable queue, so a disconnect silently discarded work that had never
       * reached any remote — `Not backed up · n` simply vanished — and threw
       * away the leases a reconnect compares against. Policy Rule 9 wants the
       * old destination's queue *paused*, and `SyncQueueEntry.remote` is what
       * makes pausing safe: an entry names who it is owed to, so no other
       * remote is ever offered it.
       */
      removeRemote: fromAuthorityPromise<void, Readonly<{ name: string }>>(async ({ input }) => {
        await ensureStore();
        await port.removeRemote(input.name);
      }),

      /* I8: no *credential* work for Tau Cloud — the credential is the session,
       * and the `HttpClient` sets the header from it at request time. What Tau
       * Cloud does need is the project to exist on it (P51): connecting is the
       * verb that registers it, and it runs here, before `validating` asks the
       * remote for an advertisement it would otherwise answer `404`.
       *
       * W12 replaces this actor for a GitHub remote, where consent is a popup. */
      authorize: fromAuthorityPromise<void, RemoteAuthorizeActorInput>(async ({ input }) => {
        if (input.kind === 'tau') {
          await options.registerRemoteProject?.(projectId);
        }
      }),

      /* The cheapest question that proves a remote is really there: what refs
       * does it advertise. No object is fetched. */
      validate: fromAuthorityPromise<RemoteValidateActorOutput, RemoteValidateActorInput>(async ({ input }) => {
        await port.listRemoteRefs(input.remote);
        const storage = await options.remoteStorage?.(input.remote);
        return storage === undefined ? {} : { storage };
      }),

      /*
       * Once, at connect time: bring the remote's graph in, then offer this
       * project's branch. Everything after this is `sync.machine`'s debounce.
       */
      initialSync: fromAuthorityPromise<RemoteInitialSyncActorOutput, RemoteInitialSyncActorInput>(
        async ({ input }) => {
          await port.fetch({ remote: input.remote });
          const remotes = await port.listRemotes();
          const configured = remotes.find((remote) => remote.name === input.remote);
          if (configured?.fetchOnly === true) {
            return {};
          }
          const active = await port.readHead();
          const branch = active?.branch ?? input.branch;
          const head = await port.readRef(branch);
          if (head === undefined) {
            /* A project whose branch is unborn has nothing to back up yet; the
             * first revision pushes on its own debounce. */
            return {};
          }
          const result = await (async () => {
            try {
              /* No lease on the first sync: nothing is being rewritten, so the
               * remote's own fast-forward rule is the right refusal. W13's pushes
               * carry `expected` (A32). */
              return await port.push({
                remote: input.remote,
                refs: [{ name: `refs/heads/${branch}` }],
                atomic: true,
              });
            } catch (error) {
              /* Storage is the one refusal that is not a failed connection: the
               * person keeps the remote and gets the file list (D16, P19). The
               * machine turns this into `quotaRefused`; W13 forwards the same
               * error from its own pushes. */
              if (error instanceof LfsQuotaError) {
                return error.refusal;
              }
              throw error;
            }
          })();
          if ('paths' in result) {
            /* The numbers the server sent travel with the file list (C13): they
             * are what a storage meter can render, and they used to be parsed
             * here and dropped one line later. */
            const storage = {
              ...(result.remainingBytes === undefined ? {} : { remainingBytes: result.remainingBytes }),
              ...(result.shortfallBytes === undefined ? {} : { shortfallBytes: result.shortfallBytes }),
            };
            return {
              overQuota: result.paths,
              message: result.message,
              ...(Object.keys(storage).length === 0 ? {} : { storage }),
            };
          }
          const refused = result.refs.find((entry) => entry.status === 'rejected');
          if (refused !== undefined) {
            throw new RevisionPortError(
              'INVALID_TRANSPORT',
              `The remote refused ${refused.name}: ${refused.reason ?? 'no reason given'}`,
            );
          }
          return {};
        },
      ),
    },

    publish: {
      /* The names a project already has, the revision about to get one, and the
       * lease for the push — all three read locally, so opening the dialog
       * costs no round trip. */
      listVersions: fromAuthorityPromise<PublishVersionsActorOutput, Readonly<{ projectId: string; branch: string }>>(
        async ({ input }) => {
          await ensureStore();
          const remote = await publishRemote();
          const [tags, head, expected, advertised] = await Promise.all([
            port.listTags(),
            port.readRef(input.branch),
            port.readRef(remoteTrackingRef(remote, `refs/heads/${input.branch}`)),
            /* The tag leases (P38). A remote that cannot be reached answers
               nothing, which leases "must not exist" — a re-publish is then
               refused with a sentence rather than forced over whatever is
               there. */
            port.listRemoteRefs(remote).catch(() => []),
          ]);
          const remoteTags = Object.fromEntries(
            advertised
              .filter((ref) => ref.name.startsWith('refs/tags/'))
              .map((ref) => [ref.name.slice('refs/tags/'.length), String(ref.head)]),
          );
          return { tags, revisionId: head, expected, remoteTags };
        },
      ),

      /* W6's tag members, on a revision that already exists. */
      createTag: fromAuthorityPromise<RevisionTag, PublishTagActorInput>(async ({ input }) => {
        await ensureStore();
        const person = options.actor?.({ runId: undefined, trigger: 'save' });
        return port.tag({
          name: input.name,
          revisionId: revisionId(input.revisionId),
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(person === undefined ? {} : { actor: person }),
        });
      }),

      /*
       * The history set in one atomic offer: the branch under its lease (P18)
       * and the name that points into it. Atomic because a publication whose
       * tag landed without its history names a revision the remote cannot
       * resolve, and the materializer would then have nothing to read.
       */
      push: fromAuthorityPromise<PublishPushActorOutput, PublishPushActorInput>(async ({ input }) => {
        await ensureStore();
        const remote = await publishRemote();
        const result = await port.push({
          remote,
          atomic: true,
          refs: [
            {
              name: `refs/heads/${input.branch}`,
              ...(input.expected === undefined ? {} : { expected: revisionId(input.expected) }),
            },
            {
              name: `refs/tags/${input.tag}`,
              /* Always present, so the key itself is the lease: a revision
                 leases "still exactly there", `undefined` leases "must not
                 exist" (P18, P38). Never a force. */
              expected: input.expectedTag === undefined ? undefined : revisionId(input.expectedTag),
            },
          ],
        });
        const refused = result.refs.find((entry) => entry.status === 'rejected');
        if (refused !== undefined) {
          throw new RevisionPortError(
            'INVALID_TRANSPORT',
            refused.reason === 'leaseLost'
              ? 'Someone else changed this project in the cloud. Open it again before publishing.'
              : `The cloud refused this project: ${refused.reason ?? 'no reason given'}`,
          );
        }
        pushSequence += 1;
        return { pushId: `${input.branch}:${String(clock())}:${String(pushSequence)}`, remote };
      }),

      createPublication: fromAuthorityPromise<PublishPublicationActorOutput, PublishPublicationActorInput>(
        async ({ input }) => {
          const record = options.publishPublication;
          if (record === undefined) {
            throw new RevisionPortError(
              'INVALID_TRANSPORT',
              'This host is not signed in to Tau Cloud, so it cannot publish.',
            );
          }
          return record(input);
        },
      ),
    },

    sync: {
      /* The record, not a snapshot: this is the whole of what "retried on the
       * next open of the project on that device" reads (D28, D29). */
      readPending: fromAuthorityPromise<SyncQueueRecord, SyncReadPendingActorInput>(async () => readPendingQueue()),

      writePending: fromAuthorityPromise<void, SyncWritePendingActorInput>(async ({ input }) => {
        await writePendingQueue(input.record);
      }),

      /* Git's own remotes list again — reading a record twice is not a second
       * model, and `remote.machine` does not announce a *rehydrated* remote. */
      readRemote: fromAuthorityPromise<SyncReadRemoteActorOutput, Readonly<{ projectId: string }>>(async () => {
        await ensureStore();
        const [[remote], head] = await Promise.all([port.listRemotes(), port.readHead()]);
        return {
          remote: remote?.fetchOnly === true ? undefined : remote?.name,
          ...(head?.branch === undefined ? {} : { branch: head.branch }),
        };
      }),

      /**
       * The two sets, pushed the two ways A39 requires.
       *
       * The history set (`refs/heads/*`, `refs/tags/*`) goes **atomic**, so
       * `main` and its tags land together or not at all. The record set
       * (`refs/tau/chats/*`) goes **one push per ref**, so a chat the server
       * refuses fails only itself and never blocks a branch — which is also why
       * a rejected chat ref is replayed here rather than left to a retry that
       * would be refused for the same reason forever (W17 contract 1/4/5).
       */
      push: fromAuthorityPromise<SyncPushActorOutput, SyncPushActorInput>(async ({ input, signal }) => {
        await ensureStore();
        signal.throwIfAborted();
        const { syncChats, syncLargeExports } = await projectSyncPreferences();
        const wanted = input.refs === undefined ? undefined : new Set(input.refs);
        const offered = (name: string): boolean => wanted === undefined || wanted.has(name);
        /* A narrowed retry owes exactly the refs it names, so capturing and
         * hashing the whole evidence tree for a push that is not offering the
         * evidence ref is work nothing reads (C23). */
        const preparedRecords = [
          ...(await recordChats(syncChats)),
          ...(offered(evidenceRefName) ? await recordEvidence(syncLargeExports, input.leases[evidenceRefName]) : []),
        ];
        signal.throwIfAborted();
        const failedPreparation = new Set(
          preparedRecords.filter((entry) => entry.status === 'rejected').map((entry) => entry.name),
        );
        /* Three namespaced reads, not one bare `listRefs()`: the port answers in
         * the vocabulary it was asked in, and a bare call lists *branch names*
         * — which would offer `main` instead of `refs/heads/main` and would not
         * see a chat ref at all. */
        const [heads, tags, chats, evidence] = await Promise.all([
          port.listRefs('refs/heads'),
          port.listRefs('refs/tags'),
          syncChats ? port.listRefs(chatRefPrefix) : Promise.resolve([]),
          syncLargeExports ? port.listRefs('refs/tau/evidence') : Promise.resolve([]),
        ]);
        const history = [...heads, ...tags]
          .map((entry) => entry.name)
          .filter((name) => !isHostLocalRef(name) && offered(name));
        const records = [...chats, ...evidence]
          .map((entry) => entry.name)
          .filter((name) => offered(name) && !failedPreparation.has(name));
        /* What this push offers, by name: a refused ref reports no head of its
         * own, and "which local revision is unsent" is the whole of what the
         * queue entry is for (review 2 R8). */
        const localHeads = new Map(
          [...heads, ...tags, ...chats, ...evidence].map((entry) => [entry.name, String(entry.head)] as const),
        );
        const results: SyncRefOutcome[] = preparedRecords.filter((entry) => entry.status === 'rejected');
        let overQuota: readonly string[] | undefined;
        let quotaMessage: string | undefined;
        let quotaStorage: RemoteStorageRefusal | undefined;

        /*
         * D54: a lease is only a licence to rewrite the remote when this device
         * has *integrated* what it leases. The lease is the head the last fetch
         * saw, and a fetch whose merge did not happen (open files mid-save, a
         * branch this checkout is not on) still records it — so a push under
         * it overwrote the remote's own commits. A branch whose local head does
         * not contain its lease is refused here as `leaseLost`, never offered;
         * the scheduler's retry pulls and merges, or raises the conflict.
         */
        const unintegrated = new Set<string>();
        for (const name of history) {
          const lease = input.leases[name];
          const local = localHeads.get(name);
          if (!name.startsWith('refs/heads/') || lease === undefined || local === undefined || lease === local) {
            continue;
          }
          // oxlint-disable-next-line no-await-in-loop -- one bounded walk per diverging branch, before anything is sent.
          const walk = await port.log({ heads: [revisionId(local), revisionId(lease)], limit: divergenceWalkLimit });
          if (integrationOf(walk, revisionId(local), revisionId(lease)) !== 'upToDate') {
            unintegrated.add(name);
            results.push({ name, status: 'rejected', head: local, reason: 'leaseLost' });
          }
        }
        const offeredHistory = history.filter((name) => !unintegrated.has(name));

        if (offeredHistory.length > 0) {
          signal.throwIfAborted();
          try {
            /* The one push a `pagehide` re-send may carry (D28, S41, review 2
             * R3): the host's recorder is armed for exactly this call. */
            const pushed = await recordHistoryPush(async () =>
              port.push({
                remote: input.remote,
                atomic: true,
                refs: offeredHistory.map((name) => offerOf(name, input.leases)),
              }),
            );
            results.push(...pushed.refs.map((entry) => outcomeOf(entry, localHeads)));
          } catch (error) {
            /* A refusal of the whole push — a credential, a plan, a missing
             * repository, the network — is the scheduler's to classify (its R5
             * path): flattened into per-ref outcomes it read as a ref refusal,
             * and every class offered *Sync now*. Only the server's own per-ref
             * answer and storage stay here, where the records still push. */
            if (!staysPerRef(error)) {
              throw error;
            }
            /* Storage is the one refusal that is not a failed connection: the
             * files are named and `remote.machine` owns the list (D16, P19). */
            const message = error instanceof Error ? error.message : 'History could not be backed up.';
            if (error instanceof LfsQuotaError) {
              overQuota = error.refusal.paths;
              quotaMessage = error.refusal.message;
              quotaStorage = storageRefusalOf(error.refusal) ?? quotaStorage;
            }
            results.push(...refusedAll(offeredHistory, message, localHeads));
          }
        }

        for (const name of records) {
          signal.throwIfAborted();
          const chatId = chatIdOfRef(name);
          // oxlint-disable-next-line no-await-in-loop -- one push per record ref is the point: a refused chat must fail only itself.
          const offered_ = await pushRecordRef({
            name,
            remote: input.remote,
            leases: input.leases,
            offered: localHeads,
          });
          const { outcome } = offered_;
          if (offered_.overQuota !== undefined) {
            overQuota = [...(overQuota ?? []), ...offered_.overQuota];
            quotaMessage = offered_.quotaMessage;
            quotaStorage = offered_.quotaStorage ?? quotaStorage;
          }
          if (outcome.status !== 'rejected' || chatId === undefined) {
            results.push(outcome);
            continue;
          }
          /* The CAS loser's whole recovery: fetch what the remote holds, write
           * the projection, replay this device's own segment onto it, and offer
           * it again under the head that was just fetched. A union over disjoint
           * paths, so nothing merges a line (S39, P27). */
          try {
            // oxlint-disable-next-line no-await-in-loop -- a rejected record is replayed before its result is recorded.
            const replayed = await replayRejectedChat({
              chatId,
              name,
              remote: input.remote,
              syncChats,
              refusal: outcome.reason,
            });
            results.push(replayed);
          } catch (error) {
            results.push({
              name,
              status: 'rejected',
              head: localHeads.get(name),
              reason: error instanceof Error ? error.message : 'This chat could not be replayed.',
            });
          }
        }

        return {
          refs: results,
          ...(overQuota === undefined ? {} : { overQuota }),
          ...(quotaMessage === undefined ? {} : { quotaMessage }),
          ...(quotaStorage === undefined ? {} : { quotaStorage }),
        };
      }),

      /**
       * Opening pulls first (D28), and the fetch path writes the projection (A39).
       *
       * Two fetches, because `isomorphic-git` deletes every advertised ref
       * outside `refs/heads/*` before refspec translation, so the record set has
       * to be named (W11b §1.2). The per-record-ref round trip is that lane's
       * known ceiling and this is where it is paid.
       */
      fetch: fromAuthorityPromise<SyncFetchActorOutput, SyncFetchActorInput>(async ({ input, signal }) => {
        await ensureStore();
        signal.throwIfAborted();
        const { syncChats, syncLargeExports: initialSyncLargeExports } = await projectSyncPreferences();
        let syncLargeExports = initialSyncLargeExports;
        /*
         * The deadline is a signal the port carries, so it ends the request and
         * not only this host's wait (review 2 P36).
         *
         * ponytail: honoured by the leg that speaks HTTP itself. A leg that
         * spawns `git` leaves the process to its own transport timeouts — the
         * machine still leaves `opening` on the deadline either way, so the
         * difference is a socket held open on a host that has stopped waiting.
         * Upgrade path: a signal through `runGitCommand` to the child process.
         */
        const abort = AbortSignal.any([signal, AbortSignal.timeout(input.deadlineMilliseconds)]);
        const deadline = new Promise<never>((_resolve, reject) => {
          abort.addEventListener('abort', () => {
            reject(new RevisionPortError('INVALID_TRANSPORT', 'The remote did not answer in time.'));
          });
        });
        const advertised = await Promise.race([port.listRemoteRefs(input.remote), deadline]);
        signal.throwIfAborted();
        const [localBranchesBefore, trackingBefore, places] = await Promise.all([
          port.listRefs('refs/heads'),
          port.listRefs(`refs/remotes/${input.remote}`),
          listPlaces(),
        ]);
        const wanted = advertised
          .map((entry) => entry.name)
          .filter(
            (name) =>
              (!name.startsWith(`${chatRefPrefix}/`) || syncChats) &&
              (!name.startsWith('refs/tau/evidence/') || syncLargeExports),
          );
        let fetched =
          advertised.length === 0 || wanted.length === 0
            ? { refs: [] }
            : await Promise.race([
                /* The signal goes *into* the port, so the deadline ends the socket and
                 * not only this host's wait (review 2 P36). */
                port.fetch({ remote: input.remote, signal: abort, refs: wanted }),
                deadline,
              ]);
        signal.throwIfAborted();
        if (!syncLargeExports && (await fetchedProjectSyncsLargeExports(input.remote, input.branch))) {
          syncLargeExports = true;
          const evidence = advertised
            .map((entry) => entry.name)
            .filter((name) => name.startsWith('refs/tau/evidence/'));
          if (evidence.length > 0) {
            const evidenceFetched = await Promise.race([
              port.fetch({ remote: input.remote, signal: abort, refs: evidence }),
              deadline,
            ]);
            fetched = { refs: [...fetched.refs, ...evidenceFetched.refs] };
          }
        }

        /*
         * Fetch owns remote-tracking refs; this is the one reconciliation from
         * those facts into project branch identity. Unborn or previously clean
         * ref-only branches follow the remote. Diverged and checked-out branches
         * are preserved, including when the remote renames or deletes a name.
         */
        const localByName = new Map(localBranchesBefore.map((entry) => [entry.name, String(entry.head)]));
        const priorTrackingPrefix = `refs/remotes/${input.remote}/`;
        const priorByBranch = new Map(
          trackingBefore.flatMap((entry) =>
            entry.name.startsWith(priorTrackingPrefix)
              ? [[`refs/heads/${entry.name.slice(priorTrackingPrefix.length)}`, String(entry.head)] as const]
              : [],
          ),
        );
        const advertisedBranches = new Map<`refs/heads/${string}`, string>(
          advertised.flatMap((entry) =>
            entry.name.startsWith('refs/heads/')
              ? [[entry.name as `refs/heads/${string}`, String(entry.head)] as const]
              : [],
          ),
        );
        const activeBranch = `refs/heads/${input.branch}` as const;
        const checkedOut = new Set(
          places.flatMap((place) => (place.branch === undefined ? [] : [`refs/heads/${place.branch}`])),
        );
        for (const [branch, head] of advertisedBranches) {
          if (branch === activeBranch || checkedOut.has(branch)) {
            continue;
          }
          const local = localByName.get(branch);
          if (local === undefined || local === priorByBranch.get(branch)) {
            // oxlint-disable-next-line no-await-in-loop -- each branch has its own CAS.
            const updated = await port.updateRef({
              name: branch,
              expectedHead: local === undefined ? undefined : revisionId(local),
              head: revisionId(head),
            });
            if (updated.status === 'updated') {
              localByName.set(branch, head);
            }
          }
        }
        for (const [branch, prior] of priorByBranch) {
          if (
            branch === activeBranch ||
            advertisedBranches.has(branch) ||
            checkedOut.has(branch) ||
            localByName.get(branch) !== prior
          ) {
            continue;
          }
          // oxlint-disable-next-line no-await-in-loop -- each deleted remote branch has its own CAS.
          const removed = await port.updateRef({ name: branch, expectedHead: revisionId(prior) });
          if (removed.status === 'updated') {
            localByName.delete(branch);
          }
          const tracking = remoteTrackingRef(input.remote, branch);
          // oxlint-disable-next-line no-await-in-loop -- paired cleanup for the same remote branch.
          await port.updateRef({ name: tracking, expectedHead: revisionId(prior) });
        }
        /*
         * The branch this pull is *integrating* belongs in the answer too (C21).
         *
         * Both loops above skip it on purpose — `fastForward` owns it and moves
         * it a step later — but `branches` is what the Branches region renders,
         * and a fresh device whose `main` is still unborn was reporting every
         * branch in the project except the one it is on.
         */
        const reported = new Map(localByName);
        const activeAdvertised = advertisedBranches.get(activeBranch);
        if (!reported.has(activeBranch) && activeAdvertised !== undefined) {
          reported.set(activeBranch, activeAdvertised);
        }
        const branches = [...reported]
          .filter(([name]) => !isHostLocalRef(name))
          .map(([name, head]) => ({ name: name.slice('refs/heads/'.length), head }));
        const context = await chatContext();
        const recordTasks: Array<Promise<SyncRefOutcome>> = [];
        if (context !== undefined && syncChats) {
          for (const ref of fetched.refs) {
            const chatId = chatIdOfRef(ref.name);
            if (chatId === undefined) {
              continue;
            }
            recordTasks.push(
              (async (): Promise<SyncRefOutcome> => {
                try {
                  const projected = await projectChats({ ...context, refs: [ref], signal });
                  if (projected.length > 0) {
                    options.onChatsProjected?.(projected);
                  }
                  return {
                    name: chatRefName(chatId),
                    status: projected.length > 0 ? 'updated' : 'upToDate',
                    head: ref.head,
                  };
                } catch (error) {
                  return {
                    name: chatRefName(chatId),
                    status: 'rejected',
                    head: ref.head,
                    reason: error instanceof Error ? error.message : 'This chat could not be restored.',
                  };
                }
              })(),
            );
          }
        }
        const fetchedEvidence = fetched.refs.find(
          (ref) => ref.name === evidenceRefName || ref.name.endsWith('/tau/evidence/exports'),
        );
        /*
         * A record the remote has not moved is not restored again (C21, R11).
         *
         * `projectEvidence` is preserve-then-replace: it copies whatever is on
         * disk into `.tau/artifacts/sync-conflicts/` and writes the recorded
         * bytes over it. Run on every pull that is what it should do for a
         * record that *changed* — and what it must never do for one that did
         * not, which is how a device that had already restored an export, and
         * then edited it, had its own file replaced by the same remote bytes on
         * the very next pull. The remote-tracking ref this host held before the
         * fetch is exactly "what I have already applied".
         */
        const priorEvidenceHead = trackingBefore.find((entry) => entry.name === fetchedEvidence?.name)?.head;
        const fetchedEvidenceHead = fetchedEvidence?.head;
        if (fetchedEvidenceHead !== undefined && String(priorEvidenceHead) === fetchedEvidenceHead) {
          recordTasks.push(
            Promise.resolve<SyncRefOutcome>({
              name: evidenceRefName,
              status: 'upToDate',
              head: fetchedEvidenceHead,
            }),
          );
        } else if (syncLargeExports && fetchedEvidence !== undefined) {
          recordTasks.push(
            (async (): Promise<SyncRefOutcome> => {
              try {
                await projectEvidence([fetchedEvidence], signal);
                return { name: evidenceRefName, status: 'upToDate', head: fetchedEvidence.head };
              } catch (error) {
                return {
                  name: evidenceRefName,
                  status: 'rejected',
                  head: fetchedEvidence.head,
                  reason: error instanceof Error ? error.message : 'Generated exports could not be restored.',
                };
              }
            })(),
          );
        }
        const records = await Promise.all(recordTasks);
        /* The lease is keyed by the ref this host would *offer*, not by the
         * remote-tracking ref it landed in (P18). */
        const leases = Object.fromEntries(advertised.map((entry) => [entry.name, String(entry.head)]));
        const branchRef = `refs/heads/${input.branch}`;
        const localHead = await port.readRef(branchRef);
        const remoteHead = advertised.find((entry) => entry.name === branchRef)?.head;
        const integration = await (async (): Promise<SyncFetchActorOutput['integration']> => {
          if (localHead === remoteHead) {
            return 'upToDate';
          }
          /* A branch the remote has never had — an import's setup revision is written
           * straight to the ref, so nothing is queued to push it (D38). */
          if (remoteHead === undefined) {
            return 'ahead';
          }
          if (localHead === undefined) {
            return 'fastForward';
          }
          /*
           * Both heads, one walk, one relation (review 2 R1).
           *
           * Walking only the *remote* head answered `diverged` for a device that
           * is merely **ahead** — the state of every device with unacknowledged
           * work — which sent the next open to `conflicted`, where there is no
           * push edge and the durable queue could never drain.
           *
           * ponytail: bounded at `divergenceWalkLimit`, so a base further back
           * than that reads as a fork. The safe wrong answer: it composes rather
           * than overwriting. Upgrade path: `mergeBase` on `RevisionPort`.
           */
          const walk = await port.log({ heads: [remoteHead, localHead], limit: divergenceWalkLimit });
          const relation = integrationOf(walk, localHead, remoteHead);
          /*
           * `integrationOf` answers what this device has to *integrate*, and
           * "the remote has everything" and "this device is ahead" both need
           * nothing integrated — so it collapses them into `upToDate`. The
           * scheduler needs the opposite distinction: the heads differ here
           * (checked above), so an `upToDate` relation is precisely "the remote
           * is missing my revisions" (C15).
           */
          return relation === 'upToDate' ? 'ahead' : relation;
        })();
        return { leases, integration, branches, records };
      }),

      /** A clean checkout takes the remote head; nothing is composed (A2). */
      fastForward: fromAuthorityPromise<SyncFastForwardActorOutput, Readonly<{ remote: string; branch: string }>>(
        async ({ input, signal }) => {
          const tracking = remoteTrackingRef(input.remote, `refs/heads/${input.branch}`);
          const head = await port.readRef(tracking);
          signal.throwIfAborted();
          if (head === undefined) {
            return undefined;
          }
          /*
           * R04, above both branches (C20).
           *
           * Compare-and-swap proves the ref did not move *during* the call; it
           * proves nothing about whether the replacement is a fast-forward. The
           * checkout-bearing branch below got that recheck as the R04 repair and
           * the checkout-less one — a ref-only branch, which is exactly what a
           * second device's branches are — kept CASing straight to the remote
           * head, so work on a branch nobody has open could be replaced without
           * ever being composed.
           */
          const ancestryHolds = async (local: RevisionId | undefined): Promise<boolean> => {
            if (local === undefined || local === head) {
              return true;
            }
            const walk = await port.log({ heads: [head, local], limit: divergenceWalkLimit });
            return integrationOf(walk, local, head) === 'fastForward';
          };
          const places = await listPlaces();
          signal.throwIfAborted();
          const place = places.find((entry) => entry.branch === input.branch);
          if (place === undefined) {
            const expected = await port.readRef(`refs/heads/${input.branch}`);
            signal.throwIfAborted();
            if (!(await ancestryHolds(expected))) {
              throw new RevisionPortError(
                'CHECKOUT_CONFLICT',
                `${input.branch} has work the remote does not. Fetch and compose the two lines first.`,
              );
            }
            signal.throwIfAborted();
            const updated = await port.updateRef({ name: `refs/heads/${input.branch}`, expectedHead: expected, head });
            if (updated.status !== 'updated') {
              throw new RevisionPortError('CHECKOUT_CONFLICT', `${input.branch} moved while synchronizing.`);
            }
            return undefined;
          }
          const branch = `refs/heads/${input.branch}`;
          const target = await port.readTree(head);
          signal.throwIfAborted();
          if (target === undefined) {
            throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for ${head}.`);
          }
          let expected: RevisionId | undefined;
          await materializeTree(place, target, {
            signal,
            validate: async (before) => {
              expected = await port.readRef(branch);
              if (!(await ancestryHolds(expected))) {
                throw new RevisionPortError(
                  'CHECKOUT_CONFLICT',
                  `${input.branch} changed after synchronization checked it. Fetch and compose the newer work first.`,
                );
              }
              signal.throwIfAborted();
              const expectedTreeId = await treeIdOf(expected);
              const beforeTreeId = revisionTreeId(await recordedTree(before), await formatOf());
              const pristineTreeId = revisionTreeId(generatedSetupTree, await formatOf());
              const dirty =
                expectedTreeId === undefined ? beforeTreeId !== pristineTreeId : expectedTreeId !== beforeTreeId;
              const leases = await readLeases();
              const leased = leases.some((lease) => lease.checkoutId === place.id);
              signal.throwIfAborted();
              if (dirty || leased) {
                throw new RevisionPortError(
                  'CHECKOUT_CONFLICT',
                  leased
                    ? 'These files are being changed by an active run. Synchronization will retry after it settles.'
                    : 'These files have changes that are not in a revision yet. Save them before synchronizing.',
                );
              }
            },
            publish: async () => {
              signal.throwIfAborted();
              const currentLeases = await readLeases();
              if (currentLeases.some((lease) => lease.checkoutId === place.id)) {
                throw new RevisionPortError(
                  'CHECKOUT_CONFLICT',
                  'A run started changing these files while synchronization was applying. It will retry after the run settles.',
                );
              }
              const updated = await port.updateRef({ name: branch, expectedHead: expected, head });
              if (updated.status !== 'updated') {
                throw new RevisionPortError('CHECKOUT_CONFLICT', `${input.branch} moved while synchronizing.`);
              }
            },
          });
          const treeId = await treeIdOf(head);
          if (treeId === undefined) {
            throw new RevisionPortError('UNKNOWN_REVISION', `No recorded tree for ${head}.`);
          }
          return { checkoutId: place.id, revisionId: head, treeId };
        },
      ),

      merge: fromAuthorityPromise<SyncMergeActorOutput, SyncIntegrateActorInput>(async ({ input }) => {
        const conflictBranch = `sync/${input.remote}/${input.branch}`;
        const tracking = remoteTrackingRef(input.remote, `refs/heads/${input.branch}`);
        /*
         * D57: a sync conflict is resolved on its own branch (AC14 leaves the
         * branch merged into untouched), and nothing else carries that
         * resolution home — merging the remote again only re-conflicts, so a
         * resolved sync conflict could never finish. When the sync branch holds
         * a resolution that already contains both heads, that resolution *is*
         * this pull's merge: the branch fast-forwards to it, and the sync
         * branch and its checkout are retired.
         */
        const resolved = await port.readRef(conflictBranch);
        const [theirs, ours] = await Promise.all([port.readRef(tracking), port.readRef(input.branch)]);
        if (resolved !== undefined && theirs !== undefined && resolved !== ours) {
          const walk = await port.log({ heads: [resolved], limit: divergenceWalkLimit });
          const reached = new Set<string>(walk.map((entry) => entry.id));
          const settled = walk.find((entry) => entry.id === resolved)?.conflicted === false;
          if (settled && reached.has(theirs) && (ours === undefined || reached.has(ours))) {
            const landed = await mergeBranches({
              branch: conflictBranch,
              into: input.branch,
              sourceLabel: `${input.remote}/${input.branch}`,
            });
            if (landed.status === 'merged') {
              const places = await listPlaces();
              const place = places.find((candidate) => candidate.branch === conflictBranch);
              if (place !== undefined && port.removeCheckout !== undefined) {
                await port.removeCheckout(place.id);
              }
              await port.updateRef({ name: conflictBranch, expectedHead: resolved, head: undefined });
              return { status: 'merged', revisionId: landed.revisionId };
            }
          }
        }
        const outcome = await mergeBranches({
          branch: tracking,
          into: input.branch,
          conflictBranch,
          sourceLabel: `${input.remote}/${input.branch}`,
        });
        return outcome.status === 'merged'
          ? { status: 'merged', revisionId: outcome.revisionId }
          : { status: 'conflicted', branch: conflictBranch, into: input.branch, paths: outcome.paths };
      }),

      connectivity: createCallbackLogic<AnyEventObject>(({ sendBack }) => {
        const subscribe = options.connectivity;
        if (subscribe === undefined) {
          /* A host that says nothing is a host that is online: `offline` is a
           * fact somebody has to report, never one this module guesses. */
          return () => undefined;
        }
        return subscribe((online) => {
          sendBack({ type: online ? 'online' : 'offline' });
        });
      }),
    },
  };
};

/** Options for one project's running revision actor tree. @public */
export type ProjectRevisionActorOptions = RevisionActorsOptions &
  Readonly<{
    /**
     * The checkout that is the project directory itself.
     *
     * An override: the registry's own `kind === 'live'` record is the source,
     * so a host that has no reason to pin one leaves this out.
     */
    liveCheckoutId?: string;
    selectedCheckoutId?: string;
  }>;

/**
 * The project's actor tree, with every effect this module builds already
 * provided.
 *
 * One composition, not one per host: the five machines are wired together here
 * so a page, a daemon and the Electron utility differ only in the port and the
 * checkout filesystems they pass. The actor is returned **unstarted**, so a
 * caller can subscribe before the registry opens.
 *
 * @param options - The same dependencies {@link createRevisionActors} takes.
 * @returns The root actor, ready to `start()`, and the `settled` wait a caller
 *   owes the project after it stops that actor.
 * @public
 *
 * @example <caption>Serve one project on a disk host</caption>
 * ```typescript
 * import { NodeFsProvider } from '@taucad/filesystem/backend/node';
 * import { createProjectRevisionsActor } from '@taucad/revisions/revision-effects';
 * import { createNativeGitRevisionPort } from '@taucad/revisions/node';
 *
 * const { actor } = createProjectRevisionsActor({
 *   port: createNativeGitRevisionPort({ repositoryPath: '/srv/project' }),
 *   projectId: 'project-1',
 *   authorityEpoch: 'epoch-1',
 *   filesystem: () => new NodeFsProvider('/srv/project'),
 * });
 * actor.start();
 * actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
 * ```
 */
export const createProjectRevisionsActor = (
  options: ProjectRevisionActorOptions,
): Readonly<{ actor: ProjectRevisionsActor; settled: () => Promise<void> }> => {
  const actors = createRevisionActors(options);
  const actor = createActor(
    projectRevisionsMachine.provide({
      actors: {
        checkouts: checkoutsMachine.provide({ actors: actors.checkouts }),
        restore: restoreMachine.provide({ actors: actors.restore }),
        checkout: checkoutMachine.provide({ actors: actors.checkout }),
        turn: turnMachine.provide({ actors: actors.turn }),
        remote: remoteMachine.provide({ actors: actors.remote }),
        branch: branchMachine.provide({ actors: actors.branch }),
        resolution: resolutionMachine.provide({ actors: actors.resolution }),
        publish: publishMachine.provide({ actors: actors.publish }),
        sync: syncMachine.provide({ actors: actors.sync }),
      },
    }),
    {
      input: {
        projectId: options.projectId,
        ...(options.liveCheckoutId === undefined ? {} : { liveCheckoutId: options.liveCheckoutId }),
        ...(options.selectedCheckoutId === undefined ? {} : { selectedCheckoutId: options.selectedCheckoutId }),
      },
    },
  );
  return { actor, settled: actors.settled };
};

/**
 * How long an admission waits for its turn to take its lease.
 *
 * The same bound the turn machine gives its own cut (`turnCutSettlementMilliseconds`),
 * spelled here rather than imported because it is the *host's* patience: a turn
 * whose base mint never settles must refuse the run rather than hold the client
 * open for the life of the process. Both compositions read this one value
 * (W10.5) — they had a copy each, and a bound kept in two places is a bound.
 *
 * @public
 */
export const admissionMilliseconds = 30_000;

/**
 * How long a host waits for the scheduler before it lets a project go.
 *
 * The same 5 s the close flush itself is given: a quit must not hang on a remote
 * that stopped answering, and a revision this host could not push is a record in
 * `.git/sync-pending` that the next open retries (D28).
 *
 * @public
 */
export const syncQuiesceMilliseconds = 5000;

/* What the scheduler looks like when it owes this host nothing more. */
const settledSyncStates = new Set<SyncFacet['state']>(['noRemote', 'backedUp', 'queued', 'conflicted']);

/**
 * Wait for the scheduler to finish pushing or to record what it could not push.
 *
 * The one quiesce seam, because both hosts need the same wait: a browser worker
 * releasing its last port and a Node host holding `before-quit` are the same
 * question — *has the close revision reached the remote, or at least the
 * record?* — and two implementations of it would be two bounds to keep in step
 * (W13 review 2 R2, P33).
 *
 * The bound is a failure unless the machine reached a state that proves either
 * remote persistence or a durable local retry record. `checking` and `pending`
 * are both "not yet", so both remain inside the wait.
 *
 * @param actor - The project's running revision root.
 * @param timeoutMilliseconds - How long to wait. Defaults to {@link syncQuiesceMilliseconds}.
 * @returns Once the push or its durable retry record is confirmed.
 * @public
 */
export const awaitSyncSettled = async (
  actor: ProjectRevisionsActor,
  timeoutMilliseconds: number = syncQuiesceMilliseconds,
): Promise<void> => {
  const inspect = (): 'settled' | 'waiting' | Error => {
    const snapshot = actor.getSnapshot();
    const { sync } = selectRevisionStatus(snapshot);
    if (snapshot.status !== 'active') {
      return new Error('Revision backup stopped before it settled.');
    }
    if (sync.state === 'failed') {
      return new Error(sync.error ?? 'Revision backup failed before its retry could be recorded.');
    }
    return settledSyncStates.has(sync.state) ? 'settled' : 'waiting';
  };
  const initial = inspect();
  if (initial instanceof Error) {
    throw initial;
  }
  if (initial === 'settled') {
    return;
  }
  const quiesced = Promise.withResolvers<void>();
  const subscription = actor.subscribe(() => {
    const outcome = inspect();
    if (outcome instanceof Error) {
      quiesced.reject(outcome);
    } else if (outcome === 'settled') {
      quiesced.resolve();
    }
  });
  const bound = setTimeout(() => {
    quiesced.reject(new Error('Revision backup did not settle before the close deadline.'));
  }, timeoutMilliseconds);
  try {
    await quiesced.promise;
  } finally {
    clearTimeout(bound);
    subscription.unsubscribe();
  }
};
