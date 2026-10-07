/**
 * The browser's revision root (architecture A38).
 *
 * One `projectRevisionsMachine` actor tree per opened project, running **inside
 * the file-manager worker** — the same composition
 * (`createProjectRevisionsActor`) the Node daemon and the Electron utility
 * mount, over `createIsomorphicGitRevisionPort` instead of native Git. The page
 * holds no revision actor: it reads one `RevisionStatus` projection and sends
 * commands, both over the port this module serves.
 *
 * The worker is the only place in the browser that can own it. It already holds
 * the mount table, so it can hand the effects module a rooted provider per
 * checkout route (`/projects/<id>` live, `/checkouts/<id>` linked — W2's
 * routes), and it already sees every content change, which is what feeds the
 * `changed` seam.
 */

import { Topic } from '@taucad/events';
import {
  awaitCheckoutCuts,
  awaitSyncSettled,
  createProjectRevisionsActor,
  releaseUnplacedTurns,
  describeTurnRelease,
  describeTurnSettlement,
} from '@taucad/revisions/revision-effects';
import type {
  EditorConflictInput,
  EditorConflictOutcome,
  TurnConflictedEvent,
  TurnFailedEvent,
  TurnFinalizedEvent,
} from '@taucad/revisions/revision-effects';
import type { SyncMachineEmitted } from '@taucad/revisions/sync-machine';
import { selectRevisionStatus } from '@taucad/revisions/project-revisions-machine';
import {
  sameRevisionStatus,
  versionedChangePaths as classifiedChangePaths,
} from '@taucad/revisions/revision-projection';
import { isAmbientCut } from '@taucad/revisions/checkout-machine';
import type {
  BranchOperation,
  CheckoutRecord,
  GitRemoteCredential,
  IsomorphicGitCheckoutOptions,
  KeepalivePushOutcome,
  PublishDraft,
  RevisionDiffEntry,
  RevisionDivergence,
  RevisionLogRequest,
  RevisionPort,
  RevisionRow,
  RevisionStatusProjection,
  RevisionStreamHandlers,
  RevisionTag,
  RevisionUserActor,
  TurnAttemptKey,
} from '@taucad/revisions';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import {
  publishFailureMessage,
  publishOverHttp,
  readRemoteStorageOverHttp,
  readRevisionDiff,
  readRevisionLog,
  registerProjectFailureMessage,
  registerProjectOverHttp,
  tauRemoteUrl,
  watchRevisionStream,
} from '@taucad/revisions';
import { requireParameterRecord, serializeParameterRecord } from '@taucad/parameters';
import { revisionId, compareRevisionFile, captureRevisionTree, diffRevisionTrees } from '@taucad/revisions/algorithms';
import type { RevisionFileComparison } from '@taucad/revisions/algorithms';
import type { FileMode, MountTable, RootedFileSystem, WorkspaceFileService } from '@taucad/filesystem';
import type { ActorOptions, AnyActorLogic } from 'xstate';
import type { ChangeEvent } from '@taucad/types';
import { describeRevisionFailure } from '#lib/revision-failure-copy.js';
import { randomUuid } from '@taucad/utils/id';
import { createFileSystemBridgePort } from '@taucad/fs-bridge';
import type { FileSystemBridgeConnection } from '@taucad/fs-bridge';
import { createTurnPlacementPort } from '@taucad/revisions/turn-placement';
import type { TurnPlacementAdapter } from '@taucad/revisions/turn-placement';
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { reportToApi } from '#runtime/observability/report-to-api.js';
import { fetchGeoSpecCandidates, publishGeoSpecCandidate } from '#lib/geospec-candidate-git.js';

/**
 * The versioned paths one content-change event touches inside this project.
 *
 * The rule itself is `@taucad/revisions`' (W10.5) and takes the classifier it
 * reads; this worker composes Tau's own layout, so its callers pass the event
 * and the route and nothing else.
 *
 * @param event - One authority-level change event.
 * @param projectRoot - The project's route, e.g. `/projects/p1`.
 * @returns Every versioned project-relative path the event touched.
 * @public
 */
export const versionedChangePaths = (event: ChangeEvent, projectRoot: string): readonly string[] =>
  classifiedChangePaths(event, projectRoot, tauPathPolicy);

/** The sentence a lost compare-and-swap reads as, in the log (the page's words come from its code). */
const casLostMessage = 'Something else changed this project first. Try again.';

/**
 * A command the page sends to one project's revision root.
 *
 * The verbs are the machine's own: there is no browser-only verb, because the
 * page is a client of the same tree every host runs. `close` is the exception —
 * it is the port's own lifecycle, not the tree's.
 *
 * @public
 */
export type WorkerRevisionCommand =
  | Readonly<{ command: 'restore'; revisionId: string }>
  /** *Undo restore*: restore the first parent of `revisionId`, or of the last restore (D2). */
  | Readonly<{ command: 'undo' }>
  /** *Undo*: reverse this device's newest operation on the selected line (D15). */
  | Readonly<{ command: 'undoOperation' }>
  | Readonly<{ command: 'confirm' }>
  | Readonly<{ command: 'cancel' }>
  | Readonly<{ command: 'switch'; branch: string }>
  | Readonly<{ command: 'followChat'; chatId: string }>
  | Readonly<{ command: 'pinTo'; checkoutId: string }>
  /*
   * The *Branches* region's verbs (S26, A2/D10).
   *
   * Named `…Branch` for the same reason the Sync region's are named `…Remote`:
   * one flat namespace per project, and `confirm`/`cancel` already belong to
   * restore. Each one is `branch.machine`'s own event — the region drives a
   * machine, not a promise.
   */
  | Readonly<{ command: 'createBranch'; name: string; from?: string }>
  | Readonly<{ command: 'discardBranch'; branch: string; checkoutId?: string }>
  | Readonly<{ command: 'mergeBranch'; branch: string }>
  | Readonly<{ command: 'renameBranch'; branch: string; name: string }>
  | Readonly<{ command: 'confirmBranch' }>
  | Readonly<{ command: 'cancelBranch' }>
  /*
   * The Sync region's verbs (S26, S34).
   *
   * Named `…Remote` rather than the machine's own `authorized`/`cancel`: this
   * is one flat namespace per project and `cancel` already belongs to restore.
   * The page supplies the Tau Cloud URL because only the page knows which API
   * origin it is signed in to — the worker has no `window.ENV`.
   */
  | Readonly<{
      command: 'connectRemote';
      kind: 'none' | 'tau' | 'git';
      url?: string;
      provider?: 'github';
      repositoryId?: string;
      fetchOnly?: boolean;
    }>
  | Readonly<{ command: 'disconnectRemote' }>
  | Readonly<{ command: 'cancelRemote' }>
  /* The page re-minted the credential a `reconnectRequired` remote was refused
     with and sent its frame first; `remote.machine` re-validates (D3). */
  | Readonly<{ command: 'authorizeRemote' }>
  | Readonly<{ command: 'syncNow' }>
  /** Separate, consent-gated candidate artifact route; never authored sync. */
  | Readonly<{ command: 'fetchGeoSpecCandidates' }>
  | Readonly<{ command: 'publishGeoSpecCandidate'; candidate: Uint8Array<ArrayBuffer> }>
  | Readonly<{ command: 'recordsChanged' }>
  /*
   * The Publish dialog's three verbs (S32, W8).
   *
   * Named `…Publish` on the same flat namespace: `confirm` and `cancel` already
   * belong to restore. `publishProject` opens the dialog on the project's own
   * names; `confirmPublish` carries the whole draft, because a publication's
   * visibility, title and recipients are decided in one gesture.
   */
  | Readonly<{
      command: 'publishProject';
      tag?: string;
      /** An older revision to publish (a History row's *Publish*); the branch head when absent. */
      revisionId?: string;
      /* The API origin Publish reaches, on the command rather than in a
       * credential frame: a frame carrying no credential *clears* the one a
       * third-party remote was connected with, and publishing must not sign
       * anybody out of GitHub (W8 review R4, W12's S34). */
      apiBaseUrl?: string;
    }>
  | Readonly<{ command: 'confirmPublish'; draft: PublishDraft }>
  | Readonly<{ command: 'cancelPublish' }>
  | Readonly<{ command: 'resetPublish' }>
  /*
   * The *Needs resolution* card's verbs (S33, W10).
   *
   * Each names the conflicted revision it is about, because a project can hold
   * more than one conflicted branch and every verb is addressed to that
   * revision's own `resolution` child. `resolveInEditor` asks for the marker
   * text (it arrives back as a `conflictText` notice) and `resolvedInEditor`
   * hands the resolved file back.
   */
  | Readonly<{ command: 'resolve'; revisionId: string; path: string; side: 'mine' | 'theirs' }>
  | Readonly<{ command: 'resolveInEditor'; revisionId: string; path: string }>
  | Readonly<{ command: 'resolvedInEditor'; revisionId: string; path: string; content: string }>
  | Readonly<{ command: 'finishResolution'; revisionId: string }>
  | Readonly<{ command: 'abandonResolution'; revisionId: string }>
  | Readonly<{ command: 'askChatToResolve'; revisionId: string }>
  /*
   * An editor's overlapping edit, recorded as a conflicted revision on the live
   * line's conflict line (D14, RV-W5b2 R2-1): the *Needs your decision* card is
   * then the one surface, and it survives a reload and travels. A question: the
   * editor waits for the record before it lets go of its text.
   */
  | (Readonly<{ command: 'recordEditorConflict' }> & EditorConflictInput)

  /* The three graph reads. The page never holds a port (A38), and `Rev N`,
   * "Current" and *Compare* are all derived from the graph at read time (I3),
   * so the reads ride the same port the verbs do. */
  /*
   * Named versions (S31) and `Mod+S` (S30).
   *
   * `saveRevision` is a cut with no turn: the page asks its checkout to record
   * what is on disk, and the I5 gate decides whether anything is minted.
   * `tag`/`deleteTag` are port verbs with no lifecycle of their own — a name is
   * a ref, not a state machine — so they ride the same correlated channel the
   * graph reads do rather than becoming machine events with nothing to hold.
   */
  | Readonly<{ command: 'saveRevision'; trigger?: 'save' | 'hidden' | 'close' }>
  /*
   * Who this document records as (S37, A26, EQ8).
   *
   * A resolved value, not a resolver: a function cannot cross a `MessagePort`,
   * and the decision the page owns is *which person* — the signed-in user, or
   * their per-workspace anonymous stand-in. Turning the model of an agent turn
   * into the actor is mechanical and stays here, beside the mint.
   */
  | Readonly<{ command: 'setActor'; actor: RevisionUserActor }>
  /*
   * Which device this document is (W13, W17).
   *
   * Sent by the page rather than read here, because the id lives in
   * `localStorage` and a worker cannot see it. It names no pushed record — chat
   * segments name a random record device per actor form (`.git/ops-devices.json`)
   * — but a worker that has not been told writes no chat refs at all, and the id
   * counts as this host's own for a segment written before record devices
   * existed (`apps/ui/app/lib/device-id.ts` is the one source).
   */
  | Readonly<{ command: 'setDeviceId'; deviceId: string }>
  /*
   * The `pagehide` last word (A32, S41).
   *
   * Offers the receive-pack POST the `hidden` flush already built again, under
   * `keepalive`. Over 64 KiB the client refuses it and the scheduler records
   * *Not backed up* — which is the difference between a bounded failure and a
   * silent drop.
   */
  | Readonly<{ command: 'flushKeepalive' }>
  | Readonly<{ command: 'tag'; name: string; revisionId: string; note?: string }>
  | Readonly<{ command: 'deleteTag'; name: string }>
  | Readonly<{ command: 'log'; branch?: string; limit?: number; from?: string }>
  | Readonly<{ command: 'divergence'; head: string; base: string }>
  | Readonly<{ command: 'diff'; revisionId: string; from?: string; against?: 'checkout' }>
  | Readonly<{ command: 'compare'; revisionId: string; path: string; from?: string; against?: 'checkout' }>;

