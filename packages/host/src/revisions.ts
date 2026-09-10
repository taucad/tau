/**
 * Turn revisions on a Node host (charter V17, north star N26 and I-EDIT).
 *
 * The host — never the agent and never the client — records what a turn wrote.
 * `@taucad/revisions`' {@link TurnRevisionRecorder} already owns prepare →
 * capture → merge → finalize host-neutrally, and {@link NodeFsProvider} is
 * already a `RootedFileSystem` rooted at one absolute directory, so this module
 * is only the turn boundary: capture the base before the turn is admitted,
 * finalize when its durable lifecycle marker turns terminal.
 *
 * It wraps the launcher rather than reaching inside it because both host
 * compositions — the daemon (launcher 1) and the Electron services utility
 * (launcher 2) — build the launcher the same way, and the wrapper is the only
 * seam that is strictly ordered *before* `host.admit`. Observing the durable
 * stream alone would race the first tool write.
 */

import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { materializedWorkspaceId, revisionId } from '@taucad/filesystem';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { defaultTurnCaptureExclusions, TurnRevisionRecorder } from '@taucad/revisions';
import type { MaterializedWorkspace, MaterializedWorkspaceId } from '@taucad/filesystem';
import type { HostAuthoredLogEvent, NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { AgentChannelEvent, RevisionFinalizedEvent } from '@taucad/agent-host';
import type { RevisionPort } from '@taucad/revisions';
import { isRecord } from '@taucad/utils/schema';

/**
 * Revision modes a Node host records a turn in.
 *
 * Both, since R-W4a. `candidate` runs the turn against a checkout the authority
 * materializes and merges home at finalization, and every writer honours that
 * now: the external agent's session `cwd` is the checkout (R-W3), and Tau's own
 * tools are rooted per run through the same {@link TurnRevisionOptions.checkouts}
 * map — `createHostToolRegistry` resolves the calling run's root per invocation
 * rather than binding one at construction.
 *
 * The list is per host, not per turn kind, and a host must never advertise a
 * mode it records as something else. It is enforced where it is honoured:
 * {@link withTurnRevisions} refuses a start naming a mode that is not in here.
 *
 * @public
 */
export const hostRevisionModes: ReadonlyArray<'direct' | 'candidate'> = Object.freeze(['direct', 'candidate']);

/**
 * Where one prepared turn runs, and what it descends from.
 *
 * Published per run so the *external agent port* can root its session in the
 * same workspace the recorder prepared. The port is constructed before the
 * launcher this wrapper wraps, so the two share a map rather than a call: no
 * second recorder, and no lookup that has to exist before either side does
 * (VI11 — the host records the turn, the agent only works in what it is given).
 *
 * @public
 */
export type TurnCheckout = {
  /** Absolute directory the turn's agent works in. */
  readonly cwd: string;
  /** The mode this turn was admitted in. */
  readonly mode: 'direct' | 'candidate';
  /** Revision the turn's tree descends from. */
  readonly baseRevisionId: string;
};

/**
 * Entries under `.tau/workspaces` that are not a turn workspace.
 *
 * The same four the browser provider's own sweep reserves, so one root shared
 * by a desktop window and its services host has one answer. `revisions` is the
 * revision store itself; sweeping it would delete every recorded turn.
 */
const reservedWorkspaceEntries = new Set(['claims', 'publications', 'conflicts', 'revisions']);

/**
 * Workspaces some other authority still owns, from its own claim records.
 *
 * The browser revision authority writes into this **same** `.tau/workspaces`
 * namespace on a shared desktop root, and it protects a workspace with a claim
 * file rather than with a reserved name — so a name-only sweep would delete a
 * renderer-placed turn's checkout out from under it mid-turn (4-review B3).
 *
 * Read leniently: a half-written, foreign or future claim record protects
 * nothing, and must never be able to stop the sweep it is read by.
 *
 * @param directory - The `.tau/workspaces` directory being swept.
 * @returns Every `workspaceId` a claim record names.
 */
const claimedWorkspaceIds = async (directory: string): Promise<readonly string[]> => {
  let files: readonly string[];
  try {
    files = await readdir(join(directory, 'claims'));
  } catch {
    return [];
  }
  const claimed = await Promise.all(
    files.map(async (file) => {
      try {
        const record: unknown = JSON.parse(await readFile(join(directory, 'claims', file), 'utf8'));
        return isRecord(record) && typeof record['workspaceId'] === 'string' ? [record['workspaceId']] : [];
      } catch {
        return [];
      }
    }),
  );
  return claimed.flat();
};

/**
 * Workspaces kept as the evidence of a conflicted settlement: the authority
 * retires the claim but leaves the bytes and a `conflicts/<id>.json` beside
 * them (I-CONF), so neither sweep may treat that directory as an orphan
 * (6-review M6).
 *
 * @param directory - The `.tau/workspaces` directory being swept.
 * @returns Every workspace id a conflict record names.
 */
const conflictedWorkspaceIds = async (directory: string): Promise<readonly string[]> => {
  let files: readonly string[];
  try {
    files = await readdir(join(directory, 'conflicts'));
  } catch {
    return [];
  }
  /* Per file, like the claims: one undecodable name protects nothing and must
   * not fail every other record open (7-review S1). */
  return files
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        return [decodeURIComponent(file.slice(0, -5))];
      } catch {
        return [];
      }
    });
};

