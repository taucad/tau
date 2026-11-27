import type { FileSystemProvider } from '#types.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { DirectIdbProvider } from '#backend/direct-idb-provider.js';
import { OPFSProvider } from '#backend/opfs-provider.js';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import { NodeFsChannel, NodeFsImportSources, NodeFsProviderClient } from '#backend/node/client.js';
import type { NodeFsPort } from '#backend/node/port.js';
import type { WorkspaceScope } from '#mount-table.js';
import { resolveStorageRootKey } from '#storage-root-key.js';
import { MissingWorkspaceHandleError } from '#workspace-errors.js';
import type { BatchEntry } from '#changeset.js';
import { IoScheduler } from '#io-scheduler.js';
import type { IoLane } from '#io-scheduler.js';

/**
 * Told of every mutating call on a provider the registry hands out, before the call is issued (discovery index A2 a).
 * Returns the call to make when the mutation settles, whether it resolved or rejected.
 *
 * @public
 */
export type ProviderWriteTap = (storageRootKey: string, paths: readonly string[]) => () => void;

/**
 * A path a file operation names. A file at the top of a root is never a project directory, so it is left out: the
 * discovery index would otherwise take it for a directory (review N5). A path below the top names its directory.
 */
const filePath = (path: unknown): string[] => (String(path).replace(/^\/+/u, '').includes('/') ? [String(path)] : []);

/** The paths each mutating provider method names, from its arguments; a directory operation names its path whatever its depth. */
const mutatingMethods: Readonly<Record<string, (arguments_: readonly unknown[]) => string[]>> = {
  writeFile: ([path]) => filePath(path),
  appendFile: ([path]) => filePath(path),
  writeFileStream: ([path]) => filePath(path),
  writeFileChecked: ([input]) => filePath((input as { path: unknown }).path),
  deleteFileChecked: ([input]) => filePath((input as { path: unknown }).path),
  mkdir: ([path]) => [String(path)],
  unlink: ([path]) => filePath(path),
  rmdir: ([path]) => [String(path)],
  setFileMode: ([path]) => filePath(path),
  rename: ([from, to]) => [String(from), String(to)],
  applyBatch: ([entries]) =>
    (entries as readonly BatchEntry[]).flatMap((entry) => {
      switch (entry.op) {
        case 'move': {
          return [entry.from, entry.to];
        }
        case 'mkdir': {
          return [entry.path];
        }
        case 'delete': {
          return entry.kind === 'file' ? filePath(entry.path) : [entry.path];
        }
        default: {
          return filePath(entry.path);
        }
      }
    }),
};
/**
 * The provider methods that do I/O: counted while in flight when an interactive caller makes them, and admitted by the
 * lane when a background or sweep caller does (fast path FW4). `refresh`, `observe`, `readFileStream` and `dispose` are
 * neither: a cache drop, a subscription, a stream pulled later, and a release.
 */
const ioMethods = [
  'readdirWithStats',
  'readFile',
  'writeFile',
  'writeFileChecked',
  'deleteFileChecked',
  'appendFile',
  'writeFileStream',
  'readdir',
  'stat',
  'mkdir',
  'unlink',
  'rmdir',
  'rename',
  'exists',
  'lstat',
  'getFileMode',
  'setFileMode',
  'hashFiles',
  'applyBatch',
  'readdirEntries',
] as const;

const ioMethodNames: ReadonlySet<string | symbol> = new Set(ioMethods);

/**
 * Which lane a caller's provider calls run in: `interactive` and `background` (FW4), or `sweep`, an identity sweep a
 * person is waiting on, which runs in its own bounded window ({@link IoScheduler.runSweep}).
 *
 * @public
 */
export type ProviderLane = IoLane | 'sweep';

/**
 * Configuration for {@link ProviderRegistry}.
 * @public
 */
export type ProviderRegistryOptions = {
  databasePrefix?: string;
  /**
   * Opens the port to the node filesystem host. Injected rather than statically
   * imported so `node:fs` never follows a static import into this bundle: the
   * host lives in another process and only the shell knows how to reach it.
   * Absent on the web build, where a `node` scope is simply unreachable.
   */
  createNodeFsPort?: () => Promise<NodeFsPort>;
  /** The lanes' admission rule (FW4); one is made when omitted. */
  ioScheduler?: IoScheduler;
};

