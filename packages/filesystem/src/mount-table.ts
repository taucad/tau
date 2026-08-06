/**
 * Virtual mount-point table that routes absolute filesystem paths to their
 * backing {@link FileSystemProvider} based on longest-prefix matching.
 *
 * Enables transparent multi-backend composition: e.g. project files on IDB
 * at `/`, CDN modules on OPFS at `/node_modules/`.
 *
 * @public
 */

import type {
  AdoptableProjectManifest,
  FileSystemBackend,
  ProjectManifest,
  ProjectManifestParseIssue,
} from '@taucad/types';
import type { FileSystemProvider } from '#types.js';
import { resolveVirtualPath } from '@taucad/utils/path';

/**
 * Common option fields shared by every {@link MountConfig} variant.
 * @public
 */
export type MountConfigCommon = {
  /**
   * Absolute provider-relative directory represented by the mount prefix.
   * Defaults to `/` for a provider rooted at the mount itself.
   */
  readonly providerBasePath?: string;
};

/**
 * Discriminated mount configuration. The compiler enforces that
 * `webaccess` mounts carry an explicit `directoryHandle` and stable
 * `workspaceId`, eliminating ambient handle state from the mount API.
 *
 * Non-webaccess mounts carry no workspace identity because their
 * persistence is bound to the origin (IndexedDB / OPFS) or to the
 * process lifetime (memory).
 *
 * @public
 */
export type MountConfig =
  | (MountConfigCommon & {
      readonly backend: 'webaccess';
      readonly directoryHandle: FileSystemDirectoryHandle;
      readonly workspaceId: string;
    })
  | (MountConfigCommon & {
      readonly backend: 'indexeddb' | 'opfs';
    })
  | (MountConfigCommon & {
      readonly backend: 'memory';
      readonly storageRootKey: string;
    });

/**
 * Cloneable persisted route from a virtual project id to a physical root directory.
 * @public
 */
export type ProjectRootConfig = MountConfig & {
  readonly projectId: string;
  readonly providerBasePath: string;
};

/**
 * Physical root scanned for project manifests, independent of existing project routes.
 * @public
 */
export type StorageRootConfig =
  | {
      readonly backend: 'webaccess';
      readonly directoryHandle: FileSystemDirectoryHandle;
      readonly workspaceId: string;
    }
  | {
      readonly backend: 'indexeddb' | 'opfs';
    };

/** Complete persisted project-route and discovery-root configuration. @public */
export type ProjectRootConfiguration = {
  readonly projects: readonly ProjectRootConfig[];
  readonly roots: readonly StorageRootConfig[];
};

/** Stable locator for a discovered project directory. @public */
export type ProjectLocator =
  | {
      readonly backend: 'indexeddb' | 'opfs';
      readonly storageRootKey: string;
      readonly relativeDirectory: string;
    }
  | {
      readonly backend: 'webaccess';
      readonly storageRootKey: string;
      readonly relativeDirectory: string;
      readonly workspaceId: string;
    };

/** Validated or quarantined result from project discovery. @public */
export type ProjectDiscoveryEntry =
  | {
      readonly status: 'valid';
      readonly manifest: ProjectManifest;
      readonly locator: ProjectLocator;
    }
  | {
      readonly status: 'duplicate-id';
      readonly manifest: ProjectManifest;
      readonly locator: ProjectLocator;
    }
  | {
      readonly status: 'adoption-required';
      readonly manifest: AdoptableProjectManifest;
      readonly locator: ProjectLocator;
      readonly issue: ProjectManifestParseIssue;
    }
  | {
      readonly status: 'invalid';
      readonly locator: ProjectLocator;
      readonly issue: ProjectManifestParseIssue;
    };

/** Completeness of one configured physical-root scan. @public */
export type ProjectRootDiscoveryStatus =
  | {
      readonly status: 'complete';
      readonly root: StorageRootConfig;
    }
  | {
      readonly status: 'inaccessible';
      readonly root: StorageRootConfig;
      readonly reason: string;
    };

/** Complete project-discovery result. Entries never imply an unreported root was empty. @public */
export type ProjectDiscoveryResult = {
  readonly entries: readonly ProjectDiscoveryEntry[];
  readonly roots: readonly ProjectRootDiscoveryStatus[];
};