/** What one {@link sweepTurnWorkspaces} pass did. @public */
export type TurnWorkspaceSweep = {
  /** Directories removed. */
  readonly removed: number;
  /** Directories a live owner still holds, or that are not turn workspaces (SR4). */
  readonly preserved: number;
};

/**
 * Delete turn workspaces no live run owns, once, at host start.
 *
 * Two kinds of leftover accumulate under `.tau/workspaces`: the per-run tree
 * copies pre-V2 external runs made (`<runId>/tree`), and the per-turn records
 * the recorder writes (`t<runId>/identity.json`) for a host that died between
 * admission and settlement. Neither is ever read again, and nothing else
 * removes them.
 *
 * SR4: a directory a live owner still holds is preserved — an owner is a chat
 * the host's own admission window still tracks (a checkout is named by its
 * chat, {@link workspaceIdOf}), which at start is normally none and after a
 * takeover is whatever the caller reports; **or** a workspace a claim record
 * names, which is how the browser authority sharing this root says a turn of
 * its own is in flight ({@link claimedWorkspaceIds}); **or** a workspace whose
 * conflicted settlement was preserved as evidence under `conflicts/` (I-CONF).
 *
 * @param options - The root to sweep and the chats still owning a workspace.
 * @returns How many directories were removed and how many were kept.
 * @public
 *
 * @example <caption>Sweep at host start</caption>
 * ```typescript
 * import { sweepTurnWorkspaces } from '@taucad/host';
 *
 * const sweep = await sweepTurnWorkspaces({ workspaceRoot: '/srv/project' });
 * console.log(sweep.removed, sweep.preserved);
 * ```
 */
export const sweepTurnWorkspaces = async (options: {
  /** Absolute workspace root whose `.tau/workspaces` is swept. */
  readonly workspaceRoot: string;
  /** Chat ids whose checkouts must survive, folded to their workspace ids. */
  readonly liveChatIds?: Iterable<string> | undefined;
}): Promise<TurnWorkspaceSweep> => {
  const directory = join(options.workspaceRoot, '.tau', 'workspaces');
  const live = new Set<string>([
    ...(await claimedWorkspaceIds(directory)),
    ...(await conflictedWorkspaceIds(directory)),
  ]);
  for (const chatId of options.liveChatIds ?? []) {
    live.add(workspaceIdOf(chatId));
  }
  let entries: readonly string[];
  try {
    entries = await readdir(directory);
  } catch {
    /* A root that never ran a turn has no directory to sweep. */
    return { removed: 0, preserved: 0 };
  }
  const orphans = entries.filter((entry) => !reservedWorkspaceEntries.has(entry) && !live.has(entry));
  await Promise.all(orphans.map(async (entry) => rm(join(directory, entry), { recursive: true, force: true })));
  return { removed: orphans.length, preserved: entries.length - orphans.length };
};

