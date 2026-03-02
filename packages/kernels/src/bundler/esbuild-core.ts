/**
 * ESBuild Core
 *
 * Provides in-browser bundling using esbuild-wasm with custom plugins
 * for ZenFS filesystem integration and node_modules resolution.
 *
 * This module is designed to run in kernel workers and uses:
 * - A `zenfs` namespace for project files (project-relative paths) and CDN modules
 * - A `builtin` namespace for pre-loaded modules served from memory (zero FS I/O)
 * - An `http-url` namespace for HTTP/HTTPS URLs fetched on demand
 * - ModuleManager for CDN module fetching and caching at root `/node_modules/`
 */

import * as esbuild from 'esbuild-wasm';
import type { Plugin, BuildOptions, Message, Metafile } from 'esbuild-wasm';
import { isBareSpecifier, parsePackageSpecifier, getCdnCachePath, resolveRelativePath } from '@taucad/utils/import';
import { base64ToString } from 'uint8array-extras';
import type { KernelIssue } from '#types/kernel.types.js';
import type { KernelFileSystem } from '#types/kernel-worker.types.js';
import type { ExecuteResult } from '#types/kernel-bundler.types.js';
import type { BuiltinModule } from '#bundler/module-manager.js';
import { ModuleManager } from '#bundler/module-manager.js';
import { isNode } from '#framework/environment.js';

// =============================================================================
// Types
// =============================================================================

/**
 *
 */
export type BundleResult = {
  /** The bundled code as a string */
  code: string;
  /** Source map (if enabled) */
  sourceMap?: string;
  /** Compilation issues (errors, warnings) */
  issues: KernelIssue[];
  /** Whether bundling succeeded */
  success: boolean;
  /** Absolute paths of all project files that were resolved during bundling (transitive dependencies). */
  dependencies: string[];
};

/**
 *
 */
export type BundlerOptions = {
  /** Filesystem interface for reading/writing files */
  filesystem: KernelFileSystem;
  /** Base path for the project (e.g., /builds/project) */
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
// HTTP Fetch Limits
// =============================================================================

/** Maximum time (ms) to wait for a remote HTTP module before aborting. */
export const httpFetchTimeoutMs = 30_000;

/** Maximum response size (bytes) for fetched HTTP modules (10 MB). */
export const httpFetchMaxSizeBytes = 10 * 1024 * 1024;

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
      // eslint-disable-next-line @typescript-eslint/naming-convention -- esbuild API uses wasmURL
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

/** Namespace prefix that esbuild adds to file paths in error messages for the zenfs namespace. */
const zenfsPrefix = 'zenfs:';

/** Default names to auto-export from CommonJS-style entry files */
const defaultAutoExportNames = ['main', 'defaultParams'];

/**
 * Resolve file extension for imports without extension.
 * Needs filesystem access, so it lives inside the plugin scope.
 */
async function resolveFileExtension(filesystem: KernelFileSystem, path: string): Promise<string> {
  // If already has extension, return as-is
  if (/\.[jt]sx?$/.test(path)) {
    return path;
  }

  // Try common extensions in order
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];

  for (const extension of extensions) {
    const fullPath = path + extension;
    // eslint-disable-next-line no-await-in-loop -- Intentional: short-circuits on first match
    if (await filesystem.exists(fullPath)) {
      return fullPath;
    }
  }

  // Return original path if no extension found
  return path;
}

/**
 * Determine the esbuild loader based on file extension.
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
 * Since the plugin uses project-relative paths in the zenfs namespace,
 * stripping the prefix yields a clean filename (e.g., `main.ts`).
 */
function resolveEsbuildFilePath(filePath: string): string {
  return filePath.startsWith(zenfsPrefix) ? filePath.slice(zenfsPrefix.length) : filePath;
}

// =============================================================================
// Production ZenFS Plugin
// =============================================================================

/**
 *
 */
export type ZenFsPluginOptions = {
  filesystem: KernelFileSystem;
  moduleManager: ModuleManager;
  builtinModules: Map<string, BuiltinModule>;
  projectPath: string;
  entryPath: string;
  autoExportNames: string[];
};

