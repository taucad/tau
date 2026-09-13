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

import { captureRevisionTree } from '@taucad/filesystem';
import type { RootedFileSystem } from '@taucad/filesystem';
import { classify } from '@taucad/filesystem/path-registry';
import {
  ImmutableRevisionTree,
  mergeRevisionTrees,
  renderConflictMarkers,
  revisionId,
} from '@taucad/filesystem/revisions';
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
  ResolutionSide,
} from '#resolution.machine.js';
import { createActor, fromCallback, fromPromise } from 'xstate';
import type { AnyEventObject } from 'xstate';

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
import { chatIdOfRef, chatRefName, chatRefPrefix, projectChats, replayChatSegment, writeChatRef } from '#chat-ref.js';
import { LfsQuotaError } from '#lfs-client.js';
import { cleanLargeObjects } from '#lfs.js';
import { bytesToHex, concatBytes, digest, hexToBytes } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';
import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import { publishMachine } from '#publish.machine.js';
import type {
  PublishActors,
  PublishPublicationActorInput,
  PublishPublicationActorOutput,
  PublishPushActorInput,
  PublishPushActorOutput,
  PublishTagActorInput,
  PublishVersionsActorOutput,
} from '#publish.machine.js';
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
import { latestRevisionTarget, restoreMachine } from '#restore.machine.js';
import { syncMachine } from '#sync.machine.js';
import type {
  SyncActors,
  SyncFacet,
  SyncFetchActorInput,
  SyncFetchActorOutput,
  SyncPushActorInput,
  SyncPushActorOutput,
  SyncQueueEntry,
  SyncQueueRecord,
  SyncReadPendingActorInput,
  SyncReadRemoteActorOutput,
  SyncRefOutcome,
  SyncWritePendingActorInput,
} from '#sync.machine.js';
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
  RevisionEngineDescriptor,
  RevisionPort,
  RevisionPushRef,
  RevisionPushRefResult,
  RevisionTag,
} from '#revision-port.js';
import { turnMachine } from '#turn.machine.js';
import type {
  TurnActors,
  TurnCaptureActorInput,
  TurnLeaseActorInput,
  TurnMergeActorOutput,
  TurnPrepareActorInput,
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
export type CheckoutFileSystems = (checkout: Checkout) => RootedFileSystem | Promise<RootedFileSystem>;

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
  reason: string;
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
    changedPaths: changes.map(({ path }) => path),
    ...(record?.treeId === undefined ? {} : { treeId: record.treeId }),
    trigger: 'turn',
    runIds: settlement.runIds,
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
      });

/** Dependencies one project's actor set is built from. @public */
export type RevisionActorsOptions = Readonly<{
  /** The content-addressed store every revision id comes from. */
  port: RevisionPort;
  filesystem: CheckoutFileSystems;
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
   * Called when a turn's placement settles, before its lease is written.
   *
   * Both outcomes: a host has to root the turn's agent where the placement put
   * it, and has to refuse a turn it could not place rather than run it
   * unrecorded (I-EDIT).
   */
  onPlacement?: (placement: TurnPlacement) => void;
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
   * `merge` is absent for the same reason it is absent from `branch`: composing
   * two diverged lines needs the conflict surface that renders the result
   * (W10). Unprovided, the machine's default throws into `conflicted`, which is
   * where A22 wants a divergence to sit until a person or W10 resolves it.
   */
  sync: Omit<SyncActors, 'merge'>;
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
/** Git's tree-entry modes. Files only: the tree model carries no mode. */
const fileMode = '100644';
const directoryMode = '40000';
/**
 * How many handles one table keeps.
 *
 * ponytail: insertion-ordered eviction, not age. A cut or plan is keyed by its
 * checkout and a capture by its turn, so the table only grows when a turn dies
 * between `capture` and `merge`; nothing keeps that many turns in flight.
 */
const handleLimit = 64;
/**
 * How far back a pull looks to decide fast-forward from divergence.
 *
 * ponytail: a bounded walk read by `mergeBaseOf` — W10's, so there is one idea
 * of "base" in the package. A base further back than this reads as diverged,
 * which is the safe answer: it merges instead of fast-forwarding.
 */
const divergenceWalkLimit = 1000;

const textEncoder = new TextEncoder();

/* One git object's framed bytes: `<type> <length>\0<body>`. */
const frameObject = (type: 'blob' | 'tree', body: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  concatBytes(textEncoder.encode(`${type} ${String(body.length)}\0`), body);

type TreeNode = {
  readonly files: Map<string, Uint8Array<ArrayBuffer>>;
  readonly directories: Map<string, TreeNode>;
};

const emptyNode = (): TreeNode => ({ files: new Map(), directories: new Map() });

/* Fold a flat path-keyed tree into the nested shape a git tree object has. */
const nodeOf = (tree: ImmutableRevisionTree): TreeNode => {
  const root = emptyNode();
  for (const { path, content } of tree.entries()) {
    const segments = path.split('/');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let child = node.directories.get(segment);
      if (child === undefined) {
        child = emptyNode();
        node.directories.set(segment, child);
      }
      node = child;
    }
    node.files.set(segments.at(-1) ?? path, content);
  }
  return root;
};

/* Git's own entry order: byte-wise by name, a directory sorting as `name/`. */
const compareBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): number => {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
};

const hashNode = (node: TreeNode, format: ObjectFormat): string => {
  const entries = [
    ...[...node.files].map(([name, content]) => ({
      name,
      mode: fileMode,
      sortKey: textEncoder.encode(name),
      oid: bytesToHex(digest(format, frameObject('blob', content))),
    })),
    ...[...node.directories].map(([name, child]) => ({
      name,
      mode: directoryMode,
      sortKey: textEncoder.encode(`${name}/`),
      oid: hashNode(child, format),
    })),
  ].sort((left, right) => compareBytes(left.sortKey, right.sortKey));
  const body = concatBytes(
    ...entries.map((entry) => concatBytes(textEncoder.encode(`${entry.mode} ${entry.name}\0`), hexToBytes(entry.oid))),
  );
  return bytesToHex(digest(format, frameObject('tree', body)));
};

/**
 * The object id the tree would have in the store, computed without writing it.
 *
 * The I5 gate compares a cut against the head's `treeId`, and the head's comes
 * from a recorded commit — so this has to be the *git* tree id and not a digest
 * of Tau's own choosing, or the gate would never hold and every turn would mint
 * an identical revision. Every mint checks the claim: `writeRevision` compares
 * what the engine recorded against what this computed, and refuses on a
 * mismatch rather than silently re-minting forever.
 *
 * @param tree - The captured tree.
 * @param format - The store's recorded object hash.
 * @returns Lowercase hexadecimal tree object id.
 * @public
 */
