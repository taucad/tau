/**
 * Turn revisions on a Node host (charter V17, north star N26 and I-EDIT).
 *
 * The host — never the agent and never the client — records what a turn wrote.
 * The lifecycle itself is `projectRevisionsMachine` and its children, which run
 * identically in a page, in this daemon and in the Electron utility; this module
 * is the Node composition of that tree: it starts one actor per served project,
 * gives it the effects `@taucad/revisions/revision-effects` builds over a
 * {@link RevisionPort}, and hands the host's run actor (M1) the project's
 * turn-placement port over that tree (W8 TS-S4): M1 admits, completes and
 * acknowledges every attempt itself, and appends its settlement rows.
 */

import { waitFor } from 'xstate';
import type { ActorOptions, AnyActorLogic, SnapshotFrom } from 'xstate';
import { randomUUID } from 'node:crypto';
import { readFileSync, watch as watchDirectory } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { basename, join, sep } from 'node:path';
import { z } from 'zod';

import { jsonValueSchema } from '@taucad/agent-host';
import type { JsonValue } from '@taucad/agent-host';
import type { AgentChannelRevisionEvent } from '@taucad/agent-host/wire';
import type { FileMode } from '@taucad/filesystem';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { classify } from '@taucad/filesystem/path-registry';
import { revisionId, compareRevisionFile, captureRevisionTree, diffRevisionTrees } from '@taucad/revisions/algorithms';
import type { ParameterRecordCodec } from '@taucad/revisions/algorithms';
import {
  awaitCheckoutCuts,
  awaitSyncSettled,
  closeCutMilliseconds,
  createProjectRevisionsActor,
  releaseUnplacedTurns,
  syncQuiesceMilliseconds,
  describeTurnSettlement,
  describeTurnRelease,
} from '@taucad/revisions/revision-effects';
import type {
  CheckoutFileSystems,
  ProjectRevisionsActor,
  UseCheckoutFileSystem,
  TurnConflictedEvent as SettlementConflicted,
  TurnFailedEvent as SettlementFailed,
  TurnFinalizedEvent as SettlementFinalized,
} from '@taucad/revisions/revision-effects';
import {
  generatedGitattributesPath,
  generatedIgnorePath,
  readRevisionDiff,
  readRevisionLog,
  readRevisionPlace,
  publishOverHttp,
  readRemoteStorageOverHttp,
  registerProjectOverHttp,
  tauRemoteUrl,
  watchRevisionStream,
} from '@taucad/revisions';
import { selectBranchNeedsConfirmation } from '@taucad/revisions/branch-machine';
import type { SyncMachineEmitted } from '@taucad/revisions/sync-machine';
import { requireParameterRecord, serializeParameterRecord } from '@taucad/parameters';
import type { branchMachine } from '@taucad/revisions/branch-machine';
import { isAmbientCut } from '@taucad/revisions/checkout-machine';
import { selectRevisionStatus } from '@taucad/revisions/project-revisions-machine';
import { sameRevisionStatus } from '@taucad/revisions/revision-projection';
import type {
  CheckoutRecord,
  CreateRevisionTagInput,
  PublishDraft,
  PublishPublicationActorInput,
  PublishPublicationActorOutput,
  RevisionActor,
  RevisionDiffEntry,
  RevisionEngineDescriptor,
  RevisionLogRequest,
  RevisionPlace,
  RevisionPort,
  RevisionRow,
  RevisionStatusProjection,
  RevisionTag,
  SyncPushOutcome,
} from '@taucad/revisions';
import { GitToolchainError, createNativeGitRevisionPort, resolveGitToolchain } from '@taucad/revisions/node';
import type {
  MissingGitTool,
  NativeGitCheckoutOptions,
  NativeGitRemoteCredential,
  TauApiCredential,
} from '@taucad/revisions/node';
import { createTurnPlacementPort } from '@taucad/revisions/turn-placement';
import type { TurnPlacementAdapter, TurnPlacementPortOptions } from '@taucad/revisions/turn-placement';
import type { TurnSettlement } from '@taucad/revisions/turn-machine';

import { defaultConfigDirectory } from '#credential-store.js';
import { hostRevisionActor } from '#revision-actor.js';

/**
 * How this host reads and writes `.tau/parameters/**` for the per-key merge (D12).
 *
 * One value for every composition in this module, and the same pair the browser
 * worker injects, so a conflict re-derived here settles as it was recorded.
 */
const parameterCodec: ParameterRecordCodec = { read: requireParameterRecord, serialize: serializeParameterRecord };

/**
 * Where one prepared turn runs, and what it descends from.
 *
 * Published per run so the *external agent port* and Tau's own tool registry
 * can root the turn where the placement put it. The port is constructed before
 * the launcher this wrapper wraps, so the three share a map rather than a call
 * (VI11 — the host records the turn, the agent only works in what it is given).
 *
 * `mode` is the session-record word for the two kinds of checkout — the live
 * project (`direct`) and a linked one (`candidate`). It is not a revision mode:
 * a turn's placement is resolved from the chat's checkout and never branches.
 *
 * @public
 */
export type TurnCheckout = {
  /** Absolute directory the turn's agent works in. */
  readonly cwd: string;
  /** Whether that directory is the project itself or a linked checkout. */
  readonly mode: 'direct' | 'candidate';
  /** Revision the turn's tree descends from; empty on an unborn branch. */
  readonly baseRevisionId: string;
};

/**
 * The host-attested settlement of one turn (A4, D9, S9).
 *
 * Declared by `@taucad/revisions/revision-effects`, beside the machine that
 * emits it, so the browser worker root and this host publish one schema by
 * construction rather than by convention (A38). Aliased rather than re-exported
 * because `#revisions.js` is an internal subpath, not a barrel: its consumers
 * read the host's own surface, and `no-barrel-files` stays honest about where
 * the declaration lives.
 *
 * @public
 */
export type TurnFinalizedEvent = SettlementFinalized;

/** A turn whose merge conflicted; the conflicted revision is on its branch (A22). @public */
export type TurnConflictedEvent = SettlementConflicted;

/** A turn that ended without settling, with the reason already safe to render. @public */
export type TurnFailedEvent = SettlementFailed;

/** What a Node host reports about its revisions. @public */
export type HostRevisionEvent =
  | TurnFinalizedEvent
  | TurnConflictedEvent
  | TurnFailedEvent
  | {
      readonly type: 'revision.failed';
      readonly operation: 'open' | 'add' | 'remove' | 'retire';
      readonly reason: string;
    }
  | {
      /**
       * This machine cannot record revisions at all: `git` or `git-lfs` is
       * missing (OQ-B8). Emitted once when the project opens, so a person is
       * told before the first turn instead of finding an empty history later.
       */
      readonly type: 'revision.unavailable';
      readonly reason: string;
      readonly missing: readonly MissingGitTool[];
    };

/**
 * Options for {@link createProjectRevisions}.
 *
 * `clock`, `inspect` and `onRejectedEvent` go to the revision actor tree (MC-R4):
 * production passes none, and tests pass a `StepClock` and the harness inspector.
 *
 * @public
 */
export type ProjectRevisionsOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> & {
  /** Absolute workspace root this host owns: the live checkout's tree. */
  readonly workspaceRoot: string;
  /**
   * The content-addressed store this project's revisions are minted by.
   *
   * Defaults to native Git over the project directory, with linked checkouts in
   * this host's own data directory — never inside a served tree, because Git
   * refuses a worktree inside its own worktree (S6, S12). A caller passes its
   * own port instead; `createIsomorphicGitRevisionPort` over a `NodeFsProvider`
   * is the *test* construction, since browser CAS is per-document rather than
   * cross-process. Nothing below this line changes with the choice, and no
   * revision mode exists to choose.
   */
  readonly port?: RevisionPort | undefined;
  /** Defaults to a `NodeFsProvider` at the live root, or at a linked checkout's own. */
  readonly filesystem?: CheckoutFileSystems | undefined;
  /** Optional host-owned admission wrapper around checkout tree reads and writes. */
  readonly useFileSystem?: UseCheckoutFileSystem | undefined;
  /** Native linked-checkout mutations under the embedding host's writer authority. */
  readonly checkoutMutation?: NativeGitCheckoutOptions['withMutationAuthority'];
  /** Defaults to the workspace root's directory name. */
  readonly projectId?: string | undefined;
  /** Host-private parent for linked Git worktrees; defaults to Tau's config directory. */
  readonly checkoutsDirectory?: string | undefined;
  /**
   * The `git` this host records with (OQ-B8, OQ3).
   *
   * Absent, it is taken from `PATH` — which is also why the check is here and
   * not only in the CLI: a desktop launched from Finder has
   * `/usr/bin:/bin:/usr/sbin:/sbin`. A packaged app passes the `git` it ships,
   * and `git-lfs` is reached the way a person reaches it, as that git's own
   * subcommand; there is no second binary to name.
   */
  readonly gitExecutable?: string | undefined;
  /** Tau API origin, when this host has an authenticated cloud session. */
  readonly apiBaseUrl?: string | undefined;
  /** Read per remote request; never persisted under the project. */
  readonly tauCredential?: (() => TauApiCredential | undefined) | undefined;
  /**
   * Where this host runs, for Tau Sync telemetry (W36 D1). Set, each settled
   * push or pull is reported to the API's telemetry ingest with the session
   * bearer; absent, nothing is reported.
   */
  readonly syncTelemetryPlacement?: 'desktop' | 'daemon' | undefined;
  /** Read per third-party Git request; the renderer may replace it in memory. */
  readonly remoteCredential?: (() => NativeGitRemoteCredential | undefined) | undefined;
  /** Called once per host revision fact. Reporting only; never fails a turn. */
  readonly events?: ((event: HostRevisionEvent) => void) | undefined;
  /**
   * Where each admitted turn runs, published by run id (V19).
   *
   * Written when the turn's placement resolves — before the launcher admits
   * anything — and cleared when it settles, so the external agent port reads
   * this turn's own checkout and never a previous turn's. Pass the same map to
   * `createAcpExternalAgentPort`; omit it on a host that runs no external agents.
   */
  readonly checkouts?: Map<string, TurnCheckout> | undefined;
  /**
   * Actor recorded on this host's revisions.
   *
   * W5 replaces it with the turn's real author (the model row, or the external
   * agent id); until then every host turn is the host itself.
   */
  readonly actorId?: string | undefined;
  /**
   * The actor recorded on every revision this host mints (S37, A26).
   *
   * The host owns the mapping because only the host knows who it is running
   * for: a daemon serving one machine answers with that machine's user, and a
   * Tau Cloud host answers from the session. Anonymity is applied here, before
   * the write, so switching it later rewrites nothing.
   */
  readonly actor?:
    | ((input: { readonly runId: string | undefined; readonly trigger: string }) => RevisionActor | undefined)
    | undefined;
  /**
   * Observe this workspace's own writes, so the checkout knows it is dirty.
   *
   * On by default on a disk host, because without it `changed` has no caller
   * and every Node dirty path is inert: the idle window never starts, *Save
   * revision* hashes a tree nothing said had changed, and the pane shows a
   * clean checkout over an edited tree (W3c review R3). A host that already has
   * a change source of its own — one serving the filesystem to a client — turns
   * it off and calls {@link ProjectRevisions.changed} itself, so one project
   * never has two counters.
   */
  readonly watchWorkspace?: boolean | undefined;
};

