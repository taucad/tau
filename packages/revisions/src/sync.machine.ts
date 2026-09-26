/**
 * `sync.machine` — the only thing in Tau that decides when a project is pushed.
 *
 * Sync is never a user event (D28, S41). A remote that is connected means every
 * minted revision reaches it within one debounce; a tab going hidden means the
 * `close` revision is pushed while the page can still `await`; anything the
 * server did not acknowledge is a record in `.git/sync-pending` that
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

import { createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { AnyActorRef, AnyEventObject, EnqueueObject, SnapshotFrom } from 'xstate';

import type { CheckoutCutTrigger } from '#checkout.machine.js';
import { eventSchemas } from '#machine-schemas.js';
import type { MachineActors } from '#machine-schemas.js';
import { isStorageRefusal } from '#refusal-markers.js';
import type { RemoteStorageRefusal } from '#revision-port.js';
import type {
  SyncFacet,
  SyncPushOutcome,
  SyncQueueEntry,
  SyncQueueRecord,
  SyncRefOutcome,
  SyncFailureReason,
} from '#sync.types.js';

/** Input accepted when creating the syncMachine actor. @public */
export type SyncMachineInput = Readonly<{
  projectId: string;
  /** The branch the history set tracks. Defaults to `main`. */
  branch?: string;
  /** The root, for the two facts that belong to siblings (`publish`, `remote`). */
  parentRef?: AnyActorRef;
  /** D28's 2 s. */
  debounceMilliseconds?: number;
  /** How long a burst of mints may hold its push. Defaults to {@link syncDebounceMaxWaitFactor} windows. */
  debounceMaxWaitMilliseconds?: number;
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

/* The fields of {@link SyncMachineContext}, named by the interface below. */
type SyncMachineContextFields = Readonly<{
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
  /**
   * A correlated request that arrived while a push was already running (W15 F1).
   *
   * That push was assembled before the request — before the revision the
   * requester minted and then asked about — so it is never the one that
   * answers: the request is delivered again once that push is recorded.
   */
  nextPushId: string | undefined;
  /** How many pushes in a row have not been acknowledged. Never leaves context. */
  attempt: number;
  /**
   * A rate-limited remote's own wait (W13d): the next retry waits exactly this
   * long instead of the doubling, which a 429 does not advance.
   */
  retryAfterMilliseconds: number | undefined;
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
  /**
   * That remembered mint was a `close` or `hidden` cut, which flushes now.
   *
   * `pendingMint` alone cannot say so, and the state that acts on it —
   * `backedUp.always` — is not the state the event arrived in, so a close cut
   * landing during an in-flight push was routed to the 2 s debounce and lost
   * with the document (C17).
   */
  pendingFlush: boolean;
  /** A fetch completed record projections whose durable retry slice must be written. */
  recordQueueDirty: boolean;
  /**
   * The last pull found this device ahead of the remote (C15).
   *
   * Distinct from `pendingMint`: nothing was minted *now*, the remote is simply
   * missing revisions this device already has — the state of any device whose
   * queue write was lost or whose process died inside the debounce.
   */
  ahead: boolean;
  /** Where a divergence landed, when one did (A22). */
  conflictRef: string | undefined;
  /**
   * A remote move arrived while this machine was busy (D13).
   *
   * The same remembered-fact shape as `pendingMint`: the entry is a wake-up,
   * and the state that finishes the current effect fetches for it.
   */
  pendingFetch: boolean;
  /** A lease retired since the current pull started, so a hold it hit may already be gone (rule 9). */
  leaseSettled: boolean;
  /** The checkout an apply left alone, and which the `merge` cut or the lease wait is about (D12). */
  heldCheckoutId: string | undefined;
  /**
   * A merge cut already found nothing to save and the pull ran again at once.
   *
   * The second such answer backs off instead (RV-W5b F2): a dirty check and a
   * cut that disagree — a registry lease with no file behind it, a turn not yet
   * leased, a capture that saw a write the cut's memo did not — would otherwise
   * be a real fetch per loop. Cleared once the project is backed up.
   */
  mintRepulled: boolean;
  /** The fetched remote head a leased checkout has not applied (RA4's *Arrived*). */
  arrived: string | undefined;
  /** How many cuts this machine has asked for, so each `requestId` is new (N2). */
  cutCount: number;
  /** The id the checkout echoes on the answer to this machine's latest cut. */
  requestId: string | undefined;
  error: string | undefined;
  reason: SyncFailureReason | undefined;
  debounceMilliseconds: number;
  debounceMaxWaitMilliseconds: number;
  retryMilliseconds: number;
  maxRetryMilliseconds: number;
  pullRenderMilliseconds: number;
  pullDeadlineMilliseconds: number;
}>;

/** Serializable state owned by syncMachine. @public */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference it by name, where an alias is expanded into every transition of this machine and of any machine that holds it (K-17, TS7056)
export interface SyncMachineContext extends SyncMachineContextFields {}

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
      trigger: CheckoutCutTrigger;
      revisionId: string;
      turnId?: string;
      requestId?: string;
    }>
  /* The root's other answers to a cut, which reach here only for a cut no turn
   * asked for; this machine reads the one whose `requestId` is its own (D12). */
  | Readonly<{ type: 'nothingToSave'; checkoutId: string; trigger: CheckoutCutTrigger; requestId?: string }>
  | Readonly<{
      type: 'cutFailed';
      checkoutId: string | undefined;
      trigger: CheckoutCutTrigger;
      requestId?: string;
      reason: string;
    }>
  | Readonly<{ type: 'casLost'; checkoutId: string; trigger: CheckoutCutTrigger; requestId?: string }>
  /** A turn's lease retired; a pull parked behind it applies now (rule 9). */
  | Readonly<{ type: 'leaseRetired'; runId: string }>
  /**
   * The remote moved (D13): one `revision` entry from the durable-events long
   * poll. A wake-up, never a payload — the bytes come from the fetch it starts.
   */
  | Readonly<{ type: 'remoteMoved'; generation: number; refs: readonly string[] }>
  /** The long poll was refused (404 for a non-member); classified like any remote refusal (rule 19). */
  | Readonly<{ type: 'remoteRefused'; code: string; message: string }>
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
  /** What it said about room, when it said anything (C13). */
  quotaStorage?: RemoteStorageRefusal;
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
  /**
   * What this device has to do about the remote's head.
   *
   * `ahead` is the case a single `upToDate` used to hide: "the remote has
   * everything" and "the remote is missing my revisions" are opposite answers,
   * and collapsing them let a device whose work never reached the remote open
   * to *Backed up* and push nothing (C15).
   */
  integration: 'upToDate' | 'ahead' | 'fastForward' | 'diverged';
  /** Local branch refs after remote branch reconciliation, including ref-only branches. */
  branches?: ReadonlyArray<Readonly<{ name: string; head: string }>>;
  /** Independent record projections attempted after the fetch. */
  records?: readonly SyncRefOutcome[];
}>;

/** What applying the fetched head is asked for. @public */
export type SyncIntegrateActorInput = Readonly<{ remote: string; branch: string }>;