/**
 * One settled signal from the worker revision root.
 *
 * Turn outcomes use the same host-attested schema the Node host writes into a
 * chat's durable log. `chats.projected` is browser composition only: it names
 * the protected chat records a remote fetch finished writing, so page caches
 * can reread their filesystem authority without guessing from sync timing.
 *
 * @public
 */
export type WorkerRevisionEvent =
  | TurnConflictedEvent
  | TurnFailedEvent
  | TurnFinalizedEvent
  | Readonly<{ type: 'chats.projected'; projectId: string; chatIds: readonly string[] }>
  | Readonly<{ type: 'checkout.changed'; checkoutId: string; paths: readonly string[] }>;

/**
 * What a child of the tree asked the page to say.
 *
 * The two children with something to tell a person are `restore` and `branch`;
 * every other outcome rides the projection, which is why this union is small
 * and not one per machine.
 *
 * @public
 */
export type RevisionToast =
  /** `revisionNumber` is `undefined` for a target that is not on the line (D5, A9). */
  | Readonly<{ type: 'restored'; revisionNumber: number | undefined }>
  /** *Undo* landed; the number is the revision it undid (D15). */
  | Readonly<{ type: 'undone'; revisionNumber: number | undefined }>
  /** `heldBy`: the run whose lease held the save; its edits land in that run's revision (TS-R17, V5 A6). */
  | Readonly<{ type: 'nothingToSave'; heldBy?: TurnAttemptKey }>
  | Readonly<{
      type: 'branch';
      operation: BranchOperation;
      branch: string;
      /** What a `create` made, for a caller correlating one (P4). */
      checkoutId?: string;
      checkoutRoot?: string;
    }>
  /** A *Switch* the D10 guard would not make, in the words it gave (review R3). */
  | Readonly<{ type: 'refused'; branch: string; reason: string }>
  /**
   * A merge that collided (AC14, W10 review R1).
   *
   * The card on the branch's own row says what to do about it; this says that
   * something happened at all, because the person pressed a button and the
   * thing they were looking at — the target branch — did not move, by design.
   */
  | Readonly<{ type: 'mergeConflicted'; branch: string; into: string; paths: readonly string[] }>
  /**
   * One conflicted file's marker text, for the editor that opens it (S33, W10).
   *
   * Not a toast in the sense of a message, but the same channel for the same
   * reason: it is a fact from the tree that only a page can act on, and the page
   * holds the root and nothing else (A38).
   */
  | Readonly<{ type: 'conflictText'; revisionId: string; path: string; text: string; ours: string; theirs: string }>
  /** That conflicted file could not be opened, and why (C44). */
  | Readonly<{ type: 'conflictTextFailed'; revisionId: string; path: string; reason: string }>
  /** *Ask chat to resolve*: whatever starts chat turns on this page should. */
  | Readonly<{
      type: 'resolveWithChat';
      revisionId: string;
      checkoutId: string | undefined;
      paths: readonly string[];
    }>
  /**
   * A verb that could not be carried out, in the words the tree gave.
   *
   * `save` joined `restore` and `branch` because a cut nobody asked for by hand
   * — *Save*, the idle window, the tab going hidden — failed with a reason only
   * the Revisions pane's count hinted at, and a count is not a reason (I12,
   * W18 DEF-7). A cut a *turn* asked for is not on this channel: its chat
   * already says so, through the admission it refuses.
   */
  /**
   * A remote or resolution child's own sentence (L2-F8): *Connected*, a
   * refused connection, a merge that could not be finished. The machines
   * already phrase these for a person, so the page shows `message` as it is.
   */
  | Readonly<{ type: 'notice'; subject: 'remote' | 'resolution'; tone: 'info' | 'error'; message: string }>
  | Readonly<{
      type: 'error';
      subject: 'restore' | 'branch' | 'save' | 'connection';
      /** Which attachment attempt and initialization step failed. */
      generation?: number;
      connectionOperation?: 'connect' | 'status' | 'open' | 'subscribe' | 'stream';
      /* Which branch verb refused, so a caller correlating one *New branch*
       * does not take another verb's refusal for its own (finding 1). */
      operation?: BranchOperation;
      branch?: string;
      message: string;
      /* P4: the code is the refusal; the page turns it into product words. */
      code?: string;
      /** The revision an undo could not undo, for the page's sentence (D15). */
      revisionNumber?: number;
    }>;

/**
 * Where this document materializes one project's linked checkouts (S4, D4, W2 review R4).
 *
 * The browser port asks for a checkout's provider *while it creates it*, before
 * any projection has reported it, so the route cannot come from the page's
 * `configureProjectRoots` — that call arrives after. The worker installs it
 * directly on the mount table instead, at `.tau/checkouts/<projectId>/<id>` on
 * the **project's own** provider: the dot-prefixed space project discovery
 * never scans, no new storage root, no new capability. The page's own re-issue
 * then re-installs the same route from the projection and makes it durable
 * across every later configuration read.
 *
 * @param options - The document's mount table and file service.
 * @returns The port option for one project.
 * @public
 */
export const createCheckoutRoutes = (options: {
  readonly mountTable: MountTable;
  readonly fileService: Pick<WorkspaceFileService, 'createRootedFileSystem'>;
}): ((projectId: string) => IsomorphicGitCheckoutOptions) => {
  const { mountTable, fileService } = options;
  return (projectId) => ({
    projectId,
    root: (id) => {
      const prefix = `/checkouts/${id}`;
      const project = mountTable.getExactMount(`/projects/${projectId}`);
      if (project === undefined) {
        throw new Error(`Project ${projectId} has no route, so its checkouts have nowhere to live.`);
      }
      if (mountTable.getExactMount(prefix) === undefined) {
        mountTable.mount(prefix, project.provider, {
          backend: project.backend,
          ...(project.storageRootKey === undefined ? {} : { storageRootKey: project.storageRootKey }),
          providerBasePath: `.tau/checkouts/${projectId}/${id}`,
          class: 'authored',
        });
      }
      return fileService.createRootedFileSystem(prefix);
    },
  });
};

/** One project's revision root, as the worker's port protocol drives it. @public */
export type WorkerProjectRevisions = Readonly<{
  /** Private candidate artifact operations; each rereads device-local consent. */
  fetchGeoSpecCandidates: () => Promise<ReadonlyArray<Uint8Array<ArrayBuffer>>>;
  publishGeoSpecCandidate: (candidate: Uint8Array<ArrayBuffer>) => Promise<'updated' | 'upToDate' | 'rejected'>;
  /** Every verb: fire-and-forget into the tree. */
  send: (command: WorkerRevisionCommand) => void;
  /**
   * Make a branch and wait for the checkout the registry made for it.
   *
   * The correlated form of `send({ command: 'createBranch' })`. The `branch`
   * child owns the verb — it records the selected tree first when there is
   * something to record (P3) — so this resolves on its settlement and rejects
   * on its refusal, with the port's `code` on the error (P4).
   */
  createBranch: (name: string, from?: string) => Promise<BranchCreated>;
  /**
   * Record what is on disk and wait for the answer (C16, contract §6).
   *
   * The correlated form of `send({ command: 'saveRevision' })`. It resolves
   * once the cut has settled — minted, refused by the I5 gate, or failed — and
   * the scheduler has quiesced, so the `hidden` unload registrant can hold the
   * document open until the close revision is in a push rather than letting
   * `pagehide` offer the *previous* push's pack.
   *
   * Resolves rather than rejects at the bound: after it the durable queue is
   * the guarantee and the next open retries (D28).
   */
  saveRevision: (trigger?: 'save' | 'hidden' | 'close') => Promise<void>;
  /** Record an editor's overlapping edit as a conflicted revision, and wait for it (D14). */
  recordEditorConflict: (input: EditorConflictInput) => Promise<EditorConflictOutcome>;
  /** One content-change event on a checkout, already filtered to versioned paths. */
  changed: (checkoutId: string, paths: readonly string[]) => void;
  /** Name one revision, or re-point an existing name (S31). */
  tag: (input: Readonly<{ name: string; revisionId: string; note?: string }>) => Promise<RevisionTag>;
  /** Remove one name. The revision it named stays. */
  deleteTag: (name: string) => Promise<void>;
  /** One branch's history, newest first, with its first-parent `Rev N` (I3). */
  log: (request?: RevisionLogRequest) => Promise<readonly RevisionRow[]>;
  /** How far two heads have gone apart, counted by the port rather than by listing both histories. */
  divergence: (head: string, base: string) => Promise<RevisionDivergence>;
  /** Which paths one revision changed, against `from` or its own first parent. */
  diff: (
    revision: string,
    from?: string,
    options?: Readonly<{ against?: 'checkout' }>,
  ) => Promise<readonly RevisionDiffEntry[]>;
  /** One file's text before and after a revision, for *Compare* (S38). */
  compare: (
    revision: string,
    path: string,
    options?: Readonly<{ from?: string; against?: 'checkout' }>,
  ) => Promise<RevisionFileComparison>;
  /** Every settled revision signal this tree published, in order. */
  subscribeEvents: (listener: (event: WorkerRevisionEvent) => void) => () => void;
  /** The restore child's toasts, which only a page can show. */
  subscribeToasts: (listener: (toast: RevisionToast) => void) => () => void;
  /** The projection as it stands, for a port that has just connected. */
  status: () => RevisionStatusProjection;
  subscribe: (listener: (status: RevisionStatusProjection) => void) => () => void;
  /**
   * The root actor itself, for a caller that must prove it stopped.
   *
   * The registry's own bookkeeping empties before `release()` resolves, so
   * "stopped with no child left running" is only a claim if it is read here.
   * `writeGenerations` is each checkout child's own counter, which is where a
   * `changed` has to land to be a change at all (F9, F4).
   */
  inspect: () => Readonly<{
    status: string;
    children: readonly string[];
    writeGenerations: Readonly<Record<string, number>>;
  }>;
  /**
   * Open this project's placement session (W8 TS-S5): the turn-placement port the resident agent host drives. A newer
   * session fences the older one (TS-R6): its later requests are refused and its tools revoked, and the root keeps
   * its turn actors.
   */
  placementSession: () => Promise<TurnPlacementAdapter<FileSystemBridgeConnection>>;
  /** Stop the tree and wait for the store's own creation to finish. */
  release: () => Promise<void>;
}>;