/** One project's running revision actor tree. @public */
export type ProjectRevisions = {
  /** Browser-safe projection and verb seam served over the existing host channel. */
  readonly channel: Readonly<{
    request(input: JsonValue): Promise<Readonly<{ result: JsonValue; status: JsonValue }>>;
    events(signal: AbortSignal): AsyncIterable<AgentChannelRevisionEvent>;
  }>;
  /**
   * This project's history, read-only (S28).
   *
   * The same three functions `tau revisions` and the Revisions pane read, over
   * this project's own port — handed to `createHostToolRegistry` so the agent's
   * `revisions` tool cannot answer from a second reading of the graph. Nothing
   * here writes: an agent has no branch, merge, restore, discard or sync (I10).
   */
  readonly history: Readonly<{
    log(request?: RevisionLogRequest): Promise<readonly RevisionRow[]>;
    diff(from: string | undefined, to: string): Promise<readonly RevisionDiffEntry[]>;
    describe(): Promise<RevisionPlace>;
  }>;
  /**
   * Open this project's turn-placement session over its revision tree (W8 TS-S4, D9). The host process is the session,
   * so a Node host opens one and hands it to its launcher; its tools are what `openTools` makes of an attempt's
   * revocable view of its checkout.
   */
  placement<Tools>(openTools: TurnPlacementPortOptions<Tools>['openTools']): TurnPlacementAdapter<Tools>;
  /** One content-change event on a checkout, from whatever observes writes. */
  changed(checkoutId: string, paths: readonly string[]): void;
  /**
   * What this project's revision root currently says about itself (W13).
   *
   * The root's own projection, read where it lives — never a second one: the
   * Sync row, the CLI's *Not backed up · n* and whatever a desktop quit dialog
   * shows are all the same settled values (A38, P28).
   */
  status(): RevisionStatusProjection;
  /** Record what is on disk, then stop the tree. The launcher closes first, so its attempts are settled. */
  release(): Promise<void>;
};

/**
 * How long the workspace watcher gathers writes before it raises one `changed`.
 *
 * Short enough that a save feels immediate and long enough that one editor
 * write — content, then a rename of the temporary file — is one event.
 */
const watchCoalesceMilliseconds = 50;

/**
 * How long a watch barrier waits for its cookie before it gives up on the feed.
 *
 * The cookie usually returns in about 20 ms. One that does not return means the
 * watcher lost track, and the checkout reads everything at its next cut, which
 * is correct, only slower.
 */
const watchSettleMilliseconds = 500;

/* The channel requests that never record, so they do not wait for the watcher. */
const unrecordingCommands: ReadonlySet<string> = new Set([
  'status',
  'setActor',
  'setDeviceId',
  'flushKeepalive',
  'remoteCredential',
  'log',
  'divergence',
  'diff',
  'compare',
]);

/* A cookie's name is a staged temporary sibling, so a capture that meets one leaves it out. */
const watchCookiePrefix = '.tau-watch.tau-staged.';

/* The live checkout's watch key: its id is the registry's, and writes can land before the registry answers. */
const liveRoot = Symbol('live checkout');

/** A watched checkout root: the live one, or a linked checkout by id. */
type WatchKey = string | typeof liveRoot;

/** What a caller allows each of the close flush's two answered waits: the live checkout, then the `close` cuts. */
const closeFlushMilliseconds = closeCutMilliseconds;

/**
 * How long a caller that waits on `release()` allows one project (rule 9): the caller's bound, not the host's.
 *
 * The close flush waits for the registry's live checkout and then for every
 * `close` cut by request id, with no bound of its own (B3, B8), and only the
 * scheduler's quiesce is bounded (W13 P33). This budget allows each of the two
 * answered waits one close-cut bound before the quiesce. A caller that waits on
 * `release()` (desktop quit, B9) nests strictly outside it, so a host that is
 * merely slow answers before the caller gives up with its generic reason.
 *
 * @public
 */
export const projectReleaseMilliseconds = closeFlushMilliseconds * 2 + syncQuiesceMilliseconds;

/**
 * The longest a recorded launcher's `close()` holds one project (rule 9, RV-W2b #1).
 *
 * `close()` first drains the runs it started (T3), then releases the project
 * within {@link projectReleaseMilliseconds}. A drained run's completion cut is
 * answered, not bounded (B3), so the drain is allowed one close-cut bound.
 * A utility quit that waits on it nests outside this sum.
 *
 * ponytail: W8 deleted the admission bound this used to add; one close-cut bound
 * for the drain is a stand-in until the drain has a bound of its own.
 *
 * @public
 */
export const projectCloseMilliseconds = closeCutMilliseconds + projectReleaseMilliseconds;

const hostRevisionRequestSchema = z.object({ command: z.string().min(1) }).catchall(jsonValueSchema);

/**
 * Strip `undefined` fields from machine projections before the JSON wire.
 *
 * @param value - Projection or outcome to serialize.
 * @returns A JSON-safe copy.
 */
const revisionJson = (value: unknown): JsonValue =>
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON serialization deliberately strips undefined fields.
  JSON.parse(JSON.stringify(value === undefined ? null : value)) as JsonValue;

/**
 * Which device this host is, for the record set (W13, W17).
 *
 * The machine plus the account, which is what "this device" means on disk: two
 * users on one machine hold two checkouts and write two chat segments. Stable
 * across restarts, needs no record of its own, and is never a credential — the
 * browser's equivalent is `apps/ui/app/lib/device-id.ts` and neither mints the
 * other's.
 */
const hostDeviceId = `${hostname()}:${userInfo().username}`;

/**
 * The store a disk host's project is recorded in (S12, OQ-B8).
 *
 * Native git over the project directory — the one backend on every disk host,
 * with no mode to choose — and linked checkouts in this host's own data
 * directory, because git refuses a worktree inside its own worktree and `tau
 * serve` treats the directory it serves as the project (compute-reuse D9, S6).
 *
 * @param options - The project directory and, optionally, its id.
 * @returns The port every verb and every machine on this host reads and writes.
 * @public
 *
 * @example <caption>Reading a project's history from a script</caption>
 * ```typescript
 * import { createProjectRevisionPort } from '@taucad/host';
 * import { readRevisionLog } from '@taucad/revisions';
 *
 * const port = createProjectRevisionPort({ workspaceRoot: '/srv/project' });
 * const rows = await readRevisionLog(port, { limit: 5 });
 * ```
 */
export const createProjectRevisionPort = (
  options: Readonly<{
    workspaceRoot: string;
    projectId?: string | undefined;
    checkoutsDirectory?: string | undefined;
    gitExecutable?: string | undefined;
    /** Native linked-checkout mutations under the embedding host's writer authority. */
    checkoutMutation?: NativeGitCheckoutOptions['withMutationAuthority'];
    /**
     * Read before every request to a remote, and only offered to Tau's own API
     * origin (P40). A terminal has no cookie, so this is how `tau publish`
     * authenticates its push; it is never written under the project.
     */
    tauCredential?: (() => TauApiCredential | undefined) | undefined;
    /** Exact third-party repository credential, held only for the next native Git spawn. */
    remoteCredential?: (() => NativeGitRemoteCredential | undefined) | undefined;
  }>,
): RevisionPort => {
  const projectId = resolveProjectId(options.workspaceRoot, options.projectId);
  return createNativeGitRevisionPort({
    repositoryPath: options.workspaceRoot,
    checkouts: {
      projectId,
      directory: options.checkoutsDirectory ?? join(defaultConfigDirectory(), 'checkouts', projectId),
      ...(options.checkoutMutation === undefined ? {} : { withMutationAuthority: options.checkoutMutation }),
    },
    ...(options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable }),
    ...(options.tauCredential === undefined ? {} : { tauCredential: options.tauCredential }),
    ...(options.remoteCredential === undefined ? {} : { remoteCredential: options.remoteCredential }),
  });
};

/**
 * Settles when the checkout registry has answered for the first time, with or without checkouts (B4).
 *
 * A turn on a dirty checkout asks its *checkout actor* to mint the base, and the root spawns those actors from the
 * registry's first answer, so a verb waits for it. The registry answers even when it lists nothing (W5 RM-R11), so
 * the wait is an answer, never a bound.
 *
 * @param actor - The started root actor.
 * @returns A promise that settles on the registry's first answer.
 */
const registryAnswered = async (actor: ProjectRevisionsActor): Promise<void> => {
  await waitFor(actor, (snapshot) => snapshot.context.registrySettled);
};