/**
 * Factory for filesystem provider instances across backends
 * (IndexedDB, OPFS, Web Access, memory).
 *
 * **Stateless w.r.t. workspaces.** Every webaccess provider receives its
 * `{ directoryHandle, workspaceId }` via an explicit
 * {@link WorkspaceScope} on each call. The registry never carries an
 * ambient handle; multiple concurrent webaccess scopes coexist
 * without cross-contamination.
 *
 * The registry is the sole provider owner. Mounts and scoped reads resolve
 * through the same cache, keyed by physical storage-root identity.
 *
 * @public
 */
export class ProviderRegistry {
  /** The lanes' admission rule: interactive calls are counted, background and sweep calls admitted (FW4). */
  public readonly ioScheduler: IoScheduler;
  private readonly _providers = new Map<string, Promise<FileSystemProvider>>();
  private readonly _databasePrefix: string;
  private readonly _createNodeFsPort: (() => Promise<NodeFsPort>) | undefined;
  /** One channel serves every node root; each request names its own rooted view. */
  private _nodeFsChannel: Promise<NodeFsChannel> | undefined;
  /** The channel the memo above resolved to, so a stale close cannot evict a newer one. */
  private _liveNodeFsChannel: NodeFsChannel | undefined;
  /** Told the provider paths a root's recovery removed (I1). */
  private _recoveryListener: ((storageRootKey: string, providerPaths: readonly string[]) => void) | undefined;
  /** Told of every mutating provider call (FW2). */
  private _writeTap: ProviderWriteTap | undefined;
  /** Each provider's gated views, made once per provider and lane. */
  private readonly _laneViews = new WeakMap<
    FileSystemProvider,
    Map<Exclude<ProviderLane, 'interactive'>, FileSystemProvider>
  >();
  /** The root each provider this registry made serves. */
  private readonly _rootOf = new WeakMap<FileSystemProvider, string>();
  /** Recoveries that finished before a listener was set. */
  private readonly _pendingRecoveries: Array<Readonly<{ storageRootKey: string; providerPaths: readonly string[] }>> =
    [];

  /**
   * Create a ProviderRegistry.
   *
   * @param options - Optional registry configuration.
   */
  public constructor(options?: ProviderRegistryOptions) {
    this._databasePrefix = options?.databasePrefix ?? 'tau';
    this._createNodeFsPort = options?.createNodeFsPort;
    this.ioScheduler = options?.ioScheduler ?? new IoScheduler();
  }

  /**
   * Get or create a standalone provider for cross-backend reads
   * (e.g. the `/files` route). Cached separately from mount providers
   * via the workspace-stable cache key.
   *
   * For `webaccess` scopes the cache key is
   * `` `webaccess:${workspaceId}` `` so two workspaces with the same
   * folder name produce distinct providers (closes Finding 3 of the
   * blueprint). For other backends the key is the backend identifier
   * itself (one IDB / OPFS / memory provider per registry).
   *
   * @param scope - Workspace scope (carries `directoryHandle` + `workspaceId` for webaccess).
   * @returns Standalone provider instance.
   */
  public async getProvider(scope: WorkspaceScope): Promise<FileSystemProvider> {
    const cacheKey = this.resolveStorageRootKey(scope);
    let pending = this._providers.get(cacheKey);
    if (!pending) {
      pending = (async () => this._tapped(cacheKey, await this._createProvider(scope)))();
      this._providers.set(cacheKey, pending);
    }

    try {
      const provider = await pending;
      if (this._providers.get(cacheKey) !== pending) {
        throw new Error(`Provider root was revoked during initialization: ${cacheKey}`);
      }
      return provider;
    } catch (error) {
      if (this._providers.get(cacheKey) === pending) {
        this._providers.delete(cacheKey);
      }
      throw error;
    }
  }

  /**
   * The provider of a root as a caller in `lane` sees it (FW4): the provider itself for an interactive caller, whose
   * calls it counts, or a view whose every I/O call waits for the lane to admit it.
   *
   * @param scope - Workspace scope.
   * @param lane - The caller's lane.
   * @returns The provider, or its gated view.
   */
  public async getLaneProvider(scope: WorkspaceScope, lane: ProviderLane): Promise<FileSystemProvider> {
    return this.inLane(await this.getProvider(scope), lane);
  }

