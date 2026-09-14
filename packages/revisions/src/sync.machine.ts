/**
 * `sync.machine` — the only thing in Tau that decides when a project is pushed.
 *
 * Sync is never a user event (D28, S41). A remote that is connected means every
 * minted revision reaches it within one debounce; a tab going hidden means the
 * `close` revision is pushed while the page can still `await`; anything the
 * server did not acknowledge is a record in `.tau/revisions/sync-pending` that
 * the next open of this project on this device retries before it does anything
 * else. Opening pulls first, under a bound, so a second device sees the first
 * device's work without anybody pressing anything.
 *
 * Three things this machine deliberately does not hold:
 *
 * - **A backoff tick.** The facet is settled values only (A38): `Backed up`,
 *   `Backing up… n`, `Not backed up · n`, `Needs resolution`. The retry counter
 *   exists in context and never leaves it.
 * - **A snapshot.** The durable queue is a *record* read by an injected actor
 *   at start and written by another after every push (D29, "records are the
 *   durable form"). Nothing here is persisted as machine state.
 * - **The over-quota file list.** A push the remote refused for storage
 *   forwards `quotaRefused { paths }` to the parent, which routes it to
 *   `remote.machine` — the single owner of that list (P19, A40).
 *
 * `Sync now` is not a verb a person has: it exists only as the correlated
 * `syncNow { pushId }` / `pushSettled { pushId, outcome }` pair `publish.machine`
 * needs to know its refs are on the remote before it tags them (architecture
 * `publish.machine` row).
 */

import { assign, emit, enqueueActions, fromCallback, fromPromise, setup } from 'xstate';
import type { AnyActorRef, SnapshotFrom } from 'xstate';

/** How one offered ref ended, in the port's own three outcomes. @public */
export type SyncRefStatus = 'updated' | 'upToDate' | 'rejected';

/** One ref's outcome, which is the unit a push reports in (A39, W11b §1). @public */
export type SyncRefOutcome = Readonly<{
  /** Fully-qualified local ref, e.g. `refs/heads/main` or `refs/tau/chats/c1`. */
  name: string;
  status: SyncRefStatus;
  /** What the remote holds for this ref now, when the push moved it. */
  head: string | undefined;
  /** Why it was refused, when it was. Never a credential. */
  reason?: string;
}>;

/**
 * One ref this device has not had acknowledged yet.
 *
 * A record, not a machine snapshot: it is written as JSON under
 * `.tau/revisions/sync-pending` and is the whole of what "retried on the next
 * open" reads.
 *
 * @public
 */
export type SyncQueueEntry = Readonly<{
  ref: string;
  /**
   * The local head the remote has not taken, when this host knows it.
   *
   * A refused ref reports no head of its own (`RevisionPushRefResult`), so this
   * is the head the push *offered*; absent only when even that is unknown —
   * never the empty string, which is what it used to record for exactly the case
   * the field exists for (review 2 R8).
   */
  head?: string;
  /** What this host last saw the *remote* ref to be — the lease it retries under (P18). */
  expected: string | undefined;
  /** Why it is still here, in words already safe to render. */
  reason: string;
  /** Milliseconds since the Unix epoch. */
  recordedAt: number;
}>;

/** The durable queue as the record spells it (`.tau/revisions/sync-pending`). @public */
export type SyncQueueRecord = Readonly<{ version: 1; entries: readonly SyncQueueEntry[] }>;

/** What the Sync row and the header chip render (S26, status-projection rows). @public */
export type SyncFacet = Readonly<{
  /**
   * The settled state, never a tick.
   *
   * `checking` covers the open pull's first window; `pending` and `pushing`
   * are both `Backing up… n`; `queued` and `failed` are both
   * `Not backed up · n`, which is the honest reading — the difference between
   * them is whether this host will retry on its own.
   */
  state: 'noRemote' | 'checking' | 'backedUp' | 'pending' | 'queued' | 'conflicted' | 'failed';
  /** The `n`: refs this device has not had acknowledged. */
  pendingCount: number;
  /** Whether this host believes it can reach anything at all. */
  online: boolean;
  /** Where an unresolved divergence landed, for W10's surface (A22). */
  conflictRef: string | undefined;
  /** The last failure, already safe to render. */
  error: string | undefined;
}>;

/** Input accepted when creating the syncMachine actor. @public */
export type SyncMachineInput = Readonly<{
  projectId: string;
  /** The branch the history set tracks. Defaults to `main`. */
  branch?: string;
  /** The root, for the two facts that belong to siblings (`publish`, `remote`). */
  parentRef?: AnyActorRef;
  /** D28's 2 s. */
  debounceMilliseconds?: number;
  /** First retry wait after an unacknowledged push; doubles per attempt. */
  retryMilliseconds?: number;
  /** The ceiling the doubling stops at. */
  maxRetryMilliseconds?: number;
  /** Review 3 F16's 3 s: how long the row says `Checking…`. */
  pullRenderMilliseconds?: number;
  /** Review 3 F16's 10 s: when the pull is abandoned outright. */
  pullDeadlineMilliseconds?: number;
  /** Whether this host starts believing it is online. Defaults to `true`. */
  online?: boolean;
}>;