/**
 * Start one project's revision tree, whose placement session a launcher places and settles every turn through.
 *
 * @param options - The root, the port, and where turns publish their checkouts.
 * @returns The running tree and its placement session.
 * @public
 *
 * @example <caption>Launcher 1, placing every turn</caption>
 * ```typescript
 * import { createGatewayModelTransport } from '@taucad/agent-host';
 * import type { ToolRegistry } from '@taucad/agent-host';
 * import { createAgentLauncher } from '@taucad/agent-host/launcher';
 * import { createNodeChatStore } from '@taucad/agent-host/node';
 * import { createProjectRevisions } from '@taucad/host';
 *
 * declare const toolRegistry: ToolRegistry;
 * const revisions = createProjectRevisions({ workspaceRoot: '/srv/project' });
 * const launcher = createAgentLauncher({
 *   chats: createNodeChatStore({ workspaceRoot: '/srv/project' }),
 *   modelTransport: createGatewayModelTransport({ baseUrl: 'https://api.tau.new/' }),
 *   credential: () => ({ mode: 'session' }),
 *   systemPrompt: 'You are Tau.',
 *   toolRegistry,
 *   turnPlacement: revisions.placement(() => toolRegistry),
 * });
 * await launcher.close();
 * await revisions.release();
 * ```
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one closure over one project's actor tree; every half reads the same five values.
export const createProjectRevisions = (options: ProjectRevisionsOptions): ProjectRevisions => {
  const projectId = resolveProjectId(options.workspaceRoot, options.projectId);
  const { apiBaseUrl } = options;
  let channelRemoteCredential: NativeGitRemoteCredential | undefined;
  const toolchain = options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable };
  const port =
    options.port ??
    createProjectRevisionPort({
      workspaceRoot: options.workspaceRoot,
      projectId,
      ...(options.checkoutsDirectory === undefined ? {} : { checkoutsDirectory: options.checkoutsDirectory }),
      ...toolchain,
      ...(options.checkoutMutation === undefined ? {} : { checkoutMutation: options.checkoutMutation }),
      ...(options.tauCredential === undefined ? {} : { tauCredential: options.tauCredential }),
      ...(options.remoteCredential === undefined
        ? { remoteCredential: () => channelRemoteCredential }
        : {
            remoteCredential: () => channelRemoteCredential ?? options.remoteCredential?.(),
          }),
    });
  const channelListeners = new Set<(event: AgentChannelRevisionEvent) => void>();
  const emitChannel = (event: AgentChannelRevisionEvent): void => {
    for (const listener of channelListeners) {
      listener(event);
    }
  };
  if (options.port === undefined) {
    /* The early named refusal, on every disk host rather than only in the CLI:
     * a machine with no `git` records nothing, and a person who is told that
     * when the project opens can fix it before the first turn. Reported once,
     * as a fact about this machine — the turn itself still runs.
     *
     * async-iife: bootstrap -- two version probes at open; nothing waits on
     * them, and a host that cannot record must still serve its files. */
    void (async (): Promise<void> => {
      try {
        await requireRevisionToolchain(toolchain);
      } catch (error) {
        options.events?.({
          type: 'revision.unavailable',
          reason: error instanceof Error ? error.message : String(error),
          missing: error instanceof GitToolchainError ? error.missing : ['git', 'git-lfs'],
        });
      }
    })();
  }
  /**
   * Publish one host revision fact, on the wire and to the caller's reporter. Reporting only: the turn's own rows
   * are M1's, appended from the placement session's settlements (W8 TS-S4, TS-R18).
   */
  const report = (event: HostRevisionEvent): void => {
    options.events?.(event);
    if (event.type === 'turn.finalized' || event.type === 'turn.conflicted' || event.type === 'turn.failed') {
      emitChannel({ kind: 'event', value: revisionJson(event) });
    }
  };
  /** Monotonic per checkout, one increment per content-change event (A38, F9). */
  const generations = new Map<string, number>();
  const filesystems =
    options.filesystem ??
    ((checkout: Parameters<NonNullable<ProjectRevisionsOptions['filesystem']>>[0]) =>
      new NodeFsProvider(checkout.kind === 'live' ? options.workspaceRoot : checkout.root));
  const tree = createProjectRevisionsActor({
    port,
    projectId,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
    ...(options.onRejectedEvent === undefined ? {} : { onRejectedEvent: options.onRejectedEvent }),
    ...(options.actorId === undefined ? {} : { actorId: options.actorId }),
    ...(options.actor === undefined ? {} : { actor: options.actor }),
    /*
     * Which device this host is (W13, W17).
     *
     * A chat ref names one device's log segment, so a host that could not say
     * which device it is would risk overwriting another's. A disk host has a
     * stable answer the operating system already keeps — the machine's own
     * hostname, per user — and unlike the browser's it needs no record of its
     * own.
     */
    deviceId: () => hostDeviceId,
    /*
     * Connectivity, honestly (S41's first exit).
     *
     * ponytail: a disk host is always online, and the durable queue is the
     * guarantee. Node has no `online`/`offline` event, and anything else here
     * would be this module *guessing* — a reachability probe of its own, which
     * is a second network policy beside the push's. A push that cannot reach the
     * remote already becomes a queue entry and a backoff, which is what the
     * offline exit buys the browser. Upgrade path: a host that has a real
     * connectivity source (a desktop shell, a daemon with a supervisor) passes
     * one in.
     */
    filesystem: filesystems,
    ...(options.useFileSystem === undefined ? {} : { useFileSystem: options.useFileSystem }),
    /*
     * E1: the watcher below reports every write, the host's own applies
     * included, and each cut waits for it to catch up (`settleWatch`), so a cut
     * re-reads only the paths it names. A host that brings its own change
     * source (`watchWorkspace: false`) makes no such promise.
     *
     * Applies are not hidden from the feed: hiding them would let a write that
     * raced an apply drop out of every later incremental cut. The checkout
     * compares the tree after such a burst, so a restore, a switch or a pull
     * reads clean again as soon as that comparison finds nothing changed.
     */
    completeChanges: options.watchWorkspace !== false,
    parameters: parameterCodec,
    ...(apiBaseUrl === undefined ? {} : { remoteUrl: (id: string) => tauRemoteUrl(apiBaseUrl, id) }),
    ...(apiBaseUrl === undefined || options.tauCredential === undefined
      ? {}
      : {
          /* D13: another device's push wakes this open project over the API's
           * long poll, with the same bearer the git routes take. */
          remoteMoves: (input, handlers) =>
            watchRevisionStream(
              {
                projectId: input.projectId,
                apiBaseUrl: () => apiBaseUrl,
                auth: () => {
                  const credential = options.tauCredential?.();
                  return credential === undefined
                    ? undefined
                    : { kind: 'bearer', authorization: credential.authorization };
                },
              },
              handlers,
            ),
          /* D18: the owner's usage, for the Sync region's `x of 1 GB`; a
           * signed-out host has no figure to show rather than an error. */
          remoteStorage: async () => {
            const credential = options.tauCredential?.();
            return credential === undefined
              ? undefined
              : readRemoteStorageOverHttp(
                  apiBaseUrl,
                  { kind: 'bearer', authorization: credential.authorization },
                  projectId,
                );
          },
          registerRemoteProject: async (id: string) => {
            const credential = options.tauCredential?.();
            if (credential === undefined) {
              throw new Error('This host is not signed in to Tau Cloud.');
            }
            await registerProjectOverHttp(
              apiBaseUrl,
              { kind: 'bearer', authorization: credential.authorization },
              {
                id,
                name: readManifestField(options.workspaceRoot, 'name'),
              },
            );
          },
          publishPublication: async (input: PublishPublicationActorInput) => {
            const credential = options.tauCredential?.();
            if (credential === undefined) {
              throw new Error('This host is not signed in to Tau Cloud.');
            }
            return publishOverHttp(apiBaseUrl, { kind: 'bearer', authorization: credential.authorization }, input);
          },
        }),
    onChatsProjected: (chatIds) => {
      emitChannel({
        kind: 'event',
        value: revisionJson({ type: 'chats.projected', projectId, chatIds }),
      });
    },
    /* V19: where each placed run works, for the external agent port and the MCP endpoint's tools. */
    onPlacement: (placement) => {
      if (placement.status !== 'placed') {
        return;
      }
      options.checkouts?.set(placement.runId, {
        cwd: placement.checkout.kind === 'live' ? options.workspaceRoot : placement.checkout.root,
        mode: placement.checkout.kind === 'live' ? 'direct' : 'candidate',
        baseRevisionId: placement.baseRevisionId ?? '',
      });
    },
  });
  const { actor, settled, recordEditorConflict } = tree;

  /* W36 D1: one bounded entry per settled push or pull, on the API's existing ingest. */
  const placement = options.syncTelemetryPlacement;
  if (placement !== undefined && apiBaseUrl !== undefined) {
    actor.getSnapshot().children.sync?.on('syncAttempt', (attempt: SyncMachineEmitted & { type: 'syncAttempt' }) => {
      const credential = options.tauCredential?.();
      if (credential === undefined) {
        return;
      }
      const { direction, outcome, durationMilliseconds, lagMilliseconds, pending } = attempt;
      /* async-iife: bootstrap -- telemetry is best effort and never fails a sync. */
      void (async (): Promise<void> => {
        try {
          await fetch(`${apiBaseUrl}/v1/telemetry/ingest`, {
            method: 'POST',
            headers: { authorization: credential.authorization, 'content-type': 'application/json' },
            body: JSON.stringify({
              entries: [
                {
                  name: 'observability.syncAttempt',
                  duration: durationMilliseconds,
                  detail: {
                    direction,
                    outcome,
                    placement,
                    ...(lagMilliseconds === undefined ? {} : { lagMilliseconds }),
                    ...(pending === undefined ? {} : { pending }),
                  },
                },
              ],
            }),
          });
        } catch {
          // Telemetry is best effort.
        }
      })();
    });
  }

  /**
   * Report one settled turn, with the two graph facts it does not carry.
   *
   * `changedPaths` and `treeId` are asked of the store by the shared describer,
   * which the browser worker root calls too — one shape, one implementation.
   *
   * @param settlement - The turn settlement the root emitted.
   */
  const reportSettlement = async (settlement: TurnSettlement): Promise<void> => {
    options.checkouts?.delete(settlement.runId);
    report(await describeTurnSettlement(port, projectId, settlement));
  };

  actor.on('turnFinalized', (settlement) => {
    /* async-iife: bootstrap -- a settlement report never fails a turn; the
     * revision is already on disk and the graph answers either way. */
    void (async (): Promise<void> => {
      try {
        await reportSettlement(settlement);
      } catch {
        /* Reporting only: the revision is already on disk, and a client that
         * missed the notice reads the graph on its next attach. */
      }
    })();
  });
  actor.on('turnConflicted', (settlement) => {
    options.checkouts?.delete(settlement.runId);
    report({
      type: 'turn.conflicted',
      turnId: settlement.turnId,
      runId: settlement.runId,
      chatId: settlement.chatId,
      checkoutId: settlement.checkoutId,
    });
  });
  actor.on('checkoutFailed', (failure) => {
    options.events?.({
      type: 'revision.failed',
      operation: failure.operation,
      reason: failure.reason,
    });
  });

  /* The outcome no settlement carries, emitted by the root itself (W6): a turn
   * that ended `failed` or `released` is a fact a person can see, so it arrives
   * as an event rather than as a per-host poll of the turn actor. */
  actor.on('turnReleased', (event) => {
    const failure = describeTurnRelease(event);
    options.checkouts?.delete(event.runId);
    if (failure !== undefined) {
      report(failure);
    }
  });
  const channelStatus = (snapshot: Parameters<typeof selectRevisionStatus>[0]): RevisionStatusProjection => {
    const status = selectRevisionStatus(snapshot);
    const route = (checkoutId: string | undefined): string | undefined => {
      if (checkoutId === undefined) {
        return undefined;
      }
      const checkout = snapshot.context.checkouts.find((entry) => entry.id === checkoutId);
      return checkout?.kind === 'live' ? `/projects/${projectId}` : checkout ? `/checkouts/${checkoutId}` : undefined;
    };
    return {
      ...status,
      checkoutRoot: route(status.checkoutId),
      branches: status.branches.map((branch) => ({ ...branch, checkoutRoot: route(branch.checkoutId) })),
    };
  };
  /* One status frame per *visible* change (W10.5). The projection is rebuilt on
   * every transition, so identity never answers; without the comparator the
   * daemon sent a frame per transition and every client repainted for each. */
  let publishedStatus: RevisionStatusProjection | undefined;
  actor.subscribe((snapshot) => {
    const next = channelStatus(snapshot);
    if (publishedStatus !== undefined && sameRevisionStatus(publishedStatus, next)) {
      return;
    }
    publishedStatus = next;
    emitChannel({ kind: 'status', value: revisionJson(next) });
  });
  actor.start();
  const restoreChild = actor.getSnapshot().children.restore;
  restoreChild?.on('toast.restored', (toast) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({
        type: 'restored',
        revisionNumber: toast.revisionNumber,
      }),
    });
  });
  /* D15: *Undo* landed; the number is the revision it undid. */
  restoreChild?.on('toast.undone', (toast) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({ type: 'undone', revisionNumber: toast.revisionNumber }),
    });
  });
  /* Whole, like the branch child's below: the code is what phrases the refusal
   * on the page, so a relay that kept only the sentence showed desktop clients
   * the generic restore copy. */
  restoreChild?.on('toast.error', ({ type: _type, ...toast }) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({ ...toast, type: 'error', subject: 'restore' }),
    });
  });
  /* The worker's save channel, drawn at the same line (M3): an operation's own
   * cut is answered by the child that asked, so it must not also read as a
   * failed save. */
  actor.on('cutFailed', (failure) => {
    if (!isAmbientCut(failure)) {
      return;
    }
    emitChannel({
      kind: 'toast',
      value: revisionJson({ type: 'error', subject: 'save', message: failure.reason }),
    });
  });
  /* D3 on desktop too: a *Save* another writer beat is an answer, not a silent
   * `dirty`. Only `save`, as in the worker (N6). */
  actor.on('casLost', (lost) => {
    if (lost.turn !== undefined || lost.trigger !== 'save') {
      return;
    }
    emitChannel({
      kind: 'toast',
      value: revisionJson({
        type: 'error',
        subject: 'save',
        message: 'Something else changed this project first. Try again.',
        code: 'CAS_LOST',
      }),
    });
  });
  actor.on('nothingToSave', (event) => {
    if (event.trigger === 'save' && event.turn === undefined) {
      emitChannel({ kind: 'toast', value: revisionJson({ type: 'nothingToSave' }) });
    }
  });
  /* The remote and resolution children's own sentences (L2-F8). */
  actor.on('childToast', ({ type: _type, ...toast }) => {
    emitChannel({ kind: 'toast', value: revisionJson({ ...toast, type: 'notice' }) });
  });
  actor.on('switchRefused', (refusal) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({
        type: 'refused',
        branch: refusal.branch,
        reason: refusal.reason,
      }),
    });
  });
  actor.on('mergeConflicted', ({ type: _type, ...conflicted }) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({ ...conflicted, type: 'mergeConflicted' }),
    });
  });
  actor.on('conflictMaterialized', ({ type: _type, ...materialized }) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({ ...materialized, type: 'conflictText' }),
    });
  });
  actor.on('turnRequested', ({ type: _type, ...requested }) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({ ...requested, type: 'resolveWithChat' }),
    });
  });
  const branchChild = actor.getSnapshot().children.branch;
  branchChild?.on('toast.branch', ({ type: _type, ...toast }) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({ ...toast, type: 'branch' }),
    });
  });
  /* Whole, like `toast.branch` above: the code phrases the refusal on the
   * page and the verb and branch let a waiting create tell its own refusal
   * from another verb's. */
  branchChild?.on('toast.error', ({ type: _type, ...toast }) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({ ...toast, type: 'error', subject: 'branch' }),
    });
  });
  /*
   * The project's own writes, coalesced into one `changed` per burst.
   *
   * Recursive `fs.watch` is the platform's own source — a rename storm, an
   * editor's atomic save, an agent's tool write all arrive here — and the burst
   * is collapsed before it reaches the tree, because the checkout counts
   * *events*, not paths (A38, F9). Derived content is filtered by the path
   * registry rather than by a second ignore list, so `thumbnail.webp` and
   * `.tau/types/**` cannot start an idle window.
   *
   * One watcher per live checkout root, and a write is raised against the
   * checkout whose root it landed in (L2-F4, policy rule 3): linked checkouts
   * live in this host's data directory, outside the workspace, so watching the
   * workspace alone left them never dirty — no idle revision, no write
   * generation guard, and a quit that could let their work go.
   */
  const watchers = new Map<WatchKey, FSWatcher | undefined>();
  const watchedRoots = new Map<WatchKey, string>();
  const pendingPaths = new Map<WatchKey, Set<string>>();
  /* The barriers waiting on a cookie, by the cookie's name. */
  const cookies = new Map<string, () => void>();
  let coalescing: ReturnType<typeof setTimeout> | undefined;
  let watchedCheckouts: readonly CheckoutRecord[] | undefined;
  let stopWatchingCheckouts = (): void => undefined;
  /**
   * Raise the gathered paths once per checkout, or hold them for the registry.
   *
   * The registry answers asynchronously, and a project's very first writes
   * routinely land before it does. Dropping them would leave the checkout
   * reading clean over an edited tree for the rest of the session, so the burst
   * is held and re-timed instead.
   */
  const flush = (): void => {
    const { liveCheckoutId } = actor.getSnapshot().context;
    for (const [key, paths] of pendingPaths) {
      const checkoutId = key === liveRoot ? liveCheckoutId : key;
      if (checkoutId !== undefined) {
        pendingPaths.delete(key);
        revisions.changed(checkoutId, [...paths]);
      }
    }
    if (pendingPaths.size > 0) {
      coalescing ??= raise();
    }
  };
  /* The coalescing window, which ends in a flush. */
  const raise = (): ReturnType<typeof setTimeout> =>
    setTimeout(() => {
      coalescing = undefined;
      flush();
    }, watchCoalesceMilliseconds).unref();
  const reportWrite = (key: WatchKey, path: string): void => {
    const pending = pendingPaths.get(key) ?? new Set<string>();
    pending.add(path);
    pendingPaths.set(key, pending);
    coalescing ??= raise();
  };
  /*
   * E1: a watcher that cannot say what changed reports the root, `''`, which
   * the checkout's next cut reads as "read everything". That covers a null file
   * name, an error (an overflow, a watched root that went away), and a root
   * that could not be watched at all.
   */
  const lose = (key: WatchKey): void => {
    reportWrite(key, '');
  };
  /**
   * Wait until the watchers have reported every write that landed before this call.
   *
   * Each watched root gets a cookie file, the sync cookie watchman uses. A
   * watcher delivers events in order, so once the cookie's own event arrives
   * every earlier write has arrived too, and the coalescing window is flushed
   * at once. A cut request goes to the tree only after this, so the paths the
   * cut takes name every write made before the request. That includes writes
   * from another process (an editor, the agent's filesystem server), which
   * reach this host only through the watcher. A root with no watcher, or a
   * cookie that never comes back, is reported as `''`.
   *
   * @returns Once every watched root has caught up, or has been marked unknown.
   */
  const settleWatch = async (): Promise<void> => {
    await Promise.all(
      [...watchers].map(async ([key, watcher]) => {
        const root = watchedRoots.get(key);
        if (watcher === undefined || root === undefined) {
          lose(key);
          return;
        }
        const name = `${watchCookiePrefix}${randomUUID()}.tmp`;
        const seen = Promise.withResolvers<boolean>();
        cookies.set(name, () => {
          seen.resolve(true);
        });
        const bound = setTimeout(() => {
          seen.resolve(false);
        }, watchSettleMilliseconds).unref();
        try {
          await writeFile(join(root, name), '');
          if (!(await seen.promise)) {
            lose(key);
          }
        } catch {
          lose(key);
        } finally {
          clearTimeout(bound);
          cookies.delete(name);
          await rm(join(root, name), { force: true }).catch(() => undefined);
        }
      }),
    );
    if (coalescing !== undefined) {
      clearTimeout(coalescing);
      coalescing = undefined;
    }
    flush();
  };
  const watchRoot = (key: WatchKey, root: string): void => {
    watchedRoots.set(key, root);
    try {
      const watcher = watchDirectory(root, { recursive: true, persistent: false }, (_event, filename) => {
        if (filename === null) {
          lose(key);
          return;
        }
        const path = filename.toString().split(sep).join('/');
        if (path.startsWith(watchCookiePrefix)) {
          cookies.get(path)?.();
          return;
        }
        const initializing = actor.getSnapshot().context.liveCheckoutId === undefined;
        if (path === '' || !classify(path).versioned) {
          return;
        }
        if (initializing && (path === generatedIgnorePath || path === generatedGitattributesPath)) {
          return;
        }
        reportWrite(key, path);
      });
      watcher.on('error', () => {
        lose(key);
        watcher.close();
        watchers.set(key, undefined);
      });
      watchers.set(key, watcher);
    } catch {
      /* A platform or a filesystem with no recursive watch records revisions on
       * every other trigger; it simply never mints an idle one on its own, and
       * every cut on it reads the whole tree (`settleWatch`). The key is still
       * recorded, so a root that cannot be watched is not retried on every
       * transition. */
      watchers.set(key, undefined);
    }
  };
  /* Follow the registry: watch each linked checkout it adds, stop each it drops. */
  const watchLinkedCheckouts = (checkouts: readonly CheckoutRecord[]): void => {
    if (checkouts === watchedCheckouts) {
      return;
    }
    watchedCheckouts = checkouts;
    const linked = new Map(
      checkouts.flatMap((checkout) => (checkout.kind === 'linked' ? [[checkout.id, checkout.root] as const] : [])),
    );
    for (const [key, watcher] of watchers) {
      if (key !== liveRoot && !linked.has(key)) {
        watcher?.close();
        watchers.delete(key);
        watchedRoots.delete(key);
        pendingPaths.delete(key);
      }
    }
    for (const [id, root] of linked) {
      if (!watchers.has(id)) {
        watchRoot(id, root);
      }
    }
  };
  const startWatching = (): void => {
    if (options.watchWorkspace === false) {
      return;
    }
    watchRoot(liveRoot, options.workspaceRoot);
    watchLinkedCheckouts(actor.getSnapshot().context.checkouts);
    const subscription = actor.subscribe((snapshot) => {
      watchLinkedCheckouts(snapshot.context.checkouts);
    });
    stopWatchingCheckouts = () => {
      subscription.unsubscribe();
    };
  };

  /**
   * The live checkout, once the registry has answered (B3: an answer, not a bound).
   *
   * @returns The live checkout's id, or `undefined` when the registry answered with none.
   */
  const waitForLiveCheckout = async (): Promise<string | undefined> => {
    const snapshot = await waitFor(
      actor,
      (current) => current.context.liveCheckoutId !== undefined || current.context.registrySettled,
    );
    return snapshot.context.liveCheckoutId;
  };

  /**
   * Record what is on disk before this host lets the project go (S30 `close`).
   *
   * The checkout's I5 gate decides whether anything is minted, so a clean
   * checkout pays one tree hash. The registry and every cut are answered by
   * request id, not bounded (B3, B8); only the scheduler's quiesce is. A quit
   * that must not hang is bounded by its owner (desktop quit, B9): a revision
   * not minted here is minted by the next host to open the project, from the
   * same bytes.
   *
   * @returns Nothing; the outcome is the revision, or the absence of one.
   */
  const flushClose = async (): Promise<void> => {
    /*
     * A missing live checkout is *not yet*, not "nothing to do" (W6-a3): the
     * registry is read asynchronously, so the close waits for its answer. A
     * registry that answered with no live checkout has nothing to record.
     */
    const checkoutId = await waitForLiveCheckout();
    if (checkoutId === undefined) {
      throw new Error('This project has no live checkout to record at close.');
    }
    /*
     * Every checkout no turn of this root holds, live and linked (the close ruling, D6).
     *
     * Another holder's lease is not skipped here: the registry's list lags a
     * retirement, so a refused turn's record would skip the close silently. The
     * cut reads the records itself instead, and a live lease answers
     * `nothingToSave{heldBy}` (RM-R16); a process that dies before that turn
     * settles loses nothing, since the next host mints from the same bytes.
     */
    /* A turn still waiting to be placed would hold every checkout from the
     * cuts; a closing host is not going to run it. Abandoned, it releases
     * whatever it is granted, and the placement port refuses its admission
     * (RV-W2b #5, TS-R1). */
    releaseUnplacedTurns(actor);
    let refused: Error | undefined;
    try {
      await settleWatch();
      await awaitCheckoutCuts(actor, 'close');
    } catch (error) {
      refused = error instanceof Error ? error : new Error(String(error));
    }
    /*
     * And then the scheduler, inside its own bound (W13 P33), even after a
     * refused cut: whatever the other checkouts minted still has to reach the
     * remote or its record.
     *
     * The same seam the browser worker's `release` uses, because it is the same
     * question: has the close revision reached the remote, or at least the
     * record? A quit that does not wait leaves a revision nothing knows is
     * unsent; after the bound, `.git/sync-pending` is the guarantee
     * and the next open retries it (D28, AC21). The bound is rule 9's quiesce,
     * which outlasts the open pull it may be waiting on.
     */
    try {
      await awaitSyncSettled(actor);
    } catch {
      /* RV-W2b #2: only a refused cut keeps the project. A sync that failed
       * (a damaged copy, revoked access) or ran out its bound has already
       * written `.git/sync-pending`, and the Sync region keeps its refusal; a
       * close that threw here would never let the project go (D28). */
    }
    if (refused !== undefined) {
      throw refused;
    }
  };

  /* A retried close (the launcher refused its own release) finds the tree stopped, where a cut is never answered. */
  let stopped = false;
  const release = async (): Promise<void> => {
    if (!stopped) {
      /* A refused close keeps everything: the caller's next close re-attempts
       * the cut, so nothing below runs until one succeeds. */
      await flushClose();
      stopWatchingCheckouts();
      for (const watcher of watchers.values()) {
        watcher?.close();
      }
      watchers.clear();
      if (coalescing !== undefined) {
        clearTimeout(coalescing);
        coalescing = undefined;
      }
      actor.stop();
      stopped = true;
    }
    /* Stopping the tree cancels nothing already in flight; the store's own
     * creation outlives it, and a caller that removes the project directory
     * next must not race it. */
    await settled();
  };

  const requiredText = (request: Record<string, JsonValue>, key: string): string => {
    const value = request[key];
    if (typeof value !== 'string' || value === '') {
      throw Object.assign(new Error(`Revision request requires ${key}.`), {
        code: 'INVALID_REVISION_REQUEST',
      });
    }
    return value;
  };
  const optionalText = (request: Record<string, JsonValue>, key: string): string | undefined => {
    const value = request[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw Object.assign(new Error(`Revision request ${key} must be text.`), {
        code: 'INVALID_REVISION_REQUEST',
      });
    }
    return value;
  };
  /* A verb names its request (RM-R1): the page's own id when it sent one, else one minted here. */
  const requestIdOf = (request: Record<string, JsonValue>): string =>
    optionalText(request, 'requestId') ?? randomUUID();
  /**
   * What one `remoteCredential` frame makes this host hold (D4, D16b).
   *
   * An `unavailable` frame is held as well: dropping it left native git free
   * to reach the repository with the person's own credential helper, where
   * holding it refuses the repository with reconnect-required (ruling G1). A
   * frame that names no repository clears whatever was held.
   *
   * @param request - The parsed frame.
   * @returns The credential native git reads next, if any.
   */
  const channelCredential = (request: Record<string, JsonValue>): NativeGitRemoteCredential | undefined => {
    const repositoryUrl = optionalText(request, 'repositoryUrl');
    const authorization = optionalText(request, 'authorization');
    const unavailable = optionalText(request, 'unavailable');
    if (repositoryUrl === undefined) {
      return undefined;
    }
    if (unavailable !== undefined) {
      return { repositoryUrl, unavailable };
    }
    return authorization === undefined ? undefined : { repositoryUrl, authorization };
  };
  const comparisonCheckout = async () => {
    const snapshot = actor.getSnapshot();
    const status = selectRevisionStatus(snapshot);
    const checkout = snapshot.context.checkouts.find((entry) => entry.id === status.checkoutId);
    if (checkout === undefined) {
      throw new Error('The selected checkout is unavailable.');
    }
    const [filesystem, basis] = await Promise.all([
      filesystems({
        id: checkout.id,
        projectId,
        root: checkout.root,
        kind: checkout.kind,
        branch: status.line.kind === 'branch' ? status.line.name : undefined,
        baseRevisionId: status.headRevisionId === undefined ? undefined : revisionId(status.headRevisionId),
      }),
      status.headRevisionId === undefined ? undefined : port.readTree(revisionId(status.headRevisionId)),
    ]);
    if (status.headRevisionId !== undefined && basis === undefined) {
      throw new Error('The checkout head tree is unavailable.');
    }
    return { filesystem, mode: (path: string): FileMode => basis?.mode(path) ?? '100644' };
  };

  // oxlint-disable-next-line complexity -- One validated dispatch table mirrors the established worker wire without another protocol layer.
  const sendRevisionRequest = async (value: JsonValue): Promise<JsonValue> => {
    const request = hostRevisionRequestSchema.parse(value) as {
      command: string;
    } & Record<string, JsonValue>;
    if (request.command === 'diff' || request.command === 'compare') {
      const against = optionalText(request, 'against');
      if (against !== undefined && against !== 'checkout') {
        throw Object.assign(new Error('Revision comparison against must be checkout or omitted.'), {
          code: 'INVALID_REVISION_REQUEST',
        });
      }
    }
    /* Anything that may record waits for the watcher first (E1); reads do not. */
    if (!unrecordingCommands.has(request.command)) {
      await settleWatch();
    }
    const text = (key: string): string => requiredText(request, key);
    /* The cases intentionally mirror the existing worker command vocabulary;
     * braces and destructuring here add ceremony without narrowing the wire. */
    /* oxlint-disable unicorn/switch-case-braces, prefer-destructuring -- Mirrors the established worker command switch without per-case ceremony. */
    switch (request.command) {
      case 'status':
      case 'setActor':
      case 'setDeviceId':
      case 'flushKeepalive':
        return null;
      case 'open':
        actor.send({ type: 'sync', event: { type: 'open' } });
        return null;
      case 'remoteCredential': {
        channelRemoteCredential = channelCredential(request);
        return null;
      }
      case 'log': {
        const limit = request['limit'];
        if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1)) {
          throw Object.assign(new Error('Revision request limit must be a positive integer.'), {
            code: 'INVALID_REVISION_REQUEST',
          });
        }
        return revisionJson(
          await readRevisionLog(port, {
            ...(optionalText(request, 'branch') === undefined ? {} : { branch: optionalText(request, 'branch') }),
            ...(optionalText(request, 'from') === undefined ? {} : { from: optionalText(request, 'from') }),
            ...(limit === undefined ? {} : { limit }),
          }),
        );
      }
      case 'divergence':
        return revisionJson(await port.divergence({ head: revisionId(text('head')), base: revisionId(text('base')) }));
      case 'diff': {
        const to = text('revisionId');
        if (request['against'] === 'checkout') {
          const original = await port.readTree(revisionId(to));
          if (original === undefined) {
            throw new Error('The selected revision is unavailable.');
          }
          const checkout = await comparisonCheckout();
          // ponytail: one bounded capture per live list refresh; reuse the checkout capture memo if large projects make this hot.
          const modified = await captureRevisionTree(checkout.filesystem, {
            exclude: (path) => !classify(path).versioned,
            inheritedMode: checkout.mode,
          });
          return revisionJson(diffRevisionTrees({ original, modified }));
        }
        const record = await port.readRevision(revisionId(to));
        return revisionJson(await readRevisionDiff(port, optionalText(request, 'from') ?? record?.parents[0], to));
      }
      case 'tag':
        return revisionJson(
          await port.tag({
            name: text('name'),
            revisionId: revisionId(text('revisionId')),
            ...(optionalText(request, 'note') === undefined ? {} : { note: optionalText(request, 'note') }),
          }),
        );
      case 'deleteTag':
        await port.deleteTag(text('name'));
        return null;
      case 'compare': {
        const requestedRevision = text('revisionId');
        const path = text('path');
        if (request['against'] === 'checkout') {
          const tree = await port.readTree(revisionId(requestedRevision));
          if (tree === undefined) {
            throw new Error('The selected revision is unavailable.');
          }
          const checkout = await comparisonCheckout();
          const { filesystem } = checkout;
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
                (('code' in error &&
                  (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR')) ||
                  ('name' in error && error.name === 'NotFoundError'))
              )
            ) {
              throw error;
            }
            working = undefined;
          }
          const original = tree.get(path);
          return revisionJson(
            compareRevisionFile({
              original: original === undefined ? undefined : { content: original, mode: tree.mode(path) ?? '100644' },
              modified: working === undefined ? undefined : { content: working, mode },
            }),
          );
        }
        const record = await port.readRevision(revisionId(requestedRevision));
        if (record === undefined) {
          throw new Error('The selected revision is unavailable.');
        }
        const base = optionalText(request, 'from') ?? record.parents[0];
        const [before, after] = await Promise.all([
          base === undefined ? undefined : port.readTree(revisionId(base)),
          port.readTree(revisionId(requestedRevision)),
        ]);
        if (after === undefined || (base !== undefined && before === undefined)) {
          throw new Error('The selected revision tree is unavailable.');
        }
        const original = before?.get(path);
        const modified = after.get(path);
        return revisionJson(
          compareRevisionFile({
            original: original === undefined ? undefined : { content: original, mode: before?.mode(path) ?? '100644' },
            modified: modified === undefined ? undefined : { content: modified, mode: after.mode(path) ?? '100644' },
          }),
        );
      }
      case 'restore':
        actor.getSnapshot().children.restore?.send({
          type: 'restore',
          revisionId: text('revisionId'),
        });
        break;
      case 'undo':
      case 'undoOperation':
      case 'confirm':
      case 'cancel':
        actor.getSnapshot().children.restore?.send({ type: request.command });
        break;
      case 'switch':
        actor.send({ type: 'switch', requestId: requestIdOf(request), branch: text('branch') });
        break;
      case 'followChat':
        actor.send({ type: 'followChat', chatId: text('chatId') });
        break;
      case 'pinTo':
        actor.send({ type: 'pinTo', checkoutId: text('checkoutId') });
        break;
      case 'createBranch': {
        /* Answered with the checkout the registry made, or its refusal (B7: an answer, never a bound). The branch
         * child answers every `create` by its id, a busy one `REVISIONS_BUSY` (W5 RM-R11). */
        if (branchChild === undefined) {
          throw Object.assign(new Error('This project has no branch verbs running.'), {
            code: 'REVISIONS_UNAVAILABLE',
          });
        }
        const requestId = requestIdOf(request);
        const name = text('name');
        const from = optionalText(request, 'from');
        const created = Promise.withResolvers<JsonValue>();
        const subscriptions = [
          branchChild.on('toast.branch', (toast) => {
            if (toast.requestId === requestId) {
              created.resolve({
                branch: name,
                ...(toast.checkoutId === undefined ? {} : { checkoutId: toast.checkoutId }),
                ...(toast.checkoutRoot === undefined ? {} : { checkoutRoot: toast.checkoutRoot }),
              });
            }
          }),
          branchChild.on('toast.error', (toast) => {
            if (toast.requestId === requestId) {
              created.reject(
                Object.assign(new Error(toast.message), toast.code === undefined ? {} : { code: toast.code }),
              );
            }
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
      }
      case 'discardBranch':
        actor.send({
          type: 'branch',
          event: {
            type: 'discard',
            requestId: requestIdOf(request),
            branch: text('branch'),
            ...(optionalText(request, 'checkoutId') ? { checkoutId: optionalText(request, 'checkoutId') } : {}),
          },
        });
        break;
      case 'mergeBranch':
        actor.send({
          type: 'branch',
          event: { type: 'merge', requestId: requestIdOf(request), branch: text('branch') },
        });
        break;
      case 'renameBranch':
        actor.send({
          type: 'branch',
          event: { type: 'rename', requestId: requestIdOf(request), branch: text('branch'), name: text('name') },
        });
        break;
      case 'confirmBranch':
        actor.send({ type: 'branch', event: { type: 'confirm' } });
        break;
      case 'cancelBranch':
        actor.send({ type: 'branch', event: { type: 'cancel' } });
        break;
      case 'connectRemote': {
        const kind = request['kind'];
        if (kind !== 'none' && kind !== 'tau' && kind !== 'git') {
          throw Object.assign(new Error('Revision request kind is invalid.'), {
            code: 'INVALID_REVISION_REQUEST',
          });
        }
        actor.send({
          type: 'remote',
          event: {
            type: 'connect',
            kind,
            ...(optionalText(request, 'url') ? { url: optionalText(request, 'url') } : {}),
            ...(request['provider'] === 'github' ? { provider: 'github' } : {}),
            ...(optionalText(request, 'repositoryId') ? { repositoryId: optionalText(request, 'repositoryId') } : {}),
            ...(request['fetchOnly'] === true ? { fetchOnly: true } : {}),
          },
        });
        break;
      }
      case 'disconnectRemote':
        actor.send({ type: 'remote', event: { type: 'disconnect' } });
        break;
      case 'cancelRemote':
        actor.send({ type: 'remote', event: { type: 'cancel' } });
        break;
      /* The page re-minted the credential a remote in `reconnectRequired` was
         refused with, and sent the frame first (D3). */
      case 'authorizeRemote':
        actor.send({ type: 'remote', event: { type: 'authorized' } });
        break;
      case 'syncNow':
        actor.send({ type: 'syncNow' });
        break;
      case 'publishProject':
        actor.send({
          type: 'publish',
          event: {
            type: 'publish',
            requestId: requestIdOf(request),
            ...(optionalText(request, 'tag') ? { tag: optionalText(request, 'tag') } : {}),
            ...(optionalText(request, 'revisionId') ? { revisionId: optionalText(request, 'revisionId') } : {}),
          },
        });
        break;
      case 'confirmPublish': {
        const draft = request['draft'];
        if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
          throw Object.assign(new Error('Revision request requires draft.'), {
            code: 'INVALID_REVISION_REQUEST',
          });
        }
        actor.send({
          type: 'publish',
          event: { type: 'confirm', draft: draft as PublishDraft },
        });
        break;
      }
      case 'cancelPublish':
        actor.send({ type: 'publish', event: { type: 'cancel' } });
        break;
      case 'resetPublish':
        actor.send({ type: 'publish', event: { type: 'reset' } });
        break;
      case 'resolve':
        actor.send({
          type: 'resolution',
          revisionId: text('revisionId'),
          event: {
            type: request['side'] === 'mine' ? 'keepMine' : 'keepTheirs',
            path: text('path'),
          },
        });
        break;
      case 'resolveInEditor':
        actor.send({
          type: 'resolution',
          revisionId: text('revisionId'),
          event: { type: 'openInEditor', path: text('path') },
        });
        break;
      case 'resolvedInEditor':
        actor.send({
          type: 'resolution',
          revisionId: text('revisionId'),
          event: {
            type: 'resolvedInEditor',
            path: text('path'),
            content: text('content'),
          },
        });
        break;
      /* An editor's edit that neither saved nor merged, recorded as a conflict (D14). */
      case 'recordEditorConflict': {
        const base = request['base'];
        const mine = optionalText(request, 'mine');
        if ((base !== null && typeof base !== 'string') || mine === undefined) {
          throw Object.assign(new Error('Revision request requires base and mine.'), {
            code: 'INVALID_REVISION_REQUEST',
          });
        }
        return revisionJson(await recordEditorConflict({ path: text('path'), base, mine }));
      }
      case 'finishResolution':
      case 'abandonResolution':
      case 'askChatToResolve':
        actor.send({
          type: 'resolution',
          revisionId: text('revisionId'),
          event: {
            type:
              request.command === 'finishResolution'
                ? 'finish'
                : request.command === 'abandonResolution'
                  ? 'abandon'
                  : 'askChat',
          },
        });
        break;
      case 'saveRevision': {
        const checkoutId = selectRevisionStatus(actor.getSnapshot()).checkoutId;
        if (checkoutId !== undefined) {
          const trigger = request['trigger'];
          actor.send({
            type: 'cut',
            requestId: requestIdOf(request),
            trigger: trigger === 'hidden' || trigger === 'close' ? trigger : 'save',
            checkoutId,
            leaseIds: [],
          });
        }
        break;
      }
      case 'quiesce':
        await flushClose();
        return null;
      default:
        throw Object.assign(new Error(`Unknown revision request ${request.command}.`), {
          code: 'INVALID_REVISION_REQUEST',
        });
    }
    /* oxlint-enable unicorn/switch-case-braces, prefer-destructuring -- End host revision command mirror. */
    return null;
  };

  const channelEvents = async function* (signal: AbortSignal): AsyncGenerator<AgentChannelRevisionEvent> {
    const queue: AgentChannelRevisionEvent[] = [
      {
        kind: 'status',
        value: revisionJson(channelStatus(actor.getSnapshot())),
      },
    ];
    let wake = Promise.withResolvers<void>();
    const listener = (event: AgentChannelRevisionEvent): void => {
      queue.push(event);
      wake.resolve();
    };
    const abort = (): void => {
      wake.resolve();
    };
    channelListeners.add(listener);
    signal.addEventListener('abort', abort, { once: true });
    try {
      while (!signal.aborted) {
        if (queue.length === 0) {
          // oxlint-disable-next-line no-await-in-loop -- a stream waits for its next event.
          await wake.promise;
          wake = Promise.withResolvers<void>();
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      signal.removeEventListener('abort', abort);
      channelListeners.delete(listener);
    }
  };

  const revisions: ProjectRevisions = {
    history: Object.freeze({
      log: async (request?: RevisionLogRequest) => readRevisionLog(port, request),
      diff: async (from: string | undefined, to: string) => readRevisionDiff(port, from, to),
      describe: async () => readRevisionPlace(port),
    }),
    changed: (checkoutId, paths) => {
      /* One increment per content-change event, whatever its path count: the
       * checkout takes `Math.max` of it across a mint, so a counter that
       * repeated would hide a write that landed during one (F9, F4). */
      const generation = (generations.get(checkoutId) ?? 0) + 1;
      generations.set(checkoutId, generation);
      actor.send({ type: 'changed', checkoutId, paths, generation });
      emitChannel({ kind: 'event', value: revisionJson({ type: 'checkout.changed', checkoutId, paths }) });
    },
    release,
    status: () => selectRevisionStatus(actor.getSnapshot()),
    channel: {
      request: async (input) => ({
        result: await sendRevisionRequest(input),
        status: revisionJson(channelStatus(actor.getSnapshot())),
      }),
      events: channelEvents,
    },
    placement: (openTools) =>
      createTurnPlacementPort({
        revisions: tree,
        openTools,
        root: (checkout) => (checkout.kind === 'live' ? options.workspaceRoot : checkout.root),
        /* E1: the watcher catches up before an admission's dirty base and before a completion cut. */
        settle: settleWatch,
      }),
  };
  startWatching();
  return revisions;
};

/**
 * Refuse to serve a project when the binaries this host records with are missing.
 *
 * A disk host's whole substrate is `git`, and `git-lfs` is how its large objects
 * reach a remote and how a stock clone resolves them (OQ-B8). This is the
 * precondition `tau serve` and `tau revisions` state before they touch a
 * project, so "git-lfs is not installed" never reaches a person as "this
 * project has no revision history".
 *
 * @param options - The `git` this host records with; `PATH`'s when absent.
 * @throws GitToolchainError `ENGINE_UNAVAILABLE`, naming exactly what is missing.
 * @public
 */
export const requireRevisionToolchain = async (
  options: Readonly<{ gitExecutable?: string | undefined }> = {},
): Promise<void> => {
  await resolveGitToolchain(options);
};

/** What a `switch` did, or why it did not (S13, D10). @public */
export type RevisionSwitchOutcome =
  | Readonly<{ status: 'switched'; branch: string; line: string }>
  /** The tree has changes this switch would overwrite; the caller decides. */
  | Readonly<{ status: 'needs-confirmation'; branch: string; reason: string }>
  | Readonly<{ status: 'refused'; branch: string; reason: string }>;

/** What a `discard` did, or why it did not (S36). @public */
export type RevisionDiscardOutcome =
  | Readonly<{ status: 'discarded'; branch: string }>
  | Readonly<{ status: 'refused'; branch: string; reason: string }>;

/**
 * Read one string field of the project's `tau.json`: the id the stream watch and the connect URL use, or the name a disk host registers with Tau Cloud.
 *
 * @param workspaceRoot - Project directory containing `tau.json`.
 * @param field - `id` or `name`.
 * @returns The trimmed value, or `undefined` when none is usable.
 */
const readManifestField = (workspaceRoot: string, field: 'id' | 'name'): string | undefined => {
  try {
    const manifest = JSON.parse(readFileSync(join(workspaceRoot, 'tau.json'), 'utf8')) as Readonly<
      Record<string, unknown>
    >;
    const value = manifest[field];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  } catch {
    return undefined;
  }
};

/* Directories already warned about, so a malformed id is said once per process. */
const malformedManifestIds = new Set<string>();

/**
 * The id a project watches, connects and keeps its checkouts under: the caller's, else `tau.json`'s `id` (W15 F2), else the directory's name.
 *
 * Every entry resolves it here, so `tau serve`, `tau revisions save` and a
 * bare port agree. A manifest id outside `[\w-]` is ignored: it names a URL
 * path and a directory, so `../x` must never reach either.
 *
 * @param workspaceRoot - Project directory containing `tau.json`.
 * @param projectId - The caller's id, which wins when given.
 * @returns The project id.
 */
const resolveProjectId = (workspaceRoot: string, projectId: string | undefined): string => {
  if (projectId !== undefined) {
    return projectId;
  }
  const manifestId = readManifestField(workspaceRoot, 'id');
  if (manifestId !== undefined && /^[\w-]+$/u.test(manifestId)) {
    return manifestId;
  }
  if (manifestId !== undefined && !malformedManifestIds.has(workspaceRoot)) {
    malformedManifestIds.add(workspaceRoot);
    console.warn(`tau.json id ${JSON.stringify(manifestId)} is not a project id; using the directory name.`);
  }
  return basename(workspaceRoot);
};

/** What a `publish` did, or why it did not (S32, S42). @public */
export type RevisionPublishOutcome =
  | Readonly<{
      status: 'published';
      tag: string;
      publicationId: string;
      url: string;
    }>
  | Readonly<{ status: 'refused'; reason: string }>;

/** What a `save` did, or why it did not (C16, W15). @public */
export type RevisionSaveOutcome =
  | Readonly<{
      status: 'saved';
      revisionId: string;
      /** Where the files are now, in the pane's words: `main · Rev 3`. */
      line: string;
      /**
       * How the push that followed ended; `noRemote` when this project backs up
       * nowhere. A hung push ends at the scheduler's own deadline (A12).
       */
      backup: SyncPushOutcome | 'noRemote';
      /** The scheduler's own sentence, when `backup` is neither `backedUp` nor `noRemote`. */
      reason?: string;
    }>
  /** The files already are the head's revision, or a turn is recording them. */
  | Readonly<{ status: 'unchanged'; line: string }>
  | Readonly<{ status: 'refused'; reason: string }>;

/** What an `openFromRemote` did, or why it did not (W18 DEF-2). @public */
export type RevisionOpenOutcome =
  | Readonly<{
      status: 'opened';
      branch: string | undefined;
      revisionId: string | undefined;
    }>
  | Readonly<{ status: 'refused'; reason: string }>;

/** The verbs one project's revision graph answers on a disk host. @public */
export type ProjectRevisionVerbs = {
  /** What the engine behind this project is. */
  describeEngine(): Promise<RevisionEngineDescriptor>;
  /** One branch's history, newest first, numbered by its first-parent line. */
  log(request?: RevisionLogRequest): Promise<readonly RevisionRow[]>;
  /** Which paths changed between two revisions. */
  diff(from: string | undefined, to: string): Promise<readonly RevisionDiffEntry[]>;
  /** Where the live tree is, and every branch this project holds. */
  describe(): Promise<RevisionPlace>;
  /** Put the live tree on one branch. */
  switchTo(branch: string, options?: Readonly<{ confirm?: boolean }>): Promise<RevisionSwitchOutcome>;
  /** Remove one branch's linked checkout, refusing while it holds unsaved work. */
  discard(branch: string): Promise<RevisionDiscardOutcome>;
  /** Name or re-point one immutable revision. */
  tag(input: Omit<CreateRevisionTagInput, 'revisionId'> & { readonly revisionId: string }): Promise<RevisionTag>;
  /** Remove one revision name. */
  deleteTag(name: string): Promise<void>;
  /**
   * Record the live files as a revision and back it up: the pane's *Save* (C16).
   *
   * One `cut` on the live checkout, answered by the checkout machine's own
   * outcomes, then an immediate push rather than D28's debounce, because a
   * terminal verb does not outlive the window.
   */
  save(): Promise<RevisionSaveOutcome>;
  /** Name this branch's head and publish it: one gesture, the dialog's machine. */
  publish(draft: PublishDraft): Promise<RevisionPublishOutcome>;
  /**
   * Connect Tau Cloud and let the open pull fill this directory (W18 DEF-2).
   *
   * The second-device verb: the same `connect` the Sync region sends, then the
   * wait for W13's scheduler to finish the pull it starts. Nothing here checks
   * anything out — `sync.machine`'s own fast-forward arm is the one writer.
   */
  openFromRemote(): Promise<RevisionOpenOutcome>;
  /** Stop whatever this opened. Reading alone starts nothing. */
  close(): Promise<void>;
};

/**
 * Open one project's revision verbs on a disk host (S13, S28).
 *
 * The read verbs are `@taucad/revisions`' own functions over this host's port —
 * the same three the Revisions pane renders and the agent's read-only tool
 * returns — and the write verbs drive the same machines the page drives, so a
 * `tau revisions switch` and a click in the pane are one implementation reached
 * two ways. Nothing is started until a write verb needs it.
 *
 * @param options - The project directory, and a port for a caller that has one.
 * @returns The verbs, and the `close` that stops what they started.
 * @public
 *
 * @example <caption>`tau revisions log`</caption>
 * ```typescript
 * import { openProjectRevisions } from '@taucad/host';
 *
 * const revisions = openProjectRevisions({ workspaceRoot: process.cwd() });
 * try {
 *   for (const row of await revisions.log({ limit: 10 })) {
 *     console.log(row.revisionNumber, row.summary);
 *   }
 * } finally {
 *   await revisions.close();
 * }
 * ```
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one closure over one project's verbs; every verb reads the same port and the same lazily started tree.
export const openProjectRevisions = (
  options: Readonly<{
    workspaceRoot: string;
    projectId?: string | undefined;
    port?: RevisionPort | undefined;
    gitExecutable?: string | undefined;
    /**
     * The Tau Cloud API this project publishes to.
     *
     * Supplies both halves of a publish when `remoteUrl` and
     * `publishPublication` are not given: the Hosted Remote the push goes to,
     * and the row the API records. Git's own credential configuration answers
     * for the push; nothing is written under the project.
     */
    apiBaseUrl?: string | undefined;
    /** Bearer session token for the publication row. Never persisted here. */
    apiToken?: string | undefined;
    /** In-memory credential for one exact third-party Git repository. */
    remoteCredential?: (() => NativeGitRemoteCredential | undefined) | undefined;
    /** The Tau Hosted Remote this project pushes a publication to (A40). */
    remoteUrl?: ((projectId: string) => string | undefined) | undefined;
    /** Creates or re-points the publication row. Only a signed-in host has it. */
    publishPublication?: ((input: PublishPublicationActorInput) => Promise<PublishPublicationActorOutput>) | undefined;
  }> &
    Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
): ProjectRevisionVerbs => {
  const projectId = resolveProjectId(options.workspaceRoot, options.projectId);
  const { apiBaseUrl, apiToken } = options;
  const remoteUrl =
    options.remoteUrl ?? (apiBaseUrl === undefined ? undefined : (id: string) => tauRemoteUrl(apiBaseUrl, id));
  const publishPublication =
    options.publishPublication ??
    (apiBaseUrl === undefined || apiToken === undefined
      ? undefined
      : async (input: PublishPublicationActorInput) =>
          publishOverHttp(apiBaseUrl, { kind: 'bearer', authorization: `Bearer ${apiToken}` }, input));
  /* Connecting Tau Cloud is what registers a project on it (P51). */
  const registerRemoteProject =
    apiBaseUrl === undefined || apiToken === undefined
      ? undefined
      : async (id: string) => {
          await registerProjectOverHttp(
            apiBaseUrl,
            { kind: 'bearer', authorization: `Bearer ${apiToken}` },
            {
              id,
              name: readManifestField(options.workspaceRoot, 'name'),
            },
          );
        };
  const port =
    options.port ??
    createProjectRevisionPort({
      workspaceRoot: options.workspaceRoot,
      projectId,
      ...(options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable }),
      /* The session the publish push travels with: the same token the
       * publication row is recorded with, offered only to the API's own origin
       * and only for as long as this call holds it (P40). */
      ...(apiBaseUrl === undefined || apiToken === undefined
        ? {}
        : {
            tauCredential: () => ({
              apiBaseUrl,
              authorization: `Bearer ${apiToken}`,
            }),
          }),
      ...(options.remoteCredential === undefined ? {} : { remoteCredential: options.remoteCredential }),
    });
  let tree: ReturnType<typeof createProjectRevisionsActor> | undefined;

  /* Started on the first write verb only: `log`, `diff` and `describe` ask the
   * store directly, and a read must never create a repository, retire a lease or
   * mint anything. */
  const started = async (): Promise<NonNullable<typeof tree>> => {
    if (tree === undefined) {
      tree = createProjectRevisionsActor({
        port,
        projectId,
        filesystem: (checkout) => new NodeFsProvider(checkout.kind === 'live' ? options.workspaceRoot : checkout.root),
        ...(options.clock === undefined ? {} : { clock: options.clock }),
        ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
        ...(options.onRejectedEvent === undefined ? {} : { onRejectedEvent: options.onRejectedEvent }),
        parameters: parameterCodec,
        /* The person this process runs for, as both other Node hosts record
         * (AC15): without it a terminal's save is authored by `tau-host`. */
        actor: hostRevisionActor(),
        ...(remoteUrl === undefined ? {} : { remoteUrl }),
        ...(publishPublication === undefined ? {} : { publishPublication }),
        ...(registerRemoteProject === undefined ? {} : { registerRemoteProject }),
      });
      tree.actor.start();
    }
    await registryAnswered(tree.actor);
    return tree;
  };

  /**
   * Resolve on the verb's own answer (B5, B6: answered, never bounded).
   *
   * Every request names its id and the machines answer it in every state, a busy one with `REVISIONS_BUSY` (W5
   * RM-R11), so there is no timeout to report; a network edge keeps its own deadline inside the machine (A9, A12).
   *
   * @param listen - Subscribes, sends, and returns its own unsubscribe.
   * @returns The first answer.
   */
  const answered = async <Answer>(listen: (resolve: (answer: Answer) => void) => () => void): Promise<Answer> => {
    const settled = Promise.withResolvers<Answer>();
    const stop = listen(settled.resolve);
    try {
      return await settled.promise;
    } finally {
      stop();
    }
  };

  const switchTo = async (
    branch: string,
    verb: Readonly<{ confirm?: boolean }> = {},
  ): Promise<RevisionSwitchOutcome> => {
    const { actor } = await started();
    const child = actor.getSnapshot().children.branch;
    if (child === undefined) {
      return Object.freeze({
        status: 'refused',
        branch,
        reason: 'This project has no branch verbs running.',
      });
    }
    /*
     * One verb, one owner. The root resolves D10 and hands the decision to
     * `branch.machine`, which owns the lifecycle — its confirmation, its failure
     * edge, and the single `applySwitch` actor that rewrites the tree. This host
     * used to choreograph the apply itself over the `restore` child, which was a
     * host re-implementing a machine (I20); now it only reports what the machine
     * settled on (W7 review R3).
     */
    /* Every answer names this request, so another verb's toast never settles this one (RM-R1). */
    const requestId = randomUUID();
    const outcome = await answered<RevisionSwitchOutcome>((resolve) => {
      const refused = actor.on('switchRefused', (event) => {
        if (event.requestId === requestId) {
          resolve(Object.freeze({ status: 'refused', branch, reason: event.reason }));
        }
      });
      /* A re-root is finished the moment it is resolved: the branch already
       * has a place of its own and no tree is rewritten. */
      const rerooted = actor.on('switchResolved', (event) => {
        if (event.requestId === requestId && event.mode === 'reroot') {
          resolve(Object.freeze({ status: 'switched', branch, line: branch }));
        }
      });
      const settled = child.on('toast.branch', (event) => {
        if (event.requestId === requestId) {
          resolve(Object.freeze({ status: 'switched', branch, line: branch }));
        }
      });
      const failed = child.on('toast.error', (event) => {
        if (event.requestId === requestId) {
          resolve(Object.freeze({ status: 'refused', branch, reason: event.message }));
        }
      });
      /* The machine parks in `confirming` when its own check says a person is
       * needed; an unconfirmed switch cancels rather than waiting. */
      const watching = child.subscribe((snapshot: SnapshotFrom<typeof branchMachine>) => {
        if (!selectBranchNeedsConfirmation(snapshot) || snapshot.context.requestId !== requestId) {
          return;
        }
        if (verb.confirm === true) {
          child.send({ type: 'confirm' });
          return;
        }
        child.send({ type: 'cancel' });
        resolve(
          Object.freeze({
            status: 'needs-confirmation',
            branch,
            reason:
              snapshot.context.question ??
              'This project has changes that are not in a revision yet, and switching would overwrite them.',
          }),
        );
      });
      actor.send({ type: 'switch', requestId, branch });
      return () => {
        refused.unsubscribe();
        rerooted.unsubscribe();
        settled.unsubscribe();
        failed.unsubscribe();
        watching.unsubscribe();
      };
    });
    if (outcome.status !== 'switched') {
      return outcome;
    }
    const place = await readRevisionPlace(port);
    return Object.freeze({ status: 'switched', branch, line: place.line });
  };

  /*
   * One verb, one owner (I20, C72).
   *
   * This used to compose four refusals of its own — a live checkout, a leased
   * one, a branch with no files — before sending anything, though
   * `checkouts.machine` owns the first two and `removeCheckout` re-checks the
   * tree against the head for every caller. A host that answers first answers
   * from a registry record rather than from the files, and drifts from the pane
   * the moment either rule moves. Only the two host facts are left: which
   * checkout the branch names, and whether this project's registry is running —
   * the same shape `switchTo` and `publish` already have.
   */
  const discard = async (branch: string): Promise<RevisionDiscardOutcome> => {
    const { actor } = await started();
    const record = actor.getSnapshot().context.checkouts.find((checkout) => checkout.branch === branch);
    if (record === undefined) {
      return Object.freeze({
        status: 'refused',
        branch,
        reason: `${branch} has no files of its own to discard.`,
      });
    }
    const { checkouts } = actor.getSnapshot().children;
    if (checkouts === undefined) {
      return Object.freeze({
        status: 'refused',
        branch,
        reason: 'This project has no checkout registry running.',
      });
    }
    const requestId = randomUUID();
    return answered<RevisionDiscardOutcome>((resolve) => {
      const failed = actor.on('checkoutFailed', (event) => {
        if (event.requestId === requestId) {
          resolve(Object.freeze({ status: 'refused', branch, reason: event.reason }));
        }
      });
      const watching = actor.subscribe((snapshot) => {
        if (!snapshot.context.checkouts.some((checkout) => checkout.id === record.id)) {
          resolve(Object.freeze({ status: 'discarded', branch }));
        }
      });
      checkouts.send({ type: 'removeCheckout', requestId, id: record.id });
      return () => {
        failed.unsubscribe();
        watching.unsubscribe();
      };
    });
  };

  /*
   * `tau revisions save` is the pane's *Save* (C16), reached from a terminal.
   *
   * The cut carries its own request id, so the answer is this save's and not an
   * ambient one; the four answers are the checkout machine's (minted, nothing to
   * save, failed, or lost to another writer's compare-and-swap, D3). A mint is
   * pushed through the scheduler's correlated `syncNow`, the same request the
   * Publish dialog makes, so D28's queue still records what cannot be pushed.
   */
  const save = async (): Promise<RevisionSaveOutcome> => {
    const { actor } = await started();
    const checkoutId = actor.getSnapshot().context.liveCheckoutId;
    const scheduler = actor.getSnapshot().children.sync;
    if (checkoutId === undefined || scheduler === undefined) {
      return Object.freeze({ status: 'refused', reason: 'This project has no files Tau can record yet.' });
    }
    const requestId = randomUUID();
    const cut = await answered<
      | Readonly<{ status: 'minted'; revisionId: string }>
      | Readonly<{ status: 'unchanged' }>
      | Readonly<{ status: 'refused'; reason: string }>
    >(
      (resolve) => {
        const subscriptions = [
          actor.on('revisionMinted', (event) => {
            if (event.requestId === requestId) {
              resolve(Object.freeze({ status: 'minted', revisionId: event.revisionId }));
            }
          }),
          actor.on('nothingToSave', (event) => {
            if (event.requestId === requestId) {
              resolve(Object.freeze({ status: 'unchanged' }));
            }
          }),
          actor.on('cutFailed', (event) => {
            if (event.requestId === requestId) {
              resolve(Object.freeze({ status: 'refused', reason: event.reason }));
            }
          }),
          /* The checkout re-reads and rests dirty: the bytes are still on disk. */
          actor.on('casLost', (event) => {
            if (event.requestId === requestId) {
              resolve(
                Object.freeze({ status: 'refused', reason: 'Something else changed this project first. Try again.' }),
              );
            }
          }),
        ];
        actor.send({ type: 'cut', trigger: 'save', checkoutId, leaseIds: [], requestId });
        return () => {
          for (const subscription of subscriptions) {
            subscription.unsubscribe();
          }
        };
      },
      /* Answered by its request id in every state (B3, RM-R11): no host bound of its own. */
    );
    if (cut.status === 'refused') {
      return cut;
    }
    if (cut.status === 'unchanged') {
      const { line } = await readRevisionPlace(port);
      return Object.freeze({ status: 'unchanged', line });
    }
    /* A push already running when this asks was built before the mint, so the
     * scheduler answers with the next one (sync.machine row 65). */
    const pushId = randomUUID();
    const pushed = await answered<SyncPushOutcome>(
      (resolve) => {
        const settled = scheduler.on('pushSettled', (event) => {
          if (event.pushId === pushId) {
            resolve(event.outcome);
          }
        });
        actor.send({ type: 'syncNow', pushId });
        return () => {
          settled.unsubscribe();
        };
      },
      /* Every correlated push is answered, a hung one at the scheduler's own deadline (A12, RM-R11). */
    );
    const { sync } = selectRevisionStatus(actor.getSnapshot());
    /* `noRemote` answers a correlated push with `failed`; nothing failed. */
    const backup = sync.state === 'noRemote' ? 'noRemote' : pushed;
    const { line } = await readRevisionPlace(port);
    return Object.freeze({
      status: 'saved',
      revisionId: cut.revisionId,
      line,
      backup,
      ...(backup === 'backedUp' || backup === 'noRemote'
        ? {}
        : { reason: sync.error ?? 'This revision is saved here and was not backed up yet.' }),
    });
  };

  /*
   * `tau publish` is the dialog's machine, driven by events (S42). The two sends
   * are the dialog's own one gesture: `publish` opens on the name, and `confirm`
   * is held in `choosingVersion.reading` until the names have been read, so
   * nothing here waits for a frame.
   */
  const publish = async (draft: PublishDraft): Promise<RevisionPublishOutcome> => {
    const { actor } = await started();
    const child = actor.getSnapshot().children.publish;
    if (child === undefined) {
      return Object.freeze({
        status: 'refused',
        reason: 'This project has no publish verbs running.',
      });
    }
    const requestId = randomUUID();
    return answered<RevisionPublishOutcome>((resolve) => {
      const published = child.on('published', (event) => {
        if (event.requestId !== requestId) {
          return;
        }
        resolve(
          Object.freeze({
            status: 'published',
            tag: event.tag,
            publicationId: event.publicationId,
            url: event.url,
          }),
        );
      });
      const failed = child.on('toast.error', (event) => {
        if (event.requestId === requestId) {
          resolve(Object.freeze({ status: 'refused', reason: event.message }));
        }
      });
      actor.send({
        type: 'publish',
        event: { type: 'publish', requestId, tag: draft.tag },
      });
      actor.send({ type: 'publish', event: { type: 'confirm', draft } });
      return () => {
        published.unsubscribe();
        failed.unsubscribe();
      };
    });
  };

  /*
   * `tau open` is *Connect Tau Cloud* plus the pull it triggers (W18 DEF-2).
   *
   * Two machines, no new one: `remote.machine`'s connect writes the remote,
   * registers the project (P51) and validates it, and P53's `remoteConnected`
   * puts `sync.machine` into `opening` — whose fast-forward arm is what
   * materializes a branch this device has never held. This verb only waits for
   * the scheduler to leave `checking`.
   */
  const openFromRemote = async (): Promise<RevisionOpenOutcome> => {
    const { actor } = await started();
    const settle = async (): Promise<RevisionOpenOutcome> => {
      const place = await readRevisionPlace(port);
      /* A registered project and a project with something in it are different
         facts (review R2): registering creates an *empty* bare repository, and
         an empty remote leaves the scheduler `backedUp` over an empty
         directory. Nothing arrived, so nothing was opened. */
      return place.revisionId === undefined
        ? Object.freeze({
            status: 'refused',
            reason: 'This project has nothing on Tau Cloud yet.',
          })
        : Object.freeze({
            status: 'opened',
            branch: place.branch,
            revisionId: place.revisionId,
          });
    };
    const outcome = await answered<RevisionOpenOutcome | undefined>((resolve) => {
      const watching = actor.subscribe((snapshot) => {
        const status = selectRevisionStatus(snapshot);
        if (status.remote.phase === 'failed') {
          resolve(
            Object.freeze({
              status: 'refused',
              reason: status.remote.error ?? 'Tau Cloud refused this project.',
            }),
          );
          return;
        }
        /* `queued` is an answer too: the pull was abandoned on its deadline or
             this host is offline, and D28's durable queue owns what is left. */
        if (status.sync.state === 'backedUp') {
          resolve(undefined);
        } else if (
          status.sync.state === 'queued' ||
          status.sync.state === 'failed' ||
          status.sync.state === 'conflicted'
        ) {
          /* `conflicted` is a resting state with no exit this verb can take,
               so leaving it out meant waiting out the bound and then reporting a
               timeout that had not happened (review R3). It is reached only when
               another device pushes between this one's connect and its pull —
               the ordinary diverged open is refused by the remote itself, one
               state earlier (`remote.phase: 'failed'`). */
          resolve(
            Object.freeze({
              status: 'refused',
              /* The scheduler's own reason, never a reachability story this
               * host invented over it (C2): 401, 403, 404 and 413 all reached
               * Tau Cloud and were refused, and `sync.machine` carries the
               * sentence that says which. The fallback names nothing it does
               * not know. */
              reason:
                status.sync.state === 'conflicted'
                  ? 'This project has work of its own that Tau Cloud does not have.'
                  : (status.sync.error ?? 'Tau Cloud did not finish opening this project.'),
            }),
          );
        }
      });
      actor.send({ type: 'remote', event: { type: 'connect', kind: 'tau' } });
      return () => {
        watching.unsubscribe();
      };
    });
    return outcome ?? settle();
  };

  return {
    describeEngine: async () => port.describe(),
    log: async (request) => readRevisionLog(port, request),
    diff: async (from, to) => readRevisionDiff(port, from, to),
    describe: async () => readRevisionPlace(port),
    switchTo,
    discard,
    tag: async (input) => port.tag({ ...input, revisionId: revisionId(input.revisionId) }),
    deleteTag: async (name) => port.deleteTag(name),
    save,
    publish,
    openFromRemote,
    close: async () => {
      const running = tree;
      tree = undefined;
      if (running === undefined) {
        return;
      }
      running.actor.stop();
      /* Stopping the tree cancels nothing already in flight; the store's own
       * creation outlives it. */
      await running.settled();
    },
  };
};