/** Dependencies one project's root needs from its worker. @public */
export type WorkerProjectRevisionsOptions = Readonly<{
  projectId: string;
  port: RevisionPort;
  /** A task-scoped transport with its own abort signal, sharing this project's rooted Git store. */
  candidatePort?: (signal: AbortSignal) => RevisionPort;
  /**
   * Offers the last push again under `keepalive`, for `pagehide` (W13).
   *
   * Injected because the client the port speaks through is built where the
   * document's credential rules are (`file-manager.worker.ts`), and the
   * recorder has to wrap *that* client. Absent, `flushKeepalive` answers
   * `nothingToSend` and the durable queue is the whole guarantee.
   */
  keepalive?: () => Promise<KeepalivePushOutcome>;
  /**
   * Marks the history-set push as the one a `pagehide` re-send may carry (W13).
   *
   * D28/S41 name that POST, and nothing in a receive-pack request says which ref
   * set it carries, so the scheduler marks it rather than a recorder guessing
   * from a URL (review 2 R3, P35).
   */
  recordHistoryPush?: <Result>(run: () => Promise<Result>) => Promise<Result>;
  /** One rooted provider per checkout route; `checkout.root` is that route. */
  filesystem: (root: string) => RootedFileSystem | Promise<RootedFileSystem>;
  /**
   * Observe the versioned content changes under one checkout route.
   *
   * Called once per checkout the registry reports, live and linked, and the
   * returned stop is called when that checkout goes (L2-F4). Absent, only
   * `changed` feeds the tree.
   */
  observe?: (root: string, onChanged: (paths: readonly string[]) => void) => () => void;
  /**
   * Whether `observe` reports every write to a checkout before the write
   * resolves, and a change it lost track of as the root `''` (E1). The change
   * bus does; a stand-in that raises only what it is told to does not.
   */
  completeChanges?: boolean;
  /** Timers and time for this project's revision tree (MC-R4); tests pass a `StepClock`. */
  clock?: ActorOptions<AnyActorLogic>['clock'];
  /** The tree's inspector; development passes the console inspector, tests the harness. */
  inspect?: ActorOptions<AnyActorLogic>['inspect'];
  /**
   * Which API origin this document is signed in to, read per use.
   *
   * The worker has no `window.ENV`, so the page tells it — the same fact the
   * remote credential frame already carries (I8). Publishing needs it twice:
   * for the project's Tau Cloud repository URL and for the publication row the
   * API records. `undefined` means this document is not signed in anywhere, and
   * publishing is refused rather than guessed.
   */
  apiBaseUrl?: () => string | undefined;
  /** Whether this project may hold its `revision` long poll now (RV-W5b F12); every project may without it. */
  attention?: RemoteAttention;
}>;

/**
 * Which of this document's live projects holds its `revision` long poll (RV-W5b F12).
 *
 * Every live project watching at once is up to eight 25 s polls on one origin,
 * past HTTP/1.1's six sockets, and every other API request then waits behind
 * them. So only the focused project streams; the others still push and pull as
 * they always did, they just are not woken by another device. A project that
 * gains focus opens its stream and, once the stream's tail is read, pulls once
 * — tail first, so a push between the two reads is in one of them (a1b). One
 * that loses focus closes its stream. A refused stream stays off (F5) until the
 * remote is watched afresh.
 *
 * @public
 */
export type RemoteAttention = Readonly<{
  /** The page's word on whether this project is the focused one. */
  setFocused: (focused: boolean) => void;
  /**
   * Hold one `watch` of the scheduler's until this project is focused.
   *
   * @param open - Starts the real stream with the handlers it is given.
   * @param handlers - The scheduler's handlers.
   * @returns Ends the watch.
   */
  gate: (open: (handlers: RevisionStreamHandlers) => () => void, handlers: RevisionStreamHandlers) => () => void;
}>;

/**
 * Start unfocused: the page says which project is focused as it binds it.
 *
 * @returns One project's attention.
 * @public
 */
export const createRemoteAttention = (): RemoteAttention => {
  type Watch = {
    readonly open: (handlers: RevisionStreamHandlers) => () => void;
    readonly handlers: RevisionStreamHandlers;
    stop: (() => void) | undefined;
    refused: boolean;
  };
  let focused = false;
  let held: Watch | undefined;
  const begin = (watch: Watch, pullOnTail: boolean): void => {
    watch.stop = watch.open({
      moved: watch.handlers.moved,
      refused: (error) => {
        watch.refused = true;
        watch.stop = undefined;
        watch.handlers.refused(error);
      },
      watching: () => {
        watch.handlers.watching?.();
        if (pullOnTail) {
          /* A wake-up with nothing named: the scheduler pulls, as for any move. */
          watch.handlers.moved({ generation: 0, refs: [] });
        }
      },
    });
  };
  return {
    setFocused: (next) => {
      if (next === focused) {
        return;
      }
      focused = next;
      const watch = held;
      if (watch === undefined || watch.refused) {
        return;
      }
      if (next) {
        begin(watch, true);
        return;
      }
      watch.stop?.();
      watch.stop = undefined;
    },
    gate: (open, handlers) => {
      const watch: Watch = { open, handlers, stop: undefined, refused: false };
      held = watch;
      if (focused) {
        begin(watch, false);
      } else {
        /* No stream, so no tail for the open pull to wait on. */
        handlers.watching?.();
      }
      return () => {
        watch.stop?.();
        watch.stop = undefined;
        if (held === watch) {
          held = undefined;
        }
      };
    },
  };
};

/**
 * Start one project's revision tree in this worker.
 *
 * @param options - The port and the checkout routes.
 * @returns The running tree, its projection and its commands.
 * @public
 */