/** Serializable state owned by syncMachine. @public */
export type SyncMachineContext = Readonly<{
  projectId: string;
  branch: string;
  parentRef: AnyActorRef | undefined;
  /** The remote's name in git's config, or `undefined` while there is none. */
  remote: string | undefined;
  online: boolean;
  /** The durable queue, exactly as the record holds it. */
  pending: readonly SyncQueueEntry[];
  /** Ref → what this host last saw the remote hold, which is the push lease (P18). */
  leases: Readonly<Record<string, string>>;
  /** The correlated request in flight, when `publish.machine` asked for one. */
  pushId: string | undefined;
  /** How many pushes in a row have not been acknowledged. Never leaves context. */
  attempt: number;
  /** Whether the last settle was retryable, fatal, or fine. */
  failure: 'none' | 'retry' | 'fatal';
  /** Set while the open pull is still inside its first window (F16's 3 s). */
  withinPullWindow: boolean;
  /**
   * The last revision this device minted.
   *
   * Recorded so a push that *threw* — a transport failure reports no refs at
   * all (W11b R5) — still leaves an honest queue entry naming what did not
   * reach the remote.
   */
  localHead: string | undefined;
  /**
   * A revision was minted while this machine was busy elsewhere.
   *
   * `reading` and `opening` are both effect states with no push edge, and a
   * `close` cut lands in whichever one the host happens to be in — so the fact
   * is remembered and the state that finishes acts on it. Without it a project
   * closed within a second of opening would drop its own close flush.
   */
  pendingMint: boolean;
  /** Where a divergence landed, when one did (A22). */
  conflictRef: string | undefined;
  error: string | undefined;
  debounceMilliseconds: number;
  retryMilliseconds: number;
  maxRetryMilliseconds: number;
  pullRenderMilliseconds: number;
  pullDeadlineMilliseconds: number;
}>;

/** How one correlated push ended, for the sibling that asked (`publish`). @public */
export type SyncPushOutcome = 'backedUp' | 'queued' | 'conflicted' | 'failed';

/** Events accepted by syncMachine. @public */
export type SyncMachineEvent =
  /**
   * A checkout minted a revision (W6).
   *
   * `close` and `hidden` push with **zero debounce**: the document is still
   * alive at `hidden` and the desktop's quit is held, so this is the last
   * moment an `await` means anything. A cut the root declined mints nothing and
   * never arrives here, so the queue records no phantom (W6-a2 R1).
   */
  | Readonly<{
      type: 'revisionMinted';
      checkoutId: string;
      trigger: 'turn' | 'save' | 'idle' | 'hidden' | 'close';
      revisionId: string;
      turnId?: string;
    }>
  /** A durable project record changed after the current push snapshot was built. */
  | Readonly<{ type: 'recordsChanged' }>
  /** Push now, and — with a `pushId` — tell the requester how it ended. */
  | Readonly<{ type: 'syncNow'; pushId?: string; remote?: string }>
  /** A client reopened a retained project root; fetch before it reads. */
  | Readonly<{ type: 'open' }>
  /** The host is going away: flush while there is still a `then` to run. */
  | Readonly<{ type: 'close' }>
  | Readonly<{ type: 'remoteConnected'; remote: string }>
  | Readonly<{ type: 'remoteDisconnected' }>
  | Readonly<{ type: 'online' }>
  | Readonly<{ type: 'offline' }>
  /**
   * A push this machine did not make settled.
   *
   * The `pagehide` keepalive re-send is the sender: the document issued the POST
   * itself because nothing asynchronous survives an unload, and the answer — if
   * the host is still alive to hear one — arrives here (A32, S41).
   */
  | Readonly<{ type: 'pushAcknowledged'; refs: readonly SyncRefOutcome[] }>
  | Readonly<{ type: 'pushFailed'; reason: string }>
  /**
   * A divergence this machine reported has been composed (S33, W10, review 2 R6).
   *
   * `Needs resolution` is otherwise sticky: `conflicted` leaves only on
   * connectivity or a correlated `syncNow`, so a resolution the person made
   * would be invisible to the Sync row until something else happened.
   *
   * The payload is W10's own, translated by the root: `ref` is
   * `refs/heads/<branch>` for the branch its resolution settled, and
   * `revisionId` is the head that resolution minted — which is what this
   * machine then offers the remote under its lease (P44). Absent `ref` means
   * "whatever you were conflicted about".
   */
  | Readonly<{ type: 'conflictResolved'; ref?: string; revisionId?: string }>;

/** Facts syncMachine emits for a host that holds only the root. @public */
export type SyncMachineEmitted =
  /** The remote and this device have diverged; W10's surface takes it from here. */
  | Readonly<{ type: 'syncConflict'; ref: string; reason: string }>
  /** The correlated answer to one `syncNow { pushId }` (the `publish.machine` row). */
  | Readonly<{ type: 'pushSettled'; pushId: string; outcome: SyncPushOutcome }>;

/** What `readPending` is asked, and what the record answers. @public */
export type SyncReadPendingActorInput = Readonly<{ projectId: string }>;

/** What `writePending` is asked to record. @public */
export type SyncWritePendingActorInput = Readonly<{ projectId: string; record: SyncQueueRecord }>;

