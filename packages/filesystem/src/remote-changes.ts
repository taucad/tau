/**
 * Cross-tab remote-change application: the one place a fact another tab
 * published becomes local state (charter D13, D14).
 *
 * Extracted from `WorkspaceFileService`. A peer's notification names
 * a physical authority, not a logical path this authority still routes, so
 * every fact is checked against the live mount table before it invalidates a
 * derivative or emits an event, and the whole sequence runs in arrival order on
 * one tail. One sibling changeset arrives as one notice; its facts cost one
 * refresh scoped to the paths they name and one change event per storage root,
 * and evict only the derivatives those paths feed. A refresh that fails, or a
 * notice that follows a lost one, turns into one reset rather than a lost fact.
 *
 * @module
 */

import type { FileSystemBackend } from '@taucad/types';
import type { SharedPool } from '@taucad/memory';
import type { FileSystemProvider, PathChangeEvent } from '#types.js';
import type { MountEntry, MountResolution, MountTable } from '#mount-table.js';
import type { ChangeNotice, ChangeNotification, PhysicalAuthority } from '#cross-tab-coordinator.js';
import type { MutationPipeline } from '#mutation-pipeline.js';
import type { ProviderRegistry } from '#provider-registry.js';
import type { ResolvedDiscoveryRoot } from '#project-directories.js';
import type { ProjectIndexes } from '#project-index/project-indexes.js';
import type { WatchRegistry } from '#watch-registry.js';

/**
 * The local event one peer mutation notification stands for.
 *
 * @param notification - A peer notification naming one mutated path.
 * @param backend - Backend of the mount that still projects the path.
 * @returns The equivalent change event.
 */
const remoteChangeEvent = (
  notification: Exclude<ChangeNotification, { type: 'project-unavailable' | 'directory-change' }>,
  backend: FileSystemBackend,
): PathChangeEvent => {
  const { path } = notification;
  switch (notification.type) {
    case 'write': {
      return { type: 'fileWritten', path, backend };
    }
    case 'mkdir': {
      return { type: 'directoryCreated', path, backend };
    }
    case 'delete': {
      return { type: 'fileDeleted', path, backend };
    }
    default: {
      return { type: 'directoryDeleted', path, backend };
    }
  }
};

/**
 * The authority's cross-tab receive arm.
 *
 * @public
 */
export class RemoteChanges {
  private readonly _registry: ProviderRegistry;
  private readonly _mountTable: MountTable;
  private readonly _pipeline: MutationPipeline;
  private readonly _projectIndexes: ProjectIndexes;
  private readonly _watchRegistry: WatchRegistry;
  /** Read through a function: the writer-side pool arrives after construction. */
  private readonly _filePool: () => SharedPool | undefined;
  /** Read through a function: the authority replaces the array on every topology pass. */
  private readonly _discoveryRoots: () => readonly ResolvedDiscoveryRoot[];
  private readonly _revokeProjectRoute: (path: string, notifyPeers: boolean) => void;
  private _remoteChangeTail: Promise<void> = Promise.resolve();

  /**
   * Create the receive arm over the authority's own collaborators.
   *
   * @param options - The registry, mount table, mutation pipeline, per-root indexes, watch registry, pool accessor, discovery-root accessor and route revoker the authority owns.
   */
  public constructor(options: {
    registry: ProviderRegistry;
    mountTable: MountTable;
    pipeline: MutationPipeline;
    projectIndexes: ProjectIndexes;
    watchRegistry: WatchRegistry;
    filePool: () => SharedPool | undefined;
    discoveryRoots: () => readonly ResolvedDiscoveryRoot[];
    revokeProjectRoute: (path: string, notifyPeers: boolean) => void;
  }) {
    this._registry = options.registry;
    this._mountTable = options.mountTable;
    this._pipeline = options.pipeline;
    this._projectIndexes = options.projectIndexes;
    this._watchRegistry = options.watchRegistry;
    this._filePool = options.filePool;
    this._discoveryRoots = options.discoveryRoots;
    this._revokeProjectRoute = options.revokeProjectRoute;
  }