export const createWorkerProjectRevisions = (options: WorkerProjectRevisionsOptions): WorkerProjectRevisions => {
  const { projectId } = options;
  const candidateStorage = new IndexedDbStorageProvider();
  const candidateConsent = async (): Promise<boolean> => {
    const state = await candidateStorage.getProjectLibraryState(projectId);
    return state?.syncGeoSpecCandidates === true;
  };
  const candidateRemote = async (publishing: boolean): Promise<string> => {
    if (isDesktopTarget()) {
      throw new Error('GeoSpec candidate sharing is available in the browser only.');
    }
    if (
      published.remote.kind === 'none' ||
      published.remote.phase !== 'connected' ||
      (publishing && published.remote.fetchOnly)
    ) {
      throw new Error('This project has no writable connected Git remote for GeoSpec candidates.');
    }
    const remotes = await options.port.listRemotes();
    const configured = remotes.find((remote) => remote.url === published.remote.url);
    if (configured === undefined) {
      throw new Error('The connected Git remote is unavailable.');
    }
    return configured.name;
  };
  /* The page's latest answer, read per mint so signing in or turning anonymity
   * on changes the next revision and rewrites none of the recorded ones. */
  let person: RevisionUserActor | undefined;
  /* The page's own answer, read per use: a chat ref written under the wrong
   * device id would overwrite another device's log segment (W17). */
  let device: string | undefined;
  /** Monotonic per checkout, one increment per content-change event (A38, F9). */
  const generations = new Map<string, number>();
  /* The live placement session, if the agent host opened one (TS-S5). */
  let session: TurnPlacementAdapter<FileSystemBridgeConnection> | undefined;
  const listeners = new Topic<RevisionStatusProjection>({ name: 'WorkerProjectRevisions' });
  const events = new Topic<WorkerRevisionEvent>({ name: 'WorkerProjectRevisionEvents' });
  const toasts = new Topic<RevisionToast>({ name: 'WorkerProjectRevisionToasts' });

  const { actor, settled, turns, recordEditorConflict } = createProjectRevisionsActor({
    port: options.port,
    projectId,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
    actorId: projectId,
    /* Only a feed that sees every write lets a cut skip the files it did not name (E1). */
    completeChanges: options.completeChanges === true && options.observe !== undefined,
    deviceId: () => device,
    ...(options.recordHistoryPush === undefined ? {} : { recordHistoryPush: options.recordHistoryPush }),
    /*
     * The scheduler's three exits need to know whether this document can reach
     * anything (S41). A worker has the events itself — `globalThis` is a
     * `WorkerGlobalScope` and fires `online`/`offline` — so nothing is injected
     * from the page for this one.
     */
    /* D12: the same `.tau/parameters/**` codec the desktop host injects, at every merge. */
    parameters: { read: requireParameterRecord, serialize: serializeParameterRecord },
    /*
     * D13: another device's push wakes this open project over the API's long
     * poll, with this document's session — the same cookie the git routes take.
     * The origin is read per request, so a page that names it later is heard.
     */
    remoteMoves: (input, handlers) => {
      const open = (streamHandlers: RevisionStreamHandlers): (() => void) =>
        watchRevisionStream(
          {
            projectId: input.projectId,
            apiBaseUrl: () => options.apiBaseUrl?.(),
            auth: () => ({ kind: 'cookie' }),
          },
          streamHandlers,
        );
      return options.attention === undefined ? open(handlers) : options.attention.gate(open, handlers);
    },
    connectivity: (report) => {
      const online = (): void => {
        report(true);
      };
      const offline = (): void => {
        report(false);
      };
      globalThis.addEventListener('online', online);
      globalThis.addEventListener('offline', offline);
      return () => {
        globalThis.removeEventListener('online', online);
        globalThis.removeEventListener('offline', offline);
      };
    },
    actor: ({ runId }) => {
      if (person === undefined) {
        return undefined;
      }
      /* A cut a run holds is the agent's: `git log`'s author stays the person
       * through `onBehalfOf`, while `Tau-Actor` names the model. */
      return runId === undefined ? person : { kind: 'agent', id: 'agent', runId, onBehalfOf: person };
    },
    filesystem: async (checkout) => options.filesystem(checkout.root),
    /* Tau Cloud's repository for this project, from the origin the page named. */
    remoteUrl: (id) => {
      const apiBaseUrl = options.apiBaseUrl?.();
      return apiBaseUrl === undefined ? undefined : tauRemoteUrl(apiBaseUrl, id);
    },
    /* D18: the owner's usage for the Sync region, with the page's own session. */
    remoteStorage: async () => {
      const apiBaseUrl = options.apiBaseUrl?.();
      return apiBaseUrl === undefined
        ? undefined
        : readRemoteStorageOverHttp(apiBaseUrl, { kind: 'cookie' }, projectId);
    },
    /* P51: connecting registers the project before anything asks the remote
     * for an advertisement it would otherwise answer `404`. */
    registerRemoteProject: async (id) => {
      let name: string | undefined;
      try {
        const filesystem = await options.filesystem(`/projects/${id}`);
        const manifest = JSON.parse(await filesystem.readFile('tau.json', 'utf8')) as {
          readonly name?: unknown;
        };
        name = typeof manifest.name === 'string' && manifest.name.trim() !== '' ? manifest.name.trim() : undefined;
      } catch {
        /* Registration still makes an empty or incomplete local project
         * recoverable; the API's fallback name is honest until tau.json exists. */
      }
      const apiBaseUrl = options.apiBaseUrl?.();
      if (apiBaseUrl === undefined) {
        /* No origin means no session: the same sentence the API's own 401
         * answers, from the one ladder both hosts read (C6). */
        throw new Error(registerProjectFailureMessage(401));
      }
      await registerProjectOverHttp(apiBaseUrl, { kind: 'cookie' }, { id, name });
    },
    publishPublication: async (input) => {
      const apiBaseUrl = options.apiBaseUrl?.();
      if (apiBaseUrl === undefined) {
        throw new Error(publishFailureMessage(401));
      }
      /* The document's session is the whole credential (I8): nothing is carried
       * through this module and nothing is written under the project. */
      return publishOverHttp(apiBaseUrl, { kind: 'cookie' }, input);
    },
    onChatsProjected: (chatIds) => {
      events.emit({ type: 'chats.projected', projectId, chatIds });
    },
  });

  let published: RevisionStatusProjection = selectRevisionStatus(actor.getSnapshot());

  actor.subscribe((snapshot) => {
    /* Settled changes only: the machine passes through `minting`/`dirty` more
     * often than the projection's own fields move, and a page that re-rendered
     * on every internal transition would paint frames nobody asked for. */
    const next = selectRevisionStatus(snapshot);
    if (sameRevisionStatus(published, next)) {
      return;
    }
    published = next;
    listeners.emit(next);
  });
  /* The three host revision facts, from the machines that emit them — the same
   * three `packages/host/src/revisions.ts` writes into a chat's durable log, in
   * the same schema (S9). */
  actor.on('turnFinalized', (settlement) => {
    // async-iife: bootstrap -- a settlement report never fails a turn; the
    // revision is already recorded and the graph answers either way.
    void (async (): Promise<void> => {
      try {
        events.emit(await describeTurnSettlement(options.port, projectId, settlement));
      } catch {
        /* Reporting only: a page that missed the notice re-reads the graph. */
      }
    })();
  });
  actor.on('turnConflicted', (settlement) => {
    events.emit({
      type: 'turn.conflicted',
      turnId: settlement.turnId,
      runId: settlement.runId,
      chatId: settlement.chatId,
      checkoutId: settlement.checkoutId,
    });
  });
  /* The outcome no settlement carries, emitted by the root itself (W6). */
  actor.on('turnReleased', (event) => {
    const failure = describeTurnRelease(event);
    if (failure === undefined) {
      return;
    }
    events.emit(failure);
    console.error('[revisions] turn', failure.code, failure.reason);
  });
  const changed = (checkoutId: string, paths: readonly string[]): void => {
    /* One increment per content-change event, whatever its path count: the
     * checkout takes `Math.max` of it across a mint, so a counter that
     * repeated would hide a write that landed during one (F9, F4). */
    const generation = (generations.get(checkoutId) ?? 0) + 1;
    generations.set(checkoutId, generation);
    actor.send({ type: 'changed', checkoutId, paths, generation });
    events.emit({ type: 'checkout.changed', checkoutId, paths });
  };
  /*
   * L2-F4: one observation per checkout, each raising against its own id.
   *
   * A write under a linked checkout's route used to be credited to whichever
   * checkout the workbench showed, and one under the live route while the
   * workbench showed a linked checkout was credited to that one. Reconciled
   * from the registry on every snapshot, so a checkout made or removed later
   * is observed or let go with it.
   */
  const observations = new Map<string, () => void>();
  const observeCheckouts = (checkouts: readonly CheckoutRecord[]): void => {
    const { observe } = options;
    if (observe === undefined) {
      return;
    }
    const known = new Set(checkouts.map((checkout) => checkout.id));
    for (const [id, stop] of observations) {
      if (!known.has(id)) {
        stop();
        observations.delete(id);
      }
    }
    for (const checkout of checkouts) {
      if (!observations.has(checkout.id)) {
        observations.set(
          checkout.id,
          observe(checkout.root, (paths) => {
            changed(checkout.id, paths);
          }),
        );
      }
    }
  };
  const observing = actor.subscribe((snapshot) => {
    observeCheckouts(snapshot.context.checkouts);
  });
  const stopObserving = (): void => {
    observing.unsubscribe();
    for (const stop of observations.values()) {
      stop();
    }
    observations.clear();
  };
  actor.start();
  published = selectRevisionStatus(actor.getSnapshot());
  /* W36 D1: each settled push or pull, on the existing telemetry ingest. The desktop's disk host reports its own. */
  actor.getSnapshot().children.sync?.on('syncAttempt', (attempt: SyncMachineEmitted & { type: 'syncAttempt' }) => {
    const apiBaseUrl = options.apiBaseUrl?.();
    if (apiBaseUrl === undefined || isDesktopTarget()) {
      return;
    }
    const { type: _type, durationMilliseconds, ...detail } = attempt;
    reportToApi({
      reportUrl: `${apiBaseUrl}/v1/telemetry/ingest`,
      name: 'observability.syncAttempt',
      duration: durationMilliseconds,
      detail: { ...detail, placement: 'browser' },
    });
  });
  /* After `start`, because the invoked children exist only once the root runs.
   * Restore's toasts are the one thing in this tree that needs a person to see
   * them, so they cross the port rather than being re-derived on the page. */
  const restoreChild = actor.getSnapshot().children.restore;
  restoreChild?.on('toast.restored', (toast) => {
    toasts.emit({ type: 'restored', revisionNumber: toast.revisionNumber });
  });
  restoreChild?.on('toast.undone', (toast) => {
    toasts.emit({ type: 'undone', revisionNumber: toast.revisionNumber });
  });
  restoreChild?.on('toast.error', (toast) => {
    toasts.emit({
      type: 'error',
      subject: 'restore',
      message: toast.message,
      ...(toast.code === undefined ? {} : { code: toast.code }),
      ...(toast.revisionNumber === undefined ? {} : { revisionNumber: toast.revisionNumber }),
    });
  });
  /* The branch verbs settle out of sight of the region that started them — a
   * *Discard* the registry refused has no row left to say so on (A25's "no
   * lease removal is silent"). */
  /* D10 answers *Switch* with a refusal the person who asked must see: a verb
   * that quietly does nothing is exactly what "no outcome is silent" forbids
   * (A25, I12; review R3). The resolved arm needs no notice — the workbench
   * moving is the notice. */
  /*
   * A save that failed says why (I12, W18 DEF-7).
   *
   * The Revisions pane counted it — `attention` — and named nothing, so a cut
   * that died on, say, a missing `Buffer` read as "one change could not be
   * saved" forever. A cut carrying a `turn` is already reported to the chat
   * that asked for it, through the admission the turn refuses; this channel is
   * for the ambient ones nobody is watching a spinner for.
   */
  actor.on('cutFailed', (failure) => {
    if (!isAmbientCut(failure)) {
      return;
    }
    toasts.emit({ type: 'error', subject: 'save', message: failure.reason });
  });
  /*
   * D3: a lost CAS on a save a person asked for is an answer they see, not a count.
   *
   * Only `save`: an operation's own cut is answered by the child that asked,
   * and an `idle`, `hidden` or `close` cut nobody pressed anything for heals
   * itself — the checkout re-reads, rests dirty, and the next window records
   * the same bytes (I5, N6) — so saying so would be noise under two clients.
   */
  actor.on('casLost', (lost) => {
    if (lost.turn !== undefined || lost.trigger !== 'save') {
      return;
    }
    toasts.emit({ type: 'error', subject: 'save', message: casLostMessage, code: 'CAS_LOST' });
  });
  actor.on('nothingToSave', (event) => {
    if (event.trigger === 'save') {
      toasts.emit({ type: 'nothingToSave', ...(event.heldBy === undefined ? {} : { heldBy: event.heldBy }) });
    }
  });
  actor.on('switchRefused', (refusal) => {
    toasts.emit({ type: 'refused', branch: refusal.branch, reason: refusal.reason });
  });
  actor.on('childToast', ({ type: _type, ...toast }) => {
    toasts.emit({ ...toast, type: 'notice' });
  });
  /* A conflicted merge is the one outcome that looks like nothing happening:
   * the branch merged into is byte-identical afterwards, on purpose (A22). */
  actor.on('mergeConflicted', (conflicted) => {
    toasts.emit({
      type: 'mergeConflicted',
      branch: conflicted.branch,
      into: conflicted.into,
      paths: conflicted.paths,
    });
  });
  /* The two resolution facts a page has to act on: the marker text an editor
   * opens, and the request that a chat be asked to resolve one (S33, W10). */
  actor.on('conflictMaterialized', (materialized) => {
    toasts.emit({
      type: 'conflictText',
      revisionId: materialized.revisionId,
      path: materialized.path,
      text: materialized.text,
      ours: materialized.ours,
      theirs: materialized.theirs,
    });
  });
  /* C44: the refusal travels the same way the text does, so the pane that asked
   * for a file learns that nothing is coming instead of waiting to assume it. */
  actor.on('conflictMaterializationFailed', (failed) => {
    toasts.emit({
      type: 'conflictTextFailed',
      revisionId: failed.revisionId,
      path: failed.path,
      reason: failed.reason,
    });
  });
  actor.on('turnRequested', (requested) => {
    toasts.emit({
      type: 'resolveWithChat',
      revisionId: requested.revisionId,
      checkoutId: requested.checkoutId,
      paths: requested.paths,
    });
  });
  const branchChild = actor.getSnapshot().children.branch;
  branchChild?.on('toast.branch', (toast) => {
    toasts.emit({
      type: 'branch',
      operation: toast.operation,
      branch: toast.branch,
      ...(toast.checkoutId === undefined ? {} : { checkoutId: toast.checkoutId }),
      ...(toast.checkoutRoot === undefined ? {} : { checkoutRoot: toast.checkoutRoot }),
    });
  });
  branchChild?.on('toast.error', (toast) => {
    /* The page phrases the busy refusal from its code like any other (RM-R11). */
    toasts.emit({
      type: 'error',
      subject: 'branch',
      ...(toast.operation === undefined ? {} : { operation: toast.operation }),
      ...(toast.branch === undefined ? {} : { branch: toast.branch }),
      message: toast.message,
      ...(toast.code === undefined ? {} : { code: toast.code }),
    });
  });

  /**
   * Cut the selected checkout for an explicit *Save* and wait for the tree's own answer (C16).
   *
   * The four settled outcomes are the machine's own emissions — minted,
   * refused by the I5 gate or the fresh fence, failed, or lost to another
   * writer's compare-and-swap (D3) — each naming this request (B8: an answer),
   * so no bound waits on it. `hidden` and `close` record every checkout
   * instead, through `awaitCheckoutCuts`: a `close` cut is answered the same
   * way, and only `hidden` keeps a bound, since the page may be frozen (B8).
   *
   * @returns When the cut has settled.
   */
  const awaitSave = async (): Promise<void> => {
    const trigger = 'save';
    const { checkoutId } = selectRevisionStatus(actor.getSnapshot());
    if (checkoutId === undefined) {
      throw new Error('The project checkout was not ready before close.');
    }
    const cut = Promise.withResolvers<void>();
    /* The answer names this request, so an idle mint or another tab's save never settles it (RM-R1); a save
     * absorbed by a later `hidden` or `close` is still answered under its own id (RM-R2, RV-W2b #4). */
    const requestId = `${trigger}:${randomUuid()}`;
    const matches = (event: Readonly<{ requestId?: string }>): boolean => event.requestId === requestId;
    const subscriptions = [
      actor.on('revisionMinted', (event) => {
        if (matches(event)) {
          cut.resolve();
        }
      }),
      /* Terminal: the checkout re-reads and rests dirty, so nothing else will
       * answer this request (D3). The toast above already said so. */
      actor.on('casLost', (event) => {
        if (matches(event)) {
          cut.reject(new Error(casLostMessage));
        }
      }),
      actor.on('nothingToSave', (event) => {
        if (matches(event)) {
          cut.resolve();
        }
      }),
      actor.on('cutFailed', (event) => {
        if (matches(event)) {
          cut.reject(new Error(event.reason));
        }
      }),
    ];
    try {
      actor.send({ type: 'cut', requestId, trigger, checkoutId, leaseIds: [] });
      await cut.promise;
    } finally {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    }
  };

  /**
   * The correlated `saveRevision` (C16, contract §6).
   *
   * Resolves rather than rejects: the failure a person can act on has already
   * gone out on the toast channel (`cutFailed` above), and after the bound the
   * durable queue is the guarantee (D28). The caller is an unload registrant
   * whose only question is "may `pagehide` run now".
   *
   * @param trigger - `save`, `hidden` or `close`. Defaults to `save`.
   * @returns When the cut has settled and the scheduler has quiesced.
   */
  /**
   * The correlated *New branch* (P4, contract §6).
   *
   * The `branch` child is the one owner of the verb, and its two settlements
   * are what a caller can act on: the branch exists on a checkout of its own,
   * or it was refused with a code. Name-matched rather than id-matched because
   * the child runs one verb at a time and the name is what the person typed —
   * and matched at all on the refusal too, because the child takes `create` in
   * `idle` only, so an unrelated verb's failure used to settle this one and a
   * dropped `create` never settled at all (review finding 1). Now matched by
   * request id, and the child answers every `create`, a busy one
   * `REVISIONS_BUSY` (W5 RM-R11), so no bound waits on it (B7).
   *
   * @param name - The branch to make.
   * @param from - The revision it starts at, when the caller has one.
   * @returns The checkout the registry made for it.
   */
  const createBranch = async (name: string, from?: string): Promise<BranchCreated> => {
    if (branchChild === undefined) {
      throw Object.assign(new Error('This project has no branch verbs running.'), { code: 'REVISIONS_UNAVAILABLE' });
    }
    const created = Promise.withResolvers<BranchCreated>();
    const requestId = randomUuid();
    const subscriptions = [
      branchChild.on('toast.branch', (toast) => {
        if (toast.requestId !== requestId) {
          return;
        }
        if (toast.checkoutId === undefined || toast.checkoutRoot === undefined) {
          /* A branch with no checkout named is no placement: `''` used to reach
           * `Chat.checkoutId` and leave the chat with nothing to run on (P2,
           * review finding 5). */
          created.reject(
            Object.assign(
              new Error(describeRevisionFailure('branch', 'BRANCH_UNPLACED', { branch: name }).description),
              {
                code: 'BRANCH_UNPLACED',
              },
            ),
          );
          return;
        }
        created.resolve({ branch: name, checkoutId: toast.checkoutId, checkoutRoot: toast.checkoutRoot });
      }),
      branchChild.on('toast.error', (toast) => {
        if (toast.requestId !== requestId) {
          return;
        }
        created.reject(
          Object.assign(new Error(toast.message), ...(toast.code === undefined ? [] : [{ code: toast.code }])),
        );
      }),
    ];
    try {
      actor.send({
        type: 'branch',
        event: { type: 'create', requestId, name, ...(from === undefined ? {} : { from }) },
      });
      return await created.promise;
    } finally {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    }
  };

  const saveRevision = async (trigger: 'save' | 'hidden' | 'close' = 'save'): Promise<void> => {
    try {
      /* `hidden` is the browser's close preparation (rule 9), so it records
       * what a close would: every checkout, live and linked (the close ruling). */
      await (trigger === 'save' ? awaitSave() : awaitCheckoutCuts(actor, trigger));
    } catch {
      /* Reported already; whatever did not record is still on disk for the next cut. */
    }
    try {
      await awaitSyncSettled(actor);
    } catch {
      /* The queue carries whatever did not reach the remote (D28). */
    }
  };

  const comparisonCheckout = async () => {
    const snapshot = actor.getSnapshot();
    const status = selectRevisionStatus(snapshot);
    const checkout = snapshot.context.checkouts.find((entry) => entry.id === status.checkoutId);
    if (checkout === undefined) {
      throw new Error('The selected checkout is unavailable.');
    }
    const [filesystem, basis] = await Promise.all([
      options.filesystem(checkout.root),
      status.headRevisionId === undefined ? undefined : options.port.readTree(revisionId(status.headRevisionId)),
    ]);
    if (status.headRevisionId !== undefined && basis === undefined) {
      throw new Error('The checkout head tree is unavailable.');
    }
    return { filesystem, mode: (path: string): FileMode => basis?.mode(path) ?? '100644' };
  };

  return {
    fetchGeoSpecCandidates: async () => {
      if (options.candidatePort === undefined) {
        throw new Error('This host has no bounded candidate transport.');
      }
      const controller = new AbortController();
      const candidateFetchTimeout = setTimeout(() => {
        controller.abort();
      }, 15_000);
      try {
        return await fetchGeoSpecCandidates({
          projectId,
          port: options.candidatePort(controller.signal),
          filesystem: await options.filesystem(`/projects/${projectId}`),
          remote: await candidateRemote(false),
          readConsent: candidateConsent,
          signal: controller.signal,
          abort: () => {
            controller.abort();
          },
        });
      } finally {
        clearTimeout(candidateFetchTimeout);
      }
    },
    publishGeoSpecCandidate: async (candidate) => {
      if (options.candidatePort === undefined) {
        throw new Error('This host has no bounded candidate transport.');
      }
      const controller = new AbortController();
      const candidatePublishTimeout = setTimeout(() => {
        controller.abort();
      }, 15_000);
      try {
        return await publishGeoSpecCandidate({
          projectId,
          port: options.candidatePort(controller.signal),
          filesystem: await options.filesystem(`/projects/${projectId}`),
          remote: await candidateRemote(true),
          candidate,
          readConsent: candidateConsent,
          signal: controller.signal,
          abort: () => {
            controller.abort();
          },
        });
      } finally {
        clearTimeout(candidatePublishTimeout);
      }
    },
    send: (command) => {
      switch (command.command) {
        /* The root invokes `restore` as a child and forwards none of its five
         * verbs, so the page reaches it where it lives. */
        case 'restore': {
          actor.getSnapshot().children.restore?.send({ type: 'restore', revisionId: command.revisionId });
          return;
        }
        /* Routed by the root to its `remote` child, so the page still speaks
         * only to the root (A38). */
        case 'connectRemote': {
          actor.send({
            type: 'remote',
            event: {
              type: 'connect',
              kind: command.kind,
              ...(command.url === undefined ? {} : { url: command.url }),
              ...(command.provider === undefined ? {} : { provider: command.provider }),
              ...(command.repositoryId === undefined ? {} : { repositoryId: command.repositoryId }),
              ...(command.fetchOnly === true ? { fetchOnly: true } : {}),
            },
          });
          return;
        }
        case 'disconnectRemote': {
          actor.send({ type: 'remote', event: { type: 'disconnect' } });
          return;
        }
        case 'cancelRemote': {
          actor.send({ type: 'remote', event: { type: 'cancel' } });
          return;
        }
        case 'authorizeRemote': {
          actor.send({ type: 'remote', event: { type: 'authorized' } });
          return;
        }
        case 'syncNow': {
          actor.send({ type: 'syncNow' });
          return;
        }
        case 'recordsChanged': {
          actor.send({ type: 'sync', event: { type: 'recordsChanged' } });
          return;
        }
        /* Routed by the root to the conflicted revision's own child (S33, W10). */
        case 'resolve': {
          actor.send({
            type: 'resolution',
            revisionId: command.revisionId,
            event: { type: command.side === 'mine' ? 'keepMine' : 'keepTheirs', path: command.path },
          });
          return;
        }
        case 'resolveInEditor': {
          actor.send({
            type: 'resolution',
            revisionId: command.revisionId,
            event: { type: 'openInEditor', path: command.path },
          });
          return;
        }
        case 'resolvedInEditor': {
          actor.send({
            type: 'resolution',
            revisionId: command.revisionId,
            event: { type: 'resolvedInEditor', path: command.path, content: command.content },
          });
          return;
        }
        case 'finishResolution': {
          actor.send({ type: 'resolution', revisionId: command.revisionId, event: { type: 'finish' } });
          return;
        }
        case 'abandonResolution': {
          actor.send({ type: 'resolution', revisionId: command.revisionId, event: { type: 'abandon' } });
          return;
        }
        case 'askChatToResolve': {
          actor.send({ type: 'resolution', revisionId: command.revisionId, event: { type: 'askChat' } });
          return;
        }
        /* Routed by the root to its `publish` child (A38): the dialog drives a
         * machine, and the machine owns the push, the name and the row. */
        case 'publishProject': {
          actor.send({
            type: 'publish',
            event: {
              type: 'publish',
              requestId: randomUuid(),
              ...(command.tag === undefined ? {} : { tag: command.tag }),
              ...(command.revisionId === undefined ? {} : { revisionId: command.revisionId }),
            },
          });
          return;
        }
        case 'confirmPublish': {
          actor.send({ type: 'publish', event: { type: 'confirm', draft: command.draft } });
          return;
        }
        case 'cancelPublish': {
          actor.send({ type: 'publish', event: { type: 'cancel' } });
          return;
        }
        case 'resetPublish': {
          actor.send({ type: 'publish', event: { type: 'reset' } });
          return;
        }
        /* Routed by the root to its `branch` child, which owns the verb's
         * lifecycle — including the confirmation and the failure edge the
         * region used to fake with a boolean (A38). */
        case 'discardBranch': {
          actor.send({
            type: 'branch',
            event: {
              type: 'discard',
              requestId: randomUuid(),
              branch: command.branch,
              ...(command.checkoutId === undefined ? {} : { checkoutId: command.checkoutId }),
            },
          });
          return;
        }
        case 'mergeBranch': {
          actor.send({ type: 'branch', event: { type: 'merge', requestId: randomUuid(), branch: command.branch } });
          return;
        }
        case 'renameBranch': {
          actor.send({
            type: 'branch',
            event: { type: 'rename', requestId: randomUuid(), branch: command.branch, name: command.name },
          });
          return;
        }
        case 'confirmBranch': {
          actor.send({ type: 'branch', event: { type: 'confirm' } });
          return;
        }
        case 'cancelBranch': {
          actor.send({ type: 'branch', event: { type: 'cancel' } });
          return;
        }
        case 'switch': {
          actor.send({ type: 'switch', requestId: randomUuid(), branch: command.branch });
          return;
        }
        case 'undo':
        case 'undoOperation': {
          actor.getSnapshot().children.restore?.send({ type: command.command });
          break;
        }
        case 'confirm':
        case 'cancel': {
          actor.getSnapshot().children.restore?.send({ type: command.command });
          break;
        }
        /*
         * `Mod+S`, the tab going hidden, and the page being unloaded: one verb,
         * three triggers, and the checkout's I5 gate decides whether anything
         * is minted. The cut carries no turn id — nothing is waiting for an
         * answer addressed to a turn — so the root routes it to the selected
         * checkout and the projection reports the outcome.
         */
        case 'setActor': {
          person = command.actor;
          break;
        }
        case 'setDeviceId': {
          device = command.deviceId;
          break;
        }
        case 'flushKeepalive': {
          /* Fire and forget by contract: the document is already going away, so
           * there is nobody left to await this. What it can still do is tell the
           * scheduler the offer was refused, which is a queue entry. */
          // async-iife: bootstrap -- `pagehide` cannot await anything.
          void (async (): Promise<void> => {
            const sent = await options.keepalive?.();
            const outcome: KeepalivePushOutcome = sent ?? { status: 'nothingToSend' };
            if (outcome.status === 'refused') {
              actor.send({ type: 'sync', event: { type: 'pushFailed', reason: outcome.reason } });
            }
          })();
          break;
        }
        case 'saveRevision': {
          /* One implementation, awaited or not: the uncorrelated form is the
           * same cut with nobody listening for its answer (I15). */
          void saveRevision(command.trigger);
          break;
        }
        /* Questions, not events: they are answered on a correlated frame and
         * never reach the tree (see `answerOf`). */
        case 'tag':
        case 'deleteTag':
        case 'log':
        case 'divergence':
        case 'diff':
        case 'compare':
        case 'recordEditorConflict': {
          break;
        }
        case 'fetchGeoSpecCandidates':
        case 'publishGeoSpecCandidate': {
          break;
        }
        default: {
          const { command: verb, ...input } = command;
          actor.send({ type: verb, ...input } as Parameters<typeof actor.send>[0]);
        }
      }
    },
    changed,
    tag: async (input) =>
      options.port.tag({
        name: input.name,
        revisionId: revisionId(input.revisionId),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(person === undefined ? {} : { actor: person }),
      }),
    deleteTag: async (name) => options.port.deleteTag(name),
    log: async (request) => readRevisionLog(options.port, request),
    divergence: async (head, base) => options.port.divergence({ head: revisionId(head), base: revisionId(base) }),
    diff: async (revision, from, compareOptions) => {
      if (compareOptions?.against === 'checkout') {
        const original = await options.port.readTree(revisionId(revision));
        if (original === undefined) {
          throw new Error('The selected revision is unavailable.');
        }
        const checkout = await comparisonCheckout();
        // ponytail: one bounded capture per live list refresh; reuse the checkout capture memo if large projects make this hot.
        const modified = await captureRevisionTree(checkout.filesystem, {
          exclude: (path) => !tauPathPolicy.classify(path).versioned,
          inheritedMode: checkout.mode,
        });
        return diffRevisionTrees({ original, modified });
      }
      /* Against the revision's own first parent by default, which the store
       * knows: a caller that remembered a base would diff the wrong tree when a
       * dirty checkout was minted between placement and settlement. */
      const record = await options.port.readRevision(revisionId(revision));
      return readRevisionDiff(options.port, from ?? record?.parents[0], revision);
    },
    compare: async (revision, path, compareOptions) => {
      /* S38's second half: the right-hand side is the working copy rather than
       * another revision, so a reader can see what they have changed since the
       * revision they are looking at. One round trip, same viewer. */
      if (compareOptions?.against === 'checkout') {
        const tree = await options.port.readTree(revisionId(revision));
        if (tree === undefined) {
          throw new Error('The selected revision is unavailable.');
        }
        const checkout = await comparisonCheckout();
        const { filesystem } = checkout;
        const recorded = tree.get(path);
        let working: Uint8Array<ArrayBuffer> | undefined;
        let mode = checkout.mode(path);
        try {
          working = await filesystem.readFile(path);
          mode = (await filesystem.getFileMode?.(path)) ?? mode;
        } catch (error) {
          if (
            !(
              typeof error === 'object' &&
              error !== null &&
              (('code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR')) ||
                ('name' in error && error.name === 'NotFoundError'))
            )
          ) {
            throw error;
          }
          working = undefined;
        }
        return compareRevisionFile({
          original: recorded === undefined ? undefined : { content: recorded, mode: tree.mode(path) ?? '100644' },
          modified: working === undefined ? undefined : { content: working, mode },
        });
      }
      const record = await options.port.readRevision(revisionId(revision));
      if (record === undefined) {
        throw new Error('The selected revision is unavailable.');
      }
      const base = compareOptions?.from ?? record.parents[0];
      const [before, after] = await Promise.all([
        base === undefined ? undefined : options.port.readTree(revisionId(base)),
        options.port.readTree(revisionId(revision)),
      ]);
      if (after === undefined || (base !== undefined && before === undefined)) {
        throw new Error('The selected revision tree is unavailable.');
      }
      const original = before?.get(path);
      const modified = after.get(path);
      return compareRevisionFile({
        original: original === undefined ? undefined : { content: original, mode: before?.mode(path) ?? '100644' },
        modified: modified === undefined ? undefined : { content: modified, mode: after.mode(path) ?? '100644' },
      });
    },
    status: () => published,
    subscribe: (listener) => listeners.subscribe(listener),
    subscribeEvents: (listener) => events.subscribe(listener),
    subscribeToasts: (listener) => toasts.subscribe(listener),
    inspect: () => {
      const snapshot = actor.getSnapshot();
      return {
        status: snapshot.status,
        children: Object.keys(snapshot.children),
        writeGenerations: Object.fromEntries(
          Object.entries(snapshot.context.checkoutRefs).map(([id, ref]) => [
            id,
            ref.getSnapshot().context.writeGeneration,
          ]),
        ),
      };
    },
    saveRevision,
    recordEditorConflict,
    createBranch,
    placementSession: async () => {
      await session?.fence();
      /* Each attempt's tools are a filesystem bridge over its checkout, sent to the agent host as a transferable. */
      session = createTurnPlacementPort({
        revisions: { actor, turns },
        openTools: ({ filesystem }) => createFileSystemBridgePort(filesystem),
      });
      return session;
    },
    release: async () => {
      await session?.fence();
      /*
       * The scheduler first, inside its bound (W13 review 2 R2/P33).
       *
       * This runs on the document's last frame — `pagehide`, a route change, a
       * worker being replaced — and stopping the tree cancels whatever the
       * `hidden` flush started. Waiting here is what makes "the close revision
       * is pushed, or recorded as unsent" true; after the bound the durable
       * queue is the guarantee and the next open retries it (D28).
       */
      /* Every checkout no turn holds, live and linked (the close ruling, D6).
       * A refused cut still lets the scheduler push what the others minted,
       * and then keeps the tree: the next close re-attempts the cut. */
      /* A turn still waiting to be placed would hold every checkout from the
       * cuts; a closing document is not going to run it. Abandoned, it
       * releases whatever it is granted, and the placement port refuses its
       * admission (RV-W2b #5, TS-R1). No watcher settle first: the change bus
       * reports every write before the write resolves (E1). */
      releaseUnplacedTurns(actor);
      let refused: Error | undefined;
      try {
        await awaitCheckoutCuts(actor, 'close');
      } catch (error) {
        refused = error instanceof Error ? error : new Error(String(error));
      }
      try {
        await awaitSyncSettled(actor);
      } catch {
        /* RV-W2b #2: only a refused cut keeps the tree. A failed or unsettled
         * sync is already in the durable queue, and the Sync region keeps its
         * refusal (D28). */
      }
      if (refused !== undefined) {
        throw refused;
      }
      stopObserving();
      listeners.dispose();
      events.dispose();
      toasts.dispose();
      actor.stop();
      /* Stopping the tree cancels nothing already in flight; the store's own
       * creation is the one effect that outlives it (W3c §7.4). */
      await settled();
    },
  };
};