/** What `readRemote` answers: the remote git's own config already holds. @public */
export type SyncReadRemoteActorOutput = Readonly<{ remote: string | undefined; branch?: string }>;

/** What one scheduled push offers, and under which leases. @public */
export type SyncPushActorInput = Readonly<{
  remote: string;
  branch: string;
  /** Ref → the lease this push is made under (P18). Absent = the remote's own rule. */
  leases: Readonly<Record<string, string>>;
  /**
   * Narrow the offer to these refs, when a retry is catching up the queue.
   *
   * Absent means "the whole history set and the whole record set", which is what
   * an ordinary debounce wants.
   */
  refs?: readonly string[];
}>;

/**
 * What one push answers.
 *
 * Per ref, always: A39's record set must never be able to block history, and a
 * scheduler that only saw a boolean could not retry one chat ref without
 * re-offering a branch.
 *
 * @public
 */
export type SyncPushActorOutput = Readonly<{
  refs: readonly SyncRefOutcome[];
  /** Project-relative paths the remote would not store (D16, P19). */
  overQuota?: readonly string[];
  /** The server's own words, for the row that names the files. */
  quotaMessage?: string;
}>;

/** What one open pull is asked for. @public */
export type SyncFetchActorInput = Readonly<{
  remote: string;
  branch: string;
  /** The wall the effect builds its `AbortSignal.timeout` from (S24, F16). */
  deadlineMilliseconds: number;
}>;

/**
 * What the pull found.
 *
 * `integration` is what decides `fastForwarding` from `merging`; `leases` is
 * what this host now believes the remote holds, which is the lease every later
 * push is made under (P18).
 *
 * @public
 */
export type SyncFetchActorOutput = Readonly<{
  leases: Readonly<Record<string, string>>;
  integration: 'upToDate' | 'fastForward' | 'diverged';
  /** Local branch refs after remote branch reconciliation, including ref-only branches. */
  branches?: ReadonlyArray<Readonly<{ name: string; head: string }>>;
}>;

/** What applying the fetched head is asked for. @public */
export type SyncIntegrateActorInput = Readonly<{ remote: string; branch: string }>;

/** What composing a diverged local and remote branch produced. @public */
export type SyncMergeActorOutput =
  | Readonly<{ status: 'merged' }>
  | Readonly<{ status: 'conflicted'; branch: string; into: string; paths: readonly string[] }>;

/** The checkout a successful open pull re-headed. @public */
export type SyncFastForwardActorOutput =
  | Readonly<{ checkoutId: string; revisionId: string; treeId: string }>
  | undefined;

const defaultBranch = 'main';
const defaultDebounceMilliseconds = 2000;
const defaultRetryMilliseconds = 5000;
const defaultMaxRetryMilliseconds = 300_000;
const defaultPullRenderMilliseconds = 3000;
const defaultPullDeadlineMilliseconds = 10_000;

/*
 * The failure that means "grant the credential again", not "the remote is
 * broken" — the one push failure this machine will not retry behind the
 * person's back. The literal is written here rather than imported because a
 * machine may import only *types* from this package's contracts (I20, AC22).
 */
const reauthorizationRequiredCode = 'REMOTE_REAUTHORIZATION_REQUIRED';

const isFatal = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === reauthorizationRequiredCode;

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : 'This project could not be backed up.';

const unsupported = async (): Promise<never> => {
  await Promise.resolve();
  throw new Error('This host provided no sync actors; `syncMachine.provide` supplies them.');
};

/** A host with no connectivity source is a host that is always online. */
const noConnectivity = fromCallback(() => () => undefined);

const historyRefOf = (branch: string): string => `refs/heads/${branch}`;

/**
 * The record refs a retry narrows its offer to, or `undefined` for "both sets".
 * A queued history ref is the synthetic marker for a thrown full-set push,
 * which may have failed before it reached any records, so it cannot narrow.
 *
 * @param context - Current context.
 * @returns The narrowed ref list, or `undefined` when nothing is owed.
 */
const narrowedOffer = (context: SyncMachineContext): readonly string[] | undefined =>
  context.pending.length > 0 &&
  context.failure !== 'none' &&
  context.pending.every((entry) => entry.ref !== historyRefOf(context.branch))
    ? context.pending.map((entry) => entry.ref)
    : undefined;

/**
 * What the push that is running actually offered.
 *
 * A transport failure reports no refs at all (W11b R5), so the queue entry has
 * to be synthesised — and synthesising `refs/heads/<branch>` for a retry that
 * only offered one chat ref would record a branch nobody offered as
 * unacknowledged (review 2 R9).
 *
 * @param context - Current context.
 * @returns Every ref this push put on the wire.
 */
const offeredNames = (context: SyncMachineContext): readonly string[] =>
  narrowedOffer(context) ?? [historyRefOf(context.branch)];

/**
 * Every offered ref, refused with one reason.
 *
 * @param context - Current context.
 * @param why - Words already safe to render.
 * @returns One outcome per ref this push offered.
 */
const throwFailures = (context: SyncMachineContext, why: string): readonly SyncRefOutcome[] =>
  offeredNames(context).map((ref) => ({
    name: ref,
    status: 'rejected',
    head:
      context.pending.find((entry) => entry.ref === ref)?.head ??
      (ref === historyRefOf(context.branch) ? context.localHead : undefined),
    reason: why,
  }));

