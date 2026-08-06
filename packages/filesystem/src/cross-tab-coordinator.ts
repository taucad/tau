/**
 * Cross-tab write coordinator using `navigator.locks` and `BroadcastChannel`.
 *
 * Provides exclusive resource locks to prevent concurrent write conflicts
 * across browser tabs. Notifies other tabs of mutations via `BroadcastChannel`.
 *
 * Progressive enhancement: no-op when `navigator.locks` is unavailable.
 */

const lockPrefix = 'tau-fs-write:';
const channelName = 'tau-fs-changes';

/** Cloneable canonical physical authority identity. @public */
export type PhysicalAuthority = {
  readonly storageRootKey: string;
  readonly providerBasePath: string;
};

/** Cross-authority invalidation published to sibling tabs. @public */
export type ChangeNotification =
  | {
      readonly type: 'write' | 'mkdir' | 'delete' | 'rmdir' | 'directory-change';
      readonly path: string;
      readonly authority: PhysicalAuthority;
    }
  | {
      readonly type: 'project-unavailable';
      readonly path: string;
      readonly authority: PhysicalAuthority;
    };

/**
 * Coordinates filesystem writes across browser tabs.
 *
 * - Uses `navigator.locks` for supplied logical/physical resource serialization
 * - Uses `BroadcastChannel` to notify other tabs of mutations
 * - Progressive enhancement: executes operations directly when locks unavailable
 *
 * @public
 */
export class CrossTabCoordinator {
  private _channel: BroadcastChannel | undefined;
  private _changeHandler: ((notification: ChangeNotification) => void) | undefined;

  public constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this._channel = new BroadcastChannel(channelName);
    }
  }

  /**
   * Run a mutation under sorted exclusive locks and publish only after success.
   *
   * @param paths - Logical and physical lock tokens.
   * @param notification - Invalidation published after the operation succeeds.
   * @param operation - Mutation body.
   * @returns The mutation result.
   */
  public async withMutationLocks<T>(
    paths: readonly string[],
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
   * @param paths - Lock tokens to acquire in deterministic order.
   * @param operation - Operation body.
   * @returns The operation result.
   */
  public async withLocks<T>(paths: readonly string[], operation: () => Promise<T>): Promise<T> {
    if (typeof navigator === 'undefined' || !('locks' in navigator)) {
      return operation();
    }

    const sortedPaths = [...new Set(paths)].sort();
    const acquire = async (index: number): Promise<T> => {
      const path = sortedPaths[index];
      if (path === undefined) {
        return operation();
      }
      return navigator.locks.request(`${lockPrefix}${path}`, { mode: 'exclusive' }, async () => acquire(index + 1));
    };
    return acquire(0);
  }

  /**
   * Listen for change notifications from other tabs.
   *
   * @param handler - Called when another tab mutates a file.
   */
  public onRemoteChange(handler: (notification: ChangeNotification) => void): void {
    this._changeHandler = handler;

    if (this._channel) {
      this._channel.addEventListener('message', (event: MessageEvent<ChangeNotification>) => {
        this._changeHandler?.(event.data);
      });
    }
  }

  /** Publish one already-committed mutation to sibling tabs. */
  public notifyMutation(notification: ChangeNotification): void {
    this._postChangeNotification(notification);
  }

  /**
   * Notify sibling tabs before a project route becomes unavailable.
   *
   * @param projectId - Logical project identity being revoked.
   */
  public notifyProjectUnavailable(projectId: string, authority: PhysicalAuthority): void {
    this._postChangeNotification({
      type: 'project-unavailable',
      path: `/projects/${projectId}`,
      authority,
    });
  }

  /**
   * Invalidate one directory and all descendants in sibling tabs.
   *
   * @param path - Logical directory path.
   * @param authority - Canonical physical provider and base-path identity.
   */
  public notifyDirectoryChange(path: string, authority: PhysicalAuthority): void {
    this._postChangeNotification({
      type: 'directory-change',
      path,
      authority,
    });
  }

  /** Release resources. */
  public dispose(): void {
    this._channel?.close();
    this._channel = undefined;
    this._changeHandler = undefined;
  }

  private _postChangeNotification(notification: ChangeNotification): void {
    try {
      this._channel?.postMessage(notification);
    } catch {
      // Channel may be closed; safe to ignore
    }
  }
}
