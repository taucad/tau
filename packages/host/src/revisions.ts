/**
 * Turn revisions on a Node host (charter V17, north star N26 and I-EDIT).
 *
 * The host — never the agent and never the client — records what a turn wrote.
 * The lifecycle itself is `projectRevisionsMachine` and its children, which run
 * identically in a page, in this daemon and in the Electron utility; this module
 * is the Node composition of that tree: it starts one actor per served project,
 * gives it the effects `@taucad/revisions/revision-effects` builds over a
 * {@link RevisionPort}, and wires the launcher's turn boundary to the root's
 * `admitTurn` / `turnCompleted` / `turnAbandoned` events.
 *
 * It wraps the launcher rather than reaching inside it because both host
 * compositions — the daemon (launcher 1) and the Electron services utility
 * (launcher 2) — build the launcher the same way, and the wrapper is the only
 * seam that is strictly ordered *before* `host.admit`. Observing the durable
 * stream alone would race the first tool write.
 */

import { randomUUID } from 'node:crypto';
import { watch as watchDirectory } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { basename, join, sep } from 'node:path';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { classify } from '@taucad/filesystem/path-registry';
import {
  awaitSyncSettled,
  createProjectRevisionsActor,
  describeTurnSettlement,
  describeTurnRelease,
} from '@taucad/revisions/revision-effects';
import type {
  CheckoutFileSystems,
  TurnConflictedEvent as SettlementConflicted,
  TurnFailedEvent as SettlementFailed,
  TurnFinalizedEvent as SettlementFinalized,
} from '@taucad/revisions/revision-effects';
import { readRevisionDiff, readRevisionLog, readRevisionPlace, tauRemoteUrl } from '@taucad/revisions';
import { selectRevisionStatus } from '@taucad/revisions/project-revisions-machine';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import type {
  RevisionActor,
  RevisionDiffEntry,
  RevisionEngineDescriptor,
  RevisionLogRequest,
  RevisionPlace,
  RevisionPort,
  RevisionRow,
} from '@taucad/revisions';
import { GitToolchainError, createNativeGitRevisionPort, resolveGitToolchain } from '@taucad/revisions/node';
import type { MissingGitTool, TauApiCredential } from '@taucad/revisions/node';
import { publishPushMilliseconds } from '@taucad/revisions/publish-machine';
import type {
  PublishDraft,
  PublishPublicationActorInput,
  PublishPublicationActorOutput,
} from '@taucad/revisions/publish-machine';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { TurnSettlement } from '@taucad/revisions/turn-machine';

import { defaultConfigDirectory } from '#credential-store.js';

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

/** Options for {@link createProjectRevisions}. @public */
export type ProjectRevisionsOptions = {
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
  /** Defaults to the workspace root's directory name. */
  readonly projectId?: string | undefined;
  /**
   * The `git` this host records with, and the `git-lfs` it checks for.
   *
   * Absent, both are taken from `PATH`. A packaged app passes the binaries it
   * ships (OQ-B8) — which is also why the check is here and not only in the
   * CLI: a desktop launched from Finder has `/usr/bin:/bin:/usr/sbin:/sbin`.
   */
  readonly gitExecutable?: string | undefined;
  readonly gitLfsExecutable?: string | undefined;
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
   * The authority epoch leases are written under (N3).
   *
   * One per process by default: a lease from any other epoch belongs to a host
   * that no longer owns this project, and `sweepLeases` retires it on open.
   * W19 moves the value under `project-session`.
   */
  readonly authorityEpoch?: string | undefined;
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
   * The same launcher, with every turn admitted before it runs and settled when
   * its durable lifecycle marker turns terminal.
   */
  record(launcher: NodeAgentLauncher): NodeAgentLauncher;
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
  /** Stop the tree. Pending admissions are refused rather than left hanging. */
  release(): Promise<void>;
};

const terminalStates = new Set(['completed', 'failed', 'cancelled']);

/**
 * How long the workspace watcher gathers writes before it raises one `changed`.
 *
 * Short enough that a save feels immediate and long enough that one editor
 * write — content, then a rename of the temporary file — is one event.
 */
const watchCoalesceMilliseconds = 50;