/**
 * Directories no host turn capture walks.
 *
 * The shared exclusions plus the two a *disk* root has and a browser project
 * does not. A turn capture reads every excluded-free byte into memory twice, so
 * a `node_modules` under the workspace root is not a slow capture, it is a dead
 * daemon.
 *
 * ponytail: prefix match at the root only, like every other exclusion in the
 * substrate — a nested `packages/x/node_modules` is still walked. Per-path
 * ignore rules belong with the revision store R-W1 replaces this one with.
 *
 * @public
 */
export const hostTurnCaptureExclusions: readonly string[] = Object.freeze([
  ...defaultTurnCaptureExclusions,
  'node_modules',
  '.git',
]);

/**
 * How one turn's revision settled.
 *
 * Host-owned rather than the recorder's own `TurnRevisionResult`: a launcher's
 * observer wants to know whether the turn was recorded, and republishing
 * `@taucad/filesystem`'s revision types through this package's public surface
 * would make every consumer of `@taucad/host` depend on that library's shape.
 *
 * @public
 */
export type TurnRevisionOutcome = {
  readonly chatId: string;
  readonly runId: string;
  /** `failed` means the settlement itself threw; the run is still durable in its own log. */
  readonly status: 'recorded' | 'conflicted' | 'failed';
  /** Paths that differ between the turn's base tree and its recorded tree. */
  readonly changedPaths: readonly string[];
  /** Present only for `failed`. */
  readonly error?: unknown;
};

/** Options for {@link withTurnRevisions}. @public */
export type TurnRevisionOptions = {
  /** Absolute workspace root this host owns; the live tree every turn descends from. */
  readonly workspaceRoot: string;
  /** Defaults to {@link hostTurnCaptureExclusions}. */
  readonly excludedDirectories?: readonly string[] | undefined;
  /**
   * Actor recorded on this host's revisions.
   *
   * V-W5 replaces it with the turn's real author (the model row, or the external
   * agent id); until then every host turn is the host itself.
   */
  readonly actorId?: string | undefined;
  /** Called once per settled turn, recorded or not. Reporting only. */
  readonly onSettled?: ((outcome: TurnRevisionOutcome) => void) | undefined;
  /**
   * The content-addressed store this host's revisions are minted by.
   *
   * Defaults to the browser adapter over `workspaceRoot` — plain TypeScript Git
   * objects, correct in a daemon and in the desktop utility. A host that
   * resolved the pinned Jujutsu binary passes `createJjRevisionPort({...})`
   * here, **once at composition**; nothing below this line changes.
   */
  readonly port?: RevisionPort | undefined;
  /**
   * Where each admitted turn runs, published by run id (V19).
   *
   * Written when the turn's workspace is prepared — before the launcher admits
   * anything — and cleared when it settles, so the external agent port reads
   * this turn's own checkout and never a previous turn's. Pass the same map to
   * {@link createAcpExternalAgentPort}; omit it on a host that runs no external
   * agents.
   */
  readonly checkouts?: Map<string, TurnCheckout> | undefined;
};

const terminalStates = new Set(['completed', 'failed', 'cancelled']);

/**
 * How many settled runs keep their record reachable for a late subscriber.
 *
 * A client that joins the durable stream between a run's settlement and its
 * terminal marker still has to be handed the revision record before the marker,
 * and a daemon that ran ten thousand turns must not hold ten thousand of them.
 *
 * ponytail: FIFO by insertion, not by age — a host with more than this many
 * turns in flight at once would evict a live one, which no placement produces.
 */
const settledRunHistory = 64;

/**
 * Events one durable subscriber may hold behind a settling chat.
 *
 * The launcher's own fan-out drops a subscriber past the same bound, and for
 * the same reason: a reader this far behind has stopped reading, and buffering
 * on its behalf would grow this process's heap instead. The pump stops pulling
 * at this mark, which is what hands the decision back to the fan-out.
 */
const orderedEventBuffer = 1024;