/**
 * One request frame on a revision port: a command, optionally correlated.
 *
 * A command that has an answer carries an `id` and is answered by one `result`
 * frame (see `answerOf`); everything else rides the tree's own projection.
 *
 * @public
 */
export type WorkerRevisionRequest =
  | (WorkerRevisionCommand & Readonly<{ id?: number }>)
  | Readonly<{ command: 'close'; id?: number }>
  /*
   * The credential a third-party remote is reached with (S34, W12).
   *
   * A port frame rather than a tree command, for the same reason `close` is:
   * the *port* makes the requests, and the credential is resolved per request
   * rather than held in a machine's context (I8). The page sends it because
   * only the page has `authClient` and `window.ENV`; the worker keeps it in
   * memory for as long as the project is open and never writes it anywhere.
   */
  | (GitRemoteCredential & Readonly<{ command: 'remoteCredential'; id?: number }>)
  /* Whether this project is the page's focused one (RV-W5b F12): a port frame,
   * because focus is the page's fact about its projects, not the tree's. */
  | Readonly<{ command: 'focus'; focused: boolean; id?: number }>;

/**
 * What one correlated command answered.
 *
 * One `result` frame for every command that has an answer, discriminated by
 * `kind` — rather than a frame type per verb, which would be a second channel
 * to keep in step with the request ids (W3d review).
 *
 * @public
 */