/** How long a host waits for the `close` mint before it lets the project go. */
const closeFlushMilliseconds = 5000;

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
 * How long an admission waits for its turn to take its lease.
 *
 * The same bound the turn machine gives its own cut (`turnCutSettlementMilliseconds`),
 * spelled here rather than imported because it is the *host's* patience: a turn
 * whose base mint never settles must refuse the run rather than hold the client
 * open for the life of the process.
 */
const admissionMilliseconds = 30_000;

/**
 * How long an admission waits for the checkout registry's first answer.
 *
 * Short, because the wait is only an ordering convenience: a registry that
 * cannot answer refuses the turn a moment later inside `prepare`, which is the
 * refusal a client should see rather than a stalled start.
 */
const registryMilliseconds = 5000;

/**
 * The authority epoch every project this process serves writes its leases under.
 *
 * One per **process**, not one per project or per call: `sweepLeases` retires
 * every lease whose epoch is not the current one, so a second
 * {@link createProjectRevisions} in this process with an epoch of its own would
 * retire the first's *live* leases the moment it opened (N3). Cross-process
 * liveness — the epoch as the `project-session` identity, and the second fact
 * that tells a crashed host from a running one — is W19's.
 */
const processAuthorityEpoch = randomUUID();

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
    gitExecutable?: string | undefined;
    /**
     * Read before every request to a remote, and only offered to Tau's own API
     * origin (P40). A terminal has no cookie, so this is how `tau publish`
     * authenticates its push; it is never written under the project.
     */
    tauCredential?: (() => TauApiCredential | undefined) | undefined;
  }>,
): RevisionPort => {
  const projectId = options.projectId ?? basename(options.workspaceRoot);
  return createNativeGitRevisionPort({
    repositoryPath: options.workspaceRoot,
    checkouts: { projectId, directory: join(defaultConfigDirectory(), 'checkouts', projectId) },
    ...(options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable }),
    ...(options.tauCredential === undefined ? {} : { tauCredential: options.tauCredential }),
  });
};

/**
 * Settles when the checkout registry has answered for the first time.
 *
 * A turn on a dirty checkout asks its *checkout actor* to mint the base before
 * it takes its lease, and the root spawns those actors from the registry's first
 * announcement — so anything sent before that is answered for a checkout nothing
 * has spawned yet. Leases themselves need no such wait: the registry buffers
 * them (W3b R22/R30).
 *
 * @param actor - The started root actor.
 * @returns A promise that settles on the first non-empty registry, or the bound.
 */
const registryAnswered = async (actor: {
  subscribe: (listener: (snapshot: { context: { checkouts: readonly unknown[] } }) => void) => {
    unsubscribe: () => void;
  };
  getSnapshot: () => { context: { checkouts: readonly unknown[] } };
}): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, registryMilliseconds).unref();
    const subscription = actor.subscribe((snapshot) => {
      if (snapshot.context.checkouts.length > 0) {
        resolve();
        subscription.unsubscribe();
      }
    });
    if (actor.getSnapshot().context.checkouts.length > 0) {
      resolve();
      subscription.unsubscribe();
    }
  });

