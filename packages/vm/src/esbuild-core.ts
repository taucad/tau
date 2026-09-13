/**
 * ESBuild Core
 *
 * Provides in-browser bundling using esbuild-wasm with custom plugins
 * for virtual filesystem integration and node_modules resolution.
 *
 * This module is designed to run in kernel workers and uses:
 * - A `vfs` namespace for project files (project-relative paths) and CDN modules
 * - A `builtin` namespace for pre-loaded modules served from memory (zero FS I/O)
 * - An `http-url` namespace for HTTP/HTTPS URLs fetched on demand
 * - ModuleManager for CDN module fetching and caching at root `/node_modules/`
 */

import * as esbuild from 'esbuild-wasm';
import type { Plugin, BuildOptions, Loader, Message, Metafile } from 'esbuild-wasm';
import type * as NodeFs from 'node:fs';
import type * as NodeOs from 'node:os';
import type * as NodePath from 'node:path';
import type * as NodeProcess from 'node:process';
import { isBareSpecifier, parsePackageSpecifier, getCdnCachePath, resolveRelativePath } from '@taucad/utils/import';
import { base64ToString } from 'uint8array-extras';
import type { VmIssue, VmFileSystem, VmExecuteResult } from '#types.js';
import type { BuiltinModule } from '#module-manager.js';
import { ModuleManager } from '#module-manager.js';
import { isNode } from '#environment.js';
import {
  esbuildNamespace,
  vfsNamespacePrefix,
  httpFetchTimeout,
  httpFetchMaxSizeBytes,
  nodeExecFilePrefix,
} from '#esbuild.constants.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Outcome of bundling a CAD script entry point. Contains the executable code and any compilation diagnostics.
 *
 * @public
 */
export type BundleResult = {
  /** The bundled code as a string */
  code: string;
  /** Source map (if enabled) */
  sourceMap?: string;
  /** Compilation issues (errors, warnings) */
  issues: VmIssue[];
  /** Whether bundling succeeded */
  success: boolean;
  /** Absolute paths of all project files that were resolved during bundling (transitive dependencies). */
  dependencies: string[];
  /** Absolute paths of imports that could not be resolved during bundling — used for watch-set expansion. */
  unresolvedPaths: string[];
};

/**
 * Configuration options for the in-browser esbuild bundler.
 *
 * @public
 */
export type BundlerOptions = {
  /** Filesystem interface for reading/writing files */
  filesystem: VmFileSystem;
  /** Base path for the project (e.g., /projects/project) */
  projectPath: string;
  /** Built-in modules to use as fallback */
  builtinModules: Map<string, BuiltinModule>;
  /** Enable source maps */
  sourceMaps?: boolean;
  /**
   * Names to auto-export from CommonJS-style entry files.
   * When code defines these as globals but doesn't export them,
   * the bundler adds `export { ... }` statements to prevent tree-shaking.
   * Defaults to `['main', 'defaultParams']`.
   */
  autoExportNames?: string[];
};

// =============================================================================
// WASM Configuration
// =============================================================================

// WASM URL using universal pattern for browsers and bundlers
// WASM file is copied from node_modules via copy-files-from-to
// @see https://web.dev/articles/bundling-non-js-resources#universal_pattern_for_browsers_and_bundlers
const esbuildWasmUrl = new URL('wasm/esbuild.wasm', import.meta.url).href;

const isNodejs = isNode();

// =============================================================================
// State
// =============================================================================

let esbuildInitialized = false;
let initializationPromise: Promise<void> | undefined;

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize esbuild-wasm. This must be called before bundling.
 * The initialization is cached - subsequent calls return immediately.
 *
 * Uses isomorphic initialization:
 * - Browser/Worker: wasmURL (fetches WASM via network from bundled file)
 * - Node.js: No options (uses child process to run native esbuild binary)
 *
 * @returns Promise that resolves when initialization is complete
 *
 * @public
 */
export async function initializeEsbuild(): Promise<void> {
  if (esbuildInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async (): Promise<void> => {
    try {
      await esbuild.initialize(isNodejs ? {} : { wasmURL: esbuildWasmUrl });

      esbuildInitialized = true;
    } catch (error) {
      initializationPromise = undefined;
      throw error;
    }
  })();

  return initializationPromise;
}

// =============================================================================
// Shared Helpers
// =============================================================================

/** Default names to auto-export from CommonJS-style entry files */
const defaultAutoExportNames = ['main', 'defaultParams'];

/** TypeScript ESM convention: `.js`/`.jsx` specifiers resolve to `.ts`/`.tsx` source files */
const tsExtensionSwap = new Map<string, readonly string[]>([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx']],
]);

/**
 * Resolve file extension for imports without extension.
 * Needs filesystem access, so it lives inside the plugin scope.
 *
 * @param filesystem - kernel filesystem to check file existence
 * @param path - import path to resolve
 * @returns resolved path with file extension appended
 */
async function resolveFileExtension(filesystem: VmFileSystem, path: string): Promise<string> {
  const extensionMatch = /\.[jt]sx?$/.exec(path);

  if (extensionMatch) {
    const fileExists = await filesystem.exists(path);
    if (fileExists) {
      return path;
    }

    const extension = extensionMatch[0];
    const swaps = tsExtensionSwap.get(extension);
    if (swaps) {
      const stem = path.slice(0, -extension.length);
      for (const swap of swaps) {
        const candidate = stem + swap;
        // oxlint-disable-next-line no-await-in-loop -- Intentional: short-circuits on first match
        if (await filesystem.exists(candidate)) {
          return candidate;
        }
      }
    }

    return path;
  }

  // Try common extensions in order
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];

  for (const extension of extensions) {
    const fullPath = path + extension;
    // oxlint-disable-next-line no-await-in-loop -- Intentional: short-circuits on first match
    if (await filesystem.exists(fullPath)) {
      return fullPath;
    }
  }

  // Return original path if no extension found
  return path;
}