export type WorkerRevisionResult =
  | Readonly<{ kind: 'log'; rows: readonly RevisionRow[] }>
  | Readonly<{ kind: 'divergence'; divergence: RevisionDivergence }>
  | Readonly<{ kind: 'diff'; entries: readonly RevisionDiffEntry[] }>
  | Readonly<{ kind: 'comparison'; comparison: RevisionFileComparison }>
  | Readonly<{ kind: 'geoSpecCandidates'; candidates: ReadonlyArray<Uint8Array<ArrayBuffer>> }>
  | Readonly<{ kind: 'geoSpecCandidatePublication'; status: 'updated' | 'upToDate' | 'rejected' }>
  /** `tag` answers with the named version; `deleteTag` answers with nothing. */
  | Readonly<{ kind: 'tag'; tag: RevisionTag | undefined }>
  /**
   * The project's root has been released (W19).
   *
   * A correlated `close` is what lets `project-session.closing` wait for the
   * flush it asked for: `release()` takes the close cut and then awaits W13's
   * `awaitSyncSettled`, and only then does this frame go out. An uncorrelated
   * `close` — what `pagehide` sends — still answers nothing.
   */
  | Readonly<{ kind: 'closed' }>
  /**
   * The cut a `saveRevision` asked for has settled (C16).
   *
   * Carries nothing: the outcome a reader acts on is the projection (a new
   * head, or none) and the toast channel (a failure). What the frame *is* is
   * permission for `pagehide` to run.
   */
  | Readonly<{ kind: 'saved' }>
  /** What recording an editor's overlapping edit did (D14). */
  | Readonly<{ kind: 'editorConflict'; outcome: EditorConflictOutcome }>
  /**
   * The branch a `createBranch` asked for exists, on the checkout named here.
   *
   * The one fact the caller needs (interface segregation): a page placing a
   * chat on the branch it just made would otherwise subscribe to the whole
   * projection to infer it.
   */
  | (Readonly<{ kind: 'branch' }> & BranchCreated);

