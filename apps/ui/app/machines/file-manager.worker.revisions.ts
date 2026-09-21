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
  admissionMilliseconds,
  awaitSyncSettled,
  createProjectRevisionsActor,
  describeTurnRelease,
  describeTurnSettlement,
  syncQuiesceMilliseconds,
} from '@taucad/revisions/revision-effects';
import type { TurnConflictedEvent, TurnFailedEvent, TurnFinalizedEvent } from '@taucad/revisions/revision-effects';
import { selectRevisionStatus } from '@taucad/revisions/project-revisions-machine';
import {
  sameRevisionStatus,
  versionedChangePaths as classifiedChangePaths,
} from '@taucad/revisions/revision-projection';
import { branchRegistryMilliseconds } from '@taucad/revisions/branch-machine';
import type { BranchOperation } from '@taucad/revisions/branch-machine';
import type { PublishDraft } from '@taucad/revisions/publish-machine';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import {
  publishFailureMessage,
  publishOverHttp,
  readRevisionDiff,
  readRevisionLog,
  registerProjectFailureMessage,
  registerProjectOverHttp,
  tauRemoteUrl,
} from '@taucad/revisions';
import type {
  GitRemoteCredential,
  RevisionDiffEntry,
  RevisionLogRequest,
  RevisionPort,
  RevisionRow,
  RevisionTag,
  RevisionUserActor,
  IsomorphicGitCheckoutOptions,
  KeepalivePushOutcome,
} from '@taucad/revisions';
import { revisionId } from '@taucad/revisions/algorithms';
import type { ImmutableRevisionTree } from '@taucad/revisions/algorithms';
import type { MountTable, RootedFileSystem, WorkspaceFileService } from '@taucad/filesystem';
import type { ChangeEvent } from '@taucad/types';
import { describeRevisionFailure } from '#lib/revision-failure-copy.js';

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
  | Readonly<{ command: 'admitTurn'; turnId: string; chatId: string; runId: string; checkoutId?: string }>
  | Readonly<{ command: 'turnCompleted'; turnId: string }>
  | Readonly<{ command: 'turnAbandoned'; turnId: string }>
  | Readonly<{ command: 'restore'; revisionId: string }>
  | Readonly<{ command: 'returnToLatest' }>
  | Readonly<{ command: 'undo' }>
  | Readonly<{ command: 'confirm' }>
  | Readonly<{ command: 'cancel' }>
  | Readonly<{ command: 'switch'; branch: string }>
  | Readonly<{ command: 'followChat'; chatId: string }>
  | Readonly<{ command: 'pinTo'; checkoutId: string }>
  | Readonly<{
      command: 'adoptHostFinalized';
      checkoutId: string;
      revisionId: string;
      treeId: string;
      branch?: string;
    }>
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
   * The Sync region's four verbs (S26, S34).
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
  | Readonly<{ command: 'syncNow' }>
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
   * `localStorage` and a worker cannot see it. It names a chat *log segment*, so
   * a worker that has not been told writes no chat refs at all rather than
   * guessing an id two profiles could share (`apps/ui/app/lib/device-id.ts` is
   * the one source).
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
  | Readonly<{ command: 'log'; branch?: string; limit?: number }>
  | Readonly<{ command: 'diff'; revisionId: string; from?: string }>
  | Readonly<{ command: 'compare'; revisionId: string; path: string; from?: string; against?: 'checkout' }>;

/** What an `admitTurn` command answers once its turn holds its lease. @public */
export type WorkerTurnPlacement = Readonly<{
  checkoutId: string;
  /** The checkout's route in the worker's namespace, e.g. `/projects/p1`. */
  root: string;
  /** Empty on an unborn branch. */
  baseRevisionId: string;
}>;

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
  | Readonly<{ type: 'chats.projected'; projectId: string; chatIds: readonly string[] }>;