/** Exact scoped request for permanently removing one project directory. @public */
export type PermanentDeleteProjectDirectoryInput = {
  readonly projectId: string;
  readonly providerBasePath: string;
  readonly scope: StorageRootConfig;
};

/** Identity-safe outcome of permanent project-directory deletion. @public */
export type PermanentDeleteProjectDirectoryResult =
  | { readonly status: 'deleted' | 'absent' }
  | { readonly status: 'identity-mismatch'; readonly actualProjectId: string }
  | { readonly status: 'unidentifiable' };

/** Exact scoped request for committing one journal-backed project directory. @public */
export type CommitPendingProjectDirectoryInput = {
  readonly providerBasePath: string;
  readonly scope: StorageRootConfig;
  readonly files: Readonly<Record<string, { readonly content: Uint8Array<ArrayBuffer> }>>;
  readonly manifest: Uint8Array<ArrayBuffer>;
};

/** Identity-safe outcome of committing one journal-backed project directory. @public */
export type CommitPendingProjectDirectoryResult =
  | { readonly status: 'committed' | 'already-committed' }
  | { readonly status: 'identity-mismatch'; readonly actualProjectId: string }
  | { readonly status: 'unidentifiable-manifest' };

/**
 * Workspace scope passed to standalone-provider read operations via the
 * `{ scope }` options bag on `readFile`, `getZippedDirectory`, and
 * `readShallowDirectory`. Mirrors
 * {@link MountConfig} but without mount-only options.
 *
 * @public
 */
export type WorkspaceScope =
  | {
      readonly backend: 'webaccess';
      readonly directoryHandle: FileSystemDirectoryHandle;
      readonly workspaceId: string;
    }
  | {
      readonly backend: 'indexeddb' | 'opfs';
    }
  | {
      readonly backend: 'memory';
      readonly storageRootKey: string;
    };

/** Authority-resolved metadata installed in the low-level mount table. @public */
export type MountMetadata = {
  readonly backend: FileSystemBackend;
  readonly storageRootKey?: string;
  readonly providerBasePath?: string;
};

/**
 * A single mount entry mapping a path prefix to a provider.
 * @public
 */
export type MountEntry = {
  readonly prefix: string;
  readonly provider: FileSystemProvider;
  readonly backend: FileSystemBackend;
  readonly storageRootKey?: string;
  readonly providerBasePath: string;
};

/**
 * Result of resolving an absolute path against the mount table.
 * @public
 */
export type MountResolution = {
  readonly provider: FileSystemProvider;
  /** Path relative to the mount point (always starts with `/`). */
  readonly path: string;
  /** Backend type of the matching mount. */
  readonly backend: FileSystemBackend;
  /** Exact mount entry that admitted the operation. Undefined only for named physical operations. */
  readonly entry?: MountEntry;
};

/**
 * Mount table for routing filesystem paths to providers via longest-prefix matching.
 *
 * @public
 * @example <caption>Multi-backend routing</caption>
 * ```typescript
 * import { MountTable } from '@taucad/filesystem';
 * import type { FileSystemProvider } from '@taucad/filesystem';
 *
 * declare const projectProvider: FileSystemProvider;
 * declare const opfsProvider: FileSystemProvider;
 *
 * const table = new MountTable();
 * table.mount('/', projectProvider, { backend: 'indexeddb' });
 * table.mount('/node_modules', opfsProvider, { backend: 'opfs' });
 *
 * const { provider, path } = table.resolve('/node_modules/lodash/index.js');
 * // provider === opfsProvider, path === '/lodash/index.js'
 * ```
 */
export class MountTable {
  private _mounts: MountEntry[] = [];