/**
 * Vite-style query-suffix vocabulary mapped to esbuild's built-in loaders.
 *
 * `?raw` and `?text` decode bytes as UTF-8 with BOM stripping (esbuild `text` loader).
 * `?binary` exports a `Uint8Array` via base64-decoded runtime initialisation.
 * `?base64`/`?dataurl`/`?file` defer entirely to esbuild's named loaders so the asset
 * pipeline (default-export wrapping, MIME guessing, copy-emission) is identical to a
 * native esbuild build configured with the same loader for that file extension.
 *
 * Adding a new suffix is a one-line entry — no new namespace or onResolve hook needed.
 */
/* eslint-disable @typescript-eslint/naming-convention -- Vite query-suffix vocabulary uses literal `?suffix` keys for direct lookup */
const querySuffixToLoader: Record<string, Loader> = {
  '?raw': 'text',
  '?text': 'text',
  '?binary': 'binary',
  '?base64': 'base64',
  '?dataurl': 'dataurl',
  '?file': 'file',
};
/* eslint-enable @typescript-eslint/naming-convention -- end of literal-suffix map */

/** Single regex powering the suffix detection — must align with `querySuffixToLoader` keys. */
const querySuffixRegex = /\?(base64|binary|dataurl|file|raw|text)$/;

/**
 * TC39 import-attribute `type` values that map to esbuild loaders.
 *
 * `with { type: 'text' }` is the JavaScript [import-text proposal](https://github.com/tc39/proposal-import-text).
 * `with { type: 'bytes' }` is the JavaScript [import-bytes proposal](https://github.com/tc39/proposal-import-bytes).
 *
 * These work alongside Vite-style query suffixes; whichever is present wins.
 */
const importAttributeTypeToLoader: Record<string, Loader> = {
  text: 'text',
  bytes: 'binary',
};

/**
 * Pick a loader override from an esbuild `args.suffix` (Vite-style) or `args.with.type` (TC39).
 *
 * Returns `undefined` when neither dispatcher matches — callers fall through to the
 * default file-extension-based loader selection.
 *
 * @param suffix - the `args.suffix` field from `OnLoadArgs`
 * @param withType - the `args.with.type` field from `OnLoadArgs`
 * @returns esbuild loader override, or undefined when no suffix/attribute applies
 */
function resolveAssetLoader(suffix: string, withType: string | undefined): Loader | undefined {
  if (suffix && querySuffixToLoader[suffix]) {
    return querySuffixToLoader[suffix];
  }

  if (withType && importAttributeTypeToLoader[withType]) {
    return importAttributeTypeToLoader[withType];
  }

  return undefined;
}

/**
 * Strip a recognised Vite-style query suffix from an import path.
 *
 * Returns the cleaned path and the matched suffix (including the leading `?`)
 * so callers can pass it to esbuild's `OnResolveResult.suffix`. Paths without
 * a recognised suffix are returned untouched with an empty suffix.
 *
 * @param importPath - raw import specifier as it appears in source code
 * @returns split `{ cleanPath, suffix }` where `suffix` is `''` when no match
 */
function splitQuerySuffix(importPath: string): { cleanPath: string; suffix: string } {
  const match = querySuffixRegex.exec(importPath);
  if (!match) {
    return { cleanPath: importPath, suffix: '' };
  }

  return { cleanPath: importPath.slice(0, -match[0].length), suffix: match[0] };
}

/**
 * Strip a `?query` or `#fragment` from a project-relative path so that suffix-bearing
 * metafile keys collapse onto the underlying filesystem path used for watching.
 *
 * @param relativePath - project-relative path possibly carrying a query/fragment
 * @returns the path with everything from the first `?` or `#` removed
 */