  /**
   * A provider as a caller in `lane` sees it (FW4). A background or sweep view admits each I/O call through
   * {@link ProviderRegistry.ioScheduler} and then makes it on the provider itself, so the write tap still hears its
   * writes; the provider's own nested calls are neither gated nor counted. Every other member reads through to the
   * provider. Gating sits at the provider call, below every lock a caller holds.
   *
   * @param provider - A provider, normally one this registry made.
   * @param lane - The caller's lane.
   * @returns The provider for `interactive`, otherwise its view for the lane, the same object each time.
   */
  public inLane(provider: FileSystemProvider, lane: ProviderLane): FileSystemProvider {
    if (lane === 'interactive') {
      return provider;
    }
    let views = this._laneViews.get(provider);
    if (views === undefined) {
      views = new Map();
      this._laneViews.set(provider, views);
    }
    let view = views.get(lane);
    if (view === undefined) {
      view = this._gatedView(provider, lane);
      views.set(lane, view);
    }
    return view;
  }

  /**
   * Return an already-owned provider without constructing or reviving a root.
   *
   * @param storageRootKey - Canonical physical storage-root identity.
   * @returns The existing provider promise, or `undefined` when the root is not owned.
   */
  public getOwnedProvider(storageRootKey: string): Promise<FileSystemProvider> | undefined {
    return this._providers.get(storageRootKey);
  }

  /**
   * Set who is told of every mutating call on a provider this registry hands out, before the call is issued and when
   * it settles: the discovery index's tap on this authority's own writes, taken where the bytes move rather than from
   * the change bus, which carries only what each caller chose to emit (discovery index A2 a).
   *
   * @param tap - The tap.
   */
  public setWriteTap(tap: ProviderWriteTap): void {
    this._writeTap = tap;
  }

  /**
   * Set who is told the provider paths a root removed while it opened: the
   * empty files of creates a crashed realm left (I1). Recoveries that ran
   * before the listener was set are delivered to it at once.
   *
   * @param listener - Called with the storage-root key and the provider paths removed.
   */
  public setRecoveryListener(listener: (storageRootKey: string, providerPaths: readonly string[]) => void): void {
    this._recoveryListener = listener;
    for (const { storageRootKey, providerPaths } of this._pendingRecoveries.splice(0)) {
      listener(storageRootKey, providerPaths);
    }
  }

  /**
   * Every storage root this registry owns a provider for, initialized or not.
   *
   * @returns The canonical storage-root keys.
   */
  public ownedStorageRootKeys(): string[] {
    return [...this._providers.keys()];
  }

  /**
   * Dispose and remove cached standalone providers. When `workspaceId`
   * is supplied for the `webaccess` backend, only that workspace's
   * cached entry is dropped; otherwise every entry for the backend is
   * cleared (used by `disposeAll` and bulk recovery flows).
   *
   * @param storageRootKey - Stable physical storage-root identity to dispose.
   */
  public disposeRoot(storageRootKey: string): void {
    const pending = this._providers.get(storageRootKey);
    this._providers.delete(storageRootKey);
    if (pending) {
      // async-iife: bootstrap -- revocation is synchronous; a provider still initializing is disposed on settlement.
      void (async () => {
        try {
          const provider = await pending;
          provider.dispose();
        } catch {
          // Failed initialization has no provider resource to dispose.
        }
      })();
    }
  }

  /** Dispose every registry-owned provider. */
  public disposeAll(): void {
    const pending = [...this._providers.values()];
    this._providers.clear();
    this.ioScheduler.dispose();
    for (const provider of pending) {
      // async-iife: bootstrap -- registry teardown cannot await providers that are still initializing.
      void (async () => {
        try {
          const resolved = await provider;
          resolved.dispose();
        } catch {
          // Failed initialization has no provider resource to dispose.
        }
      })();
    }
  }

  /**
   * Resolve the canonical physical storage-root identity used for provider
   * caching, authority locks, and cross-tab invalidation.
   *
   * @param scope - Explicit workspace/provider scope.
   * @returns Canonical storage-root key.
   */
  public resolveStorageRootKey(scope: WorkspaceScope): string {
    return resolveStorageRootKey(scope, this._databasePrefix);
  }