/**
 * A path-safe workspace id for one **chat**.
 *
 * Per chat, not per run (R-W4a §6.1): a candidate turn's checkout has to sit
 * at the same absolute path every turn, because that path is the vendor
 * session's `cwd` and a session whose `cwd` moved is closed and reopened
 * (`acp/run.ts`). One id per chat is what lets `session/new` be sent once and
 * every later turn resume. Anything outside the identity alphabet is folded
 * rather than refused, because a turn must not fail over a punctuation choice.
 *
 * @param id - The chat (or, for the start-time sweep, the run) the workspace belongs to.
 * @returns The branded workspace identity.
 */
const workspaceIdOf = (id: string): MaterializedWorkspaceId =>
  materializedWorkspaceId(`t${id.replaceAll(/[^A-Za-z0-9_-]/gu, '-').slice(0, 127)}`);

/**
 * Record one finalized revision per turn on a Node host.
 *
 * The base tree is captured and published *before* the wrapped launcher admits
 * the turn, so nothing the turn writes can land inside its own base. Settlement
 * is driven by the durable `run.lifecycle` marker, which arrives after the run
 * is terminal and blocks nothing: the admission window the host already has
 * (a `start` between the terminal marker and the chat's release) is not widened.
 *
 * The turn's `mode` decides *where* it runs (V19): `direct` binds the live root
 * in place, `candidate` materializes a checkout the turn works in and
 * finalization merges back. Either way the workspace is given back when the turn
 * settles, so `.tau/workspaces` holds nothing between turns.
 *
 * @param launcher - The launcher this host serves.
 * @param options - Workspace root, checkout publication and reporting.
 * @returns The same launcher, recording revisions.
 * @public
 *
 * @example <caption>Launcher 1, recording every turn</caption>
 * ```typescript
 * import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
 * import { withTurnRevisions } from '@taucad/host';
 * import type { ToolRegistry } from '@taucad/agent-host';
 *
 * declare const toolRegistry: ToolRegistry;
 * const launcher = withTurnRevisions(
 *   createNodeAgentLauncher({
 *     workspaceRoot: '/srv/project',
 *     gatewayBaseUrl: 'https://api.tau.new/',
 *     systemPrompt: 'You are Tau.',
 *     toolRegistry,
 *   }),
 *   { workspaceRoot: '/srv/project' },
 * );
 * await launcher.close();
 * ```
 */
