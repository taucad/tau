/**
 * Cross-tab remote-change application: the one place a fact another tab
 * published becomes local state (charter D13, D14).
 *
 * Extracted from `WorkspaceFileService` unchanged. A peer's notification names
 * a physical authority, not a logical path this authority still routes, so
 * every fact is checked against the live mount table before it invalidates a
 * derivative or emits an event, and the whole sequence runs in arrival order on
 * one tail. A refresh that fails turns into one global reset rather than a lost
 * fact.
 *
 * @module
 */

import type { FileSystemBackend } from '@taucad/types';
import type { SharedPool } from '@taucad/memory';
import type { ChangeEvent, FileSystemProvider } from '#types.js';
import type { MountEntry, MountResolution, MountTable } from '#mount-table.js';
import type { ChangeNotification, PhysicalAuthority } from '#cross-tab-coordinator.js';
import type { MutationPipeline } from '#mutation-pipeline.js';
import type { ProviderRegistry } from '#provider-registry.js';
import type { ResolvedDiscoveryRoot } from '#project-directories.js';
import type { TreeIndexes } from '#tree-index.js';
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
): ChangeEvent => {
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
  private readonly _treeIndexes: TreeIndexes;
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
    treeIndexes: TreeIndexes;
    watchRegistry: WatchRegistry;
    filePool: () => SharedPool | undefined;
    discoveryRoots: () => readonly ResolvedDiscoveryRoot[];
    revokeProjectRoute: (path: string, notifyPeers: boolean) => void;
  }) {
    this._registry = options.registry;
    this._mountTable = options.mountTable;
    this._pipeline = options.pipeline;
    this._treeIndexes = options.treeIndexes;
    this._watchRegistry = options.watchRegistry;
    this._filePool = options.filePool;
    this._discoveryRoots = options.discoveryRoots;
    this._revokeProjectRoute = options.revokeProjectRoute;
  }

  /**
   * Apply one peer notification behind every earlier one. A rejected predecessor
   * never strands a later fact, and a rejected application resets instead.
   *
   * @param notification - The fact a sibling authority published.
   */
  public apply(notification: ChangeNotification): void {
    const predecessor = this._remoteChangeTail;
    const applyInOrder = async (): Promise<void> => {
      try {
        await predecessor;
        await this._applyRemoteChange(notification);
      } catch {
        this._handleRemoteFailure(notification);
      }
    };
    this._remoteChangeTail = applyInOrder();
  }

  /**
   * Apply one peer notification, in arrival order.
   *
   * @param notification - The fact a sibling authority published.
   */
  private async _applyRemoteChange(notification: ChangeNotification): Promise<void> {
    if (notification.type === 'project-unavailable') {
      const current = this._mountTable.getExactMount(notification.path);
      if (
        current?.storageRootKey !== notification.authority.storageRootKey ||
        current.providerBasePath !== notification.authority.providerBasePath
      ) {
        return;
      }
      this._revokeProjectRoute(notification.path, false);
      return;
    }
    await this._applyRemoteFact(notification);
  }

  /**
   * Apply one peer notification that names changed bytes rather than a lost
   * project, against the projection this authority still routes.
   *
   * @param notification - The fact a sibling authority published.
   */
  private async _applyRemoteFact(
    notification: Exclude<ChangeNotification, { type: 'project-unavailable' }>,
  ): Promise<void> {
    const pendingProvider = this._registry.getOwnedProvider(notification.authority.storageRootKey);
    if (pendingProvider === undefined) {
      return;
    }
    const provider = await pendingProvider;
    if (this._registry.getOwnedProvider(notification.authority.storageRootKey) !== pendingProvider) {
      return;
    }
    const entry = this._findMountForPhysicalAuthority(notification.path, notification.authority, provider);
    const isDiscoveryRootChange =
      notification.type === 'directory-change' &&
      notification.path === '/' &&
      notification.authority.providerBasePath === '' &&
      this._discoveryRoots().some((root) => root.storageRootKey === notification.authority.storageRootKey);
    if (entry === undefined && !isDiscoveryRootChange) {
      return;
    }
    const backend = this._backendForPhysicalAuthority(notification.authority);
    try {
      await provider.refresh?.();
    } catch {
      this._handleRemoteFailure(notification, backend);
      return;
    }

    const resolution =
      entry === undefined
        ? undefined
        : this._remoteResolution({ path: notification.path, authority: notification.authority, provider, entry });
    const isCurrent = resolution !== undefined && this._pipeline.isCurrentResolution(notification.path, resolution);
    if (!isCurrent && !isDiscoveryRootChange) {
      return;
    }

    if (isCurrent || isDiscoveryRootChange) {
      this._filePool()?.clear();
      this._treeIndexes.clear();
    }

    if (notification.type === 'directory-change') {
      this._pipeline.emitChangeEvent(
        { type: 'directoryChanged', path: notification.path, backend },
        undefined,
        resolution === undefined ? undefined : { operations: [{ path: notification.path, resolution }] },
      );
      return;
    }
    if (resolution === undefined) {
      return;
    }

    this._pipeline.emitChangeEvent(remoteChangeEvent(notification, backend), undefined, {
      operations: [{ path: notification.path, resolution }],
    });
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
    this._treeIndexes.clear();
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