  /**
   * The sources a person chose on the node host for an import (W7.4), over
   * the node transport, or `undefined` on a host without one.
   *
   * @returns The host's import sources.
   */
  public async importSources(): Promise<NodeFsImportSources | undefined> {
    if (this._createNodeFsPort === undefined) {
      return undefined;
    }
    return new NodeFsImportSources(await this._nodeFsChannelFrom(this._createNodeFsPort));
  }

  /**
   * The node transport's channel, opened once and shared by every node provider.
   * Only a failed open drops the memo, so the next resolution asks the shell for
   * a fresh port. A request that fails on an open channel leaves it memoized: the
   * channel stays live for the providers bound to it, and a channel that closes
   * drops itself through its close listener.
   *
   * @param createPort - The host's port factory.
   * @returns The open channel.
   */
  private async _nodeFsChannelFrom(createPort: () => Promise<NodeFsPort>): Promise<NodeFsChannel> {
    this._nodeFsChannel ??= this._openNodeFsChannel(createPort);
    const opening = this._nodeFsChannel;
    try {
      return await opening;
    } catch (error) {
      if (this._nodeFsChannel === opening) {
        this._nodeFsChannel = undefined;
      }
      throw error;
    }
  }

  /**
   * Wrap each mutating method of a provider this registry made so the write tap hears it before it is issued and when
   * it settles. Wrapped on the instance, once: every caller of this provider, the pipeline's unlocked batches and the
   * lifecycle's own writes included, goes through it.
   */
  private _tapped(storageRootKey: string, provider: FileSystemProvider): FileSystemProvider {
    for (const [name, pathsOf] of Object.entries(mutatingMethods)) {
      const method: unknown = Reflect.get(provider, name);
      if (typeof method !== 'function') {
        continue;
      }
      const original = method as (...arguments_: unknown[]) => unknown;
      const tap = (): ProviderWriteTap | undefined => this._writeTap;
      Object.defineProperty(provider, name, {
        configurable: true,
        writable: true,
        value: function tapped(this: unknown, ...arguments_: unknown[]): unknown {
          const settle = tap()?.(storageRootKey, pathsOf(arguments_));
          if (settle === undefined) {
            return Reflect.apply(original, this, arguments_);
          }
          try {
            const result = Reflect.apply(original, this, arguments_);
            if (result instanceof Promise) {
              return result.finally(settle);
            }
            settle();
            return result;
          } catch (error) {
            settle();
            throw error;
          }
        },
      });
    }
    this._counted(storageRootKey, provider);
    return provider;
  }

  /**
   * Count each I/O call on a provider this registry made while it is in flight (FW4): the interactive lane's count,
   * which a background call waits on. Wrapped on the instance over the write tap, once, like the tap.
   */
  private _counted(storageRootKey: string, provider: FileSystemProvider): void {
    this._rootOf.set(provider, storageRootKey);
    const scheduler = this.ioScheduler;
    for (const name of ioMethods) {
      const method: unknown = Reflect.get(provider, name);
      if (typeof method !== 'function') {
        continue;
      }
      const original = method as (...arguments_: unknown[]) => unknown;
      Object.defineProperty(provider, name, {
        configurable: true,
        writable: true,
        value: function counted(this: unknown, ...arguments_: unknown[]): unknown {
          const settle = scheduler.beginInteractive(storageRootKey);
          try {
            const result = Reflect.apply(original, this, arguments_);
            if (result instanceof Promise) {
              return result.finally(settle);
            }
            settle();
            return result;
          } catch (error) {
            settle();
            throw error;
          }
        },
      });
    }
  }