/**
 * Create a plugin that resolves and loads files from the ZenFS filesystem.
 *
 * Architecture:
 * - `zenfs` namespace: Project files (project-relative paths) and CDN modules
 * - `builtin` namespace: Built-in modules served directly from memory (zero FS I/O)
 * - `http-url` namespace: HTTP/HTTPS URLs fetched on demand
 *
 * Project files use project-relative paths (e.g., `main.ts`, `src/utils.ts`) within
 * the `zenfs` namespace. All filesystem I/O reconstructs absolute paths from the
 * relative esbuild path + projectPath.
 *
 * Bare specifier resolution:
 * 1. Builtins (replicad, jscad, zod) -> `builtin` namespace (memory)
 * 2. CDN modules -> ensure cached at `/node_modules/`, then `zenfs` namespace
 * 3. Relative/absolute imports -> resolved via filesystem with extension probing
 */
export function createZenFsPlugin(options: ZenFsPluginOptions): Plugin {
  const { filesystem, moduleManager, builtinModules, projectPath, entryPath, autoExportNames } = options;

  // Path conversion helpers: esbuild sees project-relative paths in the zenfs namespace,
  // but all filesystem I/O uses absolute ZenFS paths.
  const projectPrefix = projectPath.endsWith('/') ? projectPath : projectPath + '/';

  /** Convert absolute ZenFS path to project-relative path for esbuild identity. */
  function toRelative(absolutePath: string): string {
    return absolutePath.startsWith(projectPrefix) ? absolutePath.slice(projectPrefix.length) : absolutePath;
  }

  /** Reconstruct absolute ZenFS path from esbuild's project-relative path for filesystem I/O. */
  function toAbsolute(relativePath: string): string {
    return relativePath.startsWith('/') ? relativePath : `${projectPrefix}${relativePath}`;
  }

  // Pre-compute the relative entry path for comparison in onLoad
  const relativeEntryPath = toRelative(entryPath);

  return {
    name: 'zenfs',
    setup(build) {
      // -----------------------------------------------------------------
      // onResolve: all imports
      // -----------------------------------------------------------------
      // eslint-disable-next-line complexity -- TOOD: refactor
      build.onResolve({ filter: /.*/ }, async (args) => {
        // Entry point: convert to project-relative path in zenfs namespace
        if (args.kind === 'entry-point') {
          return { path: toRelative(args.path), namespace: 'zenfs' };
        }

        // Imports originating from the http-url namespace (sub-imports within
        // fetched CDN modules) must be resolved by the namespace-specific handlers
        // registered below. Only full URLs are handled here; relative, absolute, and
        // bare paths are passed through by returning undefined so esbuild falls
        // through to the http-url onResolve handlers.
        if (args.namespace === 'http-url') {
          if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
            return { path: args.path, namespace: 'http-url' };
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
          return { path: args.path, namespace: 'http-url' };
        }

        // --- Bare specifiers ---
        if (isBareSpecifier(args.path)) {
          const pkgInfo = parsePackageSpecifier(args.path);

          // Builtins: check full specifier first (e.g., '@jscad/modeling/primitives'),
          // then fall back to root package name (e.g., '@jscad/modeling')
          const fullSpecifier = pkgInfo.path ? `${pkgInfo.name}/${pkgInfo.path}` : pkgInfo.name;
          if (builtinModules.has(fullSpecifier)) {
            return { path: fullSpecifier, namespace: 'builtin' };
          }

          if (builtinModules.has(pkgInfo.name)) {
            return { path: pkgInfo.name, namespace: 'builtin' };
          }

          // CDN modules: ensure cached at root /node_modules/, return zenfs path
          // These keep absolute paths since they're outside the project directory
          try {
            const cachePath = getCdnCachePath(pkgInfo.name, pkgInfo.path || undefined);
            await moduleManager.ensureCdnModule(pkgInfo.name, pkgInfo.path || undefined);
            return { path: cachePath, namespace: 'zenfs' };
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
          return { path: `https://esm.sh${args.path}`, namespace: 'http-url' };
        }

        try {
          const resolvedPath = resolveRelativePath(args.path, importerAbsolute);
          const withExtension = await resolveFileExtension(filesystem, resolvedPath);
          // Return project-relative path for project files
          return { path: toRelative(withExtension), namespace: 'zenfs' };
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
      build.onLoad({ filter: /.*/, namespace: 'builtin' }, (args) => {
        const builtin = builtinModules.get(args.path);
        if (!builtin) {
          return { errors: [{ text: `Built-in module '${args.path}' not found` }] };
        }

        return { contents: builtin.code, loader: 'js' };
      });

      // -----------------------------------------------------------------
      // onLoad: HTTP/HTTPS URLs
      // -----------------------------------------------------------------
      build.onLoad({ filter: /.*/, namespace: 'http-url' }, async (args) => {
        try {
          const response = await fetch(args.path, {
            signal: AbortSignal.timeout(httpFetchTimeoutMs),
          });
          if (!response.ok) {
            return {
              errors: [{ text: `Failed to fetch '${args.path}': ${response.status} ${response.statusText}` }],
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
              { text: `Failed to fetch '${args.path}': ${error instanceof Error ? error.message : String(error)}` },
            ],
          };
        }
      });

      // -----------------------------------------------------------------
      // onResolve: relative imports within HTTP modules (e.g. ./lib/foo.js)
      // -----------------------------------------------------------------
      build.onResolve({ filter: /^\./, namespace: 'http-url' }, (args) => {
        // Resolve relative to the importer URL (resolveDir is unreliable for URLs)
        const resolvedUrl = new URL(args.path, args.importer).href;
        return { path: resolvedUrl, namespace: 'http-url' };
      });

      // -----------------------------------------------------------------
      // onResolve: absolute-path imports within HTTP modules (e.g. /lodash@4.17.21/es2022/lodash.mjs)
      // -----------------------------------------------------------------
      build.onResolve({ filter: /^\//, namespace: 'http-url' }, (args) => {
        // Resolve absolute paths against the importer's origin
        const importerUrl = new URL(args.importer);
        const resolvedUrl = new URL(args.path, importerUrl.origin).href;
        return { path: resolvedUrl, namespace: 'http-url' };
      });

      // -----------------------------------------------------------------
      // onResolve: bare imports within HTTP modules (e.g. lit-html/lib/shady-render.js)
      // Bare specifiers can't be resolved against the importer's CDN origin because
      // CDNs use different URL schemes (e.g. JSPM uses npm: prefixes, Skypack uses
      // hashed pins). Instead, resolve through esm.sh which handles bare specifiers.
      // -----------------------------------------------------------------
      build.onResolve({ filter: /^[^./]/, namespace: 'http-url' }, (args) => {
        const resolvedUrl = `https://esm.sh/${args.path}`;
        return { path: resolvedUrl, namespace: 'http-url' };
      });

      // -----------------------------------------------------------------
      // onLoad: zenfs namespace (project files + CDN cache)
      // -----------------------------------------------------------------
      build.onLoad({ filter: /.*/, namespace: 'zenfs' }, async (args) => {
        try {
          // Reconstruct absolute ZenFS path for filesystem I/O
          const absolutePath = toAbsolute(args.path);

          let content = await filesystem.readFile(absolutePath, 'utf8');
          const loader = getLoader(args.path);

          // For the entry file (not node_modules), add CommonJS exports if needed
          // This prevents esbuild from tree-shaking away unexported main/defaultParams
          const isEntryFile = args.path === relativeEntryPath;
          const isNodeModules = absolutePath.includes('/node_modules/');

          if (isEntryFile && !isNodeModules && (loader === 'js' || loader === 'ts')) {
            content = addCommonJsExports(content, autoExportNames);
          }

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

// =============================================================================
// EsbuildBundler Class
// =============================================================================

/**
 *
 */
export class EsbuildBundler {
  private readonly filesystem: KernelFileSystem;
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
    const issues: KernelIssue[] = [];

    try {
      // Create banner to inject CommonJS-style globals for built-in modules
      // This allows code like `const { draw } = replicad;` to work without imports
      // Only root modules with a globalName are included (not submodules)
      // Also define module/exports objects to prevent runtime errors in CommonJS-style code
      const moduleGlobals = [...this.builtinModules.entries()]
        .filter(([, mod]) => mod.globalName)
        .map(([name, mod]) => `const ${mod.globalName} = globalThis.__KERNEL_MODULES__?.get(${JSON.stringify(name)});`)
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
          createZenFsPlugin({
            filesystem: this.filesystem,
            moduleManager: this.moduleManager,
            builtinModules: this.builtinModules,
            projectPath: this.projectPath,
            entryPath,
            autoExportNames: this.autoExportNames,
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
      // Project files live in the zenfs namespace with project-relative paths.
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
          success: result.errors.length === 0,
        };
      }

      return {
        code: '',
        dependencies,
        issues: [
          ...issues,
          {
            message: 'No output generated',
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
          type: 'compilation',
          severity: 'error',
        });
      }

      return {
        code: '',
        dependencies: [],
        issues,
        success: false,
      };
    }
  }

  /**
   * Extract absolute paths of project-file dependencies from the esbuild metafile.
   *
   * Metafile input keys use "namespace:path" format. Project files live in the
   * `zenfs` namespace with project-relative paths. CDN/node_modules and builtin
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
      // Only include project files from the zenfs namespace
      if (!inputKey.startsWith(zenfsPrefix)) {
        continue;
      }

      const relativePath = inputKey.slice(zenfsPrefix.length);

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
   * Convert an esbuild message to a KernelIssue.
   *
   * File paths in esbuild messages use the format `namespace:path`. Since the plugin
   * stores project-relative paths in the `zenfs` namespace, we strip the `zenfs:` prefix
   * to produce clean filenames (e.g., `main.ts`) for UI display and FileLink navigation.
   */
  private convertEsbuildMessage(message: Message, severity: 'error' | 'warning'): KernelIssue {
    const issue: KernelIssue = {
      message: message.text,
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
 *
 */
export type DetectionPluginOptions = {
  filesystem: KernelFileSystem;
  projectPath: string;
};

/**
 * Create a detection-only esbuild plugin.
 *
 * This is a simplified version of the production zenfs plugin. The key difference:
 * bare specifiers are marked as `external` instead of being resolved via builtinModules
 * or CDN. This means esbuild reports what was imported without needing any modules
 * to be registered, eliminating the chicken-and-egg problem for kernel detection.
 *
 * Relative imports are still resolved normally via zenfs so the full import tree
 * is walked correctly (TypeScript, barrel files, re-exports all handled).
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
    name: 'zenfs-detection',
    setup(build) {
      let relativeEntryPath = '';

      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.kind === 'entry-point') {
          relativeEntryPath = toRelative(args.path);
          return { path: relativeEntryPath, namespace: 'zenfs' };
        }

        if (args.namespace === 'http-url' || args.path.startsWith('data:')) {
          return { external: true };
        }

        if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
          return { external: true };
        }

        if (isBareSpecifier(args.path)) {
          return { path: args.path, external: true };
        }

        const importerAbsolute = toAbsolute(args.importer || relativeEntryPath);

        try {
          const resolvedPath = resolveRelativePath(args.path, importerAbsolute);
          const withExtension = await resolveFileExtension(filesystem, resolvedPath);
          return { path: toRelative(withExtension), namespace: 'zenfs' };
        } catch {
          return { external: true };
        }
      });

      build.onLoad({ filter: /.*/, namespace: 'zenfs' }, async (args) => {
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
 */
export function extractProjectDependencies(metafile: Metafile | undefined, projectPath: string): string[] {
  if (!metafile) {
    return [];
  }

  const projectPrefix = projectPath.endsWith('/') ? projectPath : projectPath + '/';
  const dependencies: string[] = [];

  for (const inputKey of Object.keys(metafile.inputs)) {
    if (!inputKey.startsWith(zenfsPrefix)) {
      continue;
    }

    const relativePath = inputKey.slice(zenfsPrefix.length);

    if (relativePath.startsWith('/')) {
      continue;
    }

    dependencies.push(`${projectPrefix}${relativePath}`);
  }

  return dependencies;
}

/**
 * Extract external module specifiers from esbuild metafile output imports.
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

/**
 * Execute bundled JS/TS code via dynamic import.
 * Browser uses Blob URL, Node.js uses data URL.
 */
export async function executeCode(code: string): Promise<ExecuteResult> {
  const isNodejsRuntime = isNode();

  try {
    let url: string;
    let shouldRevoke = false;

    if (isNodejsRuntime) {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- class
      const { Buffer: NodeBuffer } = await import('node:buffer');
      const base64Code = NodeBuffer.from(code).toString('base64');
      url = `data:application/javascript;base64,${base64Code}`;
    } else {
      const blob = new Blob([code], { type: 'application/javascript' });
      url = URL.createObjectURL(blob);
      shouldRevoke = true;
    }

    try {
      const moduleExports: unknown = await import(/* @vite-ignore */ url);
      return { success: true, value: moduleExports };
    } finally {
      if (shouldRevoke) {
        URL.revokeObjectURL(url);
      }
    }
  } catch (error) {
    return {
      success: false,
      issues: [
        {
          message: error instanceof Error ? error.message : String(error),
          type: 'runtime' as const,
          severity: 'error' as const,
        },
      ],
    };
  }
}

// =============================================================================
// Bundler Context
// =============================================================================

/**
 *
 */
export type EsbuildBundlerContext = {
  bundler: EsbuildBundler;
  builtinModules: Map<string, BuiltinModule>;
  filesystem: KernelFileSystem;
  projectPath: string;
};