  /**
   * Apply one peer notice behind every earlier one. A rejected predecessor
   * never strands a later notice, and a rejected application resets instead.
   *
   * @param notice - Every fact one sibling changeset published.
   */
  public apply(notice: ChangeNotice): void {
    const predecessor = this._remoteChangeTail;
    const applyInOrder = async (): Promise<void> => {
      try {
        await predecessor;
        await this._applyNotice(notice);
      } catch {
        for (const notification of notice.changes) {
          this._handleRemoteFailure(notification);
        }
      }
    };
    this._remoteChangeTail = applyInOrder();
  }

  /**
   * Apply one peer notice, in arrival order: revoked projects first, then each
   * storage root's facts with one scoped refresh and one change event (I4).
   *
   * @param notice - Every fact one sibling changeset published.
   */
  private async _applyNotice(notice: ChangeNotice): Promise<void> {
    this._projectIndexes.noteNotice(notice.tabId, notice.seq, notice.gap === true);
    const facts: Array<Exclude<ChangeNotification, { type: 'project-unavailable' }>> = [];
    for (const notification of notice.changes) {
      if (notification.type === 'project-unavailable') {
        this._applyProjectUnavailable(notification);
      } else {
        facts.push(notification);
      }
    }
    if (notice.gap === true) {
      await this._resetEveryStorageRoot(facts);
      return;
    }
    const byStorageRoot = Map.groupBy(facts, ({ authority }) => authority.storageRootKey);
    for (const group of byStorageRoot.values()) {
      // oxlint-disable-next-line no-await-in-loop -- storage roots apply in arrival order on the one tail.
      await this._applyRemoteFacts(group);
    }
  }

  private _applyProjectUnavailable(notification: ChangeNotification): void {
    const current = this._mountTable.getExactMount(notification.path);
    if (
      current?.storageRootKey !== notification.authority.storageRootKey ||
      current.providerBasePath !== notification.authority.providerBasePath
    ) {
      return;
    }
    this._revokeProjectRoute(notification.path, false);
  }

  /**
   * After a lost notice, nothing this authority holds is trustworthy: the lost
   * notice could have named any storage root, so the facts that did arrive
   * bound nothing. Refresh every storage root this authority owns, drop its
   * projections whole, and say so once per backend — even when the notice that
   * revealed the gap carried only revoked projects.
   *
   * @param facts - The arriving notice's path facts, whose roots are reset too.
   */
  private async _resetEveryStorageRoot(
    facts: ReadonlyArray<Exclude<ChangeNotification, { type: 'project-unavailable' }>>,
  ): Promise<void> {
    const owned = this._registry.ownedStorageRootKeys();
    await Promise.all(
      owned.map(async (storageRootKey) => {
        try {
          const provider = await this._registry.getOwnedProvider(storageRootKey);
          await provider?.refresh?.();
        } catch {
          // The reset below is the answer to a refresh that failed as well.
        }
      }),
    );
    const backends = new Set<FileSystemBackend>([
      ...this._mountTable.listMounts().flatMap((mount) => (mount.storageRootKey === undefined ? [] : [mount.backend])),
      ...owned.map((storageRootKey) => this._backendForPhysicalAuthority({ storageRootKey, providerBasePath: '' })),
      ...facts.map(({ authority }) => this._backendForPhysicalAuthority(authority)),
    ]);
    this._filePool()?.clear();
    this._treeIndexes.clear();
    if (backends.size === 0) {
      this._watchRegistry.emitResetAll();
    }
    for (const backend of backends) {
      this._pipeline.emitChangeEvent({ type: 'backendChanged', backend });
    }
  }

