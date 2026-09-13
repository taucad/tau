/**
 * Import Resolution Utilities
 *
 * Shared pure functions for import specifier parsing and path resolution.
 * Used by both the runtime worker (esbuild bundling) and the main thread
 * (Monaco navigation, type acquisition).
 *
 * All functions are pure -- no filesystem or network access.
 */

import { parsePackage, CDN_URLS } from 'cdn-resolve';

// =============================================================================
// Types
// =============================================================================

/** @public */
export type PackageInfo = {
  name: string;
  version: string;
  path: string;
};

// =============================================================================
// Root-level node_modules cache path
// =============================================================================

/**
 * Root directory for the CDN module cache in the virtual filesystem.
 * Lives at the filesystem root (`/`), outside any project directory (`/projects/xyz/`),
 * so cached modules are shared across all projects and persist across projects.
 */
const nodeModulesRoot = '/node_modules';

// =============================================================================
// Specifier Classification
// =============================================================================

/**
 * Check if a specifier is a bare import (not relative, absolute, or URL).
 *
 * Bare specifiers are package names like 'replicad', '@jscad/modeling', or 'lodash/debounce'.
 * Non-bare specifiers include relative paths ('./foo'), absolute paths ('/foo'),
 * and URLs ('https://cdn.example.com/foo').
 *
 * This utility is shared between the runtime worker (module resolution)
 * and the main thread (type acquisition).
 * @public
 */
export function isBareSpecifier(specifier: string): boolean {
  return !(
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    specifier.startsWith('http://') ||
    specifier.startsWith('https://')
  );
}

// =============================================================================
// CDN URL Package Extraction
// =============================================================================

/**
 * Configuration for a known npm CDN host.
 *
 * Each entry describes how to extract a standard npm package specifier
 * from a CDN URL. The extraction pipeline is:
 * 1. Match `hostname` against the URL
 * 2. Strip `prefix` from the pathname
 * 3. Apply `normalizePath` (if provided) to handle CDN-specific quirks
 * 4. Pass the result to `parsePackageSpecifier`
 *
 * To add a new CDN, simply append a new entry to the `cdnConfigs` array.
 */
type CdnConfig = {
  /** Hostname to match (e.g., 'esm.sh') */
  host: string;
  /** Path prefix to strip (e.g., '/npm/') */
  prefix: string;
  /**
   * Optional normalizer for CDN-specific path quirks.
   * Receives the path after prefix stripping, returns a clean
   * npm package specifier string.
   */
  normalizePath?: (path: string) => string;
};

/**
 * Registry of known npm CDN hosts.
 *
 * Built from cdn-resolve's CDN_URLS constant plus additional known CDN hosts.
 * After stripping `https://<host><prefix>` and applying `normalizePath`,
 * the remainder is a standard npm package specifier
 * (e.g., `replicad-decorate@1.0.0/dist/index.js`) that can be parsed
 * by `parsePackageSpecifier`.
 */