  /** A view of `provider` whose I/O calls the lane admits; see {@link ProviderRegistry.inLane}. */
  private _gatedView(provider: FileSystemProvider, lane: Exclude<ProviderLane, 'interactive'>): FileSystemProvider {
    const scheduler = this.ioScheduler;
    const storageRootKey = this._rootOf.get(provider) ?? provider.id;
    const admit = async <Result>(call: () => Result): Promise<Awaited<Result>> =>
      lane === 'sweep' ? scheduler.runSweep(storageRootKey, call) : scheduler.runBackground(storageRootKey, call);
    const gated = new Map<string | symbol, (...arguments_: unknown[]) => unknown>();
    const bound = new WeakMap<(...arguments_: unknown[]) => unknown, unknown>();
    return new Proxy(provider, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property);
        if (typeof value !== 'function') {
          return value;
        }
        if (ioMethodNames.has(property)) {
          let call = gated.get(property);
          if (call === undefined) {
            /* The method is looked up when admitted, so a replaced one (a test's spy) is the one called. */
            call = async (...arguments_: unknown[]) =>
              admit(() =>
                Reflect.apply(Reflect.get(target, property) as (...a: unknown[]) => unknown, target, arguments_),
              );
            gated.set(property, call);
          }
          return call;
        }
        const method = value as (...arguments_: unknown[]) => unknown;
        let member = bound.get(method);
        if (member === undefined) {
          member = method.bind(target);
          bound.set(method, member);
        }
        return member;
      },
      set() {
        return false;
      },
    });
  }

  private _recovered(storageRootKey: string, providerPaths: readonly string[]): void {
    if (this._recoveryListener === undefined) {
      this._pendingRecoveries.push({ storageRootKey, providerPaths });
      return;
    }
    this._recoveryListener(storageRootKey, providerPaths);
  }

  private async _openNodeFsChannel(createPort: () => Promise<NodeFsPort>): Promise<NodeFsChannel> {
    const channel = new NodeFsChannel(await createPort());
    this._liveNodeFsChannel = channel;
    // A dead host would otherwise stay memoized forever: every later provider
    // resolution would hand back a client bound to a channel that can only
    // reject. Dropping both the memo and the providers built on it makes the
    // next resolution ask the shell for a fresh port.
    channel.onClose(() => {
      if (this._liveNodeFsChannel !== channel) {
        return;
      }
      this._liveNodeFsChannel = undefined;
      this._nodeFsChannel = undefined;
      // Snapshot first: `disposeRoot` mutates the map being read.
      const nodeRootKeys = [...this._providers.keys()].filter((key) => key.startsWith('node:'));
      for (const storageRootKey of nodeRootKeys) {
        this.disposeRoot(storageRootKey);
      }
    });
    return channel;
  }

  private async _createProvider(scope: WorkspaceScope): Promise<FileSystemProvider> {
    switch (scope.backend) {
      case 'indexeddb': {
        const provider = new DirectIdbProvider(this._databasePrefix);
        await provider.initialize();
        return provider;
      }
      case 'opfs': {
        const storageRootKey = this.resolveStorageRootKey(scope);
        const provider = new OPFSProvider({
          root: storageRootKey,
          onRecovered: (paths) => {
            this._recovered(storageRootKey, paths);
          },
        });
        await provider.initialize();
        return provider;
      }
      case 'webaccess': {
        // Defensive runtime check for unsafe callers (raw RPC clients,
        // tests using `as any`). The discriminated `WorkspaceScope`
        // enforces `directoryHandle` at compile time for well-typed
        // call sites, but structured-clone deserialisation through the
        // worker bridge is not type-checked.
        // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive runtime guard against unsafe (untyped RPC / `as any`) callers
        if (!scope.directoryHandle) {
          throw new MissingWorkspaceHandleError({ workspaceId: scope.workspaceId });
        }
        // The stored handle's id keys the root's create records (I1). A root
        // without one keeps none, so its creates are staged as siblings and moved.
        const storageRootKey = this.resolveStorageRootKey(scope);
        const provider = new FileSystemAccessProvider(scope.directoryHandle, {
          ...(scope.workspaceId === '' ? { stageCreates: true } : { uncommitted: { root: storageRootKey } }),
          onRecovered: (paths) => {
            this._recovered(storageRootKey, paths);
          },
        });
        await provider.recoverUncommitted();
        return provider;
      }
      case 'memory': {
        return new MemoryProvider();
      }
      case 'node': {
        if (this._createNodeFsPort === undefined) {
          throw new Error('This host has no node filesystem transport; a node storage root is unreachable.');
        }
        const channel = await this._nodeFsChannelFrom(this._createNodeFsPort);
        // The host may run in another process or on another machine: whether files
        // keep a mode is its disk's answer, never this worker's platform. A failed
        // ask keeps the channel; the next resolution asks it again.
        const { fileModes } = await channel.describeHost();
        return new NodeFsProviderClient(channel, scope.path, { fileModes });
      }
      default: {
        throw new Error(`Unknown backend: ${(scope as { backend: string }).backend}`);
      }
    }
  }
}
