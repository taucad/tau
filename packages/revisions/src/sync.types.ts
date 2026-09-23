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
 * `.git/sync-pending` and is the whole of what "retried on the next
 * open" reads.
 *
 * @public
 */
export type SyncQueueEntry = Readonly<{
  ref: string;
  /** The retry this entry represents. Missing means a push from an older record. */
  operation?: 'push' | 'projection';
  /**
   * The remote this entry is owed to (policy Rule 9).
   *
   * Without it a queue recorded against one destination was drained against
   * whichever one happened to be configured next — the integration suite
   * asserted exactly that — so a disconnect had to *erase* the record to be
   * safe. With it the old destination's queue is simply *paused*: the entries
   * stay on disk and are not offered to anybody else. Missing means a record
   * written before the field existed, which is offered to the current remote
   * because that is what it was always offered to.
   */
  remote?: string;
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

/** The durable queue as the record spells it (`.git/sync-pending`). @public */
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
  /**
   * What class of failure that was, or `undefined` while nothing has failed.
   *
   * Set for every `failed` and `queued` state, beside `error` and from the same
   * rejection, so a surface never has to read the sentence to choose an action.
   */
  reason: SyncFailureReason | undefined;
}>;

/** How one correlated push ended, for the sibling that asked (`publish`). @public */
export type SyncPushOutcome = 'backedUp' | 'queued' | 'conflicted' | 'failed';

/** How one offered ref ended, in the port's own three outcomes. @public */
export type SyncRefStatus = 'updated' | 'upToDate' | 'rejected';

/**
 * Which class of refusal left this project un-backed-up (N2, N3).
 *
 * The facet's machine-readable half: `error` is the sentence a surface renders
 * and this is what decides the *one* action beside it — *Sign in*, *Upgrade*,
 * *Reconnect*, *Open Revisions*, *Sync now* or *Retry*. A surface that parsed
 * the sentence instead would break the first time a server reworded one.
 *
 * @public
 */
export type SyncFailureReason =
  | 'unauthorized'
  | 'notEntitled'
  | 'forbidden'
  | 'notFound'
  | 'quota'
  | 'rejected'
  | 'offline'
  | 'unknown';