const cdnConfigs: readonly CdnConfig[] = [
  // --- cdn-resolve CDN_URLS ---
  { host: new URL(CDN_URLS.jsdelivr).hostname, prefix: new URL(CDN_URLS.jsdelivr).pathname + '/' },
  {
    host: new URL(CDN_URLS.esm).hostname,
    prefix: '/',
    normalizePath: (path: string) => path.replace(/^v\d+\//, ''), // Strip version prefix like v135/
  },
  { host: new URL(CDN_URLS.unpkg).hostname, prefix: '/' },
  // --- Additional CDN hosts ---
  { host: 'esm.run', prefix: '/' },
  {
    host: 'cdn.skypack.dev',
    prefix: '/',
    normalizePath(path) {
      if (!path.startsWith('pin/')) {
        return path;
      }

      // Pinned URLs: pin/react@v16.13.1-hash/file.js -> react@16.13.1/file.js
      const unpinned = path.slice(4);
      return unpinned.replace(/@v([\d.]+)[^/]*/, '@$1');
    },
  },
];

/**
 * Extract the npm package name from a CDN URL.
 *
 * Recognizes known npm CDN URL patterns and extracts the package name
 * by stripping the CDN host/prefix, applying CDN-specific normalization,
 * and delegating to `parsePackageSpecifier`.
 *
 * Examples:
 * - 'https://cdn.jsdelivr.net/npm/replicad-decorate/dist/index.js' -> 'replicad-decorate'
 * - 'https://esm.sh/lodash@4.17.21' -> 'lodash'
 * - 'https://unpkg.com/@scope/pkg@1.0.0/dist/index.js' -> '@scope/pkg'
 * - 'https://esm.sh/v135/lodash@4.17.21/index.d.ts' -> 'lodash'
 * - 'https://cdn.skypack.dev/qrcode-generator@2.0.4' -> 'qrcode-generator'
 * - 'https://cdn.skypack.dev/pin/react@v16.13.1-hash/react.js' -> 'react'
 * - 'https://example.com/not-a-cdn' -> undefined
 *
 * @param url - A full URL string
 * @returns The package name, or undefined if the URL is not a recognized CDN URL
 * @public
 */
export function extractPackageFromCdnUrl(url: string): string | undefined {
  const info = extractPackageInfoFromCdnUrl(url);
  return info?.name;
}

/**
 * Extract full package info (name, version, subpath) from a CDN URL.
 *
 * Like `extractPackageFromCdnUrl` but returns the full parsed package info
 * including version and subpath when available. This is used by the bundler
 * to construct esm.sh bundle URLs for non-esm.sh CDN imports.
 *
 * Examples:
 * - 'https://cdn.skypack.dev/qrcode-generator@2.0.4'
 *    -> { name: 'qrcode-generator', version: '2.0.4', path: '' }
 * - 'https://esm.sh/lodash@4.17.21'
 *    -> { name: 'lodash', version: '4.17.21', path: '' }
 *
 * @param url - A full URL string
 * @returns Package info, or undefined if the URL is not a recognized CDN URL
 * @public
 */
export function extractPackageInfoFromCdnUrl(url: string): PackageInfo | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const config = cdnConfigs.find((entry) => parsed.hostname === entry.host);
  if (!config) {
    return undefined;
  }

  const { pathname } = parsed;
  if (!pathname.startsWith(config.prefix)) {
    return undefined;
  }

  let packagePath = pathname.slice(config.prefix.length);

  // Apply CDN-specific normalization (version prefixes, pinned URLs, registry prefixes)
  if (config.normalizePath) {
    packagePath = config.normalizePath(packagePath);
  }

  if (!packagePath) {
    return undefined;
  }

  try {
    const info = parsePackageSpecifier(packagePath);
    return info.name ? info : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check whether a URL belongs to the esm.sh CDN.
 * @public
 */
export function isEsmShUrl(url: string): boolean {
  try {
    return new URL(url).hostname === new URL(CDN_URLS.esm).hostname;
  } catch {
    return false;
  }
}

// =============================================================================
// Package Specifier Parsing
// =============================================================================

/**
 * Parse a package specifier into name, version, and path components.
 * Uses cdn-resolve's parsePackage for robust parsing.
 *
 * Examples:
 * - 'replicad' -> { name: 'replicad', version: '', path: '' }
 * - 'replicad@0.19.1' -> { name: 'replicad', version: '0.19.1', path: '' }
 * - '@jscad/modeling@2.12.6/primitives' -> { name: '@jscad/modeling', version: '2.12.6', path: 'primitives' }
 * @public
 */
export function parsePackageSpecifier(specifier: string): PackageInfo {
  const parsed = parsePackage(specifier);
  // Cdn-resolve returns path with leading slash, but we need it without
  const parsedPath = parsed.path ?? '';
  const normalizedPath = parsedPath.startsWith('/') ? parsedPath.slice(1) : parsedPath;
  // Cdn-resolve returns 'latest' when no version specified, but we want ''
  const version = parsed.version === 'latest' ? '' : parsed.version;
  return {
    name: parsed.name,
    version,
    path: normalizedPath,
  };
}

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Resolve a relative import path against the importing file's directory.
 *
 * @param specifier - The relative import (e.g., './utils.ts', '../helpers.ts')
 * @param fromPath - Absolute path of the importing file
 * @returns Resolved absolute path
 * @public
 */
export function resolveRelativePath(specifier: string, fromPath: string): string {
  const directory = fromPath.slice(0, fromPath.lastIndexOf('/'));

  if (specifier.startsWith('./')) {
    return `${directory}/${specifier.slice(2)}`;
  }

  if (specifier.startsWith('../')) {
    const parts = directory.split('/');
    let upCount = 0;
    let remaining = specifier;

    while (remaining.startsWith('../')) {
      upCount++;
      remaining = remaining.slice(3);
    }

    const newParts = parts.slice(0, -upCount);
    return `${newParts.join('/')}/${remaining}`;
  }

  return specifier;
}

// =============================================================================
// Node Modules Path Helpers
// =============================================================================

/**
 * Get the root-level node_modules directory path for a package.
 *
 * @param packageName - Package name (e.g., 'lodash', '@jscad/modeling')
 * @returns Absolute path (e.g., '/node_modules/lodash')
 * @public
 */
export function getNodeModulesPath(packageName: string): string {
  return `${nodeModulesRoot}/${packageName}`;
}

/**
 * Get the full file path for a cached CDN module.
 *
 * @param packageName - Package name (e.g., 'lodash')
 * @param subpath - Optional subpath (e.g., 'debounce')
 * @returns Absolute file path:
 *   - No subpath: '/node_modules/lodash/index.js'
 *   - With subpath: '/node_modules/lodash/debounce.js'
 * @public
 */
export function getCdnCachePath(packageName: string, subpath?: string): string {
  const basePath = getNodeModulesPath(packageName);
  if (subpath) {
    return `${basePath}/${subpath}.js`;
  }

  return `${basePath}/index.js`;
}