/**
 * The queue as this settle leaves it.
 *
 * One entry per ref, last outcome wins: a ref the remote took is gone, a ref it
 * refused is recorded with the head it refused and the lease to retry under.
 * Refs nobody offered this time keep their entry — a narrowed retry must not
 * silently drop what it did not look at.
 *
 * @param input - The queue as it stands, every ref this push offered with its
 *   outcome, the leases this host holds, and the current time in milliseconds.
 * @returns The queue to record.
 */
const nextPending = (
  input: Readonly<{
    pending: readonly SyncQueueEntry[];
    outcomes: readonly SyncRefOutcome[];
    leases: Readonly<Record<string, string>>;
    now: number;
  }>,
): readonly SyncQueueEntry[] => {
  const { pending, outcomes, leases, now } = input;
  const offered = new Map(outcomes.map((entry) => [entry.name, entry]));
  const kept = pending.filter((entry) => !offered.has(entry.ref));
  const refused = outcomes.flatMap((entry): readonly SyncQueueEntry[] =>
    entry.status === 'rejected'
      ? [
          {
            ref: entry.name,
            ...(entry.head === undefined ? {} : { head: entry.head }),
            expected: leases[entry.name],
            reason: entry.reason ?? 'The remote refused this ref.',
            recordedAt: now,
          },
        ]
      : [],
  );
  return [...kept, ...refused];
};