  /**
   * Add a mount point. Re-sorts the table by prefix length (longest first).
   * If a mount already exists at the same prefix, it is replaced. Providers
   * are registry-owned and mounts never dispose them.
   *
   * @param prefix - Absolute path prefix (e.g. `/`, `/node_modules`).
   * @param provider - Provider to handle paths under this prefix.
   * @param config - Backend identifier and additional mount options.
   */
  public mount(prefix: string, provider: FileSystemProvider, config: MountMetadata): void {
    const normalized = this._normalizePrefix(prefix);

    const existingIndex = this._mounts.findIndex((m) => m.prefix === normalized);
    if (existingIndex !== -1) {
      this._mounts.splice(existingIndex, 1);
    }

    const providerBasePath = this._normalizePrefix(config.providerBasePath ?? '/');
    this._mounts.push({
      prefix: normalized,
      provider,
      backend: config.backend,
      storageRootKey: config.storageRootKey,
      providerBasePath,
    });
    this._mounts.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  /**
   * Remove a mount point. Does not dispose the provider —
   * `ProviderRegistry` is its sole owner. Subsequent reads under
   * the prefix fall through to whichever broader mount covers the path
   * (typically the root mount), matching POSIX-like `umount` semantics.
   *
   * @param prefix - Mount prefix to remove.
   */
  public unmount(prefix: string): void {
    const normalized = this._normalizePrefix(prefix);
    this._mounts = this._mounts.filter((m) => m.prefix !== normalized);
  }

  /**
   * Resolve an absolute path to the appropriate provider and provider-relative path.
   *
   * @param absolutePath - Absolute virtual path (e.g. `/node_modules/lodash/index.js`).
   * @returns Provider and provider-relative path.
   * @throws When no mount matches the path.
   */
  public resolve(absolutePath: string): MountResolution {
    const normalized = resolveVirtualPath(absolutePath);

    for (const entry of this._mounts) {
      if (entry.prefix === '/') {
        return {
          provider: entry.provider,
          path: this._resolveProviderPath(entry.providerBasePath, normalized),
          backend: entry.backend,
          entry,
        };
      }

      if (normalized === entry.prefix) {
        return {
          provider: entry.provider,
          path: entry.providerBasePath,
          backend: entry.backend,
          entry,
        };
      }

      if (normalized.startsWith(entry.prefix + '/')) {
        const suffix = normalized.slice(entry.prefix.length);
        const resolvedPath = this._resolveProviderPath(entry.providerBasePath, suffix);
        return { provider: entry.provider, path: resolvedPath, backend: entry.backend, entry };
      }
    }

    throw new Error(`[MountTable] No mount matches path: ${absolutePath}`);
  }

  /**
   * All mount entries, longest-prefix-first (same order as internal resolution).
   *
   * @returns Mount table entries sorted longest-prefix-first.
   * @public
   */
  public listMounts(): readonly MountEntry[] {
    return this._mounts;
  }

  /**
   * Return the exact installed mount entry at `prefix`, if present.
   *
   * @param prefix - Absolute virtual mount prefix.
   * @returns The exact entry or `undefined` when no exact mount exists.
   */
  public getExactMount(prefix: string): MountEntry | undefined {
    const normalized = this._normalizePrefix(prefix);
    return this._mounts.find((mount) => mount.prefix === normalized);
  }

  /**
   * Get child mounts under a given path (for readdir merge).
   *
   * @param path - Parent path to check for child mounts.
   * @returns Mount entries whose prefix is a direct child of the given path.
   */
  public getMountsUnder(path: string): MountEntry[] {
    const normalized = this._normalizePrefix(path);
    const parentPrefix = normalized === '/' ? '/' : normalized + '/';

    return this._mounts.filter((m) => {
      if (m.prefix === normalized) {
        return false;
      }
      if (normalized === '/') {
        const rest = m.prefix.slice(1);
        return !rest.includes('/');
      }
      if (!m.prefix.startsWith(parentPrefix)) {
        return false;
      }
      const rest = m.prefix.slice(parentPrefix.length);
      return !rest.includes('/');
    });
  }

  /** Clear all mount points. */
  public dispose(): void {
    this._mounts = [];
  }

  private _resolveProviderPath(basePath: string, suffix: string): string {
    if (basePath === '/') {
      return suffix || '/';
    }
    if (!suffix || suffix === '/') {
      return basePath;
    }
    return resolveVirtualPath(`${basePath}${suffix}`);
  }

  private _normalizePrefix(prefix: string): string {
    return resolveVirtualPath(prefix);
  }
}