/** A checkout an integration moved, reported so its actor re-heads (D3). @public */
export type SyncMovedCheckout = Readonly<{ checkoutId: string; revisionId: string; treeId: string }>;

/**
 * Why an integration left a checkout alone (D12, rule 9).
 *
 * Not a failure: a `dirty` checkout is minted first through its own checkout
 * actor (trigger `merge`) and the pull runs again; a `leased` one is never
 * re-based, so the pull waits for the lease to retire. `revisionId` is the
 * fetched remote head the checkout has not applied.
 *
 * @public
 */
export type SyncHold = Readonly<{
  status: 'held';
  hold: 'dirty' | 'leased';
  checkoutId: string;
  revisionId: string;
}>;

/** What composing a diverged local and remote branch produced. @public */
export type SyncMergeActorOutput =
  | Readonly<{ status: 'merged'; moved?: SyncMovedCheckout }>
  | Readonly<{ status: 'conflicted'; branch: string; into: string; paths: readonly string[] }>
  | SyncHold;

/** The checkout a successful open pull re-headed, or why it held. @public */
export type SyncFastForwardActorOutput = SyncMovedCheckout | SyncHold | undefined;

/** What the remote-moves subscription is started with. @public */
export type SyncRemoteMovesActorInput = Readonly<{ projectId: string }>;

const defaultBranch = 'main';
const defaultDebounceMilliseconds = 2000;

/**
 * How many debounce windows a burst of mints may hold its push (W13's finding).
 *
 * The window restarts on every mint, so without a ceiling an agent minting
 * faster than it never pushes while it keeps going. Two windows is the least
 * that still coalesces a burst — a mint cadence spaced at one window already
 * pushes once per window plus the push, so a burst pushing once per two windows
 * never costs more requests than that — and it keeps the first mint of a burst
 * on the remote within 4 s plus the push, about B6's 5 s: rule 20's 2.1 s budget
 * is the single mint's, and a burst gets one more window, not an unbounded wait.
 *
 * @public
 */
export const syncDebounceMaxWaitFactor = 2;

/**
 * The burst ceiling at the default window: 4 s.
 *
 * @public
 */
export const syncDebounceMaxWaitMilliseconds = defaultDebounceMilliseconds * syncDebounceMaxWaitFactor;
const defaultRetryMilliseconds = 5000;
const defaultMaxRetryMilliseconds = 300_000;
const defaultPullRenderMilliseconds = 3000;

/**
 * When the open pull is abandoned outright: policy rule 9's 10 s.
 *
 * The innermost bound of the close path. Rule 9 nests every lifecycle bound
 * strictly inside the wait that awaits it, so the close-path sync quiesce in
 * `revision-effects.ts` is derived from this value and exceeds it; otherwise a
 * pull outlives the wait above it and the person reads that wait's generic
 * sentence instead of the pull's own (L2-F9).
 *
 * @public
 */
export const syncPullDeadlineMilliseconds = 10_000;

/*
 * The refusals no amount of waiting will satisfy (N2).
 *
 * Retrying any of these is retrying behind the person's back: a lapsed plan, a
 * revoked session, a project that is not theirs and a full store all need
 * somebody to *do* something, and until this set existed the machine recognised
 * only the credential frame the page supplies before a request — so a real
 * 401/403/404 was retried on a 5 s→300 s backoff for as long as the tab lived,
 * with the only recovery transition unreachable.
 *
 * `REMOTE_UNAVAILABLE` (429, 5xx) and `ENGINE_FAILED` (no status at all) are
 * deliberately absent: those are the retryable ones. The literals are written
 * here rather than imported because a machine may import only *types* from this
 * package's contracts (I20, AC22).
 */
const terminalFailureCodes: ReadonlySet<string> = new Set([
  'REMOTE_REAUTHORIZATION_REQUIRED',
  'REMOTE_UNAUTHORIZED',
  'REMOTE_NOT_ENTITLED',
  'REMOTE_FORBIDDEN',
  'REMOTE_NOT_FOUND',
  'REMOTE_QUOTA_EXCEEDED',
  'REMOTE_MOVED',
  /* A damaged hosted repository answers the same 500 to every retry. */
  'REMOTE_DAMAGED',
]);

const codeOf = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a rejection is `unknown` until read.
  const { code } = error as Readonly<{ code?: unknown }>;
  return typeof code === 'string' ? code : undefined;
};

const isFatal = (error: unknown): boolean => terminalFailureCodes.has(codeOf(error) ?? '');

/* A 429's wait, read off the port's error the way `codeOf` reads its code. */
const retryAfterOf = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a rejection is `unknown` until read.
  const { retryAfterMilliseconds } = error as Readonly<{ retryAfterMilliseconds?: unknown }>;
  return typeof retryAfterMilliseconds === 'number' ? retryAfterMilliseconds : undefined;
};

/**
 * Which action the surface beside this failure should offer (N3).
 *
 * The one classifier, exported because `remote.machine` needs the same answer
 * for a refused *connect*: rule 19 asks every surface showing a remote failure
 * for exactly one action matching its class, and the connect path used to have
 * no class at all, so a `403 GIT_SYNC_NOT_ENTITLED` on connect could only offer
 * *Retry* where the identical refusal on a push offered *Upgrade*. It lives
 * here rather than in `remotes.ts` because a machine may import only *types*
 * from this package's contracts (I20, AC22) and may import a sibling machine.
 *
 * @param error - The rejection, as the actor reported it.
 * @returns The class, `'unknown'` when the code says nothing.
 * @public
 */
export const syncFailureReason = (error: unknown): SyncFailureReason => {
  switch (codeOf(error)) {
    case 'REMOTE_REAUTHORIZATION_REQUIRED':
    case 'REMOTE_UNAUTHORIZED': {
      return 'unauthorized';
    }
    case 'REMOTE_NOT_ENTITLED': {
      return 'notEntitled';
    }
    case 'REMOTE_FORBIDDEN': {
      return 'forbidden';
    }
    case 'REMOTE_NOT_FOUND': {
      return 'notFound';
    }
    case 'REMOTE_QUOTA_EXCEEDED': {
      return 'quota';
    }
    case 'LFS_REMOTE_UNSUPPORTED': {
      return 'largeFiles';
    }
    case 'REMOTE_MOVED': {
      return 'moved';
    }
    case 'REMOTE_DAMAGED': {
      return 'damaged';
    }
    /* The server refused the refs, not the device (contract §4): a fetch and a
     * replay clear it, so the action beside it is *Sync now*, not *Sign in*. */
    case 'REMOTE_REJECTED':
    case 'REMOTE_REF_CONFLICT': {
      return 'rejected';
    }
    /* No status at all is the one failure that really is connectivity. */
    case 'ENGINE_FAILED': {
      return 'offline';
    }
    default: {
      return 'unknown';
    }
  }
};

const reason = (error: unknown): string =>
  error instanceof Error ? error.message : 'This project could not be backed up.';

const unsupported = async (): Promise<never> => {
  await Promise.resolve();
  throw new Error('This host provided no sync actors; `syncMachine.provide` supplies them.');
};

/** A host with no connectivity source is a host that is always online. */
const noConnectivity = createCallbackLogic(() => () => undefined);

const historyRefOf = (branch: string): string => `refs/heads/${branch}`;