function stripPathQuery(relativePath: string): string {
  const queryStart = relativePath.search(/[#?]/);
  return queryStart === -1 ? relativePath : relativePath.slice(0, queryStart);
}

/**
 * Determine the esbuild loader based on file extension.
 *
 * @param filePath - file path to extract extension from
 * @returns esbuild loader type for the file
 */
function getLoader(filePath: string): 'ts' | 'tsx' | 'js' | 'jsx' | 'json' | 'text' {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (extension) {
    case 'ts': {
      return 'ts';
    }

    case 'tsx': {
      return 'tsx';
    }

    case 'jsx': {
      return 'jsx';
    }

    case 'json': {
      return 'json';
    }

    default: {
      return 'js';
    }
  }
}

// =============================================================================
// CommonJS Export Helpers
// =============================================================================

/**
 * Add CommonJS-style exports to source code if needed.
 *
 * When code defines any of the `names` as globals but doesn't export them,
 * this function adds the necessary export statements at the end of the code.
 *
 * This must be done at the source level (before bundling) to prevent esbuild
 * from tree-shaking away the unexported functions.
 *
 * Special handling for `main`: if `export default` already exists, `main` is
 * considered exported and won't be added again.
 *
 * @param code - The source code to transform
 * @param names - List of symbol names to auto-export
 * @returns The transformed code with exports added if needed
 */
function addCommonJsExports(code: string, names: string[]): string {
  const exportsToAdd: string[] = [];

  for (const name of names) {
    // Check if already exported
    const hasNamedExport =
      new RegExp(`\\bexport\\s+\\{\\s*[^}]*\\b${name}\\b`).test(code) ||
      new RegExp(`\\bexport\\s+(const|function|let|var)\\s+${name}\\b`).test(code);

    if (hasNamedExport) {
      continue;
    }

    // Special case: `main` is considered exported if `export default` exists
    if (name === 'main' && /\bexport\s+default\b/.test(code)) {
      continue;
    }

    // Check if code defines this symbol (not exported)
    const defines =
      new RegExp(`\\bfunction\\s+${name}\\s*\\(`).test(code) ||
      new RegExp(`\\b(const|let|var)\\s+${name}\\s*=`).test(code);

    if (defines) {
      exportsToAdd.push(name);
    }
  }

  if (exportsToAdd.length > 0) {
    return code + `\nexport { ${exportsToAdd.join(', ')} };\n`;
  }

  return code;
}

// =============================================================================
// Source Map Extraction
// =============================================================================

/**
 * Extract the inline source map JSON from bundled code.
 *
 * esbuild with `sourcemap: 'inline'` appends a base64-encoded source map
 * as a data URL comment. This extracts and decodes it for programmatic use.
 *
 * @param code - Bundled code potentially containing an inline source map
 * @returns Decoded source map JSON string, or undefined if not found
 */
function extractInlineSourceMap(code: string): string | undefined {
  const match = /\/\/# sourceMappingURL=data:application\/json;base64,(.+)$/m.exec(code);
  if (!match?.[1]) {
    return undefined;
  }

  return base64ToString(match[1]);
}

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Resolve an esbuild file path to a clean project-relative path.
 *
 * esbuild prefixes file paths with `namespace:` for custom namespaces.
 * Since the plugin uses project-relative paths in the vfs namespace,
 * stripping the prefix yields a clean filename (e.g., `main.ts`).
 *
 * @param filePath - esbuild file path, possibly prefixed with namespace
 * @returns clean project-relative path
 */
function resolveEsbuildFilePath(filePath: string): string {
  return filePath.startsWith(vfsNamespacePrefix) ? filePath.slice(vfsNamespacePrefix.length) : filePath;
}

// =============================================================================
// Production VFS Plugin
// =============================================================================

/**
 * Configuration for the vfs-namespace esbuild plugin that resolves project files, builtins, and CDN modules.
 *
 * @public
 */
export type VfsPluginOptions = {
  filesystem: VmFileSystem;
  moduleManager: ModuleManager;
  builtinModules: Map<string, BuiltinModule>;
  projectPath: string;
  entryPath: string;
  autoExportNames: string[];
  /** Collects absolute paths of project files accessed during the build, even on failure. */
  accessedProjectFiles?: Set<string>;
  /** Collects absolute paths of imports that could not be resolved during the build. */
  unresolvedPaths?: Set<string>;
};

/**
 * Create a plugin that resolves and loads files from the kernel filesystem.
 *
 * Architecture:
 * - `vfs` namespace: Project files (project-relative paths) and CDN modules
 * - `builtin` namespace: Built-in modules served directly from memory (zero FS I/O)
 * - `http-url` namespace: HTTP/HTTPS URLs fetched on demand
 *
 * Project files use project-relative paths (e.g., `main.ts`, `src/utils.ts`) within
 * the `vfs` namespace. All filesystem I/O reconstructs absolute paths from the
 * relative esbuild path + projectPath.
 *
 * Bare specifier resolution:
 * 1. Builtins (replicad, jscad, zod) -> `builtin` namespace (memory)
 * 2. CDN modules -> ensure cached at `/node_modules/`, then `vfs` namespace
 * 3. Relative/absolute imports -> resolved via filesystem with extension probing
 *
 * @param options - plugin configuration with filesystem, modules, and paths
 * @returns esbuild plugin for vfs-namespace module resolution
 *
 * @public
 */
export function createVfsPlugin(options: VfsPluginOptions): Plugin {
  const {
    filesystem,
    moduleManager,
    builtinModules,
    projectPath,
    entryPath,
    autoExportNames,
    accessedProjectFiles,
    unresolvedPaths,
  } = options;

  // Path conversion helpers: esbuild sees project-relative paths in the vfs namespace,
  // but all filesystem I/O uses absolute paths.
  const projectPrefix = projectPath.endsWith('/') ? projectPath : projectPath + '/';

  /**
   * Convert absolute filesystem path to project-relative path for esbuild identity.
   *
   * @param absolutePath - absolute filesystem path
   * @returns project-relative path
   */
  function toRelative(absolutePath: string): string {
    return absolutePath.startsWith(projectPrefix) ? absolutePath.slice(projectPrefix.length) : absolutePath;
  }

  /**
   * Reconstruct absolute filesystem path from esbuild's project-relative path for filesystem I/O.
   *
   * @param relativePath - project-relative path from esbuild
   * @returns absolute filesystem path
   */
  function toAbsolute(relativePath: string): string {
    return relativePath.startsWith('/') ? relativePath : `${projectPrefix}${relativePath}`;
  }

  // Pre-compute the relative entry path for comparison in onLoad
  const relativeEntryPath = toRelative(entryPath);

  return {
    name: esbuildNamespace.vfs,
    setup(build) {
      // -----------------------------------------------------------------
      // onResolve: all imports
      // -----------------------------------------------------------------
      // oxlint-disable-next-line complexity -- TOOD: refactor
      build.onResolve({ filter: /.*/ }, async (args) => {
        // Entry point: convert to project-relative path in vfs namespace
        if (args.kind === 'entry-point') {
          return { path: toRelative(args.path), namespace: esbuildNamespace.vfs };
        }

        // Imports originating from the http-url namespace (sub-imports within
        // fetched CDN modules) must be resolved by the namespace-specific handlers
        // registered below. Only full URLs are handled here; relative, absolute, and
        // bare paths are passed through by returning undefined so esbuild falls
        // through to the http-url onResolve handlers.
        if (args.namespace === esbuildNamespace.httpUrl) {
          if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
            return { path: args.path, namespace: esbuildNamespace.httpUrl };
          }

          // Let the http-url-specific onResolve handlers below handle this import
          return undefined;
        }

        // Handle data: URLs (esbuild internal)
        if (args.path.startsWith('data:')) {
          return { external: true };
        }

        // Handle http/https URLs - fetch and bundle them
        if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
          return { path: args.path, namespace: esbuildNamespace.httpUrl };
        }

        // --- Bare specifiers ---
        if (isBareSpecifier(args.path)) {
          const packageInfo = parsePackageSpecifier(args.path);

          // Builtins: check full specifier first (e.g., '@jscad/modeling/primitives'),
          // then fall back to root package name (e.g., '@jscad/modeling')
          const fullSpecifier = packageInfo.path ? `${packageInfo.name}/${packageInfo.path}` : packageInfo.name;
          if (builtinModules.has(fullSpecifier)) {
            return { path: fullSpecifier, namespace: esbuildNamespace.builtin };
          }

          if (builtinModules.has(packageInfo.name)) {
            return { path: packageInfo.name, namespace: esbuildNamespace.builtin };
          }

          // CDN modules: ensure cached at root /node_modules/, return vfs-namespace path
          // These keep absolute paths since they're outside the project directory
          try {
            const cachePath = getCdnCachePath(packageInfo.name, packageInfo.path || undefined);
            await moduleManager.ensureCdnModule(packageInfo.name, packageInfo.path || undefined);
            return { path: cachePath, namespace: esbuildNamespace.vfs };
          } catch (error) {
            return {
              errors: [
                {
                  text: `Failed to resolve '${args.path}': ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }
        }

        // --- Relative / absolute imports ---
        // Reconstruct the importer's absolute path for resolution, since
        // project files use relative paths in esbuild
        const importerAbsolute = toAbsolute(args.importer || relativeEntryPath);

        // CDN-relative paths: when a cached CDN module (under /node_modules/)
        // imports an absolute path like /@thi.ng/vectors@^8.6.20/..., resolve
        // it against the esm.sh CDN origin rather than the local filesystem.
        if (args.path.startsWith('/') && importerAbsolute.startsWith('/node_modules/')) {
          return {
            path: `https://esm.sh${args.path}`,
            namespace: esbuildNamespace.httpUrl,
          };
        }

        // Vite-style query suffixes (`?raw`/`?text`/`?binary`/`?base64`/`?dataurl`/`?file`).
        // Strip the suffix so the file lookup hits, then round-trip it through esbuild's
        // idiomatic `OnResolveResult.suffix` so `(namespace, path, suffix)` module identity
        // works automatically and the loader dispatches in `onLoad` via `args.suffix`.
        const { cleanPath, suffix } = splitQuerySuffix(args.path);

        try {
          const resolvedPath = resolveRelativePath(cleanPath, importerAbsolute);
          // Suffixed imports always carry the full filename — skip extension probing.
          const withExtension = suffix ? resolvedPath : await resolveFileExtension(filesystem, resolvedPath);

          if (unresolvedPaths && withExtension === resolvedPath && !suffix && !/\.[jt]sx?$/.test(resolvedPath)) {
            const extensionVariants = ['.ts', '.tsx', '.js', '.jsx'];
            for (const extension of extensionVariants) {
              unresolvedPaths.add(resolvedPath + extension);
            }
          }

          return {
            path: toRelative(withExtension),
            namespace: esbuildNamespace.vfs,
            ...(suffix ? { suffix } : {}),
          };
        } catch (error) {
          return {
            errors: [
              {
                text: `Failed to resolve '${args.path}': ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      });

      // -----------------------------------------------------------------
      // onLoad: builtin namespace (serve from memory)
      // -----------------------------------------------------------------
      build.onLoad({ filter: /.*/, namespace: esbuildNamespace.builtin }, (args) => {
        const builtin = builtinModules.get(args.path);
        if (!builtin) {
          return {
            errors: [{ text: `Built-in module '${args.path}' not found` }],
          };
        }

        return { contents: builtin.code, loader: 'js' };
      });

      // -----------------------------------------------------------------
      // onLoad: HTTP/HTTPS URLs
      // -----------------------------------------------------------------
      build.onLoad({ filter: /.*/, namespace: esbuildNamespace.httpUrl }, async (args) => {
        try {
          const response = await fetch(args.path, {
            signal: AbortSignal.timeout(httpFetchTimeout),
          });
          if (!response.ok) {
            return {
              errors: [
                {
                  text: `Failed to fetch '${args.path}': ${response.status} ${response.statusText}`,
                },
              ],
            };
          }

          // Guard against oversized responses
          const contentLength = response.headers.get('content-length');
          if (contentLength && Number(contentLength) > httpFetchMaxSizeBytes) {
            return {
              errors: [
                {
                  text: `Remote module '${args.path}' exceeds maximum size of ${httpFetchMaxSizeBytes} bytes (${contentLength} bytes)`,
                },
              ],
            };
          }

          const contents = await response.text();

          // Check actual size after download (content-length may be absent or incorrect)
          if (contents.length > httpFetchMaxSizeBytes) {
            return {
              errors: [
                {
                  text: `Remote module '${args.path}' exceeds maximum size of ${httpFetchMaxSizeBytes} bytes`,
                },
              ],
            };
          }

          const loader = getLoader(new URL(args.path).pathname);

          return { contents, loader };
        } catch (error) {
          return {
            errors: [
              {
                text: `Failed to fetch '${args.path}': ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      });

      // -----------------------------------------------------------------
      // onResolve: relative imports within HTTP modules (e.g. ./lib/foo.js)
      // -----------------------------------------------------------------
      build.onResolve({ filter: /^\./, namespace: esbuildNamespace.httpUrl }, (args) => {
        // Resolve relative to the importer URL (resolveDir is unreliable for URLs)
        const resolvedUrl = new URL(args.path, args.importer).href;
        return { path: resolvedUrl, namespace: esbuildNamespace.httpUrl };
      });

      // -----------------------------------------------------------------
      // onResolve: absolute-path imports within HTTP modules (e.g. /lodash@4.17.21/es2022/lodash.mjs)
      // -----------------------------------------------------------------
      build.onResolve({ filter: /^\//, namespace: esbuildNamespace.httpUrl }, (args) => {
        // Resolve absolute paths against the importer's origin
        const importerUrl = new URL(args.importer);
        const resolvedUrl = new URL(args.path, importerUrl.origin).href;
        return { path: resolvedUrl, namespace: esbuildNamespace.httpUrl };
      });

      // -----------------------------------------------------------------
      // onResolve: bare imports within HTTP modules (e.g. lit-html/lib/shady-render.js)
      // Bare specifiers can't be resolved against the importer's CDN origin because
      // CDNs use different URL schemes (e.g. JSPM uses npm: prefixes, Skypack uses
      // hashed pins). Instead, resolve through esm.sh which handles bare specifiers.
      // -----------------------------------------------------------------
      build.onResolve({ filter: /^[^./]/, namespace: esbuildNamespace.httpUrl }, (args) => {
        const resolvedUrl = `https://esm.sh/${args.path}`;
        return { path: resolvedUrl, namespace: esbuildNamespace.httpUrl };
      });

      // -----------------------------------------------------------------
      // onLoad: vfs namespace (project files + CDN cache)
      // -----------------------------------------------------------------
      build.onLoad({ filter: /.*/, namespace: esbuildNamespace.vfs }, async (args) => {
        const absolutePath = toAbsolute(args.path);
        const isNodeModules = absolutePath.includes('/node_modules/');
        const resolveDirectory = absolutePath.slice(0, absolutePath.lastIndexOf('/'));

        // Vite-style query suffixes (`?raw`/`?text`/...) and TC39 `with { type }` import
        // attributes both route through esbuild's built-in loaders. Read raw bytes and let
        // the chosen loader handle UTF-8 decoding (with BOM strip), base64 emission, or
        // pass-through binary so we don't reinvent any of that downstream.
        const overrideLoader = resolveAssetLoader(args.suffix, args.with['type']);

        if (overrideLoader) {
          try {
            const bytes = await filesystem.readFile(absolutePath);
            if (!isNodeModules) {
              accessedProjectFiles?.add(absolutePath);
            }
            return { contents: bytes, loader: overrideLoader, resolveDir: resolveDirectory };
          } catch (error) {
            if (unresolvedPaths && !isNodeModules) {
              unresolvedPaths.add(absolutePath);
            }
            return {
              errors: [
                {
                  text: `Failed to load '${args.path}': ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }
        }

        try {
          let content = await filesystem.readFile(absolutePath, 'utf8');
          const loader = getLoader(args.path);

          // Track project files accessed during the build so that even on
          // build failure the caller knows which files were touched.
          if (!isNodeModules) {
            accessedProjectFiles?.add(absolutePath);
          }

          // For the entry file (not node_modules), add CommonJS exports if needed
          // This prevents esbuild from tree-shaking away unexported main/defaultParams
          const isEntryFile = args.path === relativeEntryPath;

          if (isEntryFile && !isNodeModules && (loader === 'js' || loader === 'ts')) {
            content = addCommonJsExports(content, autoExportNames);
          }

          return {
            contents: content,
            loader,
            resolveDir: resolveDirectory,
          };
        } catch (error) {
          if (unresolvedPaths && !isNodeModules) {
            unresolvedPaths.add(absolutePath);
          }

          return {
            errors: [
              {
                text: `Failed to load '${args.path}': ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      });
    },
  };
}

// =============================================================================
// EsbuildBundler Class
// =============================================================================

/**
 * In-browser esbuild bundler for CAD scripts with virtual filesystem and CDN module support.
 *
 * @public
 */
export class EsbuildBundler {
  private readonly filesystem: VmFileSystem;
  private readonly projectPath: string;
  private readonly builtinModules: Map<string, BuiltinModule>;
  private readonly moduleManager: ModuleManager;
  private readonly sourceMaps: boolean;
  private readonly autoExportNames: string[];

  public constructor(options: BundlerOptions) {
    this.filesystem = options.filesystem;
    this.projectPath = options.projectPath;
    this.builtinModules = options.builtinModules;
    this.sourceMaps = options.sourceMaps ?? true;
    this.autoExportNames = options.autoExportNames ?? defaultAutoExportNames;

    this.moduleManager = new ModuleManager(options.filesystem);
  }

  /**
   * Get the project path this bundler was configured for.
   *
   * @returns absolute project path
   */
  public getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Initialize the bundler (must be called before bundling).
   */
  public async initialize(): Promise<void> {
    await initializeEsbuild();
  }

  /**
   * Register or update a builtin module on the live bundler instance.
   * Used to replace detection stubs with real module code after kernel init.
   *
   * @param name - module name (e.g., 'replicad')
   * @param builtinModule - module definition to register
   */
  public registerModule(name: string, builtinModule: BuiltinModule): void {
    this.builtinModules.set(name, builtinModule);
  }

  /**
   * Dispose of the bundler and release resources.
   */
  public dispose(): void {
    this.moduleManager.clearCaches();
  }

  /**
   * Bundle a file and all its dependencies.
   *
   * @param entryPath - Absolute path to the entry file
   * @returns Bundle result with code and any issues
   */
  public async bundle(entryPath: string): Promise<BundleResult> {
    const issues: VmIssue[] = [];
    const accessedProjectFiles = new Set<string>();
    const unresolvedPaths = new Set<string>();

    try {
      // Create banner to inject CommonJS-style globals for built-in modules
      // This allows code like `const { draw } = replicad;` to work without imports
      // Only root modules with a globalName are included (not submodules)
      // Also define module/exports objects to prevent runtime errors in CommonJS-style code
      const moduleGlobals = [...this.builtinModules.entries()]
        .filter(([, module_]) => module_.globalName)
        .map(
          ([name, module_]) =>
            `const ${module_.globalName} = globalThis.__KERNEL_MODULES__?.get(${JSON.stringify(name)});`,
        )
        .join('\n');
      const commonjsBanner = `${moduleGlobals}
const exports = {};
const module = { exports };
`;

      const buildOptions: BuildOptions = {
        entryPoints: [entryPath],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        metafile: true,
        sourcemap: this.sourceMaps ? 'inline' : false,
        platform: 'browser',
        plugins: [
          createVfsPlugin({
            filesystem: this.filesystem,
            moduleManager: this.moduleManager,
            builtinModules: this.builtinModules,
            projectPath: this.projectPath,
            entryPath,
            autoExportNames: this.autoExportNames,
            accessedProjectFiles,
            unresolvedPaths,
          }),
        ],
        // Ensure we don't try to resolve node built-ins
        external: [],
        logLevel: 'silent',
        banner: { js: commonjsBanner },
      };

      const result = await esbuild.build(buildOptions);

      // Extract project-file dependencies from the metafile.
      // Keys in metafile.inputs use the format "namespace:path".
      // Project files live in the vfs namespace with project-relative paths.
      // CDN/node_modules paths are excluded (tracked via asset hashes separately).
      const dependencies = this.extractDependencies(result.metafile);

      // Collect warnings
      for (const warning of result.warnings) {
        issues.push(this.convertEsbuildMessage(warning, 'warning'));
      }

      // Collect errors
      for (const error of result.errors) {
        issues.push(this.convertEsbuildMessage(error, 'error'));
      }

      // Get output
      if (result.outputFiles && result.outputFiles.length > 0) {
        const output = result.outputFiles[0]!;
        const sourceMap = this.sourceMaps ? extractInlineSourceMap(output.text) : undefined;
        return {
          code: output.text,
          sourceMap,
          issues,
          dependencies,
          unresolvedPaths: [...unresolvedPaths],
          success: result.errors.length === 0,
        };
      }

      return {
        code: '',
        dependencies,
        unresolvedPaths: [...unresolvedPaths],
        issues: [
          ...issues,
          {
            message: 'No output generated',
            code: 'BUNDLER_FAILED',
            type: 'compilation',
            severity: 'error',
          },
        ],
        success: false,
      };
    } catch (error) {
      // Handle build errors
      if (error && typeof error === 'object' && 'errors' in error) {
        const buildErrors = error as { errors: Message[]; warnings: Message[] };

        for (const errorMessage of buildErrors.errors) {
          issues.push(this.convertEsbuildMessage(errorMessage, 'error'));
        }

        for (const warningMessage of buildErrors.warnings) {
          issues.push(this.convertEsbuildMessage(warningMessage, 'warning'));
        }
      } else {
        issues.push({
          message: error instanceof Error ? error.message : String(error),
          code: 'BUNDLER_FAILED',
          type: 'compilation',
          severity: 'error',
        });
      }

      return {
        code: '',
        dependencies: [...accessedProjectFiles],
        unresolvedPaths: [...unresolvedPaths],
        issues,
        success: false,
      };
    }
  }

  /**
   * Extract absolute paths of project-file dependencies from the esbuild metafile.
   *
   * Metafile input keys use "namespace:path" format. Project files live in the
   * `vfs` namespace with project-relative paths. CDN/node_modules and builtin
   * modules are excluded since they are tracked separately via asset hashes.
   *
   * @param metafile - The esbuild metafile from a build with `metafile: true`
   * @returns Absolute paths of all project files involved in the bundle
   */
  private extractDependencies(metafile: Metafile | undefined): string[] {
    if (!metafile) {
      return [];
    }

    const projectPrefix = this.projectPath.endsWith('/') ? this.projectPath : this.projectPath + '/';
    const dependencies: string[] = [];

    for (const inputKey of Object.keys(metafile.inputs)) {
      // Only include project files from the vfs namespace
      if (!inputKey.startsWith(vfsNamespacePrefix)) {
        continue;
      }

      // Collapse Vite-style query suffixes / hashes onto the underlying path so the
      // watch set tracks `lib/cube.step?raw` as `lib/cube.step` regardless of how
      // esbuild folds the suffix into the metafile key.
      const relativePath = stripPathQuery(inputKey.slice(vfsNamespacePrefix.length));

      // Exclude CDN/node_modules paths (they start with '/')
      if (relativePath.startsWith('/')) {
        continue;
      }

      // Convert project-relative path to absolute
      dependencies.push(`${projectPrefix}${relativePath}`);
    }

    return dependencies;
  }

  /**
   * Convert an esbuild message to a VmIssue.
   *
   * File paths in esbuild messages use the format `namespace:path`. Since the plugin
   * stores project-relative paths in the `vfs` namespace, we strip the `vfs:` prefix
   * to produce clean filenames (e.g., `main.ts`) for UI display and FileLink navigation.
   *
   * @param message - esbuild error or warning message
   * @param severity - issue severity level
   * @returns converted kernel issue
   */
  private convertEsbuildMessage(message: Message, severity: 'error' | 'warning'): VmIssue {
    const issue: VmIssue = {
      message: message.text,
      code: 'BUNDLER_FAILED',
      type: 'compilation',
      severity,
    };

    if (message.location) {
      issue.location = {
        fileName: resolveEsbuildFilePath(message.location.file),
        startLineNumber: message.location.line,
        startColumn: message.location.column,
      };
    }

    return issue;
  }
}

// =============================================================================
// Detection Plugin
// =============================================================================

/**
 * Options for the detection-only esbuild plugin used for kernel import detection.
 *
 * @public
 */
export type DetectionPluginOptions = {
  filesystem: VmFileSystem;
  projectPath: string;
};

/**
 * Create a detection-only esbuild plugin.
 *
 * This is a simplified version of the production vfs plugin. The key difference:
 * bare specifiers are marked as `external` instead of being resolved via builtinModules
 * or CDN. This means esbuild reports what was imported without needing any modules
 * to be registered, eliminating the chicken-and-egg problem for kernel detection.
 *
 * Relative imports are still resolved normally via the vfs namespace so the full import tree
 * is walked correctly (TypeScript, barrel files, re-exports all handled).
 *
 * @returns esbuild plugin for import detection
 *
 * @public
 */
export function createDetectionPlugin({ filesystem, projectPath }: DetectionPluginOptions): Plugin {
  const projectPrefix = projectPath.endsWith('/') ? projectPath : projectPath + '/';

  function toRelative(absolutePath: string): string {
    return absolutePath.startsWith(projectPrefix) ? absolutePath.slice(projectPrefix.length) : absolutePath;
  }

  function toAbsolute(relativePath: string): string {
    return relativePath.startsWith('/') ? relativePath : `${projectPrefix}${relativePath}`;
  }

  return {
    name: `${esbuildNamespace.vfs}-detection`,
    setup(build) {
      let relativeEntryPath = '';

      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.kind === 'entry-point') {
          relativeEntryPath = toRelative(args.path);
          return { path: relativeEntryPath, namespace: esbuildNamespace.vfs };
        }

        if (args.namespace === esbuildNamespace.httpUrl || args.path.startsWith('data:')) {
          return { external: true };
        }

        if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
          return { external: true };
        }

        if (isBareSpecifier(args.path)) {
          return { path: args.path, external: true };
        }

        const importerAbsolute = toAbsolute(args.importer || relativeEntryPath);

        // Mirror the production resolver: strip Vite-style query suffixes so the
        // import-detection pass walks the underlying file (no bare specifiers can
        // hide inside an asset). The TC39 `with { type }` path is automatically
        // covered because the import path itself stays unchanged.
        const { cleanPath, suffix } = splitQuerySuffix(args.path);

        try {
          const resolvedPath = resolveRelativePath(cleanPath, importerAbsolute);
          const withExtension = suffix ? resolvedPath : await resolveFileExtension(filesystem, resolvedPath);
          return {
            path: toRelative(withExtension),
            namespace: esbuildNamespace.vfs,
            ...(suffix ? { suffix } : {}),
          };
        } catch {
          return { external: true };
        }
      });

      build.onLoad({ filter: /.*/, namespace: esbuildNamespace.vfs }, async (args) => {
        // Detection pass should never feed binary asset content into esbuild's parser.
        // Suffixed/attributed imports point at non-source files (text, binary, base64,
        // dataurl, file) which cannot contain bare specifiers, so we stub them out.
        if (resolveAssetLoader(args.suffix, args.with['type'])) {
          return { contents: '', loader: 'js' };
        }

        try {
          const absolutePath = toAbsolute(args.path);
          const content = await filesystem.readFile(absolutePath, 'utf8');
          const loader = getLoader(args.path);
          return {
            contents: content,
            loader,
            resolveDir: absolutePath.slice(0, absolutePath.lastIndexOf('/')),
          };
        } catch (error) {
          return {
            errors: [
              {
                text: `Failed to load '${args.path}': ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      });
    },
  };
}

/**
 * Extract project file dependencies from an esbuild metafile.
 *
 * @param metafile - esbuild metafile output, or undefined if unavailable
 * @param projectPath - absolute project path for prefix matching
 * @returns array of absolute file paths for project dependencies
 *
 * @public
 */
export function extractProjectDependencies(metafile: Metafile | undefined, projectPath: string): string[] {
  if (!metafile) {
    return [];
  }

  const projectPrefix = projectPath.endsWith('/') ? projectPath : projectPath + '/';
  const dependencies: string[] = [];

  for (const inputKey of Object.keys(metafile.inputs)) {
    if (!inputKey.startsWith(vfsNamespacePrefix)) {
      continue;
    }

    // Strip query/fragment so `vfs:lib/cube.step?raw` collapses onto its filesystem path.
    const relativePath = stripPathQuery(inputKey.slice(vfsNamespacePrefix.length));

    if (relativePath.startsWith('/')) {
      continue;
    }

    dependencies.push(`${projectPrefix}${relativePath}`);
  }

  return dependencies;
}

/**
 * Extract external module specifiers from esbuild metafile output imports.
 *
 * @param metafile - esbuild metafile output, or undefined if unavailable
 * @returns array of external module specifiers
 *
 * @public
 */
export function extractExternalImports(metafile: Metafile | undefined): string[] {
  if (!metafile) {
    return [];
  }

  const externals = new Set<string>();
  for (const output of Object.values(metafile.outputs)) {
    for (const imp of output.imports) {
      if (imp.external) {
        externals.add(imp.path);
      }
    }
  }

  return [...externals];
}

// =============================================================================
// Execution
// =============================================================================

const executeCacheMap = new Map<string, unknown>();
let nodeExecuteCounter = 0;

type ExecuteCodeOptions = {
  /** Reuse module exports for identical bundled code strings. */
  cache?: boolean;
};

const importNodeBuiltin = async <T>(specifier: string): Promise<T> =>
  import(/* @vite-ignore */ specifier) as Promise<T>;

/**
 * Strip inline source map comments to prevent Node.js `--enable-source-maps`
 * from applying them before our own stack trace parser has a chance to.
 *
 * @param code - bundled module source potentially containing an inline source-map comment
 * @returns the input source with the inline source-map comment removed
 */
function stripInlineSourceMap(code: string): string {
  return code.replace(/\/\/# sourceMappingURL=data:[^\n]+$/m, '');
}

/**
 * Execute bundled code in Node.js without statically importing Node built-ins.
 *
 * Browser/client bundlers still parse this file, so Node imports are intentionally hidden behind
 * an opaque dynamic importer and guarded by `isNode()`.
 *
 * @param code - bundled JavaScript code to execute
 * @returns module exports and the temp-file URL used for import
 */
async function executeCodeInNode(code: string): Promise<{ value: unknown; entryUrl: string }> {
  const [fs, os, path, nodeProcess] = await Promise.all([
    importNodeBuiltin<typeof NodeFs>('node:fs'),
    importNodeBuiltin<typeof NodeOs>('node:os'),
    importNodeBuiltin<typeof NodePath>('node:path'),
    importNodeBuiltin<typeof NodeProcess>('node:process'),
  ]);

  const temporaryFile = path.join(os.tmpdir(), `${nodeExecFilePrefix}${nodeProcess.pid}-${++nodeExecuteCounter}.mjs`);
  const entryUrl = `file://${temporaryFile}?v=${nodeExecuteCounter}`;
  fs.writeFileSync(temporaryFile, stripInlineSourceMap(code), 'utf8');
  try {
    const value: unknown = await import(/* @vite-ignore */ entryUrl);
    return { value, entryUrl };
  } finally {
    try {
      fs.unlinkSync(temporaryFile);
    } catch {
      // Best-effort cleanup; the OS will reclaim the temp file if unlink fails.
    }
  }
}

/**
 * Clear the module execute cache.
 *
 * When called with a specific code string, only that entry is removed.
 * When called with no arguments, all entries are cleared.
 *
 * @param code - optional code string to clear a specific cache entry
 *
 * @public
 */
export function clearExecuteCache(code?: string): void {
  if (code === undefined) {
    executeCacheMap.clear();
  } else {
    executeCacheMap.delete(code);
  }
}

/**
 * Execute bundled JS/TS code via dynamic import.
 * Browser uses Blob URL, Node.js writes a temp file (data: URL imports
 * break under ESM loader hooks like `@oxc-node/core/register` or `tsx`).
 *
 * Results are cached by code string — identical code returns the same
 * module object without re-evaluating. Use `clearExecuteCache` to invalidate.
 *
 * @param code - bundled JavaScript code to execute
 * @param options - execution behavior.
 * @returns execution result with exported module and cleanup function
 *
 * @public
 */
export async function executeCode<T = unknown>(
  code: string,
  options: ExecuteCodeOptions = {},
): Promise<VmExecuteResult<T>> {
  const useCache = options.cache ?? true;
  const cached = useCache ? executeCacheMap.get(code) : undefined;
  if (useCache && cached !== undefined) {
    return { success: true, value: cached as T };
  }

  try {
    let moduleExports: unknown;
    let entryUrl: string | undefined;

    if (isNode()) {
      const result = await executeCodeInNode(code);
      moduleExports = result.value;
      entryUrl = result.entryUrl;
    } else {
      const blob = new Blob([code], { type: 'application/javascript' });
      entryUrl = URL.createObjectURL(blob);
      try {
        moduleExports = await import(/* @vite-ignore */ entryUrl);
      } finally {
        URL.revokeObjectURL(entryUrl);
      }
    }

    if (useCache) {
      executeCacheMap.set(code, moduleExports);
    }
    return { success: true, value: moduleExports as T, entryUrl };
  } catch (error) {
    return {
      success: false,
      issues: [
        {
          message: error instanceof Error ? error.message : String(error),
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
      ],
    };
  }
}

// =============================================================================
// Bundler Context
// =============================================================================

/**
 * Shared state passed through the bundler lifecycle, holding the bundler instance and its dependencies.
 *
 * @public
 */
export type EsbuildBundlerContext = {
  bundler: EsbuildBundler;
  builtinModules: Map<string, BuiltinModule>;
  filesystem: VmFileSystem;
  projectPath: string;
};