export const withTurnRevisions = (launcher: NodeAgentLauncher, options: TurnRevisionOptions): NodeAgentLauncher => {
  const revisions = new TurnRevisionRecorder({
    filesystem: new NodeFsProvider(options.workspaceRoot),
    excludedDirectories: options.excludedDirectories ?? hostTurnCaptureExclusions,
    ...(options.port === undefined ? {} : { port: options.port }),
  });
  // V-W5: the turn's real author replaces this.
  const actorId = options.actorId ?? 'tau-host';
  type OpenTurn = {
    readonly chatId: string;
    readonly turnId: string;
    readonly workspace: MaterializedWorkspace;
    /** Settles with the record this turn's finalization appended, if any. */
    readonly settled: PromiseWithResolvers<RevisionFinalizedEvent | undefined>;
  };
  const open = new Map<string, OpenTurn>();
  const settling = new Set<Promise<unknown>>();
  /**
   * What each admitted run's settlement recorded, by run id.
   *
   * Registered when the turn is admitted — before any terminal marker can be
   * observed — so a durable subscriber that reaches the marker first has
   * something to wait on rather than a missing key it would read as "not mine".
   * Every entry is resolved exactly once: by the settlement, by a refused
   * admission, or by `close`. A durable subscriber blocks on one of these, so
   * an entry that stayed pending would stall the whole stream.
   */
  const settlements = new Map<string, PromiseWithResolvers<RevisionFinalizedEvent | undefined>>();
  const watching = new AbortController();

  /**
   * Give back the turn's workspace: nothing reads it once the revision exists.
   *
   * A `branch` turn's checkout is a whole tree, a `local` turn's is one
   * `identity.json` and a metadata directory, and both used to accumulate one
   * per turn forever (R-W2b §4.3). Destroying here rather than only sweeping at
   * the next start is what keeps `.tau/workspaces` empty between turns.
   *
   * @param runId - The run whose workspace is released.
   * @param chatId - The chat lane that run belonged to.
   */
  const release = async (runId: string, chatId: string): Promise<void> => {
    options.checkouts?.delete(runId);
    try {
      await revisions.workspaces.destroy(workspaceIdOf(chatId));
    } catch {
      /* A workspace that will not go is the next sweep's problem, never this
       * turn's: the revision is already recorded. */
    }
  };

  const settle = async (
    runId: string,
    entry: { chatId: string; turnId: string; workspace: MaterializedWorkspace },
  ): Promise<RevisionFinalizedEvent | undefined> => {
    let recorded: RevisionFinalizedEvent | undefined;
    try {
      const result = await revisions.finalize({
        lane: entry.chatId,
        workspace: entry.workspace,
        actorId,
        runId,
        // V-W5: a generated turn name replaces this.
        summary: `Agent turn ${runId}`,
      });
      if (result.status === 'recorded') {
        /* VI11: the host records the turn, and the client reads that fact from
         * the chat's own log — the only channel a browser on the other side of
         * a relay shares with the host. The whole finalization rides, not an
         * id: a client with no access to this store still has to render the
         * turn's revision, its branch and its changed paths. */
        const recordedRevision = await revisions.port.readRevision(result.revision.id);
        const recordedTreeId = recordedRevision?.treeId;
        recorded = await appendRevisionRecord(entry.chatId, {
          type: 'revision.finalized',
          runId,
          turnId: entry.turnId,
          workspaceId: entry.workspace.identity.workspaceId,
          revisionId: result.revision.id,
          baseRevisionId: entry.workspace.identity.baseRevisionId,
          /* The tree id, not the revision id: a revision names a commit, and
           * the commit names a tree. Two turns whose bytes are identical share
           * a tree id and differ in their revision ids, which is what makes
           * "did this turn change anything" answerable from the record alone. */
          treeId: recordedTreeId ?? result.revision.id,
          branchName: result.branch,
          publication:
            result.publication.status === 'updated'
              ? {
                  status: 'updated',
                  branchName: result.publication.branch,
                  expectedHeadRevisionId: entry.workspace.identity.baseRevisionId,
                  ...(result.publication.previousHead === undefined
                    ? {}
                    : { previousHeadRevisionId: result.publication.previousHead }),
                  // `recorded` always publishes a head; only a delete leaves none.
                  headRevisionId: result.publication.head ?? result.revision.id,
                }
              : {
                  status: 'conflicted',
                  branchName: result.publication.conflict.branch,
                  expectedHeadRevisionId: entry.workspace.identity.baseRevisionId,
                  ...(result.publication.conflict.actualHead === undefined
                    ? {}
                    : { actualHeadRevisionId: result.publication.conflict.actualHead }),
                  proposedHeadRevisionId: result.publication.conflict.proposedHead ?? result.revision.id,
                },
          changedPaths: result.changedPaths,
          provenance: { ...result.revision.provenance },
          generatedSummary: result.revision.summary.generated,
          nativeGit:
            result.persistence === undefined
              ? { status: 'not-configured' }
              : {
                  status: 'stored',
                  commitId: result.persistence.commitId,
                  objectFormat: result.persistence.objectFormat,
                },
        });
      }
      options.onSettled?.({
        chatId: entry.chatId,
        runId,
        status: result.status === 'recorded' ? 'recorded' : 'conflicted',
        changedPaths: result.status === 'recorded' ? result.changedPaths : [],
      });
    } catch (error) {
      /* Never re-raised: the run itself already settled and is durable in its
       * own log. A failed finalization must be reported, not turned into an
       * unhandled rejection that takes the host down after the fact. */
      options.onSettled?.({ chatId: entry.chatId, runId, status: 'failed', changedPaths: [], error });
    }
    await release(runId, entry.chatId);
    return recorded;
  };

  /**
   * Write the turn's record into the chat's log without ever failing the turn.
   *
   * The revision is already on disk when this runs; a log the host is closing
   * (a settlement that outlived `close`) must cost the client its live notice,
   * never the recorded revision. The next attach reads the store either way.
   *
   * @param chatId - Chat whose log takes the record.
   * @param event - The record, without its log position.
   * @returns The record as written, or `undefined` when the log refused it.
   */
  const appendRevisionRecord = async (
    chatId: string,
    event: HostAuthoredLogEvent,
  ): Promise<RevisionFinalizedEvent | undefined> => {
    try {
      return await launcher.append(chatId, event);
    } catch (error) {
      options.onSettled?.({
        chatId,
        runId: event.runId,
        status: 'failed',
        changedPaths: [...event.changedPaths],
        error,
      });
      return undefined;
    }
  };

  /**
   * Keep one settlement reachable until it is done, so `close` can drain it.
   *
   * @param entry - The turn being settled.
   * @param settlement - The finalization to track.
   */
  const track = (entry: OpenTurn, settlement: Promise<RevisionFinalizedEvent | undefined>): void => {
    settling.add(settlement);
    /* `settle` swallows its own failure, so this never rejects and needs no
     * catch of its own; `void` says the forgetting is not what `close` waits on. */
    const forget = async (): Promise<void> => {
      entry.settled.resolve(await settlement);
      settling.delete(settlement);
    };
    void forget();
  };

  /** What ended the settlement watch, re-raised by `close()`. */
  let watchFailure: unknown;
  const watch = (async (): Promise<void> => {
    try {
      await watchTerminalMarkers();
    } catch (error) {
      /* A durable subscription can *error* — the launcher's fan-out drops one
       * that fell behind — and nothing awaits this promise until `close()`. An
       * unhandled rejection ends the process on Node 24 long before that, so
       * the failure is kept and re-raised where a caller sees it (5-review
       * N4). */
      watchFailure = error;
    }
  })();
  async function watchTerminalMarkers(): Promise<void> {
    for await (const { event } of launcher.events(watching.signal)) {
      if (event.type !== 'run.lifecycle' || !terminalStates.has(event.state)) {
        continue;
      }
      const entry = open.get(event.runId);
      if (!entry) {
        continue;
      }
      open.delete(event.runId);
      /* The entry's own chat, not the event's: `prepare` named the lane from the
       * start command, and `finalize` has to name the same one (3-review N1). */
      track(entry, settle(event.runId, entry));
    }
  }

  /**
   * Hand every durable subscriber the turn's revision *before* its terminal
   * marker.
   *
   * A client reads the terminal marker as "this run is over" and stops
   * listening: the browser transport resolves its stream on it and unsubscribes
   * (`browser-agent-host-transport.ts`). The record is appended after the marker
   * — settlement is what the marker triggers — so on the wire it would arrive
   * at a closed stream and the turn would show no revision until the next
   * reattach. Holding the marker until the settlement it triggered is done, and
   * emitting the record first, makes "the run ended" mean "everything about it
   * is durable", for a live client and for a replay alike.
   *
   * The record still arrives a second time from the underlying stream — it was
   * genuinely appended — so each subscriber drops its own duplicate rather than
   * pushing that judgement onto every reader.
   *
   * The wait is held **per chat**, not per subscriber: a durable subscription
   * carries every chat this host serves, and a whole-tree capture on one of them
   * used to queue every other chat's events behind it — past 1024 the launcher's
   * fan-out does not pause a subscriber, it *errors* it, so an unrelated client
   * saw its stream die mid-run (5-review S3). Each chat gets a serial lane;
   * everything else goes straight out.
   *
   * ponytail: the buffer below is this subscriber's own copy of the fan-out's
   * bound, and it stops *reading* rather than growing — a consumer that stopped
   * consuming is still dropped by the fan-out, exactly as before. A consumer
   * that walks away without aborting its signal keeps this pump subscribed until
   * the launcher closes; every consumer in the tree aborts.
   *
   * @param signal - The subscriber's lifetime.
   * @returns The same durable stream, with each turn's record ahead of its marker.
   */
  // oxlint-disable-next-line eslint/max-lines-per-function -- one reordering buffer; splitting it would hide the ordering it exists to keep.
  const orderedEvents = async function* (signal: AbortSignal): AsyncIterable<AgentChannelEvent> {
    /* A record reaches a subscriber twice — once ahead of the marker, once from
     * the log that genuinely appended it — and whichever arrives second is
     * dropped. Only that one variant can be duplicated, so the set is empty
     * between turns. */
    const twins = new Set<string>();
    const queued: AgentChannelEvent[] = [];
    let arrived = Promise.withResolvers<void>();
    let drained = Promise.withResolvers<void>();
    const push = (item: AgentChannelEvent): void => {
      if (item.event.type === 'revision.finalized') {
        const key = `${item.chatId} ${item.event.leaderEpoch} ${String(item.event.sequence)}`;
        if (twins.delete(key)) {
          return;
        }
        twins.add(key);
      }
      queued.push(item);
      arrived.resolve();
    };
    /**
     * One serial lane per chat, so a settlement holds only its own chat's
     * events.
     *
     * ponytail: a lane is kept for every chat this subscription has seen — one
     * settled promise each, which no host produces enough chats to notice.
     */
    const lanes = new Map<string, Promise<void>>();
    const source = { ended: false, failure: undefined as unknown };
    /* A subscriber that aborts while backpressured never drains the queue, so
     * the wait below must end on the signal too or the pump is stranded for the
     * launcher's lifetime (6-review F3). */
    const aborted = new Promise<void>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    const pump = (async (): Promise<void> => {
      for await (const item of launcher.events(signal)) {
        if (queued.length >= orderedEventBuffer) {
          // oxlint-disable-next-line no-await-in-loop -- backpressure is the point: this subscriber has stopped reading.
          await Promise.race([drained.promise, aborted]);
          if (signal.aborted) {
            break;
          }
        }
        const settlement =
          item.event.type === 'run.lifecycle' && terminalStates.has(item.event.state)
            ? settlements.get(item.event.runId)?.promise
            : undefined;
        const lane = lanes.get(item.chatId);
        lanes.set(
          item.chatId,
          (async (): Promise<void> => {
            await lane;
            const record = settlement === undefined ? undefined : await settlement;
            if (record !== undefined) {
              push({ chatId: item.chatId, event: record });
            }
            push(item);
          })(),
        );
      }
      await Promise.allSettled(lanes.values());
    })();
    // async-iife: bootstrap -- the loop below is what awaits this stream's end.
    void (async (): Promise<void> => {
      try {
        await pump;
      } catch (error) {
        source.failure = error;
      } finally {
        source.ended = true;
        arrived.resolve();
      }
    })();
    while (!source.ended || queued.length > 0) {
      const item = queued.shift();
      if (item === undefined) {
        // oxlint-disable-next-line no-await-in-loop -- one subscriber's stream is ordered by construction.
        await arrived.promise;
        arrived = Promise.withResolvers();
        continue;
      }
      if (queued.length === orderedEventBuffer - 1) {
        drained.resolve();
        drained = Promise.withResolvers();
      }
      yield item;
    }
    if (source.failure !== undefined) {
      // oxlint-disable-next-line @typescript-eslint/only-throw-error -- re-raising exactly what the launcher's stream threw.
      throw source.failure;
    }
  };

  return {
    ...launcher,
    events: (signal) => orderedEvents(signal),
    execute: async (command) => {
      if (command.type === 'start' && !open.has(command.runId)) {
        /* The advertisement, enforced where it is honoured (3-review S1). The
         * client gate is a courtesy; this is the fence, so a hand-written
         * channel command cannot have a turn admitted as one mode and recorded
         * as another. */
        if (command.mode !== undefined && !hostRevisionModes.includes(command.mode)) {
          throw Object.assign(new Error(`This Tau Host does not record a turn in ${command.mode} mode.`), {
            code: 'REVISION_MODE_UNSUPPORTED',
          });
        }
        /* V19: `candidate` runs the turn in a checkout the authority
         * materializes, `direct` binds the live root in place. The mode is the
         * *client's* selection, carried on the start command; the identity
         * record's own marker is what every later step keys on. */
        const candidate = command.mode === 'candidate';
        const workspaceId = workspaceIdOf(command.chatId);
        let workspace: MaterializedWorkspace;
        try {
          ({ workspace } = await revisions.prepare({
            workspaceId,
            mode: candidate ? 'branch' : 'local',
            lane: command.chatId,
            actorId,
            ...(command.baseRevisionId === undefined ? {} : { baseRevisionId: revisionId(command.baseRevisionId) }),
          }));
        } catch (error) {
          /* A host that advertises the capability records the turn or refuses
           * it; running unrecorded is the one outcome I-EDIT rules out. */
          throw Object.assign(
            new Error(
              `This Tau Host could not open a revision for the turn: ${error instanceof Error ? error.message : String(error)}`,
            ),
            { code: 'REVISION_PREPARE_FAILED' },
          );
        }
        const entry: OpenTurn = {
          chatId: command.chatId,
          /* The stable user-message id the client keys its own turn on: the
           * revision record has to name the same turn the transcript does, or
           * the graph node it becomes belongs to nothing on screen. */
          turnId: command.message.id,
          workspace,
          settled: Promise.withResolvers(),
        };
        open.set(command.runId, entry);
        settlements.set(command.runId, entry.settled);
        for (const stale of settlements.keys()) {
          if (settlements.size <= settledRunHistory) {
            break;
          }
          settlements.delete(stale);
        }
        /* Published before the launcher admits anything, because the external
         * port opens its session *inside* that admission and has to root it
         * here (V19). Direct mode publishes the root itself, so the port asks
         * one question rather than two. The candidate path is keyed on the chat,
         * so every turn of one chat roots its agent in the same directory and
         * the vendor session is opened once. */
        options.checkouts?.set(command.runId, {
          cwd: candidate
            ? join(options.workspaceRoot, '.tau', 'workspaces', workspaceId, 'tree')
            : options.workspaceRoot,
          mode: candidate ? 'candidate' : 'direct',
          baseRevisionId: workspace.identity.baseRevisionId,
        });
        try {
          return await launcher.execute(command);
        } catch (error) {
          /* `acknowledge` only throws when nothing of ours was admitted, so the
           * turn never reached the tool loop and wrote nothing. Dropping the
           * entry keeps a refused admission from holding a workspace open for
           * the life of the host; a run that did settle was already finalized
           * and removed by the watch, and the delete is idempotent. The
           * checkout is destroyed with it: a refused candidate turn must not
           * leave a tree copy behind (R-W2b §6.6). */
          open.delete(command.runId);
          /* And the refusal settles the run's record: a durable subscriber
           * waits on this before it forwards a terminal marker, so a pending
           * one would stall the stream for every chat this host serves. */
          entry.settled.resolve(undefined);
          await release(command.runId, command.chatId);
          throw error;
        }
      }
      return launcher.execute(command);
    },
    close: async () => {
      /* The launcher first: closing it drains every background run, so the
       * terminal markers this wrapper finalizes on are published before the
       * fan-out ends the watch. */
      await launcher.close();
      /* No `watching.abort()` after this: the launcher's own fan-out has already
       * closed this subscription's controller, and aborting the signal makes it
       * close a second time — `ERR_INVALID_STATE`, thrown from a listener where
       * nothing can catch it. The signal exists for a caller that never gets
       * here (a rejected `launcher.close()`), which is why it is still passed. */
      await watch;
      await Promise.allSettled(settling);
      /* Nothing will settle a turn this host never finished; releasing them lets
       * any subscriber still holding a terminal marker finish its stream. */
      for (const pending of settlements.values()) {
        pending.resolve(undefined);
      }
      if (watchFailure !== undefined) {
        // oxlint-disable-next-line @typescript-eslint/only-throw-error -- re-raising exactly what the launcher's stream threw.
        throw watchFailure;
      }
    },
  };
};
