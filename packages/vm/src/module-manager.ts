/**
 * Module Manager -- CDN Cache
 *
 * Minimal CDN module cache manager for kernel workers.
 * Fetches ESM bundles from CDN and caches them at the root-level `/node_modules/`
 * directory in the filesystem. Cached modules persist in IndexedDB across builds and are
 * shared across all projects.
 *
 * Key responsibilities:
 * - Fetch self-contained ESM bundles from esm.sh (with jsdelivr fallback)
 * - Cache fetched modules at `/node_modules/{name}/` with subpath support
 * - Deduplicate concurrent fetches for the same package
 * - Respect retry delay for recently failed fetches
 * - Apply fetch safeguards (timeout, size limit, domain allowlist)
 * - Write atomically (code first, package.json last as commit marker)
 *
 * Note: Built-in modules (replicad, jscad) are NOT managed here.
 * They are served directly from memory via the esbuild `builtin` namespace.
 *
 * Note: Type definitions (.d.ts) are NOT handled here. Type acquisition for
 * IntelliSense is managed by the TypeAcquisitionService on the main thread.
 */

import { getCdnCachePath, getNodeModulesPath } from '@taucad/utils/import';
import type { VmFileSystem } from '#types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Pre-bundled module served from memory (replicad, jscad, zod) via the builtin namespace.
 *
 * @public
 */
export type BuiltinModule = {
  /** Pre-bundled ESM code */
  code: string;
  /** Package version */
  version: string;
  /** Optional CommonJS global variable name for banner injection.
   * Only set for root modules (not submodules). Its presence signals
   * "include in the CommonJS banner". */
  globalName?: string;
};

/** A module resolved and fetched from a CDN or cache. @public */
export type FetchedModule = {
  /** Module source code */
  code: string;
  /** Resolved version */
  version: string;
};

// =============================================================================
// Constants
// =============================================================================

/** CDN domains allowed for module fetching */
const allowedCdnDomains = new Set(['esm.sh', 'cdn.jsdelivr.net']);

/** Primary CDN for fetching ESM modules */
const esmShBase = 'https://esm.sh';

/** Fallback CDN */
const jsdelivrBase = 'https://cdn.jsdelivr.net/npm';

/** Fetch timeout. Milliseconds. */
const fetchTimeout = 15_000;

/** Maximum response size in bytes (10 MB) */
const maxResponseSizeBytes = 10 * 1024 * 1024;

/** Minimum time between retry attempts for failed fetches. Milliseconds. */
const retryDelay = 60_000;

// =============================================================================
// Module Manager Class
// =============================================================================

/**
 * Minimal CDN Cache Manager for kernel workers.
 *
 * @public
 */
export class ModuleManager {
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly filesystem: VmFileSystem;

  /** Dedup concurrent fetches for the same cache key */
  private readonly pendingFetches = new Map<string, Promise<void>>();

  /** Track failed fetches with timestamp for retry backoff */
  private readonly failedPackages = new Map<string, number>();

  public constructor(filesystem: VmFileSystem) {
    this.filesystem = filesystem;
  }

  /**
   * Ensure a CDN module is cached at `/node_modules/`.
   *
   * - Returns immediately if already cached (file exists in FS)
   * - Deduplicates concurrent requests for the same specifier
   * - Respects retry delay for previously failed packages
   * - Fetches with timeout + size limit + domain allowlist
   * - Writes code file first, package.json last (atomic commit marker)
   *
   * @param name - package name (e.g., 'lodash')
   * @param subpath - optional subpath (e.g., 'debounce')
   * @returns Promise that resolves when the module is cached
   */
  public async ensureCdnModule(name: string, subpath?: string): Promise<void> {
    const cacheKey = subpath ? `${name}/${subpath}` : name;
    const cachePath = getCdnCachePath(name, subpath);

    // Fast path: already cached (check file exists in FS)
    try {
      if (await this.filesystem.exists(cachePath)) {
        return;
      }
    } catch {
      // Filesystem error -- proceed to fetch
    }

    // Dedup: return existing in-flight promise
    const pending = this.pendingFetches.get(cacheKey);
    if (pending) {
      return pending;
    }

    // Retry guard: skip if recently failed
    const lastFailure = this.failedPackages.get(cacheKey);
    if (lastFailure !== undefined && Date.now() - lastFailure < retryDelay) {
      return;
    }

    const promise = (async () => {
      try {
        await this.fetchAndCache(name, subpath);
        this.failedPackages.delete(cacheKey);
      } catch {
        this.failedPackages.set(cacheKey, Date.now());
      }
    })();

    this.pendingFetches.set(cacheKey, promise);

    try {
      await promise;
    } finally {
      this.pendingFetches.delete(cacheKey);
    }
  }

  /**
   * Clear in-memory caches. Call on session/worker cleanup to free memory.
   */
  public clearCaches(): void {
    this.pendingFetches.clear();
    this.failedPackages.clear();
  }

  // =============================================================================
  // Private: Fetch & Cache
  // =============================================================================