export const revisionTreeId = (tree: ImmutableRevisionTree, format: ObjectFormat): string =>
  hashNode(nodeOf(tree), format);

/* A bounded table of host-side handles the machines only carry as strings. */
const createHandles = <T>(
  prefix: string,
): Readonly<{
  put: (scope: string, value: T) => string;
  take: (id: string) => T | undefined;
}> => {
  const values = new Map<string, Readonly<{ scope: string; value: T }>>();
  const byScope = new Map<string, string>();
  let counter = 0;
  /* Both tables drop together: the scope index is what would otherwise grow by
   * one dead entry per turn for the life of the process (a2 R9). */
  const forget = (id: string): Readonly<{ scope: string; value: T }> | undefined => {
    const held = values.get(id);
    values.delete(id);
    if (held !== undefined && byScope.get(held.scope) === id) {
      byScope.delete(held.scope);
    }
    return held;
  };
  return {
    /* One live handle per scope: a new cut for a checkout replaces the old one. */
    put: (scope, value) => {
      const previous = byScope.get(scope);
      if (previous !== undefined) {
        forget(previous);
      }
      counter += 1;
      const id = `${prefix}-${String(counter)}`;
      values.set(id, { scope, value });
      byScope.set(scope, id);
      for (const [oldest] of values) {
        if (values.size <= handleLimit) {
          break;
        }
        forget(oldest);
      }
      return id;
    },
    take: (id) => forget(id)?.value,
  };
};

/**
 * Paths that differ only by case, which a case-insensitive disk cannot
 * materialize as two files.
 *
 * Refused at the cut rather than at the write: the tree model accepts them
 * (W3a review), and a revision nobody can check out is worse than a failed cut.
 *
 * @param tree - The captured tree.
 * @returns The colliding paths, or an empty array.
 */
