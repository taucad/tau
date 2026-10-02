/**
 * Virtual mount-point table that routes absolute filesystem paths to their
 * backing {@link FileSystemProvider} based on longest-prefix matching.
 *
 * Enables transparent multi-backend composition: e.g. project files on IDB
 * at `/`, CDN modules on OPFS at `/node_modules/`.
 *
 * @public
 */

import type { FileSystemBackend } from '@taucad/types';
import type { FileSystemProvider } from '#types.js';

/**
 * Common option fields shared by every {@link MountConfig} variant.
 * @public
 */
export type MountConfigCommon = {
  /**
   * When true, the full absolute path is passed to the provider unchanged
   * instead of stripping the mount prefix. Use for mounts where the provider
   * shares storage with the root and stores data at full paths (e.g. project
   * mounts on the same IndexedDB database).
   */
  readonly preservePath?: boolean;
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
      readonly backend: 'indexeddb' | 'opfs' | 'memory';
    });

/**
 * Workspace scope passed to standalone-provider operations via the
 * `{ scope }` options bag on `readFile`, `unlink`, `rmdir`,
 * `getZippedDirectory`, and `readShallowDirectory`. Mirrors
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
      readonly backend: 'indexeddb' | 'opfs' | 'memory';
    };

/**
 * A single mount entry mapping a path prefix to a provider.
 * @public
 */
export type MountEntry = {
  readonly prefix: string;
  readonly provider: FileSystemProvider;
  readonly backend: FileSystemBackend;
  readonly preservePath?: boolean;
  /**
   * Workspace identity for `webaccess` mounts only. Stable id minted from
   * `generatePrefixedId(idPrefix.workspace)`; identifies the workspace
   * row whose handle backs this mount. `undefined` for IDB / OPFS /
   * memory mounts.
   */
  readonly workspaceId?: string;
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
   * If a mount already exists at the same prefix, the old provider is disposed
   * before replacement.
   *
   * @param prefix - Absolute path prefix (e.g. `/`, `/node_modules`).
   * @param provider - Provider to handle paths under this prefix.
   * @param config - Backend identifier and additional mount options.
   */
  public mount(prefix: string, provider: FileSystemProvider, config: MountConfig): void {
    const normalized = this._normalizePrefix(prefix);

    const existingIndex = this._mounts.findIndex((m) => m.prefix === normalized);
    if (existingIndex !== -1) {
      const existing = this._mounts[existingIndex]!;
      existing.provider.dispose();
      this._mounts.splice(existingIndex, 1);
    }

    const workspaceId = config.backend === 'webaccess' ? config.workspaceId : undefined;
    this._mounts.push({
      prefix: normalized,
      provider,
      backend: config.backend,
      preservePath: config.preservePath,
      workspaceId,
    });
    this._mounts.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  /**
   * Remove a mount point. Does not dispose the provider —
   * `WorkspaceFileService.unmount` owns disposal. Subsequent reads under
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
    const normalized = absolutePath.endsWith('/') && absolutePath.length > 1 ? absolutePath.slice(0, -1) : absolutePath;

    for (const entry of this._mounts) {
      if (entry.prefix === '/') {
        return { provider: entry.provider, path: normalized, backend: entry.backend };
      }

      if (normalized === entry.prefix) {
        return {
          provider: entry.provider,
          path: entry.preservePath ? normalized : '/',
          backend: entry.backend,
        };
      }

      if (normalized.startsWith(entry.prefix + '/')) {
        const resolvedPath = entry.preservePath ? normalized : normalized.slice(entry.prefix.length) || '/';
        return { provider: entry.provider, path: resolvedPath, backend: entry.backend };
      }
    }

    throw new Error(`[MountTable] No mount matches path: ${absolutePath}`);
  }

  /**
   * Resolve the backend identifier for the mount that handles a given path.
   *
   * @param absolutePath - Absolute virtual path.
   * @returns Backend identifier, or `undefined` if no mount matches.
   */
  public resolveBackend(absolutePath: string): FileSystemBackend | undefined {
    try {
      return this.resolve(absolutePath).backend;
    } catch {
      return undefined;
    }
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

  private _normalizePrefix(prefix: string): string {
    if (prefix === '/') {
      return '/';
    }
    return prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  }
}