/** A branch that now exists, and the checkout the registry made for it. @public */
export type BranchCreated = Readonly<{ branch: string; checkoutId: string; checkoutRoot: string }>;

/** One response frame on a revision port. @public */
export type WorkerRevisionResponse =
  | Readonly<{ type: 'status'; status: RevisionStatusProjection }>
  | Readonly<{ type: 'event'; event: WorkerRevisionEvent }>
  | Readonly<{ type: 'toast'; toast: RevisionToast }>
  | Readonly<{ type: 'result'; id: number; result: WorkerRevisionResult }>
  | Readonly<{ type: 'error'; id: number; message: string; code?: string }>;

/** What the registry needs from the worker it runs in. @public */
export type WorkerRevisionRegistryOptions = Readonly<{
  /** Browser-only scoped candidate transport; absent on native/host-served roots. */
  createCandidatePort?: (
    projectId: string,
    credential: () => GitRemoteCredential | undefined,
    signal: AbortSignal,
  ) => RevisionPort;
  /**
   * Build the port for one project; the worker owns the rooted provider it reads.
   *
   * `credential` reads what the page last sent for this project (S34): the
   * worker constructs the HTTP client, so the options `createGitRemoteTransport`
   * builds have to be handed to it here rather than set on a port that already
   * exists. The worker holds the box; the rule itself lives in
   * `@taucad/revisions` so both legs and the integration pins read the one
   * implementation (W12 review R7).
   */
  createPort: (
    projectId: string,
    credential: () => GitRemoteCredential | undefined,
  ) => RevisionPort | Promise<RevisionPort>;
  /**
   * Offer one project's last push again under `keepalive`, for `pagehide` (W13).
   *
   * Separate from {@link WorkerRevisionRegistryOptions.createPort} because the
   * recorder wraps the HTTP *client* the worker builds there: the port never
   * sees it. Absent, `flushKeepalive` answers `nothingToSend` and the durable
   * queue is the whole guarantee.
   */
  keepalive?: (projectId: string) => Promise<KeepalivePushOutcome>;
  /** The same recorder, armed around one project's history-set push (W13 P35). */
  recordHistoryPush?: (projectId: string) => (<Result>(run: () => Promise<Result>) => Promise<Result>) | undefined;
  /**
   * This project is closed and whatever the host kept for it can go.
   *
   * The recorder holds a whole pack body, and a document that opens several
   * projects would otherwise keep one per project for its own lifetime (W13
   * review 2 R2, secondary).
   */
  released?: (projectId: string) => void;
  /** One rooted provider per checkout route. */
  filesystem: (root: string) => RootedFileSystem | Promise<RootedFileSystem>;
  /**
   * Observe the versioned content changes under one checkout route.
   *
   * The worker holds the change bus; each project's tree observes one route per
   * checkout, live and linked, and raises one `changed` per event against that
   * checkout (F9 — debounce is the machine's, W6; L2-F4).
   */
  observe: (root: string, onChanged: (paths: readonly string[]) => void) => () => void;
  /** Whether `observe` is the change bus itself, so a cut re-reads only what it reports (E1). */
  completeChanges?: boolean;
  /**
   * This project's filesystem is served by a host that owns its revisions.
   *
   * P31: the browser worker then creates no store of its own for it — one
   * project, one store. The page reads the projection from the host side.
   */
  hostServesRevisions?: (projectId: string) => boolean;
  /**
   * Serve one placement session on the port the page brokered from the resident agent host (W8 TS-S5, W4 T5).
   *
   * The transport is the agent channel's own, injected so this module holds no rpc (R3). Absent, a placement
   * session is refused by closing its port, which its client reads as a dead session.
   */
  servePlacement?: (
    input: Readonly<{
      port: MessagePort;
      projectId: string;
      session: TurnPlacementAdapter<FileSystemBridgeConnection>;
    }>,
  ) => PlacementSessionHandle;
  /** Timers and time for every revision tree this worker opens (MC-R4). */
  clock?: ActorOptions<AnyActorLogic>['clock'];
  /** The trees' inspector; development passes the console inspector, tests the harness. */
  inspect?: ActorOptions<AnyActorLogic>['inspect'];
}>;

/** A served placement session, as the injected transport hands it back. @public */
export type PlacementSessionHandle = Readonly<{ onClose: (handler: () => void) => void }>;

/** The worker's revision roots, one per opened project. @public */
export type WorkerRevisionRegistry = Readonly<{
  connect: (port: MessagePort, projectId: string) => void;
  /**
   * Serve one project's placement session to the resident agent host (W8 TS-S5). The session waits for the page's
   * own revision port, so it never opens a root ahead of the page's routing and credential frames (RV9-F1); while it
   * is live the project's root stays open with no page port, so settlement needs no editor route.
   */
  connectPlacement: (port: MessagePort, projectId: string) => void;
  /**
   * Serve one project's revisions to a reader (the resident agent host's revisions tool, W6 RH-S8; W6.r1 finding 9).
   * A reader never opens a root: it is refused unless the project is already open, it does not keep the root open,
   * its credential frames are ignored (the page owns them), and it is closed when the project closes.
   */
  connectReader: (port: MessagePort, projectId: string) => void;
  /** Test and teardown seam: which projects hold a live root right now. */
  openProjectIds: () => readonly string[];
  /** The live roots themselves, for a caller that must inspect one. */
  roots: () => ReadonlyMap<string, Promise<WorkerProjectRevisions>>;
  stopAll: () => Promise<void>;
}>;

type ProjectEntry = {
  /** The page ports: the root stays open while one is (the refcount). */
  readonly ports: Set<MessagePort>;
  /** Reader ports: served, never counted, closed with the project (W6.r1 finding 9). */
  readonly readers: Set<MessagePort>;
  /** Live placement sessions: the root stays open while one is (TS-S5). */
  readonly placements: Set<PlacementSessionHandle>;
  /** Record what the page last said about reaching a third-party remote (S34, I8). */
  readonly setCredential: (credential: GitRemoteCredential) => void;
  /** Record the API origin alone, which Publish carries and a credential also names. */
  readonly setApiBaseUrl: (apiBaseUrl: string) => void;
  /** Whether this project is the page's focused one, which alone holds the long poll (F12). */
  readonly setFocused: (focused: boolean) => void;
  readonly revisions: Promise<WorkerProjectRevisions>;
  readonly unsubscribe: () => void;
};

/**
 * The answer one request frame expects, or `undefined` when it expects none.
 *
 * Four of the verbs are questions (a placement and the three graph reads) and
 * the rest are the tree's own events, which ride the projection. Splitting them
 * here keeps `connect` one branch rather than one per verb.
 *
 * @param tree - The project's running root.
 * @param request - The frame the page sent.
 * @returns The pending answer, or `undefined` for a fire-and-forget verb.
 */
const answerOf = (
  tree: WorkerProjectRevisions,
  request: WorkerRevisionRequest,
): Promise<WorkerRevisionResult> | undefined => {
  switch (request.command) {
    case 'log': {
      const { branch, limit, from } = request;
      return tree
        .log({
          ...(branch === undefined ? {} : { branch }),
          ...(limit === undefined ? {} : { limit }),
          ...(from === undefined ? {} : { from }),
        })
        .then((rows) => ({ kind: 'log', rows }) as const);
    }
    case 'divergence': {
      return tree
        .divergence(request.head, request.base)
        .then((divergence) => ({ kind: 'divergence', divergence }) as const);
    }
    case 'diff': {
      return tree
        .diff(request.revisionId, request.from, { against: request.against })
        .then((entries) => ({ kind: 'diff', entries }) as const);
    }
    case 'tag': {
      const { command: _verb, id: _id, ...input } = request;
      return tree.tag(input).then((tag) => ({ kind: 'tag', tag }) as const);
    }
    case 'deleteTag': {
      return tree.deleteTag(request.name).then(() => ({ kind: 'tag', tag: undefined }) as const);
    }
    case 'compare': {
      return tree
        .compare(request.revisionId, request.path, {
          ...(request.from === undefined ? {} : { from: request.from }),
          ...(request.against === undefined ? {} : { against: request.against }),
        })
        .then((comparison) => ({ kind: 'comparison', comparison }) as const);
    }
    case 'fetchGeoSpecCandidates': {
      return tree.fetchGeoSpecCandidates().then((candidates) => ({ kind: 'geoSpecCandidates', candidates }) as const);
    }
    case 'publishGeoSpecCandidate': {
      return tree
        .publishGeoSpecCandidate(request.candidate)
        .then((status) => ({ kind: 'geoSpecCandidatePublication', status }) as const);
    }
    /* A question now (C16): the `hidden` unload registrant must be able to wait
     * for the close cut before `pagehide` offers a pack. An uncorrelated frame
     * takes the same path and its answer is simply dropped. */
    case 'saveRevision': {
      return tree.saveRevision(request.trigger).then(() => ({ kind: 'saved' }) as const);
    }
    case 'recordEditorConflict': {
      const { path, base, mine } = request;
      return tree
        .recordEditorConflict({ path, base, mine })
        .then((outcome) => ({ kind: 'editorConflict', outcome }) as const);
    }
    /* A question now too: the page that made the branch places a chat on it, so
     * it needs the checkout rather than a projection diff to guess from. */
    case 'createBranch': {
      return tree.createBranch(request.name, request.from).then((created) => ({ kind: 'branch', ...created }) as const);
    }
    default: {
      return undefined;
    }
  }
};

/**
 * Serve one revision root per opened project over `MessagePort`s.
 *
 * The root starts with the first port for a project and stops with the last —
 * the page opens exactly one per project route, so that is "started when the
 * project's root is opened and stopped with it" (A38) without a second
 * lifecycle message to keep in step.
 *
 * @param options - The port factory, the checkout routes and the change seam.
 * @returns The registry the worker hands its `revisionsConnect` messages to.
 * @public
 */