/**
 * Start one project's revision tree and record every turn a launcher admits.
 *
 * @param options - The root, the port, and where turns publish their checkouts.
 * @returns The running tree and the launcher wrapper.
 * @public
 *
 * @example <caption>Launcher 1, recording every turn</caption>
 * ```typescript
 * import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
 * import { createProjectRevisions } from '@taucad/host';
 * import type { ToolRegistry } from '@taucad/agent-host';
 *
 * declare const toolRegistry: ToolRegistry;
 * const revisions = createProjectRevisions({ workspaceRoot: '/srv/project' });
 * const launcher = revisions.record(
 *   createNodeAgentLauncher({
 *     workspaceRoot: '/srv/project',
 *     gatewayBaseUrl: 'https://api.tau.new/',
 *     systemPrompt: 'You are Tau.',
 *     toolRegistry,
 *   }),
 * );
 * await launcher.close();
 * ```
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one closure over one project's actor tree; every half reads the same five values.
export const createProjectRevisions = (options: ProjectRevisionsOptions): ProjectRevisions => {
  const projectId = options.projectId ?? basename(options.workspaceRoot);
  const toolchain = {
    ...(options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable }),
    ...(options.gitLfsExecutable === undefined ? {} : { gitLfsExecutable: options.gitLfsExecutable }),
  };
  const port =
    options.port ?? createProjectRevisionPort({ workspaceRoot: options.workspaceRoot, projectId, ...toolchain });
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
   * Publish one host revision fact, on the wire and to the caller's reporter.
   *
   * The three turn facts are also **records in the chat's own durable log**, so
   * a client reads them the way it reads every other durable fact — replayed on
   * every reattach, in the same order, with no second channel to keep in step
   * (S9). `record(launcher)` supplies the appender; a host that only opens a
   * project and never records a turn has nobody to append for.
   */
  let appendToChatLog:
    | ((chatId: string, event: TurnConflictedEvent | TurnFailedEvent | TurnFinalizedEvent) => Promise<unknown>)
    | undefined;
  const recordInChatLog = async (event: TurnConflictedEvent | TurnFailedEvent | TurnFinalizedEvent): Promise<void> => {
    try {
      await appendToChatLog?.(event.chatId, event);
    } catch {
      /* A log that will not take the record does not un-record the revision:
       * the revision is already in the graph, and a client that missed the
       * record reads the graph on its next attach. */
    }
  };
  /**
   * Chat-log appends still in flight.
   *
   * `report` cannot await — it runs inside an actor's emit — so the promise is
   * held here and drained by `release()`. Without that, a host that refuses a
   * turn and is closed in the same tick is still writing into `.tau/chats/**`
   * while its caller removes the directory.
   */
  const recording = new Set<Promise<void>>();
  const report = (event: HostRevisionEvent): void => {
    options.events?.(event);
    if (event.type !== 'turn.finalized' && event.type !== 'turn.conflicted' && event.type !== 'turn.failed') {
      return;
    }
    const appended = recordInChatLog(event);
    recording.add(appended);
    const forget = async (): Promise<void> => {
      /* The rejection is the caller's to see through `release()`; this arm only
       * stops a settled append from holding the set open. */
      await appended.catch(() => undefined);
      recording.delete(appended);
    };
    void forget();
  };

  /** One pending admission per run, settled by the placement callback. */
  const admissions = new Map<string, PromiseWithResolvers<void>>();
  /** Each admitted run's turn id, so a terminal marker can name the turn. */
  const turns = new Map<string, string>();
  /** Monotonic per checkout, one increment per content-change event (A38, F9). */
  const generations = new Map<string, number>();

  const { actor, settled } = createProjectRevisionsActor({
    port,
    projectId,
    authorityEpoch: options.authorityEpoch ?? processAuthorityEpoch,
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
    filesystem:
      options.filesystem ??
      ((checkout) => new NodeFsProvider(checkout.kind === 'live' ? options.workspaceRoot : checkout.root)),
    onPlacement: (placement) => {
      const pending = admissions.get(placement.runId);
      if (placement.status === 'refused') {
        admissions.delete(placement.runId);
        pending?.reject(
          Object.assign(new Error(`This Tau Host could not open a revision for the turn: ${placement.reason}`), {
            code: 'REVISION_PREPARE_FAILED',
          }),
        );
        return;
      }
      if (placement.status === 'leased') {
        /* The admission ends here, not at `placed`: a dirty checkout is minted
         * as the turn's base *between* the two, and a run admitted before that
         * cut would fold its own writes into its own parent. */
        admissions.delete(placement.runId);
        pending?.resolve();
        return;
      }
      options.checkouts?.set(placement.runId, {
        cwd: placement.checkout.kind === 'live' ? options.workspaceRoot : placement.checkout.root,
        mode: placement.checkout.kind === 'live' ? 'direct' : 'candidate',
        baseRevisionId: placement.baseRevisionId ?? '',
      });
    },
  });

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
    turns.delete(settlement.runId);
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
    turns.delete(settlement.runId);
    report({
      type: 'turn.conflicted',
      turnId: settlement.turnId,
      runId: settlement.runId,
      chatId: settlement.chatId,
      checkoutId: settlement.checkoutId,
    });
  });
  actor.on('checkoutFailed', (failure) => {
    options.events?.({ type: 'revision.failed', operation: failure.operation, reason: failure.reason });
  });

  /* The outcome no settlement carries, emitted by the root itself (W6): a turn
   * that ended `failed` or `released` is a fact a person can see, so it arrives
   * as an event rather than as a per-host poll of the turn actor. */
  actor.on('turnReleased', (event) => {
    const failure = describeTurnRelease(event);
    turns.delete(event.runId);
    options.checkouts?.delete(event.runId);
    if (failure !== undefined) {
      report(failure);
    }
  });
  actor.start();

  const admit = async (input: {
    readonly runId: string;
    readonly chatId: string;
    readonly turnId: string;
    readonly checkoutId?: string | undefined;
  }): Promise<void> => {
    const pending = Promise.withResolvers<void>();
    admissions.set(input.runId, pending);
    turns.set(input.runId, input.turnId);
    const bound = setTimeout(() => {
      admissions.delete(input.runId);
      pending.reject(
        Object.assign(new Error('This Tau Host could not open a revision for the turn: it was never leased.'), {
          code: 'REVISION_PREPARE_FAILED',
        }),
      );
    }, admissionMilliseconds);
    /* No wait for the registry: the root holds an admission that arrives before
     * it and replays it, so there is nothing here to compensate for (A38). */
    actor.send({
      type: 'admitTurn',
      turnId: input.turnId,
      chatId: input.chatId,
      runId: input.runId,
      ...(input.checkoutId === undefined ? {} : { checkoutId: input.checkoutId }),
    });
    /* The placement is awaited, not assumed: the agent's session and Tau's own
     * file tools are rooted from it, the turn's base is minted before the agent
     * can write, and a turn this host could not place is refused rather than
     * run unrecorded (I-EDIT). */
    try {
      await pending.promise;
    } finally {
      clearTimeout(bound);
    }
  };

  /*
   * The project's own writes, coalesced into one `changed` per burst.
   *
   * Recursive `fs.watch` is the platform's own source — a rename storm, an
   * editor's atomic save, an agent's tool write all arrive here — and the burst
   * is collapsed before it reaches the tree, because the checkout counts
   * *events*, not paths (A38, F9). Derived content is filtered by the path
   * registry rather than by a second ignore list, so `thumbnail.webp` and
   * `.tau/types/**` cannot start an idle window.
   */
  let watcher: FSWatcher | undefined;
  let pendingPaths = new Set<string>();
  let coalescing: ReturnType<typeof setTimeout> | undefined;
  /**
   * Raise the gathered paths once, or wait again for the registry.
   *
   * The registry answers asynchronously, and a project's very first writes
   * routinely land before it does. Dropping them would leave the checkout
   * reading clean over an edited tree for the rest of the session, so the burst
   * is held and re-timed instead.
   *
   * @returns The scheduled timer.
   */
  const raise = (): ReturnType<typeof setTimeout> =>
    setTimeout(() => {
      coalescing = undefined;
      const checkoutId = actor.getSnapshot().context.liveCheckoutId;
      if (checkoutId === undefined) {
        if (pendingPaths.size > 0) {
          coalescing = raise();
        }
        return;
      }
      const paths = [...pendingPaths];
      pendingPaths = new Set();
      if (paths.length > 0) {
        revisions.changed(checkoutId, paths);
      }
    }, watchCoalesceMilliseconds).unref();
  const startWatching = (): void => {
    if (options.watchWorkspace === false) {
      return;
    }
    try {
      watcher = watchDirectory(options.workspaceRoot, { recursive: true, persistent: false }, (_event, filename) => {
        if (filename === null) {
          return;
        }
        const path = filename.toString().split(sep).join('/');
        if (path === '' || !classify(path).versioned) {
          return;
        }
        pendingPaths.add(path);
        coalescing ??= raise();
      });
    } catch {
      /* A platform or a filesystem with no recursive watch records revisions on
       * every other trigger; it simply never mints an idle one on its own. */
      watcher = undefined;
    }
  };

  /**
   * Record what is on disk before this host lets the project go (S30 `close`).
   *
   * The checkout's I5 gate decides whether anything is minted, so a clean
   * project pays one tree hash. Bounded, because quitting must not hang on a
   * store that stopped answering: a revision that was not minted here is minted
   * by the next host to open the project, from the same bytes.
   *
   * @returns Nothing; the outcome is the revision, or the absence of one.
   */
  /**
   * The live checkout, once the registry has one, or `undefined` at the bound.
   *
   * @returns The live checkout's id, when this host has one in time.
   */
  const waitForLiveCheckout = async (): Promise<string | undefined> => {
    const current = actor.getSnapshot().context.liveCheckoutId;
    if (current !== undefined) {
      return current;
    }
    const found = Promise.withResolvers<string | undefined>();
    const subscription = actor.subscribe((snapshot) => {
      if (snapshot.context.liveCheckoutId !== undefined) {
        found.resolve(snapshot.context.liveCheckoutId);
      }
    });
    const bound = setTimeout(() => {
      found.resolve(undefined);
    }, closeFlushMilliseconds).unref();
    try {
      return await found.promise;
    } finally {
      clearTimeout(bound);
      subscription.unsubscribe();
    }
  };

  const flushClose = async (): Promise<void> => {
    /*
     * A missing live checkout is *not yet*, not "nothing to do" (W6-a3).
     *
     * The registry is read asynchronously, so a host that quits while the
     * project is still opening used to return here immediately and let the tree
     * go with nothing recorded. The wait is the same bound the cut gets, and it
     * ends the same way: after it, whatever is on disk is recorded by the next
     * host to open the project.
     */
    const checkoutId = await waitForLiveCheckout();
    const { checkouts, turnRefs } = actor.getSnapshot().context;
    if (checkoutId === undefined) {
      return;
    }
    /*
     * A turn holding this checkout is already recording these bytes.
     *
     * The lease is the shared fact, so this holds for a *second* window over the
     * same project as much as for this one's own turns: minting here would pass
     * the I5 gate first and leave the turn's own settlement with an unchanged
     * tree — the turn's revision, recorded under `close` and credited to nobody.
     * A process that dies before the turn settles loses nothing either: the next
     * host to open the project mints from the same bytes.
     */
    const live = checkouts.find((checkout) => checkout.id === checkoutId);
    if (Object.keys(turnRefs).length > 0 || (live?.leaseRunIds.length ?? 0) > 0) {
      return;
    }
    const settledCut = Promise.withResolvers<void>();
    const subscriptions = (['revisionMinted', 'nothingToSave', 'cutFailed'] as const).map((type) =>
      actor.on(type, (event) => {
        if (event.checkoutId === checkoutId && event.trigger === 'close') {
          settledCut.resolve();
        }
      }),
    );
    const bound = setTimeout(() => {
      settledCut.resolve();
    }, closeFlushMilliseconds).unref();
    try {
      actor.send({ type: 'cut', trigger: 'close', checkoutId, leaseIds: [] });
      await settledCut.promise;
    } finally {
      clearTimeout(bound);
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    }
    /*
     * And then the scheduler, inside its own bound (W13 P33).
     *
     * The same seam the browser worker's `release` uses, because it is the same
     * question: has the close revision reached the remote, or at least the
     * record? A quit that does not wait leaves a revision nothing knows is
     * unsent; after the bound, `.tau/revisions/sync-pending` is the guarantee
     * and the next open retries it (D28, AC21).
     */
    await awaitSyncSettled(actor, closeFlushMilliseconds);
  };

  const release = async (): Promise<void> => {
    await flushClose();
    watcher?.close();
    watcher = undefined;
    if (coalescing !== undefined) {
      clearTimeout(coalescing);
      coalescing = undefined;
    }
    for (const [runId, pending] of admissions) {
      pending.reject(new Error('This Tau Host stopped serving the project before the turn was placed.'));
      admissions.delete(runId);
    }
    actor.stop();
    /* Stopping the tree cancels nothing already in flight; the store's own
     * creation and the chat-log appends are the effects that outlive it, and a
     * caller that removes the project directory next must not race either. */
    await Promise.all(recording);
    await settled();
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
    },
    release,
    status: () => selectRevisionStatus(actor.getSnapshot()),
    record: (launcher) => {
      /* The launcher owns the chat's log writer: one appender per chat, so the
       * record takes the next sequence rather than opening a second writer on
       * one `events.jsonl`. */
      appendToChatLog = async (chatId, event) => launcher.append(chatId, event);
      const watching = new AbortController();
      let watchFailure: unknown;
      const watch = (async (): Promise<void> => {
        try {
          for await (const { event } of launcher.events(watching.signal)) {
            if (event.type !== 'run.lifecycle' || !terminalStates.has(event.state)) {
              continue;
            }
            const turnId = turns.get(event.runId);
            if (turnId === undefined) {
              continue;
            }
            /* Sent straight through: `turn.machine` buffers a completion that
             * arrives while it is still `preparing` and replays it on
             * `leased.held`, so the host holds nothing (W6). */
            actor.send({ type: 'turnCompleted', turnId });
          }
        } catch (error) {
          /* A durable subscription can *error* — the launcher's fan-out drops
           * one that fell behind — and nothing awaits this promise until
           * `close()`. An unhandled rejection ends the process on Node 24 long
           * before that, so the failure is kept and re-raised where a caller
           * sees it. */
          watchFailure = error;
        }
      })();

      return {
        ...launcher,
        execute: async (command) => {
          if (command.type !== 'start' || turns.has(command.runId)) {
            return launcher.execute(command);
          }
          await admit({
            runId: command.runId,
            chatId: command.chatId,
            /* The stable user-message id the client keys its own turn on: the
             * settlement has to name the same turn the transcript does, or the
             * graph node it becomes belongs to nothing on screen. */
            turnId: command.message.id,
          });
          try {
            return await launcher.execute(command);
          } catch (error) {
            /* `acknowledge` only throws when nothing of ours was admitted, so
             * the turn never reached the tool loop and wrote nothing. The turn
             * actor retires its lease and drops out; a refused admission must
             * not hold one for the life of the host. */
            const turnId = turns.get(command.runId);
            if (turnId !== undefined) {
              actor.send({ type: 'turnAbandoned', turnId });
              turns.delete(command.runId);
            }
            options.checkouts?.delete(command.runId);
            throw error;
          }
        },
        close: async () => {
          /* The launcher first: closing it drains every background run, so the
           * terminal markers this wrapper settles on are published before the
           * fan-out ends the watch. */
          await launcher.close();
          await watch;
          await release();
          if (watchFailure !== undefined) {
            // oxlint-disable-next-line @typescript-eslint/only-throw-error -- re-raising exactly what the launcher's stream threw.
            throw watchFailure;
          }
        },
      };
    },
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
 * @param options - The binaries this host records with; `PATH`'s when absent.
 * @throws GitToolchainError `ENGINE_UNAVAILABLE`, naming exactly what is missing.
 * @public
 */