/**
 * Headless continuous sync for one project.
 *
 * @public
 * @example <caption>Run the scheduler for one project</caption>
 * ```typescript
 * import { createActor } from 'xstate';
 * import { syncMachine } from '@taucad/revisions/sync-machine';
 * import type { SyncActors } from '@taucad/revisions/sync-machine';
 *
 * declare const hostActors: SyncActors;
 * const actor = createActor(syncMachine.provide({ actors: hostActors }), { input: { projectId: 'p1' } });
 * actor.start();
 * actor.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: 'r1' });
 * ```
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one state chart; splitting it would hide the transitions it exists to show.
export const syncMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    context: {} as SyncMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    events: {} as SyncMachineEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    emitted: {} as SyncMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- XState setup typing.
    input: {} as SyncMachineInput,
  },
  actors: {
    /** The durable queue as the record holds it (D29: rehydrate from records). */
    readPending: fromPromise<SyncQueueRecord, SyncReadPendingActorInput>(unsupported),
    writePending: fromPromise<void, SyncWritePendingActorInput>(unsupported),
    /** Git's own remotes list, so a reopened project knows it has one. */
    readRemote: fromPromise<SyncReadRemoteActorOutput, Readonly<{ projectId: string }>>(unsupported),
    push: fromPromise<SyncPushActorOutput, SyncPushActorInput>(unsupported),
    fetch: fromPromise<SyncFetchActorOutput, SyncFetchActorInput>(unsupported),
    fastForward: fromPromise<SyncFastForwardActorOutput, SyncIntegrateActorInput>(unsupported),
    /**
     * Composing two diverged lines.
     *
     * Deliberately unprovided by this lane's effects: a merge needs a base and a
     * conflict surface to render the result, which is W10's. Unprovided, the
     * default throws into this state's failure edge — a named refusal that lands
     * on `conflicted`, which is exactly where A22 wants it.
     */
    merge: fromPromise<SyncMergeActorOutput, SyncIntegrateActorInput>(unsupported),
    connectivity: noConnectivity,
  },
  delays: {
    syncDebounce: ({ context }) => context.debounceMilliseconds,
    /* Doubling, capped. It is a delay, not a rendered state (A38). */
    syncBackoff: ({ context }) =>
      Math.min(context.retryMilliseconds * 2 ** Math.max(0, context.attempt - 1), context.maxRetryMilliseconds),
    pullRenderWindow: ({ context }) => context.pullRenderMilliseconds,
    pullDeadline: ({ context }) => context.pullDeadlineMilliseconds,
  },
  guards: {
    hasRemote: ({ context }) => context.remote !== undefined,
    hasPending: ({ context }) => context.pending.length > 0,
    isOnline: ({ context }) => context.online,
    /* `close` and `hidden` are the last moment an `await` means anything, so
     * they skip the window the other triggers coalesce in (D28, S41). */
    flushesNow: (_, params: Readonly<{ trigger: string }>) => params.trigger === 'close' || params.trigger === 'hidden',
  },
  actions: {
    markPending: assign({ pendingMint: true }),
    rememberHead: assign({
      localHead: ({ context, event }) => (event.type === 'revisionMinted' ? event.revisionId : context.localHead),
      pendingMint: ({ context, event }) => (event.type === 'revisionMinted' ? true : context.pendingMint),
    }),
    /** Tell the requester how its correlated push ended, and forget it. */
    settlePush: enqueueActions(({ context, enqueue }, params: Readonly<{ outcome: SyncPushOutcome }>) => {
      if (context.pushId === undefined) {
        return;
      }
      enqueue.emit({ type: 'pushSettled', pushId: context.pushId, outcome: params.outcome });
      if (context.parentRef !== undefined) {
        enqueue.sendTo(context.parentRef, { type: 'pushSettled', pushId: context.pushId, outcome: params.outcome });
      }
      enqueue.assign({ pushId: undefined });
    }),
    reportFastForward: enqueueActions(({ context, enqueue }, output: SyncFastForwardActorOutput) => {
      if (output === undefined) {
        return;
      }
      if (context.parentRef !== undefined) {
        enqueue.sendTo(context.parentRef, {
          type: 'checkoutChanged',
          ...output,
          branch: context.branch,
        });
      }
    }),
    reportBranches: enqueueActions(
      ({ context, enqueue }, branches: ReadonlyArray<Readonly<{ name: string; head: string }>> | undefined) => {
        if (context.parentRef !== undefined && branches !== undefined) {
          enqueue.sendTo(context.parentRef, { type: 'branchesFetched', branches });
        }
      },
    ),
  },
}).createMachine({
  id: 'sync',
  context: ({ input }) => ({
    projectId: input.projectId,
    branch: input.branch ?? defaultBranch,
    parentRef: input.parentRef,
    remote: undefined,
    online: input.online ?? true,
    pending: [],
    leases: {},
    pushId: undefined,
    attempt: 0,
    failure: 'none',
    withinPullWindow: false,
    localHead: undefined,
    pendingMint: false,
    conflictRef: undefined,
    error: undefined,
    debounceMilliseconds: input.debounceMilliseconds ?? defaultDebounceMilliseconds,
    retryMilliseconds: input.retryMilliseconds ?? defaultRetryMilliseconds,
    maxRetryMilliseconds: input.maxRetryMilliseconds ?? defaultMaxRetryMilliseconds,
    pullRenderMilliseconds: input.pullRenderMilliseconds ?? defaultPullRenderMilliseconds,
    pullDeadlineMilliseconds: input.pullDeadlineMilliseconds ?? defaultPullDeadlineMilliseconds,
  }),
  invoke: { id: 'connectivity', src: 'connectivity' },
  /* Connectivity and the remote are facts about the host, not about which state
   * the scheduler is in, so they are handled once at the root. */
  on: {
    online: { actions: assign({ online: true }) },
    offline: { actions: assign({ online: false }) },
    /* The fallback, not an override: a state with its own `revisionMinted`
     * handler keeps it (the deepest transition wins). This one catches the
     * states that have none — `reading`, `opening`, `recording` — so a cut is
     * never dropped for arriving at a busy moment. */
    revisionMinted: { actions: 'rememberHead' },
    recordsChanged: { actions: 'markPending' },
    /* The same fallback, for the same reason (review 2 R7): `close` is handled
     * where it can push, and remembered where it cannot — `reading`, `opening`,
     * `recording` — so the state that finishes acts on it. */
    close: { actions: assign({ pendingMint: true }) },
    open: [{ guard: 'hasRemote', target: '.opening', reenter: true }],
    remoteDisconnected: {
      target: '.noRemote',
      actions: assign({
        remote: undefined,
        pending: [],
        leases: {},
        attempt: 0,
        failure: 'none',
        error: undefined,
        conflictRef: undefined,
      }),
    },
    /*
     * A push this machine did not make, settled (A32).
     *
     * Handled at the root because the `pagehide` keepalive re-send can land in
     * any state — including `pushing`, where the in-flight push is about to be
     * cancelled with the document anyway, and the last word is the POST the
     * platform already took. Both arms go through `recording`, so the queue on
     * disk is what a reopened project reads either way.
     */
    pushAcknowledged: {
      target: '.recording',
      actions: assign({
        pending: ({ context, event }) =>
          nextPending({ pending: context.pending, outcomes: event.refs, leases: context.leases, now: Date.now() }),
        failure: 'none',
        attempt: 0,
      }),
    },
    pushFailed: {
      target: '.recording',
      actions: assign({
        failure: 'retry',
        error: ({ event }) => event.reason,
        pending: ({ context, event }) =>
          nextPending({
            pending: context.pending,
            outcomes: [
              {
                name: historyRefOf(context.branch),
                status: 'rejected',
                head: context.localHead,
                reason: event.reason,
              },
            ],
            leases: context.leases,
            now: Date.now(),
          }),
      }),
    },
  },
  initial: 'reading',
  states: {
    /**
     * What this device already owes the remote, and whether it has one.
     *
     * Two records, read in order, because neither is a snapshot: the queue is a
     * file this device wrote and the remote is git's own config. A machine that
     * started from a persisted XState snapshot would be a second schema to
     * migrate; these already exist (D29).
     */
    reading: {
      initial: 'queue',
      states: {
        queue: {
          invoke: {
            src: 'readPending',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: { target: 'remote', actions: assign({ pending: ({ event }) => event.output.entries }) },
            /* A queue that cannot be read is an empty queue, not a dead
             * scheduler: the push that follows re-derives what is unacknowledged
             * from the remote's own answer. */
            onError: { target: 'remote' },
          },
        },
        remote: {
          invoke: {
            src: 'readRemote',
            input: ({ context }) => ({ projectId: context.projectId }),
            onDone: {
              target: 'done',
              actions: assign({
                remote: ({ event }) => event.output.remote,
                branch: ({ context, event }) => event.output.branch ?? context.branch,
              }),
            },
            onError: { target: 'done' },
          },
        },
        done: { type: 'final' },
      },
      onDone: [{ guard: 'hasRemote', target: 'opening' }, { target: 'noRemote' }],
    },

    /** No remote is not a failure, and nothing is queued against one. */
    noRemote: {
      on: {
        syncNow: {
          guard: ({ event }) => event.remote !== undefined,
          target: 'pushing',
          actions: assign({
            pushId: ({ event }) => event.pushId,
            remote: ({ event }) => event.remote,
          }),
        },
        remoteConnected: { target: 'opening', actions: assign({ remote: ({ event }) => event.remote }) },
      },
    },

    /**
     * Opening pulls first, under a bound (review 3 F16).
     *
     * Three exits, all of them here: offline skips the pull outright and waits
     * for `online`; the first window is how long the row says `Checking…`; the
     * deadline abandons the pull, records what is owed, and lets the project get
     * on with itself. The tree is never held behind any of them — this host
     * renders from the local checkout and the fetched bytes arrive through the
     * authority's own watch plane, which is what makes "no reload" true.
     */
    opening: {
      always: [{ guard: ({ context }) => !context.online, target: 'queued' }],
      entry: assign({ withinPullWindow: true }),
      exit: assign({ withinPullWindow: false }),
      after: {
        pullRenderWindow: { actions: assign({ withinPullWindow: false }) },
        pullDeadline: {
          target: 'queued',
          actions: assign({ error: 'The remote did not answer in time; this project will try again.' }),
        },
      },
      initial: 'fetching',
      states: {
        fetching: {
          invoke: {
            src: 'fetch',
            input: ({ context }) => ({
              remote: context.remote ?? '',
              branch: context.branch,
              deadlineMilliseconds: context.pullDeadlineMilliseconds,
            }),
            onDone: [
              {
                guard: ({ event }) => event.output.integration === 'fastForward',
                target: 'fastForwarding',
                actions: [
                  assign({ leases: ({ event }) => event.output.leases }),
                  { type: 'reportBranches', params: ({ event }) => event.output.branches },
                ],
              },
              {
                guard: ({ event }) => event.output.integration === 'diverged',
                target: 'merging',
                actions: [
                  assign({ leases: ({ event }) => event.output.leases }),
                  { type: 'reportBranches', params: ({ event }) => event.output.branches },
                ],
              },
              {
                target: 'done',
                actions: [
                  assign({ leases: ({ event }) => event.output.leases }),
                  { type: 'reportBranches', params: ({ event }) => event.output.branches },
                ],
              },
            ],
            onError: {
              target: '#sync.queued',
              actions: assign({ error: ({ event }) => reason(event.error) }),
            },
          },
        },
        fastForwarding: {
          invoke: {
            src: 'fastForward',
            input: ({ context }) => ({ remote: context.remote ?? '', branch: context.branch }),
            onDone: {
              target: 'done',
              actions: { type: 'reportFastForward', params: ({ event }) => event.output },
            },
            onError: { target: '#sync.queued', actions: assign({ error: ({ event }) => reason(event.error) }) },
          },
        },
        /** A dirty or diverged checkout merges by the ordinary rules (A2/A22). */
        merging: {
          invoke: {
            src: 'merge',
            input: ({ context }) => ({ remote: context.remote ?? '', branch: context.branch }),
            onDone: [
              {
                guard: ({ event }) => event.output.status === 'conflicted',
                target: '#sync.conflicted',
                actions: enqueueActions(({ context, enqueue, event }) => {
                  if (event.output.status !== 'conflicted') {
                    return;
                  }
                  const conflictRef = `refs/heads/${event.output.branch}`;
                  enqueue.assign({
                    conflictRef,
                    error: 'The remote and this device changed the same files.',
                  });
                  if (context.parentRef !== undefined) {
                    enqueue.sendTo(context.parentRef, {
                      type: 'mergeConflicted',
                      branch: event.output.branch,
                      into: event.output.into,
                      paths: event.output.paths,
                    });
                  }
                  enqueue({ type: 'settlePush', params: { outcome: 'conflicted' } });
                }),
              },
              { target: 'done' },
            ],
            onError: {
              target: '#sync.queued',
              actions: assign({ error: ({ event }) => reason(event.error) }),
            },
          },
        },
        done: { type: 'final' },
      },
      onDone: [
        /* The queue first, before anything else this open does (D28). */
        { guard: 'hasPending', target: 'pushing' },
        /* Then anything minted while the pull was running — including a `close`
         * cut on a project opened and shut inside one window. */
        { guard: ({ context }) => context.pendingMint, target: 'pushing' },
        { target: 'backedUp' },
      ],
    },

    backedUp: {
      entry: assign({ attempt: 0, failure: 'none', error: undefined, conflictRef: undefined }),
      /* A revision minted *during* the push that is settling here was built
       * after that push was, so it is still unsent: it goes through `pending`,
       * not straight to `pushing`, so the debounce still coalesces (review 2
       * R4). Without this the row said `Backed up` over an unsent revision. */
      always: [{ guard: ({ context }) => context.pendingMint, target: 'pending' }],
      on: {
        revisionMinted: [
          {
            guard: { type: 'flushesNow', params: ({ event }) => ({ trigger: event.trigger }) },
            target: 'pushing',
            actions: 'rememberHead',
          },
          { target: 'pending', actions: 'rememberHead' },
        ],
        syncNow: { target: 'pushing', actions: assign({ pushId: ({ event }) => event.pushId }) },
        close: { target: 'pushing' },
        remoteConnected: { target: 'opening', actions: assign({ remote: ({ event }) => event.remote }) },
      },
    },

    /** D28's 2 s. Re-entered by every later revision, which is the coalescing. */
    pending: {
      after: { syncDebounce: { target: 'pushing' } },
      on: {
        revisionMinted: [
          {
            guard: { type: 'flushesNow', params: ({ event }) => ({ trigger: event.trigger }) },
            target: 'pushing',
            actions: 'rememberHead',
          },
          /* An external self-transition, so the debounce restarts: three saves
           * in a second are one push, which is the whole point of the window. */
          { target: 'pending', reenter: true, actions: 'rememberHead' },
        ],
        syncNow: { target: 'pushing', actions: assign({ pushId: ({ event }) => event.pushId }) },
        close: { target: 'pushing' },
      },
    },

    pushing: {
      entry: assign({ pendingMint: false }),
      invoke: {
        src: 'push',
        input: ({ context }) => {
          /* A retry offers exactly what is owed; an ordinary debounce offers
           * both sets and lets the port decide what is already up to date. */
          const narrowed = narrowedOffer(context);
          return {
            remote: context.remote ?? '',
            branch: context.branch,
            leases: context.leases,
            ...(narrowed === undefined ? {} : { refs: narrowed }),
          };
        },
        onDone: {
          target: 'recording',
          actions: enqueueActions(({ context, enqueue, event }) => {
            const now = Date.now();
            const leases = {
              ...context.leases,
              ...Object.fromEntries(
                event.output.refs.flatMap((entry) =>
                  entry.status === 'rejected' || entry.head === undefined ? [] : [[entry.name, entry.head]],
                ),
              ),
            };
            const pending = nextPending({
              pending: context.pending,
              outcomes: event.output.refs,
              leases: context.leases,
              now,
            });
            const refusedHistory = event.output.refs.find(
              (entry) => entry.status === 'rejected' && entry.name === historyRefOf(context.branch),
            );
            enqueue.assign({
              leases,
              pending,
              failure: pending.length > 0 ? 'retry' : 'none',
              attempt: pending.length > 0 ? context.attempt + 1 : 0,
              conflictRef: refusedHistory === undefined ? undefined : refusedHistory.name,
              error: refusedHistory?.reason ?? (pending.length > 0 ? pending[0]?.reason : undefined),
            });
            /* The over-quota list is `remote.machine`'s, always (P19, A40): the
             * scheduler forwards it through the parent and keeps no copy. */
            if ((event.output.overQuota ?? []).length > 0 && context.parentRef !== undefined) {
              enqueue.sendTo(context.parentRef, {
                type: 'remote',
                event: { type: 'quotaRefused', paths: event.output.overQuota ?? [] },
              });
            }
          }),
        },
        /*
         * R5: the browser leg *throws* on a transport failure rather than
         * reporting every ref as refused, so "the network is down" never reads
         * as "the remote refused this ref". It also means no ref report comes
         * back — so the history ref is recorded here by hand, or an offline
         * close would leave an empty queue and claim it was backed up.
         */
        onError: {
          target: 'recording',
          actions: assign({
            failure: ({ event }) => (isFatal(event.error) ? 'fatal' : 'retry'),
            attempt: ({ context }) => context.attempt + 1,
            error: ({ event }) => reason(event.error),
            pending: ({ context, event }) =>
              nextPending({
                pending: context.pending,
                outcomes: throwFailures(context, reason(event.error)),
                leases: context.leases,
                now: Date.now(),
              }),
          }),
        },
      },
      on: {
        /* A revision minted mid-push is not lost: the push that is running was
         * built before it, so another one follows on the ordinary debounce. */
        revisionMinted: { actions: 'rememberHead' },
      },
    },

    /**
     * The queue is a record, so writing it is an effect with its own edge (I29).
     *
     * Every push settle passes through here, including the ones that owe
     * nothing: a ref the remote finally took has to *leave* the record, or the
     * next open would retry a push that already landed.
     */
    recording: {
      invoke: {
        src: 'writePending',
        input: ({ context }) => ({
          projectId: context.projectId,
          record: { version: 1, entries: context.pending },
        }),
        onDone: [
          {
            guard: ({ context }) => context.conflictRef !== undefined,
            target: 'opening',
          },
          {
            guard: ({ context }) => context.failure === 'fatal',
            target: 'failed',
            actions: { type: 'settlePush', params: { outcome: 'failed' } },
          },
          {
            guard: ({ context }) => context.failure === 'retry',
            target: 'queued',
            actions: { type: 'settlePush', params: { outcome: 'queued' } },
          },
          { target: 'backedUp', actions: { type: 'settlePush', params: { outcome: 'backedUp' } } },
        ],
        /* A queue that cannot be written is the one failure this machine cannot
         * retry its way out of: nothing would remember what is owed. */
        onError: {
          target: 'failed',
          actions: [
            assign({ error: ({ event }) => reason(event.error) }),
            { type: 'settlePush', params: { outcome: 'failed' } },
          ],
        },
      },
    },

    /** `Not backed up · n`, and this host will try again on its own. */
    queued: {
      /* A revision minted while the pull was running, or while this machine was
       * still reading its record, is pushed as soon as there is a state that can
       * push. Every entry into `queued` passes through here, including the
       * pull's own failure edges — which is what stops an offline close from
       * being dropped by the open that preceded it. */
      always: [{ guard: ({ context }) => context.pendingMint, target: 'pushing' }],
      after: { syncBackoff: [{ guard: 'isOnline', target: 'opening' }] },
      on: {
        /* The assign is here as well as at the root because a state's own
         * handler is the one that runs: without it `opening` would read the
         * stale `online` and bounce straight back. */
        online: { target: 'opening', actions: assign({ online: true }) },
        revisionMinted: [
          {
            guard: { type: 'flushesNow', params: ({ event }) => ({ trigger: event.trigger }) },
            target: 'pushing',
            actions: 'rememberHead',
          },
          { target: 'pending', actions: 'rememberHead' },
        ],
        syncNow: { target: 'opening', actions: assign({ pushId: ({ event }) => event.pushId }) },
        close: { target: 'pushing' },
        remoteConnected: { target: 'opening', actions: assign({ remote: ({ event }) => event.remote }) },
      },
    },

    /**
     * The remote moved under this host's lease (P18, A22).
     *
     * Not a failure and not a retry: history is the one thing a scheduler must
     * never force. `Needs resolution` stands until the person, or W10's
     * surface, composes the two lines — and every way out of here pulls first.
     */
    conflicted: {
      entry: emit(
        ({ context }): SyncMachineEmitted => ({
          type: 'syncConflict',
          ref: context.conflictRef ?? historyRefOf(context.branch),
          reason: context.error ?? 'The remote has work this device has not seen.',
        }),
      ),
      on: {
        syncNow: { target: 'opening', actions: assign({ pushId: ({ event }) => event.pushId }) },
        online: { target: 'opening', actions: assign({ online: true }) },
        remoteConnected: { target: 'opening', actions: assign({ remote: ({ event }) => event.remote }) },
        /* Composed, so pull again: the resolution minted a revision on this
         * branch and whether the remote takes it is the remote's answer, not
         * something this machine can assume (review 2 R6, S33). */
        conflictResolved: [
          {
            guard: ({ context, event }) =>
              event.ref === undefined ||
              event.ref === context.conflictRef ||
              event.ref === historyRefOf(context.branch),
            target: 'opening',
            actions: assign({
              conflictRef: undefined,
              error: undefined,
              /* The composed revision is this device's head now, and it is
               * unsent: the pull that follows leaves `opening` by
               * `pendingMint → pushing`, which offers it under the lease the
               * same pull just took (P18, P44). */
              localHead: ({ context: current, event: settled }) => settled.revisionId ?? current.localHead,
              pendingMint: true,
            }),
          },
        ],
      },
    },

    /** Something a person has to act on — a credential, or a queue that will not write. */
    failed: {
      on: {
        syncNow: { target: 'opening', actions: assign({ pushId: ({ event }) => event.pushId }) },
        remoteConnected: { target: 'opening', actions: assign({ remote: ({ event }) => event.remote }) },
        revisionMinted: { target: 'pending', actions: 'rememberHead' },
      },
    },
  },
});