/** A refused ref's reason in a person's words; `leaseLost` is the ports' code for "the remote moved" (D39). */
const refusalSaid = (reason: string | undefined): string | undefined =>
  reason === 'leaseLost' ? 'This branch changed on the remote; this project will catch up and try again.' : reason;

/**
 * The queue entries *this* remote is owed.
 *
 * One predicate, because "what is unacknowledged" is asked in three places —
 * the narrowed offer, the `hasPushPending` guard and the `n` the row renders —
 * and they must agree. Entries recorded against a remote this project is no
 * longer connected to stay in the record and are never offered: disconnect
 * pauses the old destination's queue rather than erasing it (policy Rule 9).
 * A projection entry is inbound work, never something owed to a remote.
 *
 * @param context - Current context.
 * @returns The push entries this remote has not acknowledged.
 */
const owedPushes = (context: SyncMachineContext): readonly SyncQueueEntry[] =>
  context.pending.filter(
    (entry) => entry.operation !== 'projection' && (entry.remote === undefined || entry.remote === context.remote),
  );

/**
 * Whether a ref is in the history set rather than the record set (policy rule 10).
 *
 * @param ref - A fully-qualified ref name.
 * @returns `true` for `refs/heads/*` and `refs/tags/*`.
 */
const isHistoryRef = (ref: string): boolean => ref.startsWith('refs/heads/') || ref.startsWith('refs/tags/');

/**
 * The refs a retry narrows its offer to, or `undefined` for "both sets".
 *
 * Only an owed history ref other than this branch narrows — a conflict line
 * travels alone, because the diverged branch it decides would sink the atomic
 * set. An owed *record* ref never narrows: offering it alone left every new
 * revision of this branch unpushed for as long as the remote refused it, and a
 * record's refusal never blocks history (rule 10, W13c). A queued history ref
 * is the synthetic marker for a thrown full-set push, so it cannot narrow.
 *
 * @param context - Current context.
 * @returns The narrowed ref list, or `undefined` when both sets are offered.
 */
const narrowedOffer = (context: SyncMachineContext): readonly string[] | undefined => {
  const owed = owedPushes(context);
  const history = owed.filter((entry) => isHistoryRef(entry.ref));
  return history.length > 0 &&
    context.failure !== 'none' &&
    history.every((entry) => entry.ref !== historyRefOf(context.branch))
    ? owed.map((entry) => entry.ref)
    : undefined;
};

/**
 * What the push that is running actually offered.
 *
 * A transport failure reports no refs at all (W11b R5), so the queue entry has
 * to be synthesised — and synthesising `refs/heads/<branch>` for a retry that
 * only offered one chat ref would record a branch nobody offered as
 * unacknowledged (review 2 R9). A full offer records the branch even when the
 * remote holds its head: records have no entry of their own until a push
 * reports them, so that entry is what makes the retry happen at all.
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
    /** Who the push was made to; stamped on every entry it leaves behind. */
    remote: string | undefined;
    now: number;
  }>,
): readonly SyncQueueEntry[] => {
  const { pending, outcomes, leases, remote, now } = input;
  const offered = new Map(outcomes.map((entry) => [entry.name, entry]));
  /* Only entries this push could have settled are replaced: a ref it did not
   * offer, and every entry owed to a *different* remote, keeps its record. */
  const kept = pending.filter(
    (entry) =>
      entry.operation === 'projection' ||
      !offered.has(entry.ref) ||
      (entry.remote !== undefined && entry.remote !== remote),
  );
  const refused = outcomes.flatMap((entry): readonly SyncQueueEntry[] =>
    entry.status === 'rejected'
      ? [
          {
            ref: entry.name,
            ...(entry.head === undefined ? {} : { head: entry.head }),
            ...(remote === undefined ? {} : { remote }),
            expected: leases[entry.name],
            reason: entry.reason ?? 'The remote refused this ref.',
            recordedAt: now,
          },
        ]
      : [],
  );
  return [...kept, ...refused];
};

/** Replace the projection-retry slice after one complete fetch cycle. */
const nextProjectionPending = (
  pending: readonly SyncQueueEntry[],
  outcomes: readonly SyncRefOutcome[],
  now: number,
): readonly SyncQueueEntry[] => [
  ...pending.filter((entry) => entry.operation !== 'projection'),
  ...outcomes.flatMap((entry): readonly SyncQueueEntry[] =>
    entry.status === 'rejected'
      ? [
          {
            ref: entry.name,
            operation: 'projection',
            ...(entry.head === undefined ? {} : { head: entry.head }),
            expected: undefined,
            reason: entry.reason ?? 'This record could not be restored.',
            recordedAt: now,
          },
        ]
      : [],
  ),
];

type SyncEnqueue = EnqueueObject<SyncMachineEvent, SyncMachineEmitted>;
type SyncContextPatch = Partial<SyncMachineContext>;

const rememberHead = (context: SyncMachineContext, event: SyncMachineEvent): SyncContextPatch => ({
  localHead: event.type === 'revisionMinted' ? event.revisionId : context.localHead,
  pendingMint: event.type === 'revisionMinted' ? true : context.pendingMint,
  /* The trigger travels with the fact, because the state that *acts* on the
   * remembered mint is never the state the event arrived in (C17). */
  pendingFlush:
    event.type === 'revisionMinted' && (event.trigger === 'close' || event.trigger === 'hidden')
      ? true
      : context.pendingFlush,
});

/* `close` and `hidden` are the last moment an `await` means anything, so
 * they skip the window the other triggers coalesce in (D28, S41). */
const flushesNow = (trigger: string): boolean => trigger === 'close' || trigger === 'hidden';

/*
 * `pushing` and `recording` hold a push that was built before this request, so
 * it waits for the next one (W15 F1). An uncorrelated ask falls through to the
 * root, as before. Both states re-deliver it on exit (`redeliverPush`).
 */
const deferPush = ({ event }: Readonly<{ event: Readonly<{ pushId?: string }> }>) =>
  event.pushId === undefined ? undefined : { context: { nextPushId: event.pushId } };

/* Deliver a deferred request again, to whichever state the settled push left
 * this machine in: that state's own `syncNow` answers it as if it arrived now. */
const redeliverPush = (context: SyncMachineContext, enq: SyncEnqueue): SyncContextPatch => {
  if (context.nextPushId === undefined) {
    return {};
  }
  enq.raise({ type: 'syncNow', pushId: context.nextPushId });
  return { nextPushId: undefined };
};

/** Tell the requester how its correlated push ended, and forget it. */
const settlePush = (context: SyncMachineContext, enq: SyncEnqueue, outcome: SyncPushOutcome): SyncContextPatch => {
  if (context.pushId === undefined) {
    return {};
  }
  enq.emit({ type: 'pushSettled', pushId: context.pushId, outcome });
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, { type: 'pushSettled', pushId: context.pushId, outcome });
  }
  return { pushId: undefined };
};

const reportFastForward = (
  context: SyncMachineContext,
  enq: SyncEnqueue,
  output: SyncMovedCheckout | undefined,
): void => {
  if (output === undefined) {
    return;
  }
  if (context.parentRef !== undefined) {
    enq.sendTo(context.parentRef, {
      type: 'checkoutChanged',
      ...output,
      branch: context.branch,
    });
  }
};

