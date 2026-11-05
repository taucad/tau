/**
 * Cross-tab write coordinator using `navigator.locks` and `BroadcastChannel`.
 *
 * Provides shared/exclusive resource locks to prevent concurrent write
 * conflicts across browser tabs (D3), and publishes one `(tabId, seq)` notice
 * per committed changeset to sibling tabs via `BroadcastChannel` (I4).
 *
 * Progressive enhancement: no-op when `navigator.locks` is unavailable.
 */

import { z } from 'zod';
import { assertRootedPath, resolveAuthorityPath } from '@taucad/utils/path';
import { projectRoute } from '#project-routes.js';
import { workerTimings } from '#worker-timings.js';

const lockPrefix = 'tau-fs-write:';
const channelName = 'tau-fs-changes';

const canonicalAuthorityPathSchema = z.string().refine((value) => {
  try {
    return resolveAuthorityPath(value) === value;
  } catch {
    return false;
  }
});
const canonicalProviderPathSchema = z.string().refine((value) => {
  try {
    return assertRootedPath(value) === value;
  } catch {
    return false;
  }
});
const physicalAuthoritySchema = z.object({
  storageRootKey: z.string().min(1),
  providerBasePath: canonicalProviderPathSchema,
});
const changeNotificationSchema = z.object({
  type: z.enum(['write', 'mkdir', 'delete', 'rmdir', 'directory-change', 'project-unavailable']),
  path: canonicalAuthorityPathSchema,
  authority: physicalAuthoritySchema,
});
/** Most facts one notice carries; a changeset is bounded well below it (D2). */
const maximumNoticeChanges = 4096;
const changeNoticeSchema = z.object({
  tabId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  changes: z.array(changeNotificationSchema).min(1).max(maximumNoticeChanges),
});

/** Cloneable canonical physical authority identity. @public */
export type PhysicalAuthority = Readonly<z.infer<typeof physicalAuthoritySchema>>;

/** One cross-authority invalidation fact published to sibling tabs. @public */
export type ChangeNotification = Readonly<
  Omit<z.infer<typeof changeNotificationSchema>, 'authority'> & { authority: PhysicalAuthority }
>;

/**
 * Everything one committed changeset tells sibling tabs, posted once (I4).
 *
 * `seq` increases by one per notice from a tab, so a receiver can tell a gap
 * (a notice it never saw) from an ordinary successor.
 *
 * @public
 */
export type ChangeNotice = Readonly<{
  tabId: string;
  seq: number;
  changes: readonly ChangeNotification[];
  /** Set by the receiver when notices from this tab were lost before this one. */
  gap?: boolean;
}>;

/**
 * One Web Lock a mutation holds. A bare token string is exclusive.
 *
 * Ancestors are held `shared` and written paths `exclusive` (D3), so two saves
 * to unrelated paths of one project never wait on each other, while a
 * directory removal — exclusive on the directory's own token — still waits for
 * every write below it, which holds that token shared.
 *
 * @public
 */
export type LockClaim = Readonly<{ token: string; shared?: boolean }>;

/**
 * Merge claims on one token, exclusive winning, in the deterministic order
 * every acquirer uses.
 *
 * @param claims - Tokens or claims, in any order and with repeats.
 * @returns One claim per token, sorted by token.
 * @internal
 */
export const normalizeLockClaims = (claims: ReadonlyArray<string | LockClaim>): LockClaim[] => {
  const sharedByToken = new Map<string, boolean>();
  for (const claim of claims) {
    const { token, shared } = typeof claim === 'string' ? { token: claim, shared: false } : claim;
    sharedByToken.set(token, (sharedByToken.get(token) ?? true) && shared === true);
  }
  return [...sharedByToken.keys()]
    .sort()
    .map((token) => (sharedByToken.get(token) === true ? { token, shared: true } : { token }));
};

/**
 * Acquire the ordered mutation locks without owning a notification channel.
 *
 * Every request after the first is issued synchronously inside the previous
 * one's callback, so one call is one lock set however many tokens it holds.
 *
 * @param paths - Logical and physical resource tokens (exclusive) or claims.
 * @param operation - Body executed under all selected locks.
 * @returns The operation result, or its rejection.
 * @internal
 */
export const withCrossTabLocks = async <T>(
  paths: ReadonlyArray<string | LockClaim>,
  operation: () => Promise<T>,
): Promise<T> => {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    return operation();
  }
  const sorted = normalizeLockClaims(paths);
  workerTimings.count('locks.set');
  workerTimings.count('locks.token', sorted.length);
  const acquire = async (index: number): Promise<T> => {
    const claim = sorted[index];
    if (claim === undefined) {
      return operation();
    }
    return navigator.locks.request(
      `${lockPrefix}${claim.token}`,
      { mode: claim.shared === true ? 'shared' : 'exclusive' },
      async () => acquire(index + 1),
    );
  };
  return acquire(0);
};

/** Acquire browser authority locks, refusing when the platform cannot provide exclusion. @internal */
export const withRequiredCrossTabLocks = async <T>(
  paths: ReadonlyArray<string | LockClaim>,
  operation: () => Promise<T>,
): Promise<T> => {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    throw Object.assign(new Error('Checked filesystem writes require navigator.locks or a provider authority.'), {
      code: 'CHECKED_WRITE_UNSUPPORTED',
      applicationState: 'known-not-applied',
      metadata: { applicationState: 'known-not-applied' },
    });
  }
  return withCrossTabLocks(paths, operation);
};