/** The actor set `syncMachine.provide` needs. @public */
export type SyncActors = NonNullable<Parameters<typeof syncMachine.provide>[0]['actors']>;

const facetStateOf = (value: string, withinPullWindow: boolean): SyncFacet['state'] => {
  switch (value) {
    case 'noRemote': {
      return 'noRemote';
    }
    case 'reading': {
      return 'checking';
    }
    case 'opening': {
      /* F16's first window is exactly how long the row is allowed to say
       * `Checking…`; after it the pull continues and the row shows what this
       * device actually knows. */
      return withinPullWindow ? 'checking' : 'pending';
    }
    case 'pending':
    case 'pushing':
    case 'recording': {
      return 'pending';
    }
    case 'conflicted': {
      return 'conflicted';
    }
    case 'failed': {
      return 'failed';
    }
    case 'queued': {
      return 'queued';
    }
    default: {
      return 'backedUp';
    }
  }
};

/**
 * The Sync row's whole input, read where it lives.
 *
 * @param snapshot - Current sync snapshot.
 * @returns The facet the pane, the chip and the projection carry.
 * @public
 */
export const selectSyncFacet = (snapshot: SnapshotFrom<typeof syncMachine>): SyncFacet => {
  const value = typeof snapshot.value === 'string' ? snapshot.value : (Object.keys(snapshot.value)[0] ?? '');
  return {
    state: facetStateOf(value, snapshot.context.withinPullWindow),
    pendingCount: snapshot.context.pending.length,
    online: snapshot.context.online,
    conflictRef: snapshot.context.conflictRef,
    error: snapshot.context.error,
  };
};