const rememberFetch = (
  context: SyncMachineContext,
  enq: SyncEnqueue,
  output: SyncFetchActorOutput,
): SyncContextPatch => {
  const { records } = output;
  const pending = records === undefined ? context.pending : nextProjectionPending(context.pending, records, Date.now());
  const projectionFailure = pending.find((entry) => entry.operation === 'projection');
  if (context.parentRef !== undefined && output.branches !== undefined) {
    enq.sendTo(context.parentRef, { type: 'branchesFetched', branches: output.branches });
  }
  return {
    leases: output.leases,
    pending,
    retryAfterMilliseconds: undefined,
    recordQueueDirty: records !== undefined,
    ahead: output.integration === 'ahead',
    failure: projectionFailure === undefined ? (pending.length === 0 ? 'none' : context.failure) : 'retry',
    error: pending.length === 0 ? undefined : (projectionFailure?.reason ?? context.error),
    reason: pending.length === 0 ? undefined : projectionFailure === undefined ? context.reason : 'unknown',
  };
};

/*
 * A pull step that failed. A refusal no wait can satisfy is terminal here too
 * (C3b/N2): the backoff would only re-fetch it.
 */
const pullFailed = (context: SyncMachineContext, enq: SyncEnqueue, error: unknown) => {
  const failure = {
    error: reason(error),
    reason: syncFailureReason(error),
    retryAfterMilliseconds: retryAfterOf(error),
  };
  if (isFatal(error)) {
    return {
      target: '#sync.failed',
      context: { ...failure, ...settlePush({ ...context, ...failure }, enq, 'failed') },
    };
  }
  return {
    target: '#sync.queued',
    context: { ...failure, ...settlePush({ ...context, ...failure }, enq, 'queued') },
  };
};

/**
 * Where a held integration goes (D12, rule 9): a leased checkout waits for its
 * lease with the fetched head shown as arrived, a dirty one is minted first.
 *
 * @param hold - What the apply reported.
 * @returns The transition.
 */
const heldAt = (hold: SyncHold) =>
  hold.hold === 'leased'
    ? {
        target: '#sync.awaitingLease',
        /* `pendingFetch`: the parked head is owed a pull however the park ends (RV-W5b F7). */
        context: { heldCheckoutId: hold.checkoutId, arrived: hold.revisionId, pendingFetch: true },
      }
    : { target: '#sync.minting', context: { heldCheckoutId: hold.checkoutId } };

/* This machine's own cut, by the id the checkout echoes (N2), as `branch.machine` reads its. */
const answersOurCut = (context: SyncMachineContext, event: Readonly<{ requestId?: string }>): boolean =>
  event.requestId !== undefined && event.requestId === context.requestId;