/** One file's text on both sides of a revision. @public */
export type RevisionFileComparison = Readonly<{ original: string; modified: string }>;

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
  | Readonly<{ type: 'restored'; revisionNumber: number; unrecoverable: readonly string[] }>
  | Readonly<{ type: 'nothingToSave' }>
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
  | Readonly<{
      type: 'error';
      subject: 'restore' | 'branch' | 'save';
      /* Which branch verb refused, so a caller correlating one *New branch*
       * does not take another verb's refusal for its own (finding 1). */
      operation?: BranchOperation;
      branch?: string;
      message: string;
      /* P4: the code is the refusal; the page turns it into product words. */
      code?: string;
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
  /** Place a turn and wait for its lease; rejects when the turn cannot be placed. */
  admitTurn: (input: {
    readonly turnId: string;
    readonly chatId: string;
    readonly runId: string;
    readonly checkoutId?: string;
  }) => Promise<WorkerTurnPlacement>;
  /** Every other verb: fire-and-forget into the tree. */
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
  /** One content-change event on a checkout, already filtered to versioned paths. */
  changed: (checkoutId: string, paths: readonly string[]) => void;
  /** Name one revision, or re-point an existing name (S31). */
  tag: (input: Readonly<{ name: string; revisionId: string; note?: string }>) => Promise<RevisionTag>;
  /** Remove one name. The revision it named stays. */
  deleteTag: (name: string) => Promise<void>;
  /** One branch's history, newest first, with its first-parent `Rev N` (I3). */
  log: (request?: RevisionLogRequest) => Promise<readonly RevisionRow[]>;
  /** Which paths one revision changed, against `from` or its own first parent. */
  diff: (revision: string, from?: string) => Promise<readonly RevisionDiffEntry[]>;
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
  /** Stop the tree and wait for the store's own creation to finish. */
  release: () => Promise<void>;
}>;

/** Dependencies one project's root needs from its worker. @public */
export type WorkerProjectRevisionsOptions = Readonly<{
  projectId: string;
  port: RevisionPort;
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
  authorityEpoch: string;
  clock?: () => number;
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
}>;

/**
 * Start one project's revision tree in this worker.
 *
 * @param options - The port, the checkout routes and this document's epoch.
 * @returns The running tree, its projection and its commands.
 * @public
 */