/**
 * Coordinates filesystem writes across browser tabs.
 *
 * - Uses `navigator.locks` for supplied logical/physical resource serialization
 * - Uses `BroadcastChannel` to notify other tabs of committed changesets
 * - Progressive enhancement: executes operations directly when locks unavailable
 *
 * @public
 */
export class CrossTabCoordinator {
  private _channel: BroadcastChannel | undefined;
  private _changeHandler: ((notice: ChangeNotice) => void) | undefined;
  private readonly _tabId = crypto.randomUUID();
  private _seq = 0;
  /** Last sequence number seen from each sibling tab. */
  private readonly _lastSeen = new Map<string, number>();

  public constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this._channel = new BroadcastChannel(channelName);
    }
  }

  /**
   * Run a mutation under sorted locks and publish only after success.
   *
   * @param paths - Logical and physical lock tokens or claims.
   * @param notification - Invalidation published after the operation succeeds.
   * @param operation - Mutation body.
   * @returns The mutation result.
   */
  public async withMutationLocks<T>(
    paths: ReadonlyArray<string | LockClaim>,
    notification: ChangeNotification,
    operation: () => Promise<T>,
  ): Promise<T> {
    const run = async (): Promise<T> => {
      const result = await operation();
      this.notifyMutation(notification);
      return result;
    };
    return this.withLocks(paths, run);
  }

  /**
   * Execute an authority operation under supplied locks without implying mutation.
   *
   * @param paths - Lock tokens (exclusive) or claims to acquire in deterministic order.
   * @param operation - Operation body.
   * @returns The operation result.
   */
  public async withLocks<T>(paths: ReadonlyArray<string | LockClaim>, operation: () => Promise<T>): Promise<T> {
    return withCrossTabLocks(paths, operation);
  }

  /** Execute under required cross-tab exclusion, failing closed when unavailable. */
  public async withRequiredLocks<T>(
    paths: ReadonlyArray<string | LockClaim>,
    operation: () => Promise<T>,
  ): Promise<T> {
    return withRequiredCrossTabLocks(paths, operation);
  }

  /**
   * Listen for change notices from other tabs.
   *
   * A notice whose `seq` skips one from the same tab means a notice was lost;
   * it arrives marked `gap`, so the receiver resets the authorities it names
   * instead of trusting what it holds.
   *
   * @param handler - Called once per sibling notice.
   */
  public onRemoteChange(handler: (notice: ChangeNotice) => void): void {
    this._changeHandler = handler;

    if (this._channel) {
      this._channel.addEventListener('message', (event: MessageEvent<unknown>) => {
        const result = changeNoticeSchema.safeParse(event.data);
        if (!result.success) {
          console.warn('[CrossTabCoordinator] Dropped invalid change notice.');
          return;
        }
        this._changeHandler?.(this._withGapReset(result.data));
      });
    }
  }

  /**
   * Publish every fact one committed changeset produced, as one notice.
   *
   * @param changes - The changeset's facts, in entry order.
   */
  public notifyChanges(changes: readonly ChangeNotification[]): void {
    for (let start = 0; start < changes.length; start += maximumNoticeChanges) {
      this._seq += 1;
      const notice: ChangeNotice = {
        tabId: this._tabId,
        seq: this._seq,
        changes: changes.slice(start, start + maximumNoticeChanges),
      };
      try {
        this._channel?.postMessage(notice);
      } catch {
        // Channel may be closed; safe to ignore
      }
    }
  }

  /** Publish one already-committed mutation to sibling tabs. */
  public notifyMutation(notification: ChangeNotification): void {
    this.notifyChanges([notification]);
  }

  /**
   * Notify sibling tabs before a project route becomes unavailable.
   *
   * @param projectId - Logical project identity being revoked.
   * @param authority - Canonical physical provider and base-path identity.
   */
  public notifyProjectUnavailable(projectId: string, authority: PhysicalAuthority): void {
    this.notifyChanges([{ type: 'project-unavailable', path: projectRoute(projectId), authority }]);
  }

  /**
   * Invalidate one directory and all descendants in sibling tabs.
   *
   * @param path - Logical directory path.
   * @param authority - Canonical physical provider and base-path identity.
   */
  public notifyDirectoryChange(path: string, authority: PhysicalAuthority): void {
    this.notifyChanges([{ type: 'directory-change', path, authority }]);
  }

  /** Release resources. */
  public dispose(): void {
    this._channel?.close();
    this._channel = undefined;
    this._changeHandler = undefined;
  }

  /**
   * Mark a notice that follows a gap, so the receiver resets the authorities it names.
   *
   * @param notice - A validated sibling notice.
   * @returns The notice to deliver.
   */
  private _withGapReset(notice: ChangeNotice): ChangeNotice {
    const last = this._lastSeen.get(notice.tabId);
    this._lastSeen.set(notice.tabId, notice.seq);
    return last === undefined || notice.seq <= last + 1 ? notice : { ...notice, gap: true };
  }
}