export const createWorkerRevisionRegistry = (options: WorkerRevisionRegistryOptions): WorkerRevisionRegistry => {
  const projects = new Map<string, ProjectEntry>();
  /* Placement sessions brokered before the page's own port for their project (RV9-F1). */
  const waitingPlacements = new Map<string, MessagePort[]>();
  /** Each project's release while its last holder's close is in flight. */
  const closing = new Map<string, Promise<void>>();

  const openProject = (projectId: string): ProjectEntry => {
    const existing = projects.get(projectId);
    if (existing !== undefined) {
      return existing;
    }
    const ports = new Set<MessagePort>();
    const readers = new Set<MessagePort>();
    /* Memory only, for as long as the project is open: a credential is never
     * written under a project or a workspace (I8). */
    let credential: GitRemoteCredential | undefined;
    /* Held apart from the credential: the origin outlives any one remote, and
     * Publish names it without minting anything (review R4). */
    let apiBaseUrl: string | undefined;
    const attention = createRemoteAttention();
    const revisions = (async (): Promise<WorkerProjectRevisions> =>
      createWorkerProjectRevisions({
        projectId,
        attention,
        port: await options.createPort(projectId, () => credential),
        ...(options.createCandidatePort === undefined
          ? {}
          : {
              candidatePort: (signal: AbortSignal) => options.createCandidatePort!(projectId, () => credential, signal),
            }),
        filesystem: options.filesystem,
        observe: options.observe,
        ...(options.completeChanges === undefined ? {} : { completeChanges: options.completeChanges }),
        ...(options.clock === undefined ? {} : { clock: options.clock }),
        ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
        /* The same fact the credential frame carries, read per use: a page that
         * signs in after the project opened publishes without reopening it. */
        apiBaseUrl: () => apiBaseUrl ?? credential?.apiBaseUrl,
        ...((): Readonly<{ recordHistoryPush?: <Result>(run: () => Promise<Result>) => Promise<Result> }> => {
          const record = options.recordHistoryPush?.(projectId);
          return record === undefined ? {} : { recordHistoryPush: record };
        })(),
        ...(options.keepalive === undefined
          ? {}
          : {
              keepalive: async (): Promise<KeepalivePushOutcome> => {
                const sent = await options.keepalive?.(projectId);
                return sent ?? { status: 'nothingToSend' };
              },
            }),
      }))();
    let unsubscribe = (): void => undefined;
    // async-iife: bootstrap -- the root is served through `revisions`; this only
    // attaches the two streams once it exists.
    void (async (): Promise<void> => {
      const tree = await revisions;
      const publish = (frame: WorkerRevisionResponse): void => {
        for (const port of [...ports, ...readers]) {
          port.postMessage(frame);
        }
      };
      const subscriptions = [
        tree.subscribe((status) => {
          publish({ type: 'status', status });
        }),
        tree.subscribeEvents((event) => {
          publish({ type: 'event', event });
        }),
        tree.subscribeToasts((toast) => {
          publish({ type: 'toast', toast });
        }),
      ];
      unsubscribe = () => {
        for (const stop of subscriptions) {
          stop();
        }
      };
    })();
    const entry: ProjectEntry = {
      ports,
      readers,
      placements: new Set(),
      setCredential: (held) => {
        credential = held;
        apiBaseUrl = held.apiBaseUrl;
      },
      setApiBaseUrl: (url) => {
        apiBaseUrl = url;
      },
      setFocused: attention.setFocused,
      revisions,
      unsubscribe: () => {
        unsubscribe();
      },
    };
    projects.set(projectId, entry);
    return entry;
  };

  const closeProject = async (projectId: string): Promise<void> => {
    const entry = projects.get(projectId);
    if (entry === undefined) {
      return;
    }
    const release = (async (): Promise<void> => {
      const tree = await entry.revisions;
      /* A refused close keeps the entry and its live tree for the next close. */
      await tree.release();
      projects.delete(projectId);
      entry.unsubscribe();
      /* A reader lives no longer than the root it reads. */
      for (const reader of entry.readers) {
        reader.close();
      }
      entry.readers.clear();
      options.released?.(projectId);
    })();
    closing.set(projectId, release);
    try {
      await release;
    } finally {
      closing.delete(projectId);
    }
  };

  /*
   * A port that arrives while the project's release is in flight would join a
   * root that stops under it and be left talking to a stopped tree: a page that
   * reopens a project it just closed, or another tab, would never sync or
   * stream, and a placement session would place turns on nothing. It connects
   * once that close settles, to a fresh root or to the one a refused close
   * kept; its frames wait in the port, which is not started until then.
   */
  const afterClose = (projectId: string, retry: () => void): boolean => {
    const pending = closing.get(projectId);
    if (pending === undefined) {
      return false;
    }
    // async-iife: bootstrap -- the closing port hears the close's outcome; this only waits it out.
    void (async (): Promise<void> => {
      await pending.catch(() => undefined);
      retry();
    })();
    return true;
  };

  /* One placement session on its port; the root closes with its last page port or session, whichever is last. */
  const servePlacementOn = async (entry: ProjectEntry, projectId: string, port: MessagePort): Promise<void> => {
    const tree = await entry.revisions.catch(() => undefined);
    if (tree === undefined || options.servePlacement === undefined) {
      /* No root, so no session: the agent host reads the closed port as a dead session (W4 T6). */
      port.close();
      return;
    }
    const session = await tree.placementSession();
    const handle = options.servePlacement({ port, projectId, session });
    entry.placements.add(handle);
    handle.onClose(() => {
      entry.placements.delete(handle);
      // async-iife: bootstrap -- a closed session has no caller; the root closes with its last holder.
      void (async (): Promise<void> => {
        await session.fence();
        if (entry.ports.size === 0 && entry.placements.size === 0 && projects.get(projectId) === entry) {
          try {
            await closeProject(projectId);
          } catch (error) {
            /* A refused close keeps the tree; the next holder's close re-attempts the cut (RV-W2b #2). */
            console.warn('[revisions] a project could not be closed after its placement session ended', error);
          }
        }
      })();
    });
  };

  type Served = Readonly<{ entry: ProjectEntry; projectId: string; port: MessagePort; reader: boolean }>;
  /* One port's frames: a page port counts toward the root's lifetime and carries the credential; a reader does not. */
  const serve = ({ entry, projectId, port, reader }: Served): void => {
    port.addEventListener('message', ({ data }: MessageEvent<WorkerRevisionRequest>) => {
      // async-iife: bootstrap -- a port frame has no caller to return to; the
      // answer rides the port.
      void (async (): Promise<void> => {
        const tree = await entry.revisions;
        if (data.command === 'close') {
          try {
            if (reader) {
              entry.readers.delete(port);
            } else if (entry.ports.size === 1 && entry.ports.has(port) && entry.placements.size === 0) {
              await closeProject(projectId);
            } else {
              entry.ports.delete(port);
            }
          } catch (error) {
            if (data.id !== undefined) {
              port.postMessage({
                type: 'error',
                id: data.id,
                message: error instanceof Error ? error.message : String(error),
              } satisfies WorkerRevisionResponse);
            }
            return;
          }
          /* The port outlives the release when the caller correlated its
           * close: `project-session.closing` waits for this frame, and a
           * port closed first could not carry it. */
          if (data.id !== undefined) {
            port.postMessage({
              type: 'result',
              id: data.id,
              result: { kind: 'closed' },
            } satisfies WorkerRevisionResponse);
          }
          port.close();
          return;
        }
        if (reader && (data.command === 'remoteCredential' || data.command === 'publishProject')) {
          /* The page's routing and credential frames are the page's (RV9-F1); a reader cannot set or use them. */
          if (data.id !== undefined) {
            port.postMessage({
              type: 'error',
              id: data.id,
              message: "A revisions reader cannot send the project's credential or publish it.",
            } satisfies WorkerRevisionResponse);
          }
          return;
        }
        if (data.command === 'publishProject' && data.apiBaseUrl !== undefined) {
          entry.setApiBaseUrl(data.apiBaseUrl);
        }
        if (data.command === 'remoteCredential') {
          const { command: _verb, id: _id, ...held } = data;
          entry.setCredential(held);
          return;
        }
        if (data.command === 'focus') {
          /* Focus is the page's fact about its projects (F12); a reader has none to give. */
          if (!reader) {
            entry.setFocused(data.focused);
          }
          return;
        }
        const answer = answerOf(tree, data);
        if (answer === undefined) {
          tree.send(data);
          return;
        }
        const { id } = data;
        try {
          const result = await answer;
          if (id !== undefined) {
            port.postMessage({ type: 'result', id, result } satisfies WorkerRevisionResponse);
          }
        } catch (error) {
          if (id !== undefined) {
            port.postMessage({
              type: 'error',
              id,
              message: error instanceof Error ? error.message : String(error),
              ...(typeof (error as { code?: unknown }).code === 'string'
                ? { code: (error as { code: string }).code }
                : {}),
            } satisfies WorkerRevisionResponse);
          }
        }
      })();
    });
    port.start();
    // async-iife: bootstrap -- a port that just connected gets the projection
    // it missed.
    void (async (): Promise<void> => {
      const tree = await entry.revisions;
      port.postMessage({ type: 'status', status: tree.status() } satisfies WorkerRevisionResponse);
    })();
  };

  const registry: WorkerRevisionRegistry = {
    connect: (port, projectId) => {
      /* P31: nothing here owns a host-served project's revisions, so nothing
       * here opens a store for it. The port is closed rather than answered,
       * because an empty projection would be a second, wrong answer. */
      if (options.hostServesRevisions?.(projectId) === true) {
        port.close();
        return;
      }
      if (
        afterClose(projectId, () => {
          registry.connect(port, projectId);
        })
      ) {
        return;
      }
      const entry = openProject(projectId);
      entry.ports.add(port);
      for (const waiting of waitingPlacements.get(projectId) ?? []) {
        // async-iife: bootstrap -- a placement session that waited for this port is served now.
        void servePlacementOn(entry, projectId, waiting);
      }
      waitingPlacements.delete(projectId);
      serve({ entry, projectId, port, reader: false });
    },
    connectReader: (port, projectId) => {
      if (
        afterClose(projectId, () => {
          registry.connectReader(port, projectId);
        })
      ) {
        return;
      }
      const entry = projects.get(projectId);
      if (options.hostServesRevisions?.(projectId) === true || entry === undefined) {
        /* Never opens a root: only the page's own port does, behind its routing and credential frames (RV9-F1). */
        port.close();
        return;
      }
      entry.readers.add(port);
      serve({ entry, projectId, port, reader: true });
    },
    connectPlacement: (port, projectId) => {
      if (options.hostServesRevisions?.(projectId) === true || options.servePlacement === undefined) {
        port.close();
        return;
      }
      if (
        afterClose(projectId, () => {
          registry.connectPlacement(port, projectId);
        })
      ) {
        return;
      }
      const entry = projects.get(projectId);
      if (entry === undefined) {
        /* RV9-F1: only the page's own port opens the root, behind its routing and credential frames. */
        waitingPlacements.set(projectId, [...(waitingPlacements.get(projectId) ?? []), port]);
        return;
      }
      // async-iife: bootstrap -- the session is served on its own port; there is no caller to answer.
      void servePlacementOn(entry, projectId, port);
    },
    openProjectIds: () => [...projects.keys()],
    roots: () => new Map([...projects].map(([projectId, entry]) => [projectId, entry.revisions])),
    stopAll: async () => {
      await Promise.all([...projects.keys()].map(async (projectId) => closeProject(projectId)));
    },
  };
  return registry;
};