  /**
   * Apply one storage root's facts against the projection this authority still
   * routes: one refresh scoped to the paths they name, path-scoped invalidation,
   * and one change event for the lot.
   *
   * @param facts - The notice's facts on one storage root, in entry order.
   */
  private async _applyRemoteFacts(
    facts: ReadonlyArray<Exclude<ChangeNotification, { type: 'project-unavailable' }>>,
  ): Promise<void> {
    const [first] = facts;
    if (first === undefined) {
      return;
    }
    const { storageRootKey } = first.authority;
    const pendingProvider = this._registry.getOwnedProvider(storageRootKey);
    if (pendingProvider === undefined) {
      return;
    }
    const provider = await pendingProvider;
    if (this._registry.getOwnedProvider(storageRootKey) !== pendingProvider) {
      return;
    }
    const routed = facts.flatMap((notification) => {
      const entry = this._findMountForPhysicalAuthority(notification.path, notification.authority, provider);
      const isDiscoveryRootChange =
        notification.type === 'directory-change' &&
        notification.path === '/' &&
        notification.authority.providerBasePath === '' &&
        this._discoveryRoots().some((root) => root.storageRootKey === storageRootKey);
      if (entry === undefined && !isDiscoveryRootChange) {
        return [];
      }
      const resolution =
        entry === undefined
          ? undefined
          : this._remoteResolution({ path: notification.path, authority: notification.authority, provider, entry });
      return [{ notification, resolution, isDiscoveryRootChange }];
    });
    if (routed.length === 0) {
      return;
    }
    const backend = this._backendForPhysicalAuthority(first.authority);
    const prefixes = routed.some(({ resolution }) => resolution === undefined)
      ? undefined
      : [...new Set(routed.map(({ resolution }) => resolution!.path))];
    try {
      await provider.refresh?.(prefixes);
    } catch {
      this._handleRemoteFailure(first, backend);
      return;
    }

    const events: Array<{ event: PathChangeEvent; operations: Array<{ path: string; resolution: MountResolution }> }> =
      [];
    for (const { notification, resolution, isDiscoveryRootChange } of routed) {
      const isCurrent = resolution !== undefined && this._pipeline.isCurrentResolution(notification.path, resolution);
      if (!isCurrent && !isDiscoveryRootChange) {
        continue;
      }
      if (notification.type === 'write' || notification.type === 'delete') {
        this._filePool()?.invalidate(notification.path);
      } else if (notification.type !== 'mkdir') {
        this._filePool()?.clear();
      }
      /* Scoped (D5): only the named path is unknown, re-observed at the next answer. */
      this._projectIndexes.invalidate(isDiscoveryRootChange ? '/' : notification.path);
      const operations = resolution === undefined ? [] : [{ path: notification.path, resolution }];
      if (notification.type === 'directory-change') {
        events.push({ event: { type: 'directoryChanged', path: notification.path, backend }, operations });
      } else if (resolution !== undefined) {
        events.push({ event: remoteChangeEvent(notification, backend), operations });
      }
    }
    this._pipeline.emitChangeEvents(events);
  }

  private _findMountForPhysicalAuthority(
    path: string,
    authority: PhysicalAuthority,
    provider: FileSystemProvider,
  ): MountEntry | undefined {
    try {
      const current = this._mountTable.resolve(path).entry;
      if (
        current?.provider === provider &&
        current.storageRootKey === authority.storageRootKey &&
        current.providerBasePath === authority.providerBasePath
      ) {
        return current;
      }
    } catch {
      // An unroutable notification cannot identify a live projection.
    }
    return undefined;
  }

  private _remoteResolution(options: {
    path: string;
    authority: PhysicalAuthority;
    provider: FileSystemProvider;
    entry: MountEntry;
  }): MountResolution {
    const { path, authority, provider, entry } = options;
    try {
      const current = this._mountTable.resolve(path);
      if (current.entry === entry) {
        return current;
      }
    } catch {
      // The captured physical entry may no longer be globally routable.
    }
    return { provider, path: authority.providerBasePath, backend: entry.backend, entry };
  }

  private _backendForPhysicalAuthority(authority: PhysicalAuthority): FileSystemBackend {
    const entry = this._mountTable
      .listMounts()
      .find(
        (mount) =>
          mount.storageRootKey === authority.storageRootKey && mount.providerBasePath === authority.providerBasePath,
      );
    if (entry !== undefined) {
      return entry.backend;
    }
    if (authority.storageRootKey.startsWith('indexeddb:')) {
      return 'indexeddb';
    }
    if (authority.storageRootKey.startsWith('opfs:')) {
      return 'opfs';
    }
    if (authority.storageRootKey.startsWith('webaccess:')) {
      return 'webaccess';
    }
    return 'memory';
  }

  private _handleRemoteFailure(notification: ChangeNotification, backend?: FileSystemBackend): void {
    this._filePool()?.clear();
    this._projectIndexes.invalidate('/');
    if (notification.type === 'project-unavailable') {
      this._watchRegistry.emitResetAll();
      return;
    }
    this._pipeline.emitChangeEvent({
      type: 'backendChanged',
      backend: backend ?? this._backendForPhysicalAuthority(notification.authority),
    });
  }
}