/* A mint this machine asked for could not land; the backoff's pull asks again (D3: terminal for the request). */
const mintRefused = (context: SyncMachineContext, enq: SyncEnqueue, error: string) => {
  const failure = { error, reason: 'unknown' } satisfies SyncContextPatch;
  return { target: '#sync.queued', context: { ...failure, ...settlePush({ ...context, ...failure }, enq, 'queued') } };
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
const syncMachineDefinition = setup({
  schemas: {
    context: types<SyncMachineContext>(),
    events: eventSchemas<SyncMachineEvent>(),
    emitted: eventSchemas<SyncMachineEmitted>(),
    input: types<SyncMachineInput>(),
  },
  actors: {
    /** The durable queue as the record holds it (D29: rehydrate from records). */
    readPending: createAsyncLogic<SyncQueueRecord, SyncReadPendingActorInput>({ run: unsupported }),
    writePending: createAsyncLogic<void, SyncWritePendingActorInput>({ run: unsupported }),
    /** Git's own remotes list, so a reopened project knows it has one. */
    readRemote: createAsyncLogic<SyncReadRemoteActorOutput, Readonly<{ projectId: string }>>({ run: unsupported }),
    push: createAsyncLogic<SyncPushActorOutput, SyncPushActorInput>({ run: unsupported }),
    fetch: createAsyncLogic<SyncFetchActorOutput, SyncFetchActorInput>({ run: unsupported }),
    fastForward: createAsyncLogic<SyncFastForwardActorOutput, SyncIntegrateActorInput>({ run: unsupported }),
    /**
     * Composing two diverged lines (A22).
     *
     * W10 provides it (`revision-effects.ts` `merge`). Two outcomes, and they
     * leave by different doors: `conflicted` targets `#sync.conflicted`, which
     * is where *Needs resolution* lives; a merge that *throws* targets
     * `#sync.queued`, because a composition this host could not attempt is work
     * still owed, not a divergence for a person to resolve.
     */
    merge: createAsyncLogic<SyncMergeActorOutput, SyncIntegrateActorInput>({ run: unsupported }),
    connectivity: noConnectivity,
    /**
     * The project's `revision` entries while a remote is connected (D13).
     *
     * Invoked for the machine's whole life and told which remote to watch
     * (`watch { remote }` / `unwatch`), so its long-poll cursor survives every
     * transition; it answers `remoteMoved` per entry and `remoteRefused` once,
     * then stops, when the stream is refused.
     */
    remoteMoves: createCallbackLogic<AnyEventObject, SyncRemoteMovesActorInput>(() => () => undefined),
  },
  delays: {
    syncDebounce: ({ context }) => context.debounceMilliseconds,
    /* Started by the burst's first mint and never restarted by the rest. */
    syncMaxWait: ({ context }) => context.debounceMaxWaitMilliseconds,
    /* Doubling, capped. It is a delay, not a rendered state (A38). */
    syncBackoff: ({ context }) =>
      Math.min(
        context.retryAfterMilliseconds ?? context.retryMilliseconds * 2 ** Math.max(0, context.attempt - 1),
        context.maxRetryMilliseconds,
      ),
    pullRenderWindow: ({ context }) => context.pullRenderMilliseconds,
    pullDeadline: ({ context }) => context.pullDeadlineMilliseconds,
  },
  guards: {
    hasRemote: (context: SyncMachineContext) => context.remote !== undefined,
    hasPushPending: (context: SyncMachineContext) => owedPushes(context).length > 0,
    hasRecordResults: (context: SyncMachineContext) => context.recordQueueDirty,
    isOnline: (context: SyncMachineContext) => context.online,
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
    nextPushId: undefined,
    attempt: 0,
    retryAfterMilliseconds: undefined,
    failure: 'none',
    withinPullWindow: false,
    localHead: undefined,
    pendingMint: false,
    pendingFlush: false,
    recordQueueDirty: false,
    ahead: false,
    conflictRef: undefined,
    pendingFetch: false,
    leaseSettled: false,
    heldCheckoutId: undefined,
    mintRepulled: false,
    arrived: undefined,
    cutCount: 0,
    requestId: undefined,
    error: undefined,
    reason: undefined,
    debounceMilliseconds: input.debounceMilliseconds ?? defaultDebounceMilliseconds,
    debounceMaxWaitMilliseconds:
      input.debounceMaxWaitMilliseconds ??
      (input.debounceMilliseconds ?? defaultDebounceMilliseconds) * syncDebounceMaxWaitFactor,
    retryMilliseconds: input.retryMilliseconds ?? defaultRetryMilliseconds,
    maxRetryMilliseconds: input.maxRetryMilliseconds ?? defaultMaxRetryMilliseconds,
    pullRenderMilliseconds: input.pullRenderMilliseconds ?? defaultPullRenderMilliseconds,
    pullDeadlineMilliseconds: input.pullDeadlineMilliseconds ?? syncPullDeadlineMilliseconds,
  }),
  invoke: [
    { id: 'connectivity', src: 'connectivity' },
    { id: 'remoteMoves', src: 'remoteMoves', input: ({ context }) => ({ projectId: context.projectId }) },
  ],
  /* Connectivity and the remote are facts about the host, not about which state
   * the scheduler is in, so they are handled once at the root. */
  on: {
    online: { context: { online: true } },
    offline: { context: { online: false } },
    /* The fallback, not an override: a state with its own `revisionMinted`
     * handler keeps it (the deepest transition wins). This one catches the
     * states that have none — `reading`, `opening`, `recording` — so a cut is
     * never dropped for arriving at a busy moment. */
    revisionMinted: { context: ({ context, event }) => rememberHead(context, event) },
    recordsChanged: { context: { pendingMint: true } },
    /* The same fallback for a remote move (D13): a busy state remembers it and
     * the state that finishes fetches. The idle states fetch at once. */
    remoteMoved: { context: { pendingFetch: true } },
    /* The stream is only the wake-up channel (RV-W5b F5): a refusal of it is
     * not a refusal of the repository — a repository-scoped credential is
     * refused on every non-git route by design (I10). So it pulls, as a move
     * would, and the git fetch with the same credential is what the one
     * classifier reads (rule 19). The subscription does not re-read a refused
     * stream until the remote is watched afresh, so this is one pull. */
    remoteRefused: (_arguments, enq) => {
      enq.raise({ type: 'remoteMoved', generation: 0, refs: [] });
      return {};
    },
    leaseRetired: { context: { leaseSettled: true } },
    /* The same fallback, for the same reason (review 2 R7): `close` is handled
     * where it can push, and remembered where it cannot — `reading`, `opening`,
     * `recording` — so the state that finishes acts on it. */
    close: { context: { pendingMint: true, pendingFlush: true } },
    /* A decision landed while this machine was not `conflicted` — one fetched
     * from another device (D14): the merge it minted is this device's own and
     * unsent, so it is pushed like a mint. `conflicted` answers it itself. */
    conflictResolved: { context: { pendingMint: true } },
    /* The same fallback once more (L2-F3): `reading`, `opening` and `minting`
     * are effects with no push edge of their own, and dropping a
     * correlated request there left `publish.machine` waiting out its 60 s and
     * then blaming the cloud. The request is remembered, and every way out of
     * those states answers it: `opening` by pushing (or by the settle its
     * failure edges make), `noRemote` at once. `pushing` and `recording`
     * defer it to the next push instead (W15 F1). */
    syncNow: { context: ({ context, event }) => ({ pushId: event.pushId ?? context.pushId }) },
    open: ({ context, guards }) => (guards.hasRemote(context) ? { target: '.opening', reenter: true } : undefined),
    remoteDisconnected: {
      target: '.noRemote',
      /* The queue is *paused*, not dropped (policy Rule 9, C12): its entries
       * name the remote they are owed to, `owedPushes` never offers them to
       * anybody else, and keeping them in context is what keeps them in the
       * record the next `recording` writes. Clearing them here erased work that
       * had never reached a remote, silently, while the row went blank. */
      context: {
        remote: undefined,
        leases: {},
        attempt: 0,
        retryAfterMilliseconds: undefined,
        failure: 'none',
        error: undefined,
        reason: undefined,
        conflictRef: undefined,
        ahead: false,
        recordQueueDirty: false,
        pendingFetch: false,
        heldCheckoutId: undefined,
        arrived: undefined,
      },
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
      context: ({ context, event }) => ({
        pending: nextPending({
          pending: context.pending,
          outcomes: event.refs,
          leases: context.leases,
          remote: context.remote,
          now: Date.now(),
        }),
        failure: 'none',
        attempt: 0,
        retryAfterMilliseconds: undefined,
      }),
    },
    pushFailed: {
      target: '.recording',
      context: ({ context, event }) => ({
        failure: 'retry',
        error: event.reason,
        reason: 'unknown',
        pending: nextPending({
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
          remote: context.remote,
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
            onDone: { target: 'remote', context: ({ event }) => ({ pending: event.output.entries }) },
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
              context: ({ context, event }) => ({
                remote: event.output.remote,
                branch: event.output.branch ?? context.branch,
              }),
            },
            onError: { target: 'done' },
          },
        },
        done: { type: 'final' },
      },
      onDone: ({ context, guards }) => (guards.hasRemote(context) ? { target: 'opening' } : { target: 'noRemote' }),
    },

    /** No remote is not a failure, and nothing is queued against one. */
    noRemote: {
      /* A request remembered while this machine was still reading, or cut off
       * by a disconnect, has nowhere to go: say so rather than leave it
       * waiting (L2-F3). */
      entry: ({ context }, enq) => {
        enq.sendTo('remoteMoves', { type: 'unwatch' });
        return { context: { ...settlePush(context, enq, 'failed'), ...redeliverPush(context, enq) } };
      },
      on: {
        syncNow: ({ context, event }, enq) =>
          event.remote === undefined
            ? { context: settlePush({ ...context, pushId: event.pushId }, enq, 'failed') }
            : { target: 'pushing', context: { pushId: event.pushId, remote: event.remote } },
        remoteConnected: { target: 'opening', context: ({ event }) => ({ remote: event.remote }) },
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
      always: ({ context }, enq) => {
        if (context.online) {
          return undefined;
        }
        /* A correlated `syncNow { pushId }` that arrives offline used to reach
         * here and stop: `settlePush` runs only out of `recording`, so the
         * requester — `publish.machine` — waited its full 60 s and then said
         * Tau could not *confirm* the push, for a host that knew before it
         * started (C18). The outcome it already renders correctly is the
         * honest one. */
        const offline = {
          error: 'This device is offline; this project will be backed up when it is back online.',
          reason: 'offline',
        } satisfies SyncContextPatch;
        return {
          target: 'queued',
          context: { ...offline, ...settlePush({ ...context, ...offline }, enq, 'queued') },
        };
      },
      entry: ({ context }, enq) => {
        /* Subscribed while open (D13), from before the pull reads the remote,
         * so a move that lands after it is a wake-up rather than a miss. The
         * subscription ignores a repeat for the remote it already watches. */
        enq.sendTo('remoteMoves', { type: 'watch', remote: context.remote ?? '' });
        return {
          context: {
            withinPullWindow: true,
            recordQueueDirty: false,
            pendingFetch: false,
            leaseSettled: false,
            arrived: undefined,
          },
        };
      },
      exit: () => ({ context: { withinPullWindow: false } }),
      after: {
        pullRenderWindow: { context: { withinPullWindow: false } },
        pullDeadline: ({ context }, enq) => {
          const late = {
            error: 'The remote did not answer in time; this project will try again.',
            reason: 'offline',
          } satisfies SyncContextPatch;
          return { target: 'queued', context: { ...late, ...settlePush({ ...context, ...late }, enq, 'queued') } };
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
            onDone: ({ context, event }, enq) => {
              const remembered = rememberFetch(context, enq, event.output);
              switch (event.output.integration) {
                case 'fastForward': {
                  return { target: 'fastForwarding', context: remembered };
                }
                case 'diverged': {
                  return { target: 'merging', context: remembered };
                }
                default: {
                  return { target: 'done', context: remembered };
                }
              }
            },
            onError: ({ context, event }, enq) => pullFailed(context, enq, event.error),
          },
        },
        fastForwarding: {
          invoke: {
            src: 'fastForward',
            input: ({ context }) => ({ remote: context.remote ?? '', branch: context.branch }),
            onDone: ({ context, event }, enq) => {
              if (event.output !== undefined && 'hold' in event.output) {
                return heldAt(event.output);
              }
              reportFastForward(context, enq, event.output);
              return { target: 'done' };
            },
            onError: ({ context, event }, enq) => pullFailed(context, enq, event.error),
          },
        },
        /** A dirty or diverged checkout merges by the ordinary rules (A2/A22). */
        merging: {
          invoke: {
            src: 'merge',
            input: ({ context }) => ({ remote: context.remote ?? '', branch: context.branch }),
            onDone: ({ context, event }, enq) => {
              if (event.output.status === 'held') {
                return heldAt(event.output);
              }
              if (event.output.status === 'merged') {
                /* The merge moved the checkout's head: its actor re-heads, or
                 * its next cut would lose the compare-and-swap (D3). The merge
                 * revision is this device's own and unsent, so the pull's exit
                 * pushes it (D12: two devices converge without a person). */
                reportFastForward(context, enq, event.output.moved);
                return { target: 'done', context: { pendingMint: true } };
              }
              const conflict = {
                conflictRef: `refs/heads/${event.output.branch}`,
                error: 'The remote and this device changed the same files.',
              };
              if (context.parentRef !== undefined) {
                enq.sendTo(context.parentRef, {
                  type: 'mergeConflicted',
                  branch: event.output.branch,
                  into: event.output.into,
                  paths: event.output.paths,
                });
              }
              return {
                target: '#sync.conflicted',
                context: { ...conflict, ...settlePush({ ...context, ...conflict }, enq, 'conflicted') },
              };
            },
            onError: ({ context, event }, enq) => pullFailed(context, enq, event.error),
          },
        },
        done: { type: 'final' },
      },
      onDone: ({ context, guards }) => {
        /* The queue first, before anything else this open does (D28). */
        if (guards.hasPushPending(context)) {
          return { target: 'pushing' };
        }
        /* Then anything minted while the pull was running — including a `close`
         * cut on a project opened and shut inside one window — and a correlated
         * request, which is a push by definition: settling in `backedUp` would
         * answer it never (L2-F3). */
        if (context.pendingMint || context.pushId !== undefined) {
          return { target: 'pushing' };
        }
        /* Then the case an empty queue cannot express: the pull found this
         * device holding revisions the remote does not have (C15). Nothing was
         * minted and nothing is queued, and the machine used to read that as
         * `backedUp` and push nothing — a *Backed up* row over work that has
         * never left the device. */
        if (context.ahead) {
          return { target: 'pushing' };
        }
        /* Record failures are durable work of their own; writing their queue
         * cannot block the history integration that just completed. */
        if (guards.hasRecordResults(context)) {
          return { target: 'recording' };
        }
        return { target: 'backedUp' };
      },
    },

    backedUp: {
      entry: () => ({
        context: {
          attempt: 0,
          retryAfterMilliseconds: undefined,
          failure: 'none',
          error: undefined,
          reason: undefined,
          conflictRef: undefined,
          mintRepulled: false,
        },
      }),
      /* A revision minted *during* the push that is settling here was built
       * after that push was, so it is still unsent: it goes through `pending`,
       * not straight to `pushing`, so the debounce still coalesces (review 2
       * R4). Without this the row said `Backed up` over an unsent revision.
       *
       * Unless it was a `close` or `hidden` cut, which is the one trigger that
       * cannot afford a window: the document is unloading (C17). */
      always: ({ context }) => {
        if (context.pendingFlush) {
          return { target: 'pushing' };
        }
        /* A remote move that landed while busy: pull, and the pull pushes any
         * remembered mint after it (D13). */
        if (context.pendingFetch) {
          return { target: 'opening' };
        }
        return context.pendingMint ? { target: 'pending' } : undefined;
      },
      on: {
        remoteMoved: { target: 'opening' },
        revisionMinted: ({ context, event }) => ({
          target: flushesNow(event.trigger) ? 'pushing' : 'pending',
          context: rememberHead(context, event),
        }),
        syncNow: { target: 'pushing', context: ({ event }) => ({ pushId: event.pushId }) },
        close: { target: 'pushing' },
        remoteConnected: { target: 'opening', context: ({ event }) => ({ remote: event.remote }) },
      },
    },

    /** D28's 2 s. Re-entered by every later revision, which is the coalescing. */
    pending: {
      /* The burst's ceiling: this state is entered once per burst, so its timer
       * runs from the first mint however often the window below restarts. */
      after: { syncMaxWait: { target: 'pushing' } },
      on: {
        /* Pull first: the remembered mint is pushed by the pull's own exit, under the lease it takes. */
        remoteMoved: { target: 'opening' },
        syncNow: { target: 'pushing', context: ({ event }) => ({ pushId: event.pushId }) },
        close: { target: 'pushing' },
      },
      initial: 'debouncing',
      states: {
        debouncing: {
          after: { syncDebounce: { target: '#sync.pushing' } },
          on: {
            revisionMinted: ({ context, event }) =>
              flushesNow(event.trigger)
                ? { target: '#sync.pushing', context: rememberHead(context, event) }
                : /* An external self-transition of the window alone, so the
                   * debounce restarts and the ceiling does not: three saves in a
                   * second are one push, and a steady stream still pushes. */
                  { target: 'debouncing', reenter: true, context: rememberHead(context, event) },
          },
        },
      },
    },

    pushing: {
      entry: () => ({ context: { pendingMint: false, pendingFlush: false, ahead: false } }),
      /* Every way out, as `recording`: the root `open` re-enters `opening` and
       * never passes through `recording` (RV-W15). The exit patch clears the
       * request before `noRemote`'s entry reads it, so it is raised once. */
      exit: ({ context }, enq) => ({ context: redeliverPush(context, enq) }),
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
        onDone: ({ context, event }, enq) => {
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
            remote: context.remote,
            now,
          });
          const refusedHistory = event.output.refs.find(
            (entry) => entry.status === 'rejected' && entry.name === historyRefOf(context.branch),
          );
          /* The over-quota list is `remote.machine`'s, always (P19, A40): the
           * scheduler forwards it through the parent and keeps no copy. */
          if ((event.output.overQuota ?? []).length > 0 && context.parentRef !== undefined) {
            enq.sendTo(context.parentRef, {
              type: 'remote',
              event: {
                type: 'quotaRefused',
                paths: event.output.overQuota ?? [],
                ...(event.output.quotaStorage === undefined ? {} : { storage: event.output.quotaStorage }),
              },
            });
          }
          /* F9: bytes reached the remote, so its stored figure is stale. */
          if (event.output.refs.some((entry) => entry.status === 'updated') && context.parentRef !== undefined) {
            enq.sendTo(context.parentRef, { type: 'remote', event: { type: 'pushed' } });
          }
          return {
            target: 'recording',
            context: {
              leases,
              pending,
              failure: pending.length > 0 ? 'retry' : 'none',
              attempt: pending.length > 0 ? context.attempt + 1 : 0,
              retryAfterMilliseconds: undefined,
              conflictRef: refusedHistory === undefined ? undefined : refusedHistory.name,
              error: refusalSaid(refusedHistory?.reason ?? (pending.length > 0 ? pending[0]?.reason : undefined)),
              /* D20's ceiling and D17's plan quota arrive here as per-ref results
                 rather than as a thrown transport error, and each is a quota answer:
                 *Sync now* replays the same bytes and cannot clear a ceiling
                 (W10 defect 4). Recognised by the same predicate the native
                 leg uses; every other refusal stays `rejected`, and the
                 remote's own sentence and file list are untouched either way. */
              reason:
                pending.length > 0
                  ? pending.some((entry) => isStorageRefusal(entry.reason))
                    ? 'quota'
                    : 'rejected'
                  : undefined,
            },
          };
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
          context: ({ context, event }) => ({
            failure: isFatal(event.error) ? 'fatal' : 'retry',
            /* A rate limit is the remote pacing this host, not this host
             * failing: it waits the remote's wait and keeps its doubling (W13d). */
            attempt: retryAfterOf(event.error) === undefined ? context.attempt + 1 : context.attempt,
            retryAfterMilliseconds: retryAfterOf(event.error),
            error: reason(event.error),
            reason: syncFailureReason(event.error),
            pending: nextPending({
              pending: context.pending,
              outcomes: throwFailures(context, reason(event.error)),
              leases: context.leases,
              remote: context.remote,
              now: Date.now(),
            }),
          }),
        },
      },
      on: {
        /* A revision minted mid-push is not lost: the push that is running was
         * built before it, so another one follows on the ordinary debounce. */
        revisionMinted: { context: ({ context, event }) => rememberHead(context, event) },
        syncNow: deferPush,
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
      /* Every way out, so a deferred request is never stranded here. */
      exit: ({ context }, enq) => ({ context: redeliverPush(context, enq) }),
      on: { syncNow: deferPush },
      invoke: {
        src: 'writePending',
        input: ({ context }) => ({
          projectId: context.projectId,
          record: { version: 1, entries: context.pending },
        }),
        /*
         * There is deliberately no "a history ref was refused, so pull again"
         * arm here (C3a). It sent every non-divergence refusal — a
         * `pre-receive` decline, an allow-list refusal, a protected branch —
         * straight to `opening`, whose fetch answers `upToDate` for all of
         * them, and `opening.onDone` then went straight back to `pushing`:
         * an unbounded fetch↔push cycle that never touched `queued`'s
         * backoff, measured at 25 network rounds in 90 ms and able to starve
         * the worker it runs in. `failure` is already `'retry'` on that
         * settle, so the `queued` arm below takes it, and `queued`'s
         * `after: syncBackoff → opening` performs the same pull *with* the
         * backoff. A genuine divergence still arrives through `merging`.
         */
        onDone: ({ context }, enq) => {
          if (context.failure === 'fatal') {
            return { target: 'failed', context: settlePush(context, enq, 'failed') };
          }
          if (context.failure === 'retry') {
            return { target: 'queued', context: settlePush(context, enq, 'queued') };
          }
          return { target: 'backedUp', context: settlePush(context, enq, 'backedUp') };
        },
        /* A queue that cannot be written is the one failure this machine cannot
         * retry its way out of: nothing would remember what is owed. */
        onError: ({ context, event }, enq) => {
          const failure = { error: reason(event.error), reason: 'unknown' } satisfies SyncContextPatch;
          return {
            target: 'failed',
            context: { ...failure, ...settlePush({ ...context, ...failure }, enq, 'failed') },
          };
        },
      },
    },

    /** `Not backed up · n`, and this host will try again on its own. */
    queued: {
      /* A `close` or `hidden` cut remembered while the pull or the push was
       * running flushes as soon as there is a state that can push: the document
       * is unloading and a backoff is time it does not have. Every entry into
       * `queued` passes through here, including the pull's own failure edges —
       * which is what stops an offline close from being dropped by the open that
       * preceded it. Any other remembered mint waits out the backoff like the
       * work already queued (policy rule 19, L2-F6): the backoff's `opening`
       * pushes it once the pull lands. */
      always: ({ context }) =>
        context.pendingFlush
          ? { target: 'pushing' }
          : /* The remote moved: that is news the backoff was waiting for — unless
             * the remote itself asked for the wait (W13d). */
            context.pendingFetch && context.online && context.retryAfterMilliseconds === undefined
            ? { target: 'opening' }
            : undefined,
      after: {
        syncBackoff: ({ context, guards }) => (guards.isOnline(context) ? { target: 'opening' } : undefined),
      },
      on: {
        remoteMoved: ({ context }) =>
          context.online && context.retryAfterMilliseconds === undefined
            ? { target: 'opening' }
            : { context: { pendingFetch: true } },
        /* The patch is here as well as at the root because a state's own
         * handler is the one that runs: without it `opening` would read the
         * stale `online` and bounce straight back. */
        online: { target: 'opening', context: { online: true } },
        /* Only the unloading triggers pre-empt the backoff; the root remembers
         * every other mint for the retry that is already scheduled. */
        revisionMinted: ({ context, event }) =>
          flushesNow(event.trigger) ? { target: 'pushing', context: rememberHead(context, event) } : undefined,
        syncNow: { target: 'opening', context: ({ event }) => ({ pushId: event.pushId }) },
        close: { target: 'pushing' },
        remoteConnected: { target: 'opening', context: ({ event }) => ({ remote: event.remote }) },
      },
    },

    /**
     * A dirty checkout is minted before anything integrates into it (D12, rule 6).
     *
     * The checkout actor is the only minter, so this asks the root for a
     * `merge` cut and waits for the answer to that request; then the pull runs
     * again and composes a clean checkout. The pull's own deadline bounds the
     * wait, because a close waits on this machine (rule 9).
     */
    minting: {
      entry: ({ context }, enq) => {
        const cutCount = context.cutCount + 1;
        const requestId = `sync-${String(cutCount)}`;
        if (context.parentRef === undefined) {
          enq.raise({
            type: 'cutFailed',
            checkoutId: context.heldCheckoutId,
            trigger: 'merge',
            requestId,
            reason: 'This project has no checkout to record these files with.',
          });
        } else {
          enq.sendTo(context.parentRef, {
            type: 'cut',
            trigger: 'merge',
            checkoutId: context.heldCheckoutId,
            leaseIds: [],
            requestId,
          });
        }
        return { context: { cutCount, requestId } };
      },
      after: {
        pullDeadline: ({ context }, enq) =>
          mintRefused(
            context,
            enq,
            'Your changes could not be saved before synchronizing; this project will try again.',
          ),
      },
      on: {
        revisionMinted: ({ context, event }) =>
          answersOurCut(context, event)
            ? { target: 'opening', context: rememberHead(context, event) }
            : { context: rememberHead(context, event) },
        /* Clean by the time the cut ran: the pull integrates as it is — once.
         * A second disagreement between the hold and the cut waits out the
         * backoff (RV-W5b F2). */
        nothingToSave: ({ context, event }, enq) => {
          if (!answersOurCut(context, event)) {
            return undefined;
          }
          return context.mintRepulled
            ? mintRefused(
                context,
                enq,
                'Your changes could not be saved before synchronizing; this project will try again.',
              )
            : { target: 'opening', context: { mintRepulled: true } };
        },
        cutFailed: ({ context, event }, enq) =>
          answersOurCut(context, event) ? mintRefused(context, enq, event.reason) : undefined,
        casLost: ({ context, event }, enq) =>
          answersOurCut(context, event)
            ? mintRefused(context, enq, 'Another writer moved this branch first; this project will try again.')
            : undefined,
      },
    },

    /**
     * A leased checkout is never re-based (rule 9): the fetched head waits here,
     * shown as arrived, until the lease retires.
     *
     * Parked, not backing off: no timer re-fetches, and the lease's own
     * retirement is what applies it. A retirement that landed while the pull was
     * still deciding is not lost (`leaseSettled`).
     */
    awaitingLease: {
      always: ({ context }) => (context.leaseSettled ? { target: 'opening' } : undefined),
      entry: ({ context }, enq) => ({ context: settlePush(context, enq, 'queued') }),
      on: {
        leaseRetired: { target: 'opening' },
        /* Remembered, not dropped (RV-W5b F7): whichever way the park ends —
         * the lease, a close's push, a keepalive's acknowledgement — the state
         * that settles pulls again. */
        remoteMoved: { context: { pendingFetch: true } },
        /* Pushing now would be refused: the remote moved past this device. */
        syncNow: ({ context, event }, enq) => ({
          context: settlePush({ ...context, pushId: event.pushId ?? context.pushId }, enq, 'queued'),
        }),
        /* An unloading document still records what it owes (C17). */
        revisionMinted: ({ context, event }) =>
          flushesNow(event.trigger)
            ? { target: 'pushing', context: rememberHead(context, event) }
            : { context: rememberHead(context, event) },
        close: { target: 'pushing' },
        open: { target: 'opening' },
        remoteConnected: { target: 'opening', context: ({ event }) => ({ remote: event.remote }) },
      },
    },

    /**
     * The remote moved under this host's lease (P18, A22).
     *
     * Not a failure and not a retry: history is the one thing a scheduler must
     * never force. `Needs your decision` stands until a person lands the
     * decision — here, or on another device, which a remote move brings in —
     * and every way out of here pulls first.
     *
     * The decision itself travels (D14): the conflict line is offered alone on
     * entry, because the line it decides has diverged and would sink it in the
     * atomic set. A line the remote refused is offered again by the next pull,
     * which reaches the same conflict.
     */
    conflicted: {
      entry: ({ context }, enq) => {
        enq.emit({
          type: 'syncConflict',
          ref: context.conflictRef ?? historyRefOf(context.branch),
          reason: context.error ?? 'The remote has work this device has not seen.',
        });
      },
      invoke: {
        src: 'push',
        input: ({ context }) => ({
          remote: context.remote ?? '',
          branch: context.branch,
          leases: context.leases,
          refs: [context.conflictRef ?? historyRefOf(context.branch)],
        }),
        onDone: ({ context, event }) => ({
          context: {
            leases: {
              ...context.leases,
              ...Object.fromEntries(
                event.output.refs.flatMap((entry) =>
                  entry.status === 'rejected' || entry.head === undefined ? [] : [[entry.name, entry.head]],
                ),
              ),
            },
          },
        }),
        /* Offline, or refused: the card is still here, and the next pull offers it again. */
        onError: {},
      },
      on: {
        remoteMoved: { target: 'opening' },
        syncNow: { target: 'opening', context: ({ event }) => ({ pushId: event.pushId }) },
        online: { target: 'opening', context: { online: true } },
        remoteConnected: { target: 'opening', context: ({ event }) => ({ remote: event.remote }) },
        /* Composed, so pull again: the resolution minted a revision on this
         * branch and whether the remote takes it is the remote's answer, not
         * something this machine can assume (review 2 R6, S33). */
        conflictResolved: ({ context, event }) =>
          event.ref === undefined || event.ref === context.conflictRef || event.ref === historyRefOf(context.branch)
            ? {
                target: 'opening',
                context: {
                  conflictRef: undefined,
                  error: undefined,
                  /* The composed revision is this device's head now, and it is
                   * unsent: the pull that follows leaves `opening` by
                   * `pendingMint → pushing`, which offers it under the lease the
                   * same pull just took (P18, P44). */
                  localHead: event.revisionId ?? context.localHead,
                  pendingMint: true,
                },
              }
            : undefined,
      },
    },

    /**
     * Something a person has to act on — a credential, or a queue that will not write.
     *
     * A mint here is remembered by the root and pushed by the pull that *Sync
     * now* or a remote change starts; it never re-enters the push on its own,
     * or a refused project would retry on every save (policy rule 19, L2-F6).
     */
    failed: {
      on: {
        syncNow: { target: 'opening', context: ({ event }) => ({ pushId: event.pushId }) },
        remoteConnected: { target: 'opening', context: ({ event }) => ({ remote: event.remote }) },
      },
    },
  },
});

