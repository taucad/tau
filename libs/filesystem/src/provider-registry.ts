import type { FileSystemProvider } from '#types.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { DirectIdbProvider } from '#backend/direct-idb-provider.js';
import { OPFSProvider } from '#backend/opfs-provider.js';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import type { WorkspaceScope } from '#mount-table.js';
import { resolveStorageRootKey } from '#storage-root-key.js';
import { MissingWorkspaceHandleError } from '#workspace-errors.js';
/**
 * Configuration for {@link ProviderRegistry}.
 * @public
 */
export type ProviderRegistryOptions = {
  databasePrefix?: string;
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
  private readonly _providers = new Map<string, Promise<FileSystemProvider>>();
  private readonly _databasePrefix: string;

  /**
   * Create a ProviderRegistry.
   *
   * @param options - Optional registry configuration.
   */
  public constructor(options?: ProviderRegistryOptions) {
    this._databasePrefix = options?.databasePrefix ?? 'tau';
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
      pending = this._createProvider(scope);
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
   * Return an already-owned provider without constructing or reviving a root.
   *
   * @param storageRootKey - Canonical physical storage-root identity.
   * @returns The existing provider promise, or `undefined` when the root is not owned.
   */
  public getOwnedProvider(storageRootKey: string): Promise<FileSystemProvider> | undefined {
    return this._providers.get(storageRootKey);
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

  private async _createProvider(scope: WorkspaceScope): Promise<FileSystemProvider> {
    switch (scope.backend) {
      case 'indexeddb': {
        const provider = new DirectIdbProvider(this._databasePrefix);
        await provider.initialize();
        return provider;
      }
      case 'opfs': {
        const provider = new OPFSProvider();
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
        return new FileSystemAccessProvider(scope.directoryHandle);
      }
      case 'memory': {
        return new MemoryProvider();
      }
      default: {
        throw new Error(`Unknown backend: ${(scope as { backend: string }).backend}`);
      }
    }
  }
}