const caseCollisions = (tree: ImmutableRevisionTree): readonly string[] => {
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  for (const { path } of tree.entries()) {
    const folded = path.toLowerCase();
    const first = seen.get(folded);
    if (first === undefined) {
      seen.set(folded, path);
      continue;
    }
    collisions.push(first, path);
  }
  return collisions;
};

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
      throw new RevisionPortError('CHECKOUT_CONFLICT', `No checkout is registered as ${checkoutId}.`);
    }
    return place;
  };

  /* The versioned tree of one checkout: every path the registry versions. */
  const capture = async (place: Checkout): Promise<ImmutableRevisionTree> => {
    const rooted = await filesystem(place);
    const tree = await captureRevisionTree(rooted, {
      exclude: (path) => !classify(path).versioned,
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

  const headOf = async (place: Checkout): Promise<string | undefined> =>
    place.baseRevisionId ?? (place.branch === undefined ? undefined : await port.readRef(place.branch));

  /* The tree object id of one revision, as the store recorded it. */
  const treeIdOf = async (revision: string | undefined): Promise<string | undefined> => {
    if (revision === undefined) {
      return undefined;
    }
    const record = await port.readRevision(revisionId(revision));
    return record?.treeId;
  };

  const equalBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
    left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

  /**
   * Write one tree over a checkout and verify exactly what it applied.
   *
   * The same primitive a settlement runs and a restore runs — applying a stored
   * revision *is* writing its tree — and it verifies only the paths it wrote,
   * because the preview pipeline writes its own outputs into the same root
   * unfenced and a whole-tree comparison failed on bytes this never touched.
   *
   * @param place - The checkout being written.
   * @param target - The tree it must carry.
   * @param from - Its tree as already captured.
   * @returns The paths this call wrote or removed, sorted.
   */
  const applyTree = async (
    place: Checkout,
    target: ImmutableRevisionTree,
    from: ImmutableRevisionTree,
  ): Promise<readonly string[]> => {
    const live = await filesystem(place);
    const liveFiles = new Map(from.entries().map(({ path, content }) => [path, content]));
    const targetFiles = new Map(target.entries().map(({ path, content }) => [path, content]));
    const removedPaths = [...liveFiles.keys()]
      .filter((path) => !targetFiles.has(path))
      .sort((left, right) => right.length - left.length || right.localeCompare(left));
    for (const path of removedPaths) {
      // oxlint-disable-next-line no-await-in-loop -- ordered application keeps retries deterministic.
      await live.unlink(path);
    }
    const writtenPaths: string[] = [];
    for (const [path, content] of targetFiles) {
      const current = liveFiles.get(path);
      if (current !== undefined && equalBytes(current, content)) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- ordered application keeps retries deterministic.
      await live.writeFile(path, content);
      writtenPaths.push(path);
    }
    const reread = await capture(place);
    const verified = new Map(reread.entries().map(({ path, content }) => [path, content]));
    const unverified = [
      ...removedPaths.filter((path) => verified.has(path)),
      ...writtenPaths.filter((path) => {
        const applied = verified.get(path);
        const wanted = targetFiles.get(path);
        return applied === undefined || wanted === undefined || !equalBytes(applied, wanted);
      }),
    ].sort();
    if (unverified.length > 0) {
      throw new RevisionPortError(
        'ENGINE_FAILED',
        `The checkout did not keep the paths this write applied: ${unverified.join(', ')}`,
      );
    }
    return [...removedPaths, ...writtenPaths].sort();
  };

  /**
   * Where this device records what the remote has not acknowledged.
   *
   * A control-plane path (`classify` → unversioned, agent-hidden, unwatched),
   * so the queue is never a file a person sees, an agent reads, or a revision
   * records — and never a machine snapshot (D29).
   */
  const syncQueuePath = '.tau/revisions/sync-pending';

  const isQueueEntry = (value: unknown): value is SyncQueueEntry =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { ref?: unknown }).ref === 'string' &&
    typeof (value as { reason?: unknown }).reason === 'string';

  /*
   * Read leniently: a half-written or foreign record holds nothing, and an
   * unreadable queue must never be able to stop the scheduler that reads it.
   */
  const readPendingQueue = async (): Promise<SyncQueueRecord> => {
    const records = await recordsFileSystem();
    try {
      const stored: unknown = JSON.parse(await records.readFile(syncQueuePath, 'utf8'));
      const entries: unknown = (stored as { entries?: unknown }).entries;
      return { version: 1, entries: Array.isArray(entries) ? entries.filter((entry) => isQueueEntry(entry)) : [] };
    } catch {
      return { version: 1, entries: [] };
    }
  };

  /*
   * One writer, in order (review 2 R5).
   *
   * A keepalive answer arriving while a push settles targets `recording` twice,
   * and stopping an XState promise actor does not cancel the write inside it —
   * so two `writeFile` calls could overlap, and the reader is deliberately
   * lenient: a torn record holds *nothing*, which is the one outcome that loses
   * what is owed. A chain makes the last caller the last writer.
   */
  let queueWrite: Promise<void> = Promise.resolve();

  const writePendingQueue = async (record: SyncQueueRecord): Promise<void> => {
    const previous = queueWrite;
    const write = (async (): Promise<void> => {
      try {
        await previous;
      } catch {
        /* One write's failure belongs to the caller that made it; the next
         * settle still has to record what is owed. */
      }
      const records = await recordsFileSystem();
      const body = `${JSON.stringify(record, undefined, 2)}\n`;
      try {
        /* Atomic where the filesystem has a rename: a reader never sees half a
         * record, even if the host dies mid-write. */
        await records.writeFile(`${syncQueuePath}.writing`, body);
        await records.rename(`${syncQueuePath}.writing`, syncQueuePath);
      } catch {
        /* A backend without an atomic rename still has to record what is owed;
         * the lenient reader is what covers the torn read that is then possible. */
        await records.writeFile(syncQueuePath, body);
      }
    })();
    queueWrite = write;
    await write;
  };

  /**
   * The project's *Sync chats* answer, read per push (D25, W17).
   *
   * Read, never written: the toggle is W17's writer and the person's choice, and
   * a scheduler that cached it would keep pushing chats for the rest of a
   * session after they turned it off. Absent means on.
   */
  const chatsAreSynced = async (): Promise<boolean> => {
    const records = await recordsFileSystem();
    try {
      const manifest: unknown = JSON.parse(await records.readFile('tau.json', 'utf8'));
      return (manifest as { syncChats?: unknown }).syncChats !== false;
    } catch {
      return true;
    }
  };

  /** What every chat-ref effect needs, or `undefined` on a host with no device id. */
  const chatContext = async (): Promise<
    Readonly<{ port: RevisionPort; filesystem: RootedFileSystem; deviceId: string }> | undefined
  > => {
    const deviceId = options.deviceId?.();
    if (deviceId === undefined || deviceId === '') {
      return undefined;
    }
    return { port, filesystem: await recordsFileSystem(), deviceId };
  };

  /**
   * Record every chat this device holds onto its own ref, before they are offered.
   *
   * One commit per chat per debounce, which is exactly S39's "one commit per
   * push debounce": the scheduler's window *is* the batching, so nothing here
   * needs a second one.
   *
   * @param syncChats - The project's own answer; `false` writes nothing at all.
   */
  const recordChats = async (syncChats: boolean): Promise<void> => {
    const context = await chatContext();
    if (context === undefined || !syncChats) {
      return;
    }
    const person = options.actor?.({ runId: undefined, trigger: 'save' });
    const chats = await (async (): Promise<readonly string[]> => {
      try {
        return await context.filesystem.readdir('.tau/chats');
      } catch {
        return [];
      }
    })();
    await Promise.all(
      chats.map(async (chatId) =>
        writeChatRef({
          ...context,
          chatId,
          syncChats,
          actorId,
          ...(person === undefined ? {} : { actor: person }),
          now: now(),
        }),
      ),
    );
  };

  /**
   * One ref's outcome in the scheduler's own shape.
   *
   * A *refused* ref carries no remote head by contract (`RevisionPushRefResult`),
   * so the head reported for it is the one this host offered — which is the
   * revision the queue entry exists to name (review 2 R8).
   *
   * @param entry - What the port reported for this ref.
   * @param offered - The local heads this push offered, by ref name.
   * @returns The outcome the scheduler records.
   */
  const outcomeOf = (entry: RevisionPushRefResult, offered?: ReadonlyMap<string, string>): SyncRefOutcome => ({
    name: entry.name,
    status: entry.status,
    head: entry.head ?? offered?.get(entry.name),
    ...(entry.reason === undefined ? {} : { reason: entry.reason }),
  });

  /** Every ref of one push, refused with one reason — a quota, or a throw. */
  const refusedAll = (
    names: readonly string[],
    why: string,
    offered?: ReadonlyMap<string, string>,
  ): readonly SyncRefOutcome[] =>
    names.map((name) => ({ name, status: 'rejected', head: offered?.get(name), reason: why }));

  /**
   * Offer one record ref on its own, so its refusal is its own (A39).
   *
   * Its own function rather than a closure in the loop, because it captures the
   * refusal accumulator the loop also writes — and a function declared in a loop
   * over shared state is exactly what the lint rule is for.
   *
   * @param input - The ref, the remote and the leases this host holds.
   * @returns This ref's outcome, plus any storage refusal it carried.
   */
  const pushRecordRef = async (
    input: Readonly<{
      name: string;
      remote: string;
      leases: Readonly<Record<string, string>>;
      offered: ReadonlyMap<string, string>;
    }>,
  ): Promise<Readonly<{ outcome: SyncRefOutcome; overQuota?: readonly string[]; quotaMessage?: string }>> => {
    try {
      const pushed = await port.push({ remote: input.remote, refs: [offerOf(input.name, input.leases)] });
      const [entry] = pushed.refs;
      return {
        outcome:
          entry === undefined
            ? {
                name: input.name,
                status: 'rejected',
                head: input.offered.get(input.name),
                reason: 'The remote said nothing about this ref.',
              }
            : outcomeOf(entry, input.offered),
      };
    } catch (error) {
      if (!(error instanceof LfsQuotaError)) {
        throw error;
      }
      return {
        outcome: {
          name: input.name,
          status: 'rejected',
          head: input.offered.get(input.name),
          reason: error.refusal.message,
        },
        overQuota: error.refusal.paths,
        quotaMessage: error.refusal.message,
      };
    }
  };

  /** One offered ref, carrying the lease this host holds for it (P18). */
  const offerOf = (name: string, leases: Readonly<Record<string, string>>): RevisionPushRef => ({
    name,
    ...(leases[name] === undefined ? {} : { expected: revisionId(leases[name]) }),
  });

  /**
   * Put this device's chat segment back onto the head the remote holds, and offer it again.
   *
   * The CAS loser's whole recovery, and the reason a rejected chat ref is not
   * simply re-queued: the refusal is "you did not have what I have", and
   * offering the same commit again would be refused for exactly the same reason
   * forever. One retry, then the queue (S39, P27, W17 contract 1).
   *
   * @param input - The chat, its ref, the remote and the project's own answer.
   * @returns This ref's outcome, in the scheduler's shape.
   */
  const replayRejectedChat = async (
    input: Readonly<{ chatId: string; name: string; remote: string; syncChats: boolean }>,
  ): Promise<SyncRefOutcome> => {
    const context = await chatContext();
    if (context === undefined) {
      return { name: input.name, status: 'rejected', head: undefined, reason: 'This host has no device identity.' };
    }
    /* Only what the remote advertises: fetching a ref it does not have is an
     * error on the native leg, and would turn one ref's refusal into a whole
     * transport failure. A refusal on a ref that is not there is the server's
     * own rule (the allow-list, entitlement), not a CAS loss. */
    const advertised = await port.listRemoteRefs(input.remote);
    if (!advertised.some((entry) => entry.name === input.name)) {
      return { name: input.name, status: 'rejected', head: undefined, reason: 'The remote refused this ref.' };
    }
    const fetched = await port.fetch({ remote: input.remote, refs: [input.name] });
    await projectChats({ ...context, refs: fetched.refs });
    const remoteHead = await port.readRef(remoteTrackingRef(input.remote, input.name));
    const person = options.actor?.({ runId: undefined, trigger: 'save' });
    const replayed = await replayChatSegment({
      ...context,
      chatId: input.chatId,
      syncChats: input.syncChats,
      actorId,
      ...(person === undefined ? {} : { actor: person }),
      now: now(),
      onto: remoteHead,
    });
    if (replayed.head === undefined) {
      return { name: input.name, status: 'rejected', head: undefined, reason: 'This chat could not be replayed.' };
    }
    /* The lease is the head that was just *fetched*, never the local chain's
     * own value: `refs/tau/chats/*` is an orphan chain per host (W17 a2.9/5). */
    const pushed = await port.push({
      remote: input.remote,
      refs: [{ name: chatRefName(input.chatId), ...(remoteHead === undefined ? {} : { expected: remoteHead }) }],
    });
    const [entry] = pushed.refs;
    return entry === undefined
      ? { name: input.name, status: 'rejected', head: undefined, reason: 'The remote said nothing about this ref.' }
      : outcomeOf(entry);
  };

  const leasePathOf = (runId: string): string => `${leaseDirectory}/${encodeURIComponent(runId)}.json`;

  /* The project's own root: `.tau/runs` is a records row inside the project. */
  const recordsFileSystem = async (): Promise<RootedFileSystem> => {
    const places = await listPlaces();
    const live = places.find((place) => place.kind === 'live') ?? places[0];
    if (live === undefined) {
      throw new RevisionPortError('INVALID_REPOSITORY', 'This project has no live checkout to record leases in.');
    }
    return filesystem(live);
  };

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

  return {
    settled,
    checkout: {
      cut: fromPromise<CheckoutCutActorOutput, CheckoutCutActorInput>(async ({ input }) => {
        const place = await placeOf(input.checkoutId);
        const tree = await capture(place);
        const treeId = revisionTreeId(await recordedTree(tree), await formatOf());
        return { treeId, cutId: cuts.put(input.checkoutId, { tree, treeId }) };
      }),

      writeRevision: fromPromise<Readonly<{ revisionId: string }>, CheckoutWriteRevisionActorInput>(
        async ({ input }) => {
          const held = cuts.take(input.cutId);
          if (held === undefined) {
            throw new RevisionPortError('ENGINE_FAILED', 'The cut this revision would record is no longer held.');
          }
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

      casHead: fromPromise<CheckoutCasHeadActorOutput, CheckoutCasHeadActorInput>(async ({ input }) => {
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

      readHead: fromPromise<CheckoutHead, CheckoutFenceActorInput>(async ({ input }) => {
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
      fence: fromCallback<AnyEventObject, CheckoutFenceActorInput>(({ input, sendBack }) => {
        let live = true;
        let release = (): void => undefined;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const queue = fences.get(input.checkoutId) ?? Promise.resolve();
        fences.set(
          input.checkoutId,
          (async (): Promise<void> => {
            await queue;
            await held;
          })(),
        );
        const grant = async (): Promise<void> => {
          await queue;
          if (live) {
            sendBack({ type: 'fenceGranted' });
          }
        };
        // async-iife: bootstrap -- the fence grants when its turn in the queue comes; the actor's cleanup ends it.
        void grant();
        return (): void => {
          live = false;
          release();
        };
      }),
    },

    turn: {
      prepare: fromPromise<TurnPrepareActorOutput, TurnPrepareActorInput>(async ({ input }) => {
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
              `Chat ${chatId} names checkout ${String(input.checkoutId)}, which this project has none of.`,
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

      writeLease: fromPromise<Readonly<{ leaseIds: readonly string[] }>, TurnWriteLeaseActorInput>(
        async ({ input }) => {
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
        },
      ),

      retireLease: fromPromise<void, TurnRetireLeaseActorInput>(async ({ input }) => {
        await dropLease(input.runId);
      }),

      capture: fromPromise<Readonly<{ captureId: string }>, TurnCaptureActorInput>(async ({ input }) => ({
        captureId: captures.put(input.turnId, await capture(await placeOf(input.checkoutId))),
      })),

      merge: fromPromise<
        TurnMergeActorOutput,
        Readonly<{ checkoutId: string; captureId: string; baseRevisionId: string | undefined }>
      >(async ({ input }) => {
        const agent = captures.take(input.captureId);
        if (agent === undefined) {
          throw new RevisionPortError('ENGINE_FAILED', 'The captured turn tree is no longer held.');
        }
        const place = await placeOf(input.checkoutId);
        const base =
          input.baseRevisionId === undefined
            ? new ImmutableRevisionTree([])
            : ((await port.readTree(revisionId(input.baseRevisionId))) ?? new ImmutableRevisionTree([]));
        const live = await capture(place);
        /* A file where the other side has a directory used to throw out of here
         * (W3a re-review); it is a typed `file-directory` conflict now, so a
         * conflicted turn is one return rather than an exception (W10). */
        const merged = mergeRevisionTrees(base, live, agent);
        if (merged.status === 'conflicted') {
          return { status: 'conflicted' };
        }
        await applyTree(place, merged.tree, live);
        return { status: 'recorded' };
      }),

      /*
       * Leases are plural (S6, AC9): two chats hold one checkout at the same
       * time, so this grants on sight. The record is `.tau/runs/<runId>.json`
       * and the only exclusion in the system is the mint fence above.
       */
      lease: fromCallback<AnyEventObject, TurnLeaseActorInput>(({ input, sendBack }) => {
        options.onPlacement?.({ runId: input.runId, status: 'leased', checkoutId: input.checkoutId });
        sendBack({ type: 'leaseGranted' });
        return (): void => undefined;
      }),
    },

    restore: {
      computePlan: fromPromise<RestoreComputePlanActorOutput, RestoreComputePlanActorInput>(async ({ input }) => {
        await ensureStore();
        const place = await placeOf(input.checkoutId);
        const head = await headOf(place);
        const target = input.target === latestRevisionTarget ? head : input.target;
        if (target === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', 'This checkout has no revision to return to.');
        }
        const tree = await port.readTree(revisionId(target));
        if (tree === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', `No recorded revision to restore: ${target}`);
        }
        const live = await capture(place);
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
      }),

      applyPlan: fromPromise<RestoreApplyPlanActorOutput, Readonly<{ checkoutId: string; planId: string }>>(
        async ({ input }) => {
          const plan = plans.take(input.planId);
          if (plan === undefined) {
            throw new RevisionPortError('ENGINE_FAILED', 'The restore plan is no longer held.');
          }
          const place = await placeOf(plan.checkoutId);
          await applyTree(place, plan.tree, await capture(place));
          /* The checkout tracks the restored revision's branch, or nothing when
           * no branch names it — detached (A2). */
          const references = await port.listRefs();
          const branch = references.find((reference) => reference.head === plan.revisionId)?.name;
          if (branch !== undefined && place.kind === 'live') {
            await port.setHead(branch);
          }
          const treeId = await treeIdOf(plan.revisionId);
          return { revisionId: plan.revisionId, treeId: treeId ?? '', branch };
        },
      ),
    },

    checkouts: {
      listCheckouts: fromPromise<ListCheckoutsActorOutput, Readonly<{ projectId: string }>>(async () => {
        await ensureStore();
        const leases = await readLeases();
        const places = await listPlaces();
        const merged = await mergedHistory();
        return { checkouts: await Promise.all(places.map(async (place) => recordOf(place, leases, merged))) };
      }),

      addCheckout: fromPromise<AddCheckoutActorOutput, Readonly<{ projectId: string; branch: string; from: string }>>(
        async ({ input }) => {
          if (port.addCheckout === undefined) {
            throw new RevisionPortError('UNSUPPORTED_OPERATION', 'This port has no checkouts to add one to.');
          }
          const added = await port.addCheckout({
            branch: input.branch,
            ...(input.from === '' ? {} : { from: revisionId(input.from) }),
          });
          return { checkout: await recordOf(added, await readLeases()) };
        },
      ),

      /* Discard is gated on the tree equalling its head (A25, S36): a checkout
       * with work in it that no revision holds is the one thing removal can
       * destroy, so the answer is "save a revision first" rather than a
       * confirmation dialog nobody reads. */
      removeCheckout: fromPromise<void, Readonly<{ projectId: string; id: string }>>(async ({ input }) => {
        if (port.removeCheckout === undefined) {
          throw new RevisionPortError('UNSUPPORTED_OPERATION', 'This port has no checkouts to remove one from.');
        }
        const place = await placeOf(input.id);
        const headTreeId = await treeIdOf(await headOf(place));
        if (headTreeId !== revisionTreeId(await recordedTree(await capture(place)), await formatOf())) {
          throw new RevisionPortError(
            'CHECKOUT_CONFLICT',
            'This branch has changes that are not in a revision yet. Save a revision before discarding it.',
          );
        }
        await port.removeCheckout(input.id);
      }),

      /* F13: a lease from a superseded epoch belongs to a process that no longer
       * owns this project — a crashed daemon, a previous window — and is retired
       * on open. A live turn is never rehydrated from one. */
      sweepLeases: fromPromise<SweepLeasesActorOutput, Readonly<{ projectId: string }>>(async () => {
        const leases = await readLeases();
        const stale = leases.filter((lease) => lease.authorityEpoch !== authorityEpoch);
        await Promise.all(stale.map(async (lease) => dropLease(lease.runId)));
        return { retiredRunIds: stale.map((lease) => lease.runId) };
      }),

      retireLease: fromPromise<void, Readonly<{ projectId: string; runId: string }>>(async ({ input }) => {
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
      checkBranch: fromPromise<BranchCheckActorOutput, BranchCheckActorInput>(async ({ input }) => {
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
        const dirty = headTreeId !== revisionTreeId(await recordedTree(await capture(live)), await formatOf());
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
      applySwitch: fromPromise<
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
          throw new RevisionPortError('UNSUPPORTED_OPERATION', 'This project has no live checkout to move.');
        }
        const head = await port.readRef(input.branch);
        if (head === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', `${input.branch} has no revision yet.`);
        }
        const tree = await port.readTree(head);
        if (tree === undefined) {
          throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for ${input.branch}.`);
        }
        await applyTree(place, tree, await capture(place));
        if (place.kind === 'live') {
          await port.setHead(input.branch);
        }
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
      merge: fromPromise<BranchMergeActorOutput, Readonly<{ projectId: string; branch: string; into: string }>>(
        async ({ input }) => {
          await ensureStore();
          if (input.into === '' || input.into === input.branch) {
            throw new RevisionPortError('UNSUPPORTED_OPERATION', 'A branch cannot be merged into itself.');
          }
          const theirs = await port.readRef(input.branch);
          if (theirs === undefined) {
            throw new RevisionPortError('UNKNOWN_REVISION', `${input.branch} has no revision yet.`);
          }
          const ours = await port.readRef(input.into);
          const places = await listPlaces();
          const target =
            places.find((place) => place.branch === input.into) ?? places.find((place) => place.kind === 'live');
          if (target === undefined) {
            throw new RevisionPortError('UNSUPPORTED_OPERATION', 'This project has no checkout to merge into.');
          }
          /* The same guard *Discard* has (A25): a merge rewrites the target's
           * files, and work no revision holds cannot be brought back. */
          const live = await capture(target);
          const headTreeId = await treeIdOf(await headOf(target));
          if (headTreeId !== revisionTreeId(await recordedTree(live), await formatOf())) {
            throw new RevisionPortError(
              'UNSUPPORTED_OPERATION',
              'The files you have open have changes that are not in a revision yet. Save a revision before merging.',
            );
          }

          const base =
            ours === undefined
              ? undefined
              : mergeBaseOf(await port.log({ heads: mergeBaseHeads(ours, theirs) }), ours, theirs);
          if (base === theirs) {
            /* `<current>` already contains that line; the verb is a no-op with a
             * name, not a failure. */
            return { status: 'merged', revisionId: ours ?? theirs };
          }
          if (ours === undefined || base === ours) {
            const fastForward = await port.readTree(theirs);
            if (fastForward === undefined) {
              throw new RevisionPortError('UNKNOWN_REVISION', `The store holds no tree for ${input.branch}.`);
            }
            await applyTree(target, fastForward, live);
            await publishMerge(input.into, ours, theirs);
            return { status: 'merged', revisionId: theirs };
          }

          const [baseTree, oursTree, theirsTree] = await Promise.all([
            /* Two lines that share no history merge against the empty tree:
             * every path is then an add on one side or the other, which is
             * exactly what happened. */
            base === undefined ? new ImmutableRevisionTree([]) : port.readTree(base),
            port.readTree(ours),
            port.readTree(theirs),
          ]);
          if (baseTree === undefined || oursTree === undefined || theirsTree === undefined) {
            throw new RevisionPortError('UNKNOWN_REVISION', 'This project no longer holds both sides of that merge.');
          }
          const merged = mergeRevisionTrees(baseTree, oursTree, theirsTree);
          if (merged.status === 'conflicted') {
            const [oursTreeId, baseTreeId, theirsTreeId] = await Promise.all([
              treeIdOf(ours),
              treeIdOf(base),
              treeIdOf(theirs),
            ]);
            const receipt = await port.writeRevision({
              /* Source branch first, so its own `Rev N` keeps counting and the
               * branch a person merged *from* is the one that needs them. */
              parents: [theirs, ours],
              /* The source branch's own tree: a conflicted revision records the
               * collision in its headers and never writes marker bytes (A22). */
              tree: theirsTree,
              provenance: provenanceOf('merge', [], undefined),
              summary: Object.freeze({
                generated: `Merging ${input.branch} into ${input.into} needs resolution`,
              }),
              conflict: {
                trees: [oursTreeId ?? '', baseTreeId ?? '', theirsTreeId ?? ''],
                labels: conflictLabels({ ours: input.into, theirs: input.branch }),
              },
            });
            await publishMerge(input.branch, theirs, revisionId(receipt.commitId));
            return { status: 'conflicted', paths: merged.conflicts.map((conflict) => conflict.path) };
          }

          const receipt = await port.writeRevision({
            parents: [ours, theirs],
            tree: merged.tree,
            provenance: provenanceOf('merge', [], undefined),
            summary: Object.freeze({ generated: `Merged ${input.branch} into ${input.into}` }),
          });
          await applyTree(target, merged.tree, live);
          await publishMerge(input.into, ours, revisionId(receipt.commitId));
          return { status: 'merged', revisionId: receipt.commitId };
        },
      ),

      /* A rename is two ref writes, in the order that cannot lose the head: the
       * new name is born first, and only a ref that still points where we read
       * it is removed (D29's compare-and-set). */
      rename: fromPromise<BranchRenameActorOutput, Readonly<{ projectId: string; branch: string; name: string }>>(
        async ({ input }) => {
          await ensureStore();
          const head = await port.readRef(input.branch);
          if (head === undefined) {
            throw new RevisionPortError('UNKNOWN_REVISION', `${input.branch} has no revision yet.`);
          }
          const taken = await port.readRef(input.name);
          if (taken !== undefined) {
            throw new RevisionPortError('CHECKOUT_CONFLICT', `${input.name} is already a branch of this project.`);
          }
          await port.updateRef({ name: input.name, expectedHead: undefined, head });
          const live = await port.readHead();
          if (live?.branch === input.branch) {
            await port.setHead(input.name);
          }
          await port.updateRef({ name: input.branch, expectedHead: head });
          return { branch: input.name };
        },
      ),
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
      loadConflict: fromPromise<ResolutionLoadActorOutput, ResolutionLoadActorInput>(async ({ input }) => {
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

      materialize: fromPromise<
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

      applyResolution: fromPromise<void, ResolutionApplyActorInput>(async ({ input }) => {
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

      finishMerge: fromPromise<ResolutionFinishActorOutput, Readonly<{ projectId: string; revisionId: string }>>(
        async ({ input }) => {
          const terms = await conflictTermsOf(input.revisionId);
          const chosen = resolutions.get(input.revisionId) ?? new Map<string, ChosenSide>();
          const entries = new Map(terms.merged.entries().map(({ path, content }) => [path, content]));
          for (const conflict of terms.conflicts) {
            const choice = chosen.get(conflict.path);
            if (choice === undefined) {
              throw new RevisionPortError('UNSUPPORTED_OPERATION', `Choose a side for ${conflict.path} first.`);
            }
            if (choice.side === 'editor' && choice.content !== undefined) {
              entries.set(conflict.path, choice.content);
              continue;
            }
            const side = choice.side === 'mine' ? terms.ours : terms.theirs;
            if (conflict.type === 'file-directory') {
              /* The chosen *shape* wins: either the file at that path, or every
               * path that side holds under it. The two can never both be in one
               * tree, which is what made this a conflict. */
              for (const entry of side.entries()) {
                if (entry.path === conflict.path || entry.path.startsWith(`${conflict.path}/`)) {
                  entries.set(entry.path, entry.content);
                }
              }
              continue;
            }
            const bytes = side.get(conflict.path);
            if (bytes === undefined) {
              /* That side deleted it, which is a resolution like any other. */
              entries.delete(conflict.path);
            } else {
              entries.set(conflict.path, bytes);
            }
          }

          const receipt = await port.writeRevision({
            parents: [revisionId(input.revisionId)],
            tree: new ImmutableRevisionTree([...entries]),
            provenance: provenanceOf('merge', [], undefined),
            summary: Object.freeze({
              generated: `Resolved ${String(terms.conflicts.length)} ${terms.conflicts.length === 1 ? 'file' : 'files'} between ${terms.labels.ours} and ${terms.labels.theirs}`,
            }),
          });
          const branch = await branchNaming(input.revisionId);
          if (branch !== undefined) {
            await publishMerge(branch, input.revisionId, receipt.commitId);
            const places = await listPlaces();
            const place = places.find((candidate) => candidate.branch === branch);
            if (place !== undefined) {
              const tree = await port.readTree(revisionId(receipt.commitId));
              if (tree !== undefined) {
                await applyTree(place, tree, await capture(place));
              }
            }
          }
          resolutions.delete(input.revisionId);
          return { revisionId: receipt.commitId, branch };
        },
      ),

      seedTurn: fromPromise<ResolutionSeedTurnActorOutput, Readonly<{ projectId: string; revisionId: string }>>(
        async ({ input }) => {
          const terms = await conflictTermsOf(input.revisionId);
          const branch = await branchNaming(input.revisionId);
          const places = await listPlaces();
          return {
            checkoutId: branch === undefined ? undefined : places.find((place) => place.branch === branch)?.id,
            paths: terms.conflicts.map((conflict) => conflict.path),
          };
        },
      ),
    },

    remote: {
      /* Git's own remotes list is the record (D29). One remote is exposed; the
       * list can hold several and a later program can show them (A23). */
      readRemote: fromPromise<RemoteReadActorOutput, Readonly<{ projectId: string }>>(async () => {
        await ensureStore();
        const [remote] = await port.listRemotes();
        return { remote };
      }),

      writeRemote: fromPromise<RemoteWriteActorOutput, RemoteWriteActorInput>(async ({ input }) => {
        const name = input.kind === 'tau' ? tauRemoteName : 'origin';
        const url = input.url ?? (input.kind === 'tau' ? options.remoteUrl?.(input.projectId) : undefined);
        if (url === undefined) {
          throw new RevisionPortError(
            'INVALID_TRANSPORT',
            'This host does not know where this project’s Tau Cloud repository is.',
          );
        }
        await port.setRemote({ name, url });
        return { remote: remoteOf(name, url) };
      }),

      removeRemote: fromPromise<void, Readonly<{ name: string }>>(async ({ input }) => {
        await port.removeRemote(input.name);
      }),

      /* I8: nothing to do for Tau Cloud — the credential is the session, and the
       * `HttpClient` sets the header from it at request time. W12 replaces this
       * actor for a GitHub remote, where consent is a popup. */
      authorize: fromPromise<void, RemoteAuthorizeActorInput>(async () => {
        await Promise.resolve();
      }),

      /* The cheapest question that proves a remote is really there: what refs
       * does it advertise. No object is fetched. */
      validate: fromPromise<RemoteValidateActorOutput, RemoteValidateActorInput>(async ({ input }) => {
        await port.listRemoteRefs(input.remote);
        const storage = await options.remoteStorage?.(input.remote);
        return storage === undefined ? {} : { storage };
      }),

      /*
       * Once, at connect time: bring the remote's graph in, then offer this
       * project's branch. Everything after this is `sync.machine`'s debounce.
       */
      initialSync: fromPromise<RemoteInitialSyncActorOutput, RemoteInitialSyncActorInput>(async ({ input }) => {
        await port.fetch({ remote: input.remote });
        const head = await port.readRef(input.branch);
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
              refs: [{ name: `refs/heads/${input.branch}` }],
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
          return { overQuota: result.paths, message: result.message };
        }
        const refused = result.refs.find((entry) => entry.status === 'rejected');
        if (refused !== undefined) {
          throw new RevisionPortError(
            'INVALID_TRANSPORT',
            `The remote refused ${refused.name}: ${refused.reason ?? 'no reason given'}`,
          );
        }
        return {};
      }),
    },

    publish: {
      /* The names a project already has, the revision about to get one, and the
       * lease for the push — all three read locally, so opening the dialog
       * costs no round trip. */
      listVersions: fromPromise<PublishVersionsActorOutput, Readonly<{ projectId: string; branch: string }>>(
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
      createTag: fromPromise<RevisionTag, PublishTagActorInput>(async ({ input }) => {
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
      push: fromPromise<PublishPushActorOutput, PublishPushActorInput>(async ({ input }) => {
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
        return { pushId: `${input.branch}:${String(clock())}:${String(pushSequence)}` };
      }),

      createPublication: fromPromise<PublishPublicationActorOutput, PublishPublicationActorInput>(async ({ input }) => {
        const record = options.publishPublication;
        if (record === undefined) {
          throw new RevisionPortError(
            'INVALID_TRANSPORT',
            'This host is not signed in to Tau Cloud, so it cannot publish.',
          );
        }
        return record(input);
      }),
    },

    sync: {
      /* The record, not a snapshot: this is the whole of what "retried on the
       * next open of the project on that device" reads (D28, D29). */
      readPending: fromPromise<SyncQueueRecord, SyncReadPendingActorInput>(async () => readPendingQueue()),

      writePending: fromPromise<void, SyncWritePendingActorInput>(async ({ input }) => {
        await writePendingQueue(input.record);
      }),

      /* Git's own remotes list again — reading a record twice is not a second
       * model, and `remote.machine` does not announce a *rehydrated* remote. */
      readRemote: fromPromise<SyncReadRemoteActorOutput, Readonly<{ projectId: string }>>(async () => {
        await ensureStore();
        const [remote] = await port.listRemotes();
        return { remote: remote?.name };
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
      push: fromPromise<SyncPushActorOutput, SyncPushActorInput>(async ({ input }) => {
        await ensureStore();
        const syncChats = await chatsAreSynced();
        await recordChats(syncChats);
        const wanted = input.refs === undefined ? undefined : new Set(input.refs);
        const offered = (name: string): boolean => wanted === undefined || wanted.has(name);
        /* Three namespaced reads, not one bare `listRefs()`: the port answers in
         * the vocabulary it was asked in, and a bare call lists *branch names*
         * — which would offer `main` instead of `refs/heads/main` and would not
         * see a chat ref at all. */
        const [heads, tags, chats] = await Promise.all([
          port.listRefs('refs/heads'),
          port.listRefs('refs/tags'),
          syncChats ? port.listRefs(chatRefPrefix) : Promise.resolve([]),
        ]);
        const history = [...heads, ...tags]
          .map((entry) => entry.name)
          .filter((name) => !isHostLocalRef(name) && offered(name));
        const records = chats.map((entry) => entry.name).filter((name) => offered(name));
        /* What this push offers, by name: a refused ref reports no head of its
         * own, and "which local revision is unsent" is the whole of what the
         * queue entry is for (review 2 R8). */
        const localHeads = new Map(
          [...heads, ...tags, ...chats].map((entry) => [entry.name, String(entry.head)] as const),
        );
        const results: SyncRefOutcome[] = [];
        let overQuota: readonly string[] | undefined;
        let quotaMessage: string | undefined;

        if (history.length > 0) {
          try {
            /* The one push a `pagehide` re-send may carry (D28, S41, review 2
             * R3): the host's recorder is armed for exactly this call. */
            const pushed = await recordHistoryPush(async () =>
              port.push({
                remote: input.remote,
                atomic: true,
                refs: history.map((name) => offerOf(name, input.leases)),
              }),
            );
            results.push(...pushed.refs.map((entry) => outcomeOf(entry, localHeads)));
          } catch (error) {
            /* Storage is the one refusal that is not a failed connection: the
             * files are named and `remote.machine` owns the list (D16, P19). */
            if (!(error instanceof LfsQuotaError)) {
              throw error;
            }
            overQuota = error.refusal.paths;
            quotaMessage = error.refusal.message;
            results.push(...refusedAll(history, error.refusal.message, localHeads));
          }
        }

        for (const name of records) {
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
          }
          if (outcome.status !== 'rejected' || chatId === undefined) {
            results.push(outcome);
            continue;
          }
          /* The CAS loser's whole recovery: fetch what the remote holds, write
           * the projection, replay this device's own segment onto it, and offer
           * it again under the head that was just fetched. A union over disjoint
           * paths, so nothing merges a line (S39, P27). */
          // oxlint-disable-next-line no-await-in-loop -- see above.
          results.push(await replayRejectedChat({ chatId, name, remote: input.remote, syncChats }));
        }

        return {
          refs: results,
          ...(overQuota === undefined ? {} : { overQuota }),
          ...(quotaMessage === undefined ? {} : { quotaMessage }),
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
      fetch: fromPromise<SyncFetchActorOutput, SyncFetchActorInput>(async ({ input }) => {
        await ensureStore();
        const syncChats = await chatsAreSynced();
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
        const abort = AbortSignal.timeout(input.deadlineMilliseconds);
        const deadline = new Promise<never>((_resolve, reject) => {
          abort.addEventListener('abort', () => {
            reject(new RevisionPortError('INVALID_TRANSPORT', 'The remote did not answer in time.'));
          });
        });
        const advertised = await Promise.race([port.listRemoteRefs(input.remote), deadline]);
        if (advertised.length === 0) {
          /* An empty remote has nothing to fetch, and asking either leg to fetch
           * from one is undefined behaviour — `git fetch` on a repository with no
           * refs is an error on the native leg. A first sync is a push. */
          return { leases: {}, integration: 'upToDate' };
        }
        const wanted = advertised
          .map((entry) => entry.name)
          .filter((name) => !name.startsWith(`${chatRefPrefix}/`) || syncChats);
        const fetched = await Promise.race([
          /* The signal goes *into* the port, so the deadline ends the socket and
           * not only this host's wait (review 2 P36). */
          port.fetch({ remote: input.remote, signal: abort, ...(wanted.length === 0 ? {} : { refs: wanted }) }),
          deadline,
        ]);
        const context = await chatContext();
        if (context !== undefined && syncChats) {
          await projectChats({ ...context, refs: fetched.refs });
        }
        /* The lease is keyed by the ref this host would *offer*, not by the
         * remote-tracking ref it landed in (P18). */
        const leases = Object.fromEntries(advertised.map((entry) => [entry.name, String(entry.head)]));
        const branchRef = `refs/heads/${input.branch}`;
        const localHead = await port.readRef(branchRef);
        const remoteHead = advertised.find((entry) => entry.name === branchRef)?.head;
        const integration = await (async (): Promise<SyncFetchActorOutput['integration']> => {
          if (remoteHead === undefined || localHead === remoteHead) {
            return 'upToDate';
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
          return integrationOf(walk, localHead, remoteHead);
        })();
        return { leases, integration };
      }),

      /** A clean checkout takes the remote head; nothing is composed (A2). */
      fastForward: fromPromise<void, Readonly<{ remote: string; branch: string }>>(async ({ input }) => {
        const tracking = remoteTrackingRef(input.remote, `refs/heads/${input.branch}`);
        const head = await port.readRef(tracking);
        if (head === undefined) {
          return;
        }
        const expected = await port.readRef(`refs/heads/${input.branch}`);
        await port.updateRef({ name: `refs/heads/${input.branch}`, expectedHead: expected, head });
        const places = await listPlaces();
        const place = places.find((entry) => entry.branch === input.branch);
        if (place === undefined) {
          return;
        }
        const target = await port.readTree(head);
        if (target !== undefined) {
          await applyTree(place, target, await capture(place));
        }
      }),

      connectivity: fromCallback<AnyEventObject>(({ sendBack }) => {
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
 * How long a host waits for the scheduler before it lets a project go.
 *
 * The same 5 s the close flush itself is given: a quit must not hang on a remote
 * that stopped answering, and a revision this host could not push is a record in
 * `.tau/revisions/sync-pending` that the next open retries (D28).
 *
 * @public
 */
export const syncQuiesceMilliseconds = 5000;

/* What the scheduler looks like when it owes this host nothing more. */
const settledSyncStates = new Set<SyncFacet['state']>(['noRemote', 'backedUp', 'queued', 'conflicted', 'failed']);

/**
 * Wait for the scheduler to finish pushing or to record what it could not push.
 *
 * The one quiesce seam, because both hosts need the same wait: a browser worker
 * releasing its last port and a Node host holding `before-quit` are the same
 * question — *has the close revision reached the remote, or at least the
 * record?* — and two implementations of it would be two bounds to keep in step
 * (W13 review 2 R2, P33).
 *
 * Bounded, and the bound is not a failure: after it the queue on disk is the
 * guarantee. W6-a3's rule applies to the states *before* a push as much as to
 * the push itself — `checking` and `pending` are both "not yet", so both are
 * waited on inside the bound.
 *
 * @param actor - The project's running revision root.
 * @param timeoutMilliseconds - How long to wait. Defaults to {@link syncQuiesceMilliseconds}.
 * @returns Nothing; the outcome is the push, or the record of its absence.
 * @public
 */
export const awaitSyncSettled = async (
  actor: ProjectRevisionsActor,
  timeoutMilliseconds: number = syncQuiesceMilliseconds,
): Promise<void> => {
  const isSettled = (): boolean =>
    actor.getSnapshot().status !== 'active' ||
    settledSyncStates.has(selectRevisionStatus(actor.getSnapshot()).sync.state);
  if (isSettled()) {
    return;
  }
  const quiesced = Promise.withResolvers<void>();
  const subscription = actor.subscribe(() => {
    if (isSettled()) {
      quiesced.resolve();
    }
  });
  const bound = setTimeout(() => {
    quiesced.resolve();
  }, timeoutMilliseconds);
  try {
    await quiesced.promise;
  } finally {
    clearTimeout(bound);
    subscription.unsubscribe();
  }
};