  /**
   * Fetch a module from CDN and write it to the cache directory.
   *
   * @param name - package name
   * @param subpath - optional subpath within the package
   */
  private async fetchAndCache(name: string, subpath?: string): Promise<void> {
    const specifier = subpath ? `${name}/${subpath}` : name;
    const fetched = await this.fetchFromCdn(specifier);
    await this.writeToCacheDir(name, subpath, fetched);
  }

  /**
   * Fetch a module from CDN with esm.sh primary, jsdelivr fallback.
   *
   * @param specifier - full module specifier (e.g., 'lodash/debounce')
   * @returns fetched module code and version
   */
  private async fetchFromCdn(specifier: string): Promise<FetchedModule> {
    // Try esm.sh first
    try {
      return await this.fetchFromEsmSh(specifier);
    } catch {
      // Fallback to jsdelivr
      return this.fetchFromJsdelivr(specifier);
    }
  }

  /**
   * Fetch module from esm.sh CDN.
   * Uses `?bundle` to get a self-contained ESM bundle with no external imports.
   *
   * @param specifier - full module specifier
   * @returns fetched module code and version
   */
  private async fetchFromEsmSh(specifier: string): Promise<FetchedModule> {
    const url = `${esmShBase}/${specifier}?bundle`;
    const response = await this.safeFetch(url);
    const code = await response.text();
    const version = this.extractVersionFromCode(code) ?? 'unknown';
    return { code, version };
  }

  /**
   * Fetch module from jsdelivr CDN.
   *
   * @param specifier - full module specifier
   * @returns fetched module code and version
   */
  private async fetchFromJsdelivr(specifier: string): Promise<FetchedModule> {
    const url = `${jsdelivrBase}/${specifier}/+esm`;
    const response = await this.safeFetch(url);
    const code = await response.text();
    const version = this.extractVersionFromCode(code) ?? 'unknown';
    return { code, version };
  }

  /**
   * Safe fetch with timeout, size limit, and domain allowlist.
   *
   * @param url - URL to fetch from
   * @returns fetch response
   */
  private async safeFetch(url: string): Promise<Response> {
    // Validate URL domain against allowlist
    const parsedUrl = new URL(url);
    if (!allowedCdnDomains.has(parsedUrl.hostname)) {
      throw new Error(`CDN domain '${parsedUrl.hostname}' is not in the allowlist`);
    }

    // Create AbortController with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, fetchTimeout);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }

      // Check Content-Length against size limit
      const contentLength = response.headers.get('Content-Length');
      if (contentLength && Number.parseInt(contentLength, 10) > maxResponseSizeBytes) {
        throw new Error(`Response too large: ${contentLength} bytes exceeds ${maxResponseSizeBytes} byte limit`);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extract version from module code (look for version comments).
   * e.g., esm.sh - lodash@4.17.21
   *
   * @param code - module source code to scan
   * @returns extracted semver version string, or undefined if not found
   */
  private extractVersionFromCode(code: string): string | undefined {
    const match = /@(\d+\.\d+\.\d+(?:-[\d.a-z]+)?)/.exec(code);
    return match?.[1];
  }

  /**
   * Write a fetched module to the cache directory with atomic commit marker.
   *
   * Write order:
   * 1. Ensure `/node_modules/{name}/` directory exists
   * 2. Write code file first (`index.js` or `{subpath}.js`)
   * 3. Write `package.json` LAST (commit marker -- its presence = valid cache)
   *
   * @param name - package name
   * @param subpath - optional subpath within the package
   * @param module - fetched module code and version to write
   */
  private async writeToCacheDir(name: string, subpath: string | undefined, module: FetchedModule): Promise<void> {
    const packageDirectory = getNodeModulesPath(name);

    // Ensure directory exists
    await this.filesystem.ensureDir(packageDirectory);

    // If subpath has nested directories (e.g., 'utils/debounce'), ensure parent dirs
    if (subpath?.includes('/')) {
      const subpathDirectory = `${packageDirectory}/${subpath.slice(0, subpath.lastIndexOf('/'))}`;
      await this.filesystem.ensureDir(subpathDirectory);
    }

    // Write code file FIRST
    const codePath = getCdnCachePath(name, subpath);
    await this.filesystem.writeFile(codePath, module.code);

    // Write package.json LAST (commit marker)
    const packageJsonPath = `${packageDirectory}/package.json`;
    const packageJson = {
      name,
      version: module.version,
      main: 'index.js',
      module: 'index.js',
    };

    // Only write package.json if it doesn't already exist (don't overwrite for subpath fetches)
    try {
      const exists = await this.filesystem.exists(packageJsonPath);
      if (!exists) {
        await this.filesystem.writeFile(packageJsonPath, JSON.stringify(packageJson, undefined, 2));
      }
    } catch {
      // First fetch for this package -- write it
      await this.filesystem.writeFile(packageJsonPath, JSON.stringify(packageJson, undefined, 2));
    }
  }
}
