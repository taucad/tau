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

import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, watch as watchDirectory, writeFileSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import { z } from 'zod';
import { chatRecordSchema } from '@taucad/chat';

import { jsonValueSchema } from '@taucad/agent-host';
import type { AgentChannelRevisionEvent, JsonValue } from '@taucad/agent-host';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { classify } from '@taucad/filesystem/path-registry';
import { revisionId } from '@taucad/revisions/algorithms';
import {
  admissionMilliseconds,
  awaitSyncSettled,
  createProjectRevisionsActor,
  describeTurnSettlement,
  describeTurnRelease,
} from '@taucad/revisions/revision-effects';
import type {
  CheckoutFileSystems,
  UseCheckoutFileSystem,
  TurnConflictedEvent as SettlementConflicted,
  TurnFailedEvent as SettlementFailed,
  TurnFinalizedEvent as SettlementFinalized,
} from '@taucad/revisions/revision-effects';
import {
  generatedGitattributesPath,
  generatedIgnorePath,
  readChatRecord,
  readRevisionDiff,
  readRevisionLog,
  readRevisionPlace,
  publishOverHttp,
  registerProjectOverHttp,
  tauRemoteUrl,
} from '@taucad/revisions';
import { selectRevisionStatus } from '@taucad/revisions/project-revisions-machine';
import { sameRevisionStatus } from '@taucad/revisions/revision-projection';
import type { RevisionStatusProjection } from '@taucad/revisions/project-revisions-machine';
import type {
  RevisionActor,
  CreateRevisionTagInput,
  RevisionDiffEntry,
  RevisionEngineDescriptor,
  RevisionLogRequest,
  RevisionPlace,
  RevisionPort,
  RevisionRow,
  RevisionTag,
} from '@taucad/revisions';
import { GitToolchainError, createNativeGitRevisionPort, resolveGitToolchain } from '@taucad/revisions/node';
import type {
  MissingGitTool,
  NativeGitCheckoutOptions,
  NativeGitRemoteCredential,
  TauApiCredential,
} from '@taucad/revisions/node';
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
   * The authority epoch leases are written under (N3, C71).
   *
   * A lease from any other epoch belongs to a host that no longer owns this
   * project, and `sweepLeases` retires it on open. The value given here is only
   * the *claim*: a project another running host already holds keeps that host's
   * epoch, so opening it never retires a live turn's lease.
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
 * How long an admission waits for the checkout registry's first answer.
 *
 * Short, because the wait is only an ordering convenience: a registry that
 * cannot answer refuses the turn a moment later inside `prepare`, which is the
 * refusal a client should see rather than a stalled start.
 */
const registryMilliseconds = 5000;

/**
 * The authority epoch this process mints for a project nothing else owns.
 *
 * One per **process**, not one per call: `sweepLeases` retires every lease whose
 * epoch is not the current one, so a second {@link createProjectRevisions} with
 * an epoch of its own would retire the first's *live* leases the moment it
 * opened (N3).
 */
const processAuthorityEpoch = randomUUID();

/** Who holds a project on this machine, and the epoch its leases carry. */
type ProjectAuthorityRecord = Readonly<{ epoch: string; pid: number }>;

/**
 * Where this machine records which host holds a project.
 *
 * Beside the linked checkouts, in this host's own data directory — never inside
 * a served tree, because nothing a project carries may say who is running it.
 *
 * @param workspaceRoot - The project directory, which is the identity.
 * @returns The record's absolute path.
 */
const authorityRecordPath = (workspaceRoot: string): string =>
  join(
    defaultConfigDirectory(),
    'authority',
    `${createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 32)}.json`,
  );

/**
 * Whether the process that last claimed a project is still there.
 *
 * `EPERM` is alive too: another user's process answers the signal check without
 * accepting it.
 *
 * @param pid - The recorded owner.
 * @returns Whether it is still running.
 */
const ownerIsRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * The epoch one project's leases are written and swept under (C71, N3).
 *
 * The epoch belongs to the **project**, not to the process: `sweepLeases`
 * retires every lease from another epoch, so a second process opening a project
 * a first is mid-turn on used to delete the live lease and take the running
 * turn's run id out of its own provenance. A host therefore adopts the epoch of
 * whichever host still holds this project, and mints a new one only when that
 * owner is gone — which is exactly when the leases it left behind are stale.
 * The browser leg made the same move per document (`file-manager.worker.ts`).
 *
 * ponytail: the owner is a pid, so a pid reused after a reboot reads as the same
 * host and its predecessor's leases survive one more open. W19's
 * `project-session` identity is the upgrade path; a heartbeat is not (Rule 8).
 *
 * @param workspaceRoot - The project this host is opening.
 * @param minted - The epoch to claim it with when nothing else holds it.
 * @returns The epoch this host must write and sweep under.
 */
const projectAuthorityEpoch = (workspaceRoot: string, minted: string): string => {
  const path = authorityRecordPath(workspaceRoot);
  try {
    const record = JSON.parse(readFileSync(path, 'utf8')) as Partial<ProjectAuthorityRecord>;
    if (typeof record.epoch === 'string' && typeof record.pid === 'number' && ownerIsRunning(record.pid)) {
      return record.epoch;
    }
  } catch {
    /* No record, or one this host cannot read: nothing holds this project. */
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ epoch: minted, pid: process.pid } satisfies ProjectAuthorityRecord)}\n`);
  } catch {
    /* A host that cannot record its own claim still records revisions; it only
     * loses the guarantee that a later process will not sweep its leases. */
  }
  return minted;
};

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
  const projectId = options.projectId ?? basename(options.workspaceRoot);
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
    emitChannel({ kind: 'event', value: revisionJson(event) });
    const appended = (async (): Promise<void> => {
      await recordInChatLog(event);
      actor.send({ type: 'sync', event: { type: 'recordsChanged' } });
    })();
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
  /**
   * Refuse one waiting admission, with the reason it was refused for.
   *
   * One sentence for every way a turn can end without its lease — `prepare`
   * throwing, the turn announcing its release (W19-b-a2), and the bound — so a
   * caller never has to tell a refusal apart from the host running out of
   * patience. Read-then-delete, so a run whose `prepare` refused it and then
   * announced a release is answered once.
   *
   * @param runId - The run whose admission is waiting.
   * @param reason - What the host can tell the person, already a sentence.
   */
  const refuseAdmission = (runId: string, reason: string): void => {
    const pending = admissions.get(runId);
    admissions.delete(runId);
    pending?.reject(
      Object.assign(new Error(`This Tau Host could not open a revision for the turn: ${reason}`), {
        code: 'REVISION_PREPARE_FAILED',
      }),
    );
  };
  /** Each admitted run's turn id, so a terminal marker can name the turn. */
  const turns = new Map<string, string>();
  /** Monotonic per checkout, one increment per content-change event (A38, F9). */
  const generations = new Map<string, number>();
  const applyingPaths = new Map<string, number>();
  const isApplyingPath = (path: string): boolean =>
    (path === basename(options.workspaceRoot) && applyingPaths.size > 0) ||
    [...applyingPaths.keys()].some((applying) => {
      const separator = applying.lastIndexOf('/');
      const temporaryPrefix = `${separator === -1 ? '' : applying.slice(0, separator + 1)}.${applying.slice(separator + 1)}.`;
      return (
        applying === path ||
        applying.startsWith(`${path}/`) ||
        (path.startsWith(temporaryPrefix) && path.endsWith('.tmp'))
      );
    });

  const filesystems =
    options.filesystem ??
    ((checkout: Parameters<NonNullable<ProjectRevisionsOptions['filesystem']>>[0]) =>
      new NodeFsProvider(checkout.kind === 'live' ? options.workspaceRoot : checkout.root));
  const { actor, settled } = createProjectRevisionsActor({
    port,
    projectId,
    authorityEpoch: projectAuthorityEpoch(options.workspaceRoot, options.authorityEpoch ?? processAuthorityEpoch),
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
    onApplyingTree: (checkout, paths) => {
      if (checkout.kind !== 'live') {
        return;
      }
      for (const path of paths) {
        applyingPaths.set(path, (applyingPaths.get(path) ?? 0) + 1);
      }
      return () => {
        setTimeout(() => {
          for (const path of paths) {
            const count = applyingPaths.get(path) ?? 0;
            if (count <= 1) {
              applyingPaths.delete(path);
            } else {
              applyingPaths.set(path, count - 1);
            }
          }
        }, watchCoalesceMilliseconds * 2).unref();
      };
    },
    ...(apiBaseUrl === undefined ? {} : { remoteUrl: (id: string) => tauRemoteUrl(apiBaseUrl, id) }),
    ...(apiBaseUrl === undefined || options.tauCredential === undefined
      ? {}
      : {
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
                name: await readProjectName(options.workspaceRoot),
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
    turns.delete(event.runId);
    options.checkouts?.delete(event.runId);
    if (failure === undefined) {
      return;
    }
    report(failure);
    /*
     * The reason, now, rather than the bound's sentence half a minute later.
     *
     * `prepare`'s catch is the only place a placement is *refused*
     * (`revision-effects.ts`), so a turn that ended any other way before its
     * lease — a base cut the checkout could not settle, a lease it could not
     * write, an abandonment — left `admit` waiting out `admissionMilliseconds`
     * and then answering "it was never leased", which names nothing anybody can
     * act on (I12; the browser leg fixed the same gap in W19-b). A `finalized`
     * or `conflicted` turn held its lease, so its admission was already
     * resolved at `leased` and there is nothing here to settle.
     */
    refuseAdmission(event.runId, failure.reason);
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
        unrecoverable: toast.unrecoverable,
      }),
    });
  });
  restoreChild?.on('toast.error', (toast) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({
        type: 'error',
        subject: 'restore',
        message: toast.message,
      }),
    });
  });
  actor.on('cutFailed', (failure) => {
    if (failure.turnId === undefined) {
      emitChannel({
        kind: 'toast',
        value: revisionJson({
          type: 'error',
          subject: 'save',
          message: failure.reason,
        }),
      });
    }
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
  branchChild?.on('toast.error', (toast) => {
    emitChannel({
      kind: 'toast',
      value: revisionJson({
        type: 'error',
        subject: 'branch',
        message: toast.message,
      }),
    });
  });
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
      if (!admissions.has(input.runId)) {
        return;
      }
      /*
       * The root is told, not only the caller (T4-02).
       *
       * An admission the root is still holding — buffered before the registry
       * answered, or queued behind the turn id a running turn holds (V8) —
       * outlives this wait: the root replays it later, the turn it spawns takes
       * the checkout's lease, and nothing is left to send it `turnCompleted`,
       * so the checkout reads as held for the life of the process and every
       * save on it records nothing. A lease has no heartbeat by policy (§8),
       * so this host giving up is the only liveness signal it has.
       */
      actor.send({ type: 'turnAbandoned', turnId: input.turnId, runId: input.runId });
      /*
       * And the run id becomes admittable again, as it does on every other way
       * an admission ends (`turnReleased`, a failed `execute`).
       *
       * `execute` skips admission for a run it has already admitted, so a
       * client retrying the run id this bound just refused went straight to the
       * launcher: the agent ran with no lease, unfenced, and its turn recorded
       * no revision (I-EDIT).
       */
      turns.delete(input.runId);
      refuseAdmission(input.runId, 'it was never leased.');
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
        const initializing = actor.getSnapshot().context.liveCheckoutId === undefined;
        if (path === '' || !classify(path).versioned || isApplyingPath(path)) {
          return;
        }
        if (initializing && (path === generatedIgnorePath || path === generatedGitattributesPath)) {
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
      throw new Error('The project checkout was not ready before the close deadline.');
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
    const subscriptions = [
      actor.on('revisionMinted', (event) => {
        if (event.checkoutId === checkoutId && event.trigger === 'close') {
          settledCut.resolve();
        }
      }),
      actor.on('nothingToSave', (event) => {
        if (event.checkoutId === checkoutId && event.trigger === 'close') {
          settledCut.resolve();
        }
      }),
      actor.on('cutFailed', (event) => {
        if (event.checkoutId === checkoutId && event.trigger === 'close') {
          settledCut.reject(new Error(event.reason));
        }
      }),
    ];
    const bound = setTimeout(() => {
      settledCut.reject(new Error('The close revision was not recorded before the deadline.'));
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
     * unsent; after the bound, `.git/sync-pending` is the guarantee
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
    /* The fourth way a turn ends without its lease, in the same frame and with
     * the same code as the other three — a client cannot act on a refusal it
     * has to tell apart by its wording. */
    for (const runId of admissions.keys()) {
      refuseAdmission(runId, 'it stopped serving this project before the turn was placed.');
    }
    actor.stop();
    /* Stopping the tree cancels nothing already in flight; the store's own
     * creation and the chat-log appends are the effects that outlive it, and a
     * caller that removes the project directory next must not race either. */
    await Promise.all(recording);
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
  // oxlint-disable-next-line complexity -- One validated dispatch table mirrors the established worker wire without another protocol layer.
  const sendRevisionRequest = async (value: JsonValue): Promise<JsonValue> => {
    const request = hostRevisionRequestSchema.parse(value) as {
      command: string;
    } & Record<string, JsonValue>;
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
        const repositoryUrl = optionalText(request, 'repositoryUrl');
        const authorization = optionalText(request, 'authorization');
        channelRemoteCredential =
          repositoryUrl === undefined || authorization === undefined ? undefined : { repositoryUrl, authorization };
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
            ...(limit === undefined ? {} : { limit }),
          }),
        );
      }
      case 'diff': {
        const to = text('revisionId');
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
          const snapshot = actor.getSnapshot();
          const checkout = snapshot.context.checkouts.find(
            (entry) => entry.id === selectRevisionStatus(snapshot).checkoutId,
          );
          const [tree, filesystem] = await Promise.all([
            port.readTree(revisionId(requestedRevision)),
            checkout === undefined
              ? undefined
              : filesystems({
                  id: checkout.id,
                  projectId,
                  root: checkout.root,
                  kind: checkout.kind,
                  branch: checkout.branch,
                  baseRevisionId:
                    checkout.headRevisionId === undefined ? undefined : revisionId(checkout.headRevisionId),
                }),
          ]);
          const decoder = new TextDecoder();
          let working = '';
          try {
            working = filesystem === undefined ? '' : decoder.decode(await filesystem.readFile(path));
          } catch {
            // Missing on the right means deleted since the selected revision.
          }
          return revisionJson({
            original: tree?.get(path) === undefined ? '' : decoder.decode(tree.get(path)),
            modified: working,
          });
        }
        const record = await port.readRevision(revisionId(requestedRevision));
        const base = optionalText(request, 'from') ?? record?.parents[0];
        const [before, after] = await Promise.all([
          base === undefined ? undefined : port.readTree(revisionId(base)),
          port.readTree(revisionId(requestedRevision)),
        ]);
        const decoder = new TextDecoder();
        return revisionJson({
          original: before?.get(path) === undefined ? '' : decoder.decode(before.get(path)),
          modified: after?.get(path) === undefined ? '' : decoder.decode(after.get(path)),
        });
      }
      case 'restore':
        actor.getSnapshot().children.restore?.send({
          type: 'restore',
          revisionId: text('revisionId'),
        });
        break;
      case 'returnToLatest':
      case 'undo':
      case 'confirm':
      case 'cancel':
        actor.getSnapshot().children.restore?.send({ type: request.command });
        break;
      case 'switch':
        actor.send({ type: 'switch', branch: text('branch') });
        break;
      case 'followChat':
        actor.send({ type: 'followChat', chatId: text('chatId') });
        break;
      case 'pinTo':
        actor.send({ type: 'pinTo', checkoutId: text('checkoutId') });
        break;
      case 'createBranch':
        actor.send({
          type: 'branch',
          event: {
            type: 'create',
            name: text('name'),
            ...(optionalText(request, 'from') ? { from: optionalText(request, 'from') } : {}),
          },
        });
        break;
      case 'discardBranch':
        actor.send({
          type: 'branch',
          event: {
            type: 'discard',
            branch: text('branch'),
            ...(optionalText(request, 'checkoutId') ? { checkoutId: optionalText(request, 'checkoutId') } : {}),
          },
        });
        break;
      case 'mergeBranch':
        actor.send({
          type: 'branch',
          event: { type: 'merge', branch: text('branch') },
        });
        break;
      case 'renameBranch':
        actor.send({
          type: 'branch',
          event: { type: 'rename', branch: text('branch'), name: text('name') },
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
      case 'syncNow':
        actor.send({ type: 'syncNow' });
        break;
      case 'publishProject':
        actor.send({
          type: 'publish',
          event: {
            type: 'publish',
            ...(optionalText(request, 'tag') ? { tag: optionalText(request, 'tag') } : {}),
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
          const filesystem = await filesystems({
            id: actor.getSnapshot().context.liveCheckoutId ?? 'live',
            projectId,
            root: options.workspaceRoot,
            kind: 'live',
            branch: undefined,
            baseRevisionId: undefined,
          });
          const bytes = await readChatRecord(filesystem, command.chatId);
          const chat = bytes === undefined ? undefined : chatRecordSchema.parse(JSON.parse(bytes));
          if (chat !== undefined && chat.id !== command.chatId) {
            throw new Error('The chat record does not match the admitted chat.');
          }
          const snapshot = actor.getSnapshot().context;
          // The durable picker selection outranks a previous turn's cached placement.
          const checkoutId = chat?.checkoutId ?? snapshot.chatCheckouts[command.chatId] ?? snapshot.selectedCheckoutId;
          await admit({
            runId: command.runId,
            chatId: command.chatId,
            /* The stable user-message id the client keys its own turn on: the
             * settlement has to name the same turn the transcript does, or the
             * graph node it becomes belongs to nothing on screen. */
            turnId: command.message.id,
            ...(checkoutId === undefined ? {} : { checkoutId }),
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
              /* Named by run as well as by turn: an edit reuses the message id
               * the previous run leased, so the verb must not end whichever run
               * holds that turn id now. */
              actor.send({ type: 'turnAbandoned', turnId, runId: command.runId });
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
 * Read the exact project name a disk host registers with Tau Cloud.
 *
 * @param workspaceRoot - Project directory containing `tau.json`.
 * @returns The trimmed manifest name, or `undefined` when none is usable.
 */
const readProjectName = async (workspaceRoot: string): Promise<string | undefined> => {
  try {
    const manifest = JSON.parse(await readFile(join(workspaceRoot, 'tau.json'), 'utf8')) as {
      readonly name?: unknown;
    };
    return typeof manifest.name === 'string' && manifest.name.trim() !== '' ? manifest.name.trim() : undefined;
  } catch {
    return undefined;
  }
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
              name: await readProjectName(options.workspaceRoot),
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
   * store directly, and a read must never create a repository, sweep a lease or
   * mint anything. */
  const started = async (): Promise<NonNullable<typeof tree>> => {
    if (tree === undefined) {
      tree = createProjectRevisionsActor({
        port,
        projectId,
        authorityEpoch: projectAuthorityEpoch(options.workspaceRoot, options.authorityEpoch ?? processAuthorityEpoch),
        filesystem: (checkout) => new NodeFsProvider(checkout.kind === 'live' ? options.workspaceRoot : checkout.root),
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
      Object.freeze({
        status: 'refused',
        branch,
        reason: 'This project did not answer in time.',
      }),
    );
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
      Object.freeze({
        status: 'refused',
        branch,
        reason: 'This project did not answer in time.',
      }),
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
      return Object.freeze({
        status: 'refused',
        reason: 'This project has no publish verbs running.',
      });
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
        actor.send({
          type: 'publish',
          event: { type: 'publish', tag: draft.tag },
        });
        actor.send({ type: 'publish', event: { type: 'confirm', draft } });
        return () => {
          published.unsubscribe();
          failed.unsubscribe();
        };
      },
      Object.freeze({
        status: 'refused',
        reason: 'This project did not answer in time.',
      }),
      publishVerbMilliseconds,
    );
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
    const outcome = await answered<RevisionOpenOutcome | undefined>(
      (resolve) => {
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
      },
      Object.freeze({
        status: 'refused',
        reason: 'This project did not answer in time.',
      }),
    );
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