export const createWorkerProjectRevisions = (options: WorkerProjectRevisionsOptions): WorkerProjectRevisions => {
  const { projectId } = options;
  /* The page's latest answer, read per mint so signing in or turning anonymity
   * on changes the next revision and rewrites none of the recorded ones. */
  let person: RevisionUserActor | undefined;
  /* The page's own answer, read per use: a chat ref written under the wrong
   * device id would overwrite another device's log segment (W17). */
  let device: string | undefined;
  /** One pending admission per run, settled by the placement callback. */
  const admissions = new Map<string, PromiseWithResolvers<WorkerTurnPlacement>>();
  /** Where each placed run landed, filled at `placed` and answered at `leased`. */
  const placements = new Map<string, WorkerTurnPlacement>();
  /**
   * Refuse one waiting admission, with the reason it was refused for.
   *
   * One sentence for every way a turn can end without its lease, so the caller
   * never has to tell a refusal apart from the bound: `prepare` throwing,
   * `turnReleased` (W19-b) and the bound itself all answer in this shape.
   *
   * @param runId - The run whose admission is waiting.
   * @param reason - What the host can tell the person, already a sentence.
   */
  const refuseAdmission = (runId: string, reason: string, code = 'REVISION_PREPARE_FAILED'): void => {
    const pending = admissions.get(runId);
    admissions.delete(runId);
    placements.delete(runId);
    pending?.reject(
      Object.assign(new Error(`This project could not open a revision for the turn: ${reason}`), { code }),
    );
  };
  /** Monotonic per checkout, one increment per content-change event (A38, F9). */
  const generations = new Map<string, number>();
  const listeners = new Topic<RevisionStatusProjection>({ name: 'WorkerProjectRevisions' });
  const events = new Topic<WorkerRevisionEvent>({ name: 'WorkerProjectRevisionEvents' });
  const toasts = new Topic<RevisionToast>({ name: 'WorkerProjectRevisionToasts' });

  const { actor, settled } = createProjectRevisionsActor({
    port: options.port,
    projectId,
    authorityEpoch: options.authorityEpoch,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    actorId: projectId,
    deviceId: () => device,
    ...(options.recordHistoryPush === undefined ? {} : { recordHistoryPush: options.recordHistoryPush }),
    /*
     * The scheduler's three exits need to know whether this document can reach
     * anything (S41). A worker has the events itself — `globalThis` is a
     * `WorkerGlobalScope` and fires `online`/`offline` — so nothing is injected
     * from the page for this one.
     */
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
    onPlacement: (placement) => {
      if (placement.status === 'refused') {
        refuseAdmission(placement.runId, placement.reason);
        return;
      }
      const pending = admissions.get(placement.runId);
      if (placement.status === 'leased') {
        /* The admission ends here, not at `placed`: a dirty checkout is minted
         * as the turn's base *between* the two, and a run admitted before that
         * cut would fold its own writes into its own parent. */
        const placed = placements.get(placement.runId);
        admissions.delete(placement.runId);
        placements.delete(placement.runId);
        pending?.resolve(placed ?? { checkoutId: placement.checkoutId, root: '', baseRevisionId: '' });
        return;
      }
      placements.set(placement.runId, {
        checkoutId: placement.checkout.id,
        root: placement.checkout.root,
        baseRevisionId: placement.baseRevisionId ?? '',
      });
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
    /*
     * The reason, now, rather than the bound's sentence half a minute later.
     *
     * Only `prepare` refused an admission (`revision-effects.ts`), so a turn
     * that ended any other way before its lease — a base cut the checkout could
     * not settle, a lease it could not write, a `release` — left the caller
     * waiting out `admissionMilliseconds` and then hearing "it was never
     * leased", which names nothing anybody can act on (I12, W19-b). A
     * `finalized` or `conflicted` turn held its lease, so its admission was
     * already resolved at `leased` and there is nothing here to settle.
     */
    console.error('[revisions] turn', failure.code, failure.reason);
    refuseAdmission(event.runId, describeRevisionFailure('turn', failure.code).description);
  });
  /* R10: a second admission for a turn id the root still holds is answered now,
   * with its own code, instead of waiting out `admissionMilliseconds`. Edit and
   * retry reuse the first turn's message id as the lease key, so this is the
   * answer a chat gets when its previous turn actor is still retiring. */
  actor.on('turnRefused', (event) => {
    refuseAdmission(event.runId, event.reason, event.code);
  });
  actor.start();
  published = selectRevisionStatus(actor.getSnapshot());
  /* After `start`, because the invoked children exist only once the root runs.
   * Restore's toasts are the one thing in this tree that needs a person to see
   * them, so they cross the port rather than being re-derived on the page. */
  const restoreChild = actor.getSnapshot().children.restore;
  restoreChild?.on('toast.restored', (toast) => {
    toasts.emit({ type: 'restored', revisionNumber: toast.revisionNumber, unrecoverable: toast.unrecoverable });
  });
  restoreChild?.on('toast.error', (toast) => {
    toasts.emit({ type: 'error', subject: 'restore', message: toast.message });
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
   * saved" forever. A cut carrying a `turnId` is already reported to the chat
   * that asked for it, through the admission the turn refuses; this channel is
   * for the ambient ones nobody is watching a spinner for.
   */
  actor.on('cutFailed', (failure) => {
    if (failure.turnId !== undefined) {
      return;
    }
    toasts.emit({ type: 'error', subject: 'save', message: failure.reason });
  });
  actor.on('nothingToSave', (event) => {
    if (event.trigger === 'save') {
      toasts.emit({ type: 'nothingToSave' });
    }
  });
  actor.on('switchRefused', (refusal) => {
    toasts.emit({ type: 'refused', branch: refusal.branch, reason: refusal.reason });
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
   * Cut the live checkout and wait for the tree's own answer (C16).
   *
   * One implementation for the close path and for an explicit save: the three
   * settled outcomes are the machine's own emissions — minted, refused by the
   * I5 gate, or failed — and the deadline is the same `syncQuiesceMilliseconds`
   * everything else on the close path is bounded by.
   *
   * @param trigger - What asked for the cut (S30).
   * @returns When the cut has settled.
   */
  const awaitCut = async (trigger: 'save' | 'hidden' | 'close'): Promise<void> => {
    const { checkoutId } = selectRevisionStatus(actor.getSnapshot());
    if (checkoutId === undefined) {
      throw new Error('The project checkout was not ready before close.');
    }
    const cut = Promise.withResolvers<void>();
    const matches = (event: Readonly<{ checkoutId: string; trigger: string }>): boolean =>
      event.checkoutId === checkoutId && event.trigger === trigger;
    const subscriptions = [
      actor.on('revisionMinted', (event) => {
        if (matches(event)) {
          cut.resolve();
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
    const bound = globalThis.setTimeout(() => {
      cut.reject(new Error(`The ${trigger} revision was not recorded before the deadline.`));
    }, syncQuiesceMilliseconds);
    try {
      actor.send({ type: 'cut', trigger, checkoutId, leaseIds: [] });
      await cut.promise;
    } finally {
      globalThis.clearTimeout(bound);
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
   * dropped `create` never settled at all (review finding 1). The bound is the
   * registry's own, doubled: this wait covers the cut *and* the registry verb,
   * each of which is bounded by one of them inside the child.
   *
   * @param name - The branch to make.
   * @param from - The revision it starts at, when the caller has one.
   * @returns The checkout the registry made for it.
   */
  const createBranch = async (name: string, from?: string): Promise<BranchCreated> => {
    const created = Promise.withResolvers<BranchCreated>();
    const subscriptions = [
      branchChild?.on('toast.branch', (toast) => {
        if (toast.operation !== 'create' || toast.branch !== name) {
          return;
        }
        if (toast.checkoutId === undefined || toast.checkoutRoot === undefined) {
          /* A branch with no checkout named is no placement: `''` used to reach
           * `Chat.checkoutId` and leave the chat with nothing to run on (P2,
           * review finding 5). */
          created.reject(
            Object.assign(new Error(describeRevisionFailure('branch', 'BRANCH_UNPLACED', name).description), {
              code: 'BRANCH_UNPLACED',
            }),
          );
          return;
        }
        created.resolve({ branch: name, checkoutId: toast.checkoutId, checkoutRoot: toast.checkoutRoot });
      }),
      branchChild?.on('toast.error', (toast) => {
        if (toast.operation !== 'create' || toast.branch !== name) {
          return;
        }
        created.reject(
          Object.assign(new Error(toast.message), ...(toast.code === undefined ? [] : [{ code: toast.code }])),
        );
      }),
    ];
    const bound = globalThis.setTimeout(() => {
      created.reject(Object.assign(new Error('This project did not answer in time.'), { code: 'BRANCH_UNANSWERED' }));
    }, branchRegistryMilliseconds * 2);
    try {
      actor.send({
        type: 'branch',
        event: { type: 'create', name, ...(from === undefined ? {} : { from }) },
      });
      return await created.promise;
    } finally {
      globalThis.clearTimeout(bound);
      for (const subscription of subscriptions) {
        subscription?.unsubscribe();
      }
    }
  };

  const saveRevision = async (trigger: 'save' | 'hidden' | 'close' = 'save'): Promise<void> => {
    try {
      await awaitCut(trigger);
      await awaitSyncSettled(actor);
    } catch {
      /* Reported already; the queue carries whatever did not reach the remote. */
    }
  };

  return {
    admitTurn: async (input) => {
      const pending = Promise.withResolvers<WorkerTurnPlacement>();
      admissions.set(input.runId, pending);
      const bound = globalThis.setTimeout(() => {
        if (!admissions.has(input.runId)) {
          return;
        }
        /*
         * The root is told, not only the caller (T4-02).
         *
         * An admission queued behind a held turn id (V8) outlives the wait that
         * asked for it: the root raised it when that turn retired, the turn it
         * spawned took the checkout's lease, and nothing was left to send it
         * `turnCompleted` — so the checkout read as held for the rest of the
         * session and every manual save on it answered `nothingToSave`. A lease
         * has no heartbeat by policy (§8), so this host giving up is the only
         * liveness signal it has.
         */
        actor.send({ type: 'turnAbandoned', turnId: input.turnId, runId: input.runId });
        refuseAdmission(input.runId, 'it was never leased.');
      }, admissionMilliseconds);
      /* No wait for the registry: the root holds an admission that arrives
       * before it and replays it, so there is nothing here to compensate
       * for (A38, W3c §7.1). */
      actor.send({
        type: 'admitTurn',
        turnId: input.turnId,
        chatId: input.chatId,
        runId: input.runId,
        ...(input.checkoutId === undefined ? {} : { checkoutId: input.checkoutId }),
      });
      try {
        return await pending.promise;
      } finally {
        globalThis.clearTimeout(bound);
      }
    },
    send: (command) => {
      switch (command.command) {
        case 'admitTurn': {
          const { command: _verb, ...input } = command;
          actor.send({ type: 'admitTurn', ...input });
          return;
        }
        case 'adoptHostFinalized': {
          actor.send({
            type: 'checkoutChanged',
            checkoutId: command.checkoutId,
            revisionId: command.revisionId,
            treeId: command.treeId,
            branch: command.branch,
          });
          return;
        }
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
            event: { type: 'publish', ...(command.tag === undefined ? {} : { tag: command.tag }) },
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
              branch: command.branch,
              ...(command.checkoutId === undefined ? {} : { checkoutId: command.checkoutId }),
            },
          });
          return;
        }
        case 'mergeBranch': {
          actor.send({ type: 'branch', event: { type: 'merge', branch: command.branch } });
          return;
        }
        case 'renameBranch': {
          actor.send({ type: 'branch', event: { type: 'rename', branch: command.branch, name: command.name } });
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
        case 'turnCompleted':
        case 'turnAbandoned': {
          /* Sent straight through: `turn.machine` buffers a completion that
           * arrives while it is still `preparing` and replays it on
           * `leased.held`, so the worker holds nothing (W6). */
          actor.send({ type: command.command, turnId: command.turnId });
          return;
        }
        case 'returnToLatest':
        case 'undo':
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
        case 'diff':
        case 'compare': {
          break;
        }
        default: {
          const { command: verb, ...input } = command;
          actor.send({ type: verb, ...input } as Parameters<typeof actor.send>[0]);
        }
      }
    },
    changed: (checkoutId, paths) => {
      /* One increment per content-change event, whatever its path count: the
       * checkout takes `Math.max` of it across a mint, so a counter that
       * repeated would hide a write that landed during one (F9, F4). */
      const generation = (generations.get(checkoutId) ?? 0) + 1;
      generations.set(checkoutId, generation);
      actor.send({ type: 'changed', checkoutId, paths, generation });
    },
    tag: async (input) =>
      options.port.tag({
        name: input.name,
        revisionId: revisionId(input.revisionId),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(person === undefined ? {} : { actor: person }),
      }),
    deleteTag: async (name) => options.port.deleteTag(name),
    log: async (request) => readRevisionLog(options.port, request),
    diff: async (revision, from) => {
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
        const { checkoutId } = published;
        const checkout = actor.getSnapshot().context.checkouts.find((entry) => entry.id === checkoutId);
        const [tree, filesystem] = await Promise.all([
          options.port.readTree(revisionId(revision)),
          checkout === undefined ? undefined : options.filesystem(checkout.root),
        ]);
        const decoder = new TextDecoder();
        const recorded = tree?.get(path);
        let working = '';
        try {
          working = filesystem === undefined ? '' : decoder.decode(await filesystem.readFile(path));
        } catch {
          /* The file is not in the checkout any more: an empty right-hand side
           * is exactly "deleted since this revision". */
        }
        return { original: recorded === undefined ? '' : decoder.decode(recorded), modified: working };
      }
      const record = await options.port.readRevision(revisionId(revision));
      const base = compareOptions?.from ?? record?.parents[0];
      const [before, after] = await Promise.all([
        base === undefined ? undefined : options.port.readTree(revisionId(base)),
        options.port.readTree(revisionId(revision)),
      ]);
      const decoder = new TextDecoder();
      const read = (tree: ImmutableRevisionTree | undefined): string => {
        const content = tree?.get(path);
        /* An added path has no `before` and a deleted one has no `after`; the
         * viewer reads an empty side as exactly that. */
        return content === undefined ? '' : decoder.decode(content);
      };
      return { original: read(before), modified: read(after) };
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
    createBranch,
    release: async () => {
      /*
       * The scheduler first, inside its bound (W13 review 2 R2/P33).
       *
       * This runs on the document's last frame — `pagehide`, a route change, a
       * worker being replaced — and stopping the tree cancels whatever the
       * `hidden` flush started. Waiting here is what makes "the close revision
       * is pushed, or recorded as unsent" true; after the bound the durable
       * queue is the guarantee and the next open retries it (D28).
       */
      await awaitCut('close');
      await awaitSyncSettled(actor);
      /* The fourth way a turn ends without its lease, in the same frame and
       * with the same code as the other three — a client cannot act on a
       * refusal it has to tell apart by its wording (a2 review R2). */
      for (const runId of admissions.keys()) {
        refuseAdmission(runId, 'it stopped before the turn was placed.');
      }
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
  | (GitRemoteCredential & Readonly<{ command: 'remoteCredential'; id?: number }>);

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
  | Readonly<{ kind: 'placement'; placement: WorkerTurnPlacement }>
  | Readonly<{ kind: 'log'; rows: readonly RevisionRow[] }>
  | Readonly<{ kind: 'diff'; entries: readonly RevisionDiffEntry[] }>
  | Readonly<{ kind: 'comparison'; comparison: RevisionFileComparison }>
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
   * Observe this project's versioned content changes.
   *
   * The worker holds the change bus; the registry only coalesces what it is
   * handed into one `changed` per event (F9 — debounce is the machine's, W6).
   */
  observe: (projectId: string, onChanged: (paths: readonly string[]) => void) => () => void;
  /**
   * The identity of the session that owns this project's revisions (W19).
   *
   * A lease written under any other epoch belongs to a session that no longer
   * owns the project, and `sweepLeases` retires it on open. Given per project
   * because one document can hold several live projects, each with its own
   * session (W3c review R4).
   */
  authorityEpoch: string | ((projectId: string) => string);
  /**
   * This project's filesystem is served by a host that owns its revisions.
   *
   * P31: the browser worker then creates no store of its own for it — one
   * project, one store. The page reads the projection from the host side.
   */
  hostServesRevisions?: (projectId: string) => boolean;
  clock?: () => number;
}>;

/** The worker's revision roots, one per opened project. @public */
export type WorkerRevisionRegistry = Readonly<{
  connect: (port: MessagePort, projectId: string) => void;
  /** Test and teardown seam: which projects hold a live root right now. */
  openProjectIds: () => readonly string[];
  /** The live roots themselves, for a caller that must inspect one. */
  roots: () => ReadonlyMap<string, Promise<WorkerProjectRevisions>>;
  stopAll: () => Promise<void>;
}>;

type ProjectEntry = {
  readonly ports: Set<MessagePort>;
  /** Record what the page last said about reaching a third-party remote (S34, I8). */
  readonly setCredential: (credential: GitRemoteCredential) => void;
  /** Record the API origin alone, which Publish carries and a credential also names. */
  readonly setApiBaseUrl: (apiBaseUrl: string) => void;
  readonly revisions: Promise<WorkerProjectRevisions>;
  readonly stopObserving: () => void;
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
    case 'admitTurn': {
      const { id: _id, command: _verb, ...input } = request;
      return tree.admitTurn(input).then((placement) => ({ kind: 'placement', placement }) as const);
    }
    case 'log': {
      const { branch, limit } = request;
      return tree
        .log({ ...(branch === undefined ? {} : { branch }), ...(limit === undefined ? {} : { limit }) })
        .then((rows) => ({ kind: 'log', rows }) as const);
    }
    case 'diff': {
      return tree.diff(request.revisionId, request.from).then((entries) => ({ kind: 'diff', entries }) as const);
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
    /* A question now (C16): the `hidden` unload registrant must be able to wait
     * for the close cut before `pagehide` offers a pack. An uncorrelated frame
     * takes the same path and its answer is simply dropped. */
    case 'saveRevision': {
      return tree.saveRevision(request.trigger).then(() => ({ kind: 'saved' }) as const);
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

  const openProject = (projectId: string): ProjectEntry => {
    const existing = projects.get(projectId);
    if (existing !== undefined) {
      return existing;
    }
    const ports = new Set<MessagePort>();
    /* Memory only, for as long as the project is open: a credential is never
     * written under a project or a workspace (I8). */
    let credential: GitRemoteCredential | undefined;
    /* Held apart from the credential: the origin outlives any one remote, and
     * Publish names it without minting anything (review R4). */
    let apiBaseUrl: string | undefined;
    const revisions = (async (): Promise<WorkerProjectRevisions> =>
      createWorkerProjectRevisions({
        projectId,
        port: await options.createPort(projectId, () => credential),
        filesystem: options.filesystem,
        authorityEpoch:
          typeof options.authorityEpoch === 'string' ? options.authorityEpoch : options.authorityEpoch(projectId),
        ...(options.clock === undefined ? {} : { clock: options.clock }),
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
    let stopObserving = (): void => undefined;
    let unsubscribe = (): void => undefined;
    // async-iife: bootstrap -- the root is served through `revisions`; this only
    // attaches the two streams once it exists.
    void (async (): Promise<void> => {
      const tree = await revisions;
      const publish = (frame: WorkerRevisionResponse): void => {
        for (const port of ports) {
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
      stopObserving = options.observe(projectId, (paths) => {
        const { checkoutId } = tree.status();
        if (checkoutId !== undefined) {
          tree.changed(checkoutId, paths);
        }
      });
    })();
    const entry: ProjectEntry = {
      ports,
      setCredential: (held) => {
        credential = held;
        apiBaseUrl = held.apiBaseUrl;
      },
      setApiBaseUrl: (url) => {
        apiBaseUrl = url;
      },
      revisions,
      stopObserving: () => {
        stopObserving();
      },
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
    const tree = await entry.revisions;
    await tree.release();
    projects.delete(projectId);
    entry.stopObserving();
    entry.unsubscribe();
    options.released?.(projectId);
  };

  return {
    connect: (port, projectId) => {
      /* P31: nothing here owns a host-served project's revisions, so nothing
       * here opens a store for it. The port is closed rather than answered,
       * because an empty projection would be a second, wrong answer. */
      if (options.hostServesRevisions?.(projectId) === true) {
        port.close();
        return;
      }
      const entry = openProject(projectId);
      entry.ports.add(port);
      port.addEventListener('message', ({ data }: MessageEvent<WorkerRevisionRequest>) => {
        // async-iife: bootstrap -- a port frame has no caller to return to; the
        // answer rides the port.
        void (async (): Promise<void> => {
          const tree = await entry.revisions;
          if (data.command === 'close') {
            try {
              if (entry.ports.size === 1 && entry.ports.has(port)) {
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
          if (data.command === 'publishProject' && data.apiBaseUrl !== undefined) {
            entry.setApiBaseUrl(data.apiBaseUrl);
          }
          if (data.command === 'remoteCredential') {
            const { command: _verb, id: _id, ...held } = data;
            entry.setCredential(held);
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
    },
    openProjectIds: () => [...projects.keys()],
    roots: () => new Map([...projects].map(([projectId, entry]) => [projectId, entry.revisions])),
    stopAll: async () => {
      await Promise.all([...projects.keys()].map(async (projectId) => closeProject(projectId)));
    },
  };
};