export const requireRevisionToolchain = async (
  options: Readonly<{ gitExecutable?: string | undefined; gitLfsExecutable?: string | undefined }> = {},
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
 * Record one publication on Tau Cloud from a Node host (S32, A21).
 *
 * The browser worker makes the same request with its cookie session; this leg
 * carries a bearer session token instead, because a terminal has no cookie jar.
 *
 * ponytail: the two legs repeat this request and its copy. They merge into
 * `@taucad/revisions` the moment a third leg needs it — the shape that matters
 * (the pointer, the failure edges) is already shared in `publish.machine`.
 *
 * @param apiBaseUrl - The API origin, without a trailing slash.
 * @param apiToken - A Better Auth session token presented as a bearer.
 * @param input - The pointer and the settings the caller collected.
 * @returns The publication's id and the link to share.
 * @throws Error When the API refused, in the words a person can act on (A18).
 */
const publishOverHttp = async (
  apiBaseUrl: string,
  apiToken: string,
  input: PublishPublicationActorInput,
): Promise<PublishPublicationActorOutput> => {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/u, '')}/v1/publications`, {
    method: 'POST',
    /* eslint-disable @typescript-eslint/naming-convention -- HTTP header names retain TitleCase on the wire. */
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    /* eslint-enable @typescript-eslint/naming-convention -- end wire header names. */
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const code = (body as Readonly<{ code?: unknown }> | undefined)?.code;
    throw new Error(
      response.status === 401
        ? 'Tau Cloud did not accept this token. Set TAU_API_TOKEN to a current session token.'
        : code === 'ENTITLEMENT_REQUIRED'
          ? 'Private links need the Pro plan.'
          : code === 'MISSING_ENTRY_PATH'
            ? 'This version does not contain the file this project opens with.'
            : 'Tau Cloud could not publish this project. Try again.',
    );
  }
  const body = (await response.json()) as Readonly<{
    id?: string;
    urls?: Readonly<{ share?: string; view?: string }>;
  }>;
  const url = body.urls?.share ?? body.urls?.view;
  if (body.id === undefined || url === undefined) {
    throw new Error('Tau Cloud answered without a link for this publication.');
  }
  return { publicationId: body.id, url };
};

/** What a `publish` did, or why it did not (S32, S42). @public */
export type RevisionPublishOutcome =
  | Readonly<{ status: 'published'; tag: string; publicationId: string; url: string }>
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
  /** Name this branch's head and publish it: one gesture, the dialog's machine. */
  publish(draft: PublishDraft): Promise<RevisionPublishOutcome>;
  /** Stop whatever this opened. Reading alone starts nothing. */
  close(): Promise<void>;
};

/** How long a verb waits for the machines to answer. */
const verbMilliseconds = 30_000;

/* Publishing waits out `publish.machine`'s own push bound and then some, so the
 * verb reports the machine's error edge rather than pre-empting it. */
const publishVerbMilliseconds = publishPushMilliseconds + verbMilliseconds;

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
    authorityEpoch?: string | undefined;
    gitExecutable?: string | undefined;
    gitLfsExecutable?: string | undefined;
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
    /** The Tau Hosted Remote this project pushes a publication to (A40). */
    remoteUrl?: ((projectId: string) => string | undefined) | undefined;
    /** Creates or re-points the publication row. Only a signed-in host has it. */
    publishPublication?: ((input: PublishPublicationActorInput) => Promise<PublishPublicationActorOutput>) | undefined;
  }>,
): ProjectRevisionVerbs => {
  const projectId = options.projectId ?? basename(options.workspaceRoot);
  const { apiBaseUrl, apiToken } = options;
  const remoteUrl =
    options.remoteUrl ?? (apiBaseUrl === undefined ? undefined : (id: string) => tauRemoteUrl(apiBaseUrl, id));
  const publishPublication =
    options.publishPublication ??
    (apiBaseUrl === undefined || apiToken === undefined
      ? undefined
      : async (input: PublishPublicationActorInput) => publishOverHttp(apiBaseUrl, apiToken, input));
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
        : { tauCredential: () => ({ apiBaseUrl, authorization: `Bearer ${apiToken}` }) }),
    });
  let tree: ReturnType<typeof createProjectRevisionsActor> | undefined;

  /* Started on the first write verb only: `log`, `diff` and `describe` ask the
   * store directly, and a read must never create a repository, sweep a lease or
   * mint anything. */
  const started = async (): Promise<NonNullable<typeof tree>> => {
    if (tree === undefined) {
      tree = createProjectRevisionsActor({
        port,
        projectId,
        authorityEpoch: options.authorityEpoch ?? processAuthorityEpoch,
        filesystem: (checkout) => new NodeFsProvider(checkout.kind === 'live' ? options.workspaceRoot : checkout.root),
        ...(remoteUrl === undefined ? {} : { remoteUrl }),
        ...(publishPublication === undefined ? {} : { publishPublication }),
      });
      tree.actor.start();
    }
    await registryAnswered(tree.actor);
    return tree;
  };

  /**
   * Resolve on the first answer, or give up rather than hold a terminal open.
   *
   * @param listen - Subscribes, sends, and returns its own unsubscribe.
   * @param timedOut - The answer a caller gets when nothing arrives in time.
   * @param milliseconds - How long to wait; defaults to the ordinary verb bound.
   * @returns The first answer, or `timedOut`.
   */
  const answered = async <Answer>(
    listen: (resolve: (answer: Answer) => void) => () => void,
    timedOut: Answer,
    milliseconds: number = verbMilliseconds,
  ): Promise<Answer> => {
    const settled = Promise.withResolvers<Answer>();
    const stop = listen(settled.resolve);
    const bound = setTimeout(() => {
      settled.resolve(timedOut);
    }, milliseconds);
    try {
      return await settled.promise;
    } finally {
      clearTimeout(bound);
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
      return Object.freeze({ status: 'refused', branch, reason: 'This project has no branch verbs running.' });
    }
    /*
     * One verb, one owner. The root resolves D10 and hands the decision to
     * `branch.machine`, which owns the lifecycle — its confirmation, its failure
     * edge, and the single `applySwitch` actor that rewrites the tree. This host
     * used to choreograph the apply itself over the `restore` child, which was a
     * host re-implementing a machine (I20); now it only reports what the machine
     * settled on (W7 review R3).
     */
    const outcome = await answered<RevisionSwitchOutcome>(
      (resolve) => {
        const refused = actor.on('switchRefused', (event) => {
          resolve(Object.freeze({ status: 'refused', branch, reason: event.reason }));
        });
        /* A re-root is finished the moment it is resolved: the branch already
         * has a place of its own and no tree is rewritten. */
        const rerooted = actor.on('switchResolved', (event) => {
          if (event.mode === 'reroot') {
            resolve(Object.freeze({ status: 'switched', branch, line: branch }));
          }
        });
        const settled = child.on('toast.branch', () => {
          resolve(Object.freeze({ status: 'switched', branch, line: branch }));
        });
        const failed = child.on('toast.error', (event) => {
          resolve(Object.freeze({ status: 'refused', branch, reason: event.message }));
        });
        /* The machine parks in `confirming` when its own check says a person is
         * needed; an unconfirmed switch cancels rather than waiting. */
        const watching = child.subscribe((snapshot) => {
          if (!snapshot.matches('confirming')) {
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
        actor.send({ type: 'switch', branch });
        return () => {
          refused.unsubscribe();
          rerooted.unsubscribe();
          settled.unsubscribe();
          failed.unsubscribe();
          watching.unsubscribe();
        };
      },
      Object.freeze({ status: 'refused', branch, reason: 'This project did not answer in time.' }),
    );
    if (outcome.status !== 'switched') {
      return outcome;
    }
    const place = await readRevisionPlace(port);
    return Object.freeze({ status: 'switched', branch, line: place.line });
  };

  const discard = async (branch: string): Promise<RevisionDiscardOutcome> => {
    const { actor } = await started();
    const record = actor.getSnapshot().context.checkouts.find((checkout) => checkout.branch === branch);
    if (record === undefined) {
      return Object.freeze({ status: 'refused', branch, reason: `${branch} has no files of its own to discard.` });
    }
    if (record.kind === 'live') {
      return Object.freeze({
        status: 'refused',
        branch,
        reason: `${branch} is the project itself. Switch to another branch first.`,
      });
    }
    if (record.leaseRunIds.length > 0) {
      return Object.freeze({ status: 'refused', branch, reason: `An agent is working in ${branch}.` });
    }
    const { checkouts } = actor.getSnapshot().children;
    if (checkouts === undefined) {
      return Object.freeze({ status: 'refused', branch, reason: 'This project has no checkout registry running.' });
    }
    return answered<RevisionDiscardOutcome>(
      (resolve) => {
        const failed = actor.on('checkoutFailed', (event) => {
          resolve(Object.freeze({ status: 'refused', branch, reason: event.reason }));
        });
        const watching = actor.subscribe((snapshot) => {
          if (!snapshot.context.checkouts.some((checkout) => checkout.id === record.id)) {
            resolve(Object.freeze({ status: 'discarded', branch }));
          }
        });
        checkouts.send({ type: 'removeCheckout', id: record.id });
        return () => {
          failed.unsubscribe();
          watching.unsubscribe();
        };
      },
      Object.freeze({ status: 'refused', branch, reason: 'This project did not answer in time.' }),
    );
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
      return Object.freeze({ status: 'refused', reason: 'This project has no publish verbs running.' });
    }
    return answered<RevisionPublishOutcome>(
      (resolve) => {
        const published = child.on('published', (event) => {
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
          resolve(Object.freeze({ status: 'refused', reason: event.message }));
        });
        actor.send({ type: 'publish', event: { type: 'publish', tag: draft.tag } });
        actor.send({ type: 'publish', event: { type: 'confirm', draft } });
        return () => {
          published.unsubscribe();
          failed.unsubscribe();
        };
      },
      Object.freeze({ status: 'refused', reason: 'This project did not answer in time.' }),
      publishVerbMilliseconds,
    );
  };

  return {
    describeEngine: async () => port.describe(),
    log: async (request) => readRevisionLog(port, request),
    diff: async (from, to) => readRevisionDiff(port, from, to),
    describe: async () => readRevisionPlace(port),
    switchTo,
    discard,
    publish,
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
