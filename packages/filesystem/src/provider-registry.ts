import type { FileSystemBackend } from '@taucad/types';
import type { FileSystemProvider } from '#types.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { DirectIdbProvider } from '#backend/direct-idb-provider.js';
import { OPFSProvider } from '#backend/opfs-provider.js';
import { FileSystemAccessProvider } from '#backend/fs-access-provider.js';
import type { WorkspaceScope } from '#mount-table.js';
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
 * Mount providers (created via {@link createMountProvider}) are
 * uncached — the caller owns their lifecycle. Standalone providers
 * (created via {@link getStandaloneProvider}) are cached for the
 * cross-backend `/files` browse use-case and keyed by
 * `(backend, workspaceId)` so two workspaces with the same folder
 * name never collide.
 *
 * @public
 */
export class ProviderRegistry {
  private readonly _standaloneProviders = new Map<string, FileSystemProvider>();
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
  public async getStandaloneProvider(scope: WorkspaceScope): Promise<FileSystemProvider> {
    const cacheKey = scope.backend === 'webaccess' ? `webaccess:${scope.workspaceId}` : scope.backend;

    const cached = this._standaloneProviders.get(cacheKey);
    if (cached) {
      return cached;
    }

    const provider = await this._createProvider(scope);
    this._standaloneProviders.set(cacheKey, provider);
    return provider;
  }

  /**
   * Dispose and remove cached standalone providers. When `workspaceId`
   * is supplied for the `webaccess` backend, only that workspace's
   * cached entry is dropped; otherwise every entry for the backend is
   * cleared (used by `disposeAll` and bulk recovery flows).
   *
   * @param backend - Backend whose standalone providers to invalidate.
   * @param workspaceId - Optional webaccess workspace id; when set, only that workspace's entry is dropped.
   */
  public invalidateStandaloneProvider(backend: FileSystemBackend, workspaceId?: string): void {
    const keysToRemove: string[] = [];
    if (backend === 'webaccess' && workspaceId !== undefined) {
      const targetKey = `webaccess:${workspaceId}`;
      if (this._standaloneProviders.has(targetKey)) {
        keysToRemove.push(targetKey);
      }
    } else {
      for (const key of this._standaloneProviders.keys()) {
        if (key === backend || key.startsWith(`${backend}:`)) {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      this._standaloneProviders.get(key)?.dispose();
      this._standaloneProviders.delete(key);
    }
  }

  /**
   * Create a fresh provider instance for use as a mount target.
   * Does not cache the instance. The caller owns the provider's lifecycle
   * and must dispose it.
   *
   * @param scope - Workspace scope (carries `directoryHandle` + `workspaceId` for webaccess).
   * @returns A new, uncached provider instance.
   */
  public async createMountProvider(scope: WorkspaceScope): Promise<FileSystemProvider> {
    return this._createProvider(scope);
  }

  /** Dispose all cached standalone providers. */
  public disposeAll(): void {
    for (const provider of this._standaloneProviders.values()) {
      provider.dispose();
    }
    this._standaloneProviders.clear();
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