type SyncMachineDefinition = typeof syncMachineDefinition;

/**
 * The type of {@link syncMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface SyncMachine extends SyncMachineDefinition {}

/**
 * One project's push scheduler and retry queue.
 *
 * @public
 */
export const syncMachine: SyncMachine = syncMachineDefinition;

/** The actor set `syncMachine.provide` needs. @public */
export type SyncActors = MachineActors<typeof syncMachine>;

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
    case 'recording':
    case 'minting': {
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
  /* Only while parked: once the pull applies it, it is simply the head. */
  const arrived = value === 'awaitingLease' ? snapshot.context.arrived : undefined;
  return {
    /* Parked behind a lease, what this device owes is still owed (C12). */
    state:
      value === 'awaitingLease' && owedPushes(snapshot.context).length > 0
        ? 'queued'
        : facetStateOf(value, snapshot.context.withinPullWindow),
    /* `n` is what this device owes *this* remote (C12, C19). A `projection`
     * entry is a record the fetch could not restore **locally** — inbound work,
     * not work the remote is missing — and counting it made *Not backed up · 3*
     * out of a project that was fully backed up; the reason for it still
     * reaches the person through `error`. */
    pendingCount: owedPushes(snapshot.context).length,
    online: snapshot.context.online,
    conflictRef: snapshot.context.conflictRef,
    error: snapshot.context.error,
    reason: snapshot.context.reason,
    ...(arrived === undefined ? {} : { arrived }),
  };
};
