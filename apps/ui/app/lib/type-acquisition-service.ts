/**
 * Type Acquisition Service
 *
 * Manages TypeScript/JavaScript type declarations for Monaco Editor IntelliSense.
 * Handles two categories of types:
 *
 * 1. **Static types**: Built-in packages (replicad, @jscad/modeling) whose `.d.ts`
 *    content is bundled at build time and injected immediately during activation.
 *
 * 2. **Dynamic types**: User-imported packages (lodash, three, etc.) whose types
 *    are fetched from esm.sh CDN on demand when detected in editor content.
 *
 * This service is standalone with no dependencies on MonacoModelService, FileManagerApi,
 * or any virtual filesystem layer. It communicates with Monaco purely through
 * `addExtraLib` on both `typescriptDefaults` and `javascriptDefaults`.
 *
 * Architecture:
 * - Watches all JS/TS models for import statements (debounced)
 * - Parses imports using es-module-lexer (cached, <1ms)
 * - Fetches type declarations from esm.sh via X-TypeScript-Types header
 * - Guards all async operations with session epoch + AbortController
 * - Degrades gracefully offline (static types always available, dynamic types silently skipped)
 */

import type * as Monaco from 'monaco-editor';
import { getAllImports, parseExportNames } from '#lib/javascript-import-parser.js';
import { isBareSpecifier, extractPackageFromCdnUrl } from '#utils/import.utils.js';

// =============================================================================
// Types
// =============================================================================

export type StaticTypeDefinition = {
  /** The npm package name (e.g., 'replicad', '@jscad/modeling') */
  packageName: string;
  /** Raw .d.ts content string */
  content: string;
  /** If true, content already contains `declare module` blocks and should not be wrapped */
  prewrapped?: boolean;
};

export type TypeAcquisitionConfig = {
  /** Static type definitions to inject immediately on initialization */
  staticTypes: StaticTypeDefinition[];
};

// =============================================================================
// Constants
// =============================================================================

const esmShBase = 'https://esm.sh';

/** Debounce delay for model content changes. Milliseconds. */
const requestDebounce = 500;

/** Minimum time between retry attempts for failed packages. Milliseconds. */
const retryDelay = 60_000;

/** JS/TS language IDs that we watch for imports */
const jsTsLanguages = new Set(['typescript', 'javascript', 'typescriptreact', 'javascriptreact']);

// eslint-disable-next-line @typescript-eslint/naming-convention -- toggle to enable debug logging
const ATA_DEBUG = false;
function ataLog(...args: unknown[]): void {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug flag toggled manually
  if (ATA_DEBUG) {
    console.log('[ATA]', ...args);
  }
}

// =============================================================================
// TypeAcquisitionService
// =============================================================================

export class TypeAcquisitionService {
  private monaco: typeof Monaco | undefined;

  // --- Session safety ---
  private sessionEpoch = 0;
  private abortController: AbortController | undefined;

  // --- Static types (addExtraLib disposables) ---
  private readonly staticDisposables: Monaco.IDisposable[] = [];
  private readonly builtinTypePackages = new Set<string>();

  // --- Dynamic types ---
  private readonly dynamicLibs = new Map<string, Monaco.IDisposable[]>();
  private readonly acquiredTypes = new Set<string>();

  // --- Watcher state ---
  private readonly modelListeners = new Map<Monaco.editor.ITextModel, Monaco.IDisposable>();
  private readonly debounceTimers = new Map<Monaco.editor.ITextModel, ReturnType<typeof setTimeout>>();
  private readonly globalListeners: Monaco.IDisposable[] = [];

  // --- CDN URL aliases ---
  /** Maps packageName -> set of CDN URLs that import this package */
  private readonly cdnUrlAliases = new Map<string, Set<string>>();

  // --- Fetch management ---
  private readonly fetchCache = new Map<string, string>(); // PackageName -> .d.ts content
  private readonly pendingFetches = new Map<string, Promise<void>>(); // Dedup in-flight
  private readonly failedPackages = new Map<string, number>(); // Pkg -> timestamp of last failure

  /**
   * Initialize the service with Monaco and static type definitions.
   * Must be called before `startWatching()`.
   */
  public initialize(monaco: typeof Monaco, config: TypeAcquisitionConfig): void {
    this.monaco = monaco;
    this.abortController = new AbortController();

    // Register static types via addExtraLib on both defaults
    for (const staticType of config.staticTypes) {
      const content = staticType.prewrapped
        ? staticType.content
        : `declare module '${staticType.packageName}' {\n${staticType.content}\n}`;
      const filePath = `file:///node_modules/${staticType.packageName}/index.d.ts`;

      // Register on both TS and JS defaults so .js files also get type info
      const tsDisposable = monaco.typescript.typescriptDefaults.addExtraLib(content, filePath);
      const jsDisposable = monaco.typescript.javascriptDefaults.addExtraLib(content, filePath);

      this.staticDisposables.push(tsDisposable, jsDisposable);
      this.builtinTypePackages.add(staticType.packageName);
      this.acquiredTypes.add(staticType.packageName);

      const packageJsonPath = `file:///node_modules/${staticType.packageName}/package.json`;
      const packageJsonContent = JSON.stringify({ name: staticType.packageName, types: 'index.d.ts' });
      const tsPackageDisposable = monaco.typescript.typescriptDefaults.addExtraLib(packageJsonContent, packageJsonPath);
      const jsPackageDisposable = monaco.typescript.javascriptDefaults.addExtraLib(packageJsonContent, packageJsonPath);
      this.staticDisposables.push(tsPackageDisposable, jsPackageDisposable);
    }
  }

  /**
   * Start watching Monaco models for import statements.
   * Attaches listeners to existing and newly-created JS/TS models.
   */
  public startWatching(): void {
    if (!this.monaco) {
      return;
    }

    const { monaco } = this;

    // Watch for new and disposed models
    this.globalListeners.push(
      monaco.editor.onDidCreateModel((model) => {
        if (this.isJsTsModel(model)) {
          this.attachModelListener(model);
          void this.scanModelImports(model);
        }
      }),
      monaco.editor.onWillDisposeModel((model) => {
        this.detachModelListener(model);
      }),
    );

    // Scan existing models
    for (const model of monaco.editor.getModels()) {
      if (this.isJsTsModel(model)) {
        this.attachModelListener(model);
        void this.scanModelImports(model);
      }
    }
  }

  /**
   * Handle a project session change. Clears dynamic types and re-scans models.
   * Static types persist across sessions.
   */
  public onProjectSessionChange(): void {
    // Increment epoch to invalidate in-flight fetches
    this.sessionEpoch++;

    // Abort in-flight requests
    this.abortController?.abort();
    this.abortController = new AbortController();

    // Dispose dynamic type libs
    for (const disposables of this.dynamicLibs.values()) {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    }

    this.dynamicLibs.clear();

    // Reset tracking (keep builtinTypePackages)
    this.acquiredTypes.clear();
    for (const packageName of this.builtinTypePackages) {
      this.acquiredTypes.add(packageName);
    }

    this.pendingFetches.clear();
    this.failedPackages.clear();
    this.cdnUrlAliases.clear();

    // Keep fetchCache -- types don't change between sessions, avoids redundant CDN requests

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }

    this.debounceTimers.clear();

    // Re-scan all existing models (deferred to avoid blocking)
    if (typeof globalThis.requestIdleCallback === 'function') {
      globalThis.requestIdleCallback(() => {
        this.rescanAllModels();
      });
    } else {
      setTimeout(() => {
        this.rescanAllModels();
      }, 0);
    }
  }

  /**
   * Dispose all resources. After disposal, the service cannot be used.
   */
  public dispose(): void {
    // Abort in-flight requests
    this.abortController?.abort();
    this.abortController = undefined;

    // Dispose static type libs
    for (const disposable of this.staticDisposables) {
      disposable.dispose();
    }

    this.staticDisposables.length = 0;

    // Dispose dynamic type libs
    for (const disposables of this.dynamicLibs.values()) {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    }

    this.dynamicLibs.clear();

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }

    this.debounceTimers.clear();

    // Detach model listeners
    for (const disposable of this.modelListeners.values()) {
      disposable.dispose();
    }

    this.modelListeners.clear();

    // Detach global listeners
    for (const disposable of this.globalListeners) {
      disposable.dispose();
    }

    this.globalListeners.length = 0;

    // Clear all tracking state
    this.acquiredTypes.clear();
    this.builtinTypePackages.clear();
    this.fetchCache.clear();
    this.pendingFetches.clear();
    this.failedPackages.clear();
    this.cdnUrlAliases.clear();

    this.monaco = undefined;
  }

  // =========================================================================
  // Private: Model watching
  // =========================================================================

  private isJsTsModel(model: Monaco.editor.ITextModel): boolean {
    return jsTsLanguages.has(model.getLanguageId());
  }

  private attachModelListener(model: Monaco.editor.ITextModel): void {
    if (this.modelListeners.has(model)) {
      return;
    }

    const disposable = model.onDidChangeContent(() => {
      this.scheduleScan(model);
    });

    this.modelListeners.set(model, disposable);
  }

  private detachModelListener(model: Monaco.editor.ITextModel): void {
    const disposable = this.modelListeners.get(model);
    if (disposable) {
      disposable.dispose();
      this.modelListeners.delete(model);
    }

    const timer = this.debounceTimers.get(model);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(model);
    }
  }

  private scheduleScan(model: Monaco.editor.ITextModel): void {
    const existing = this.debounceTimers.get(model);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(model);
      void this.scanModelImports(model);
    }, requestDebounce);

    this.debounceTimers.set(model, timer);
  }

  private rescanAllModels(): void {
    if (!this.monaco) {
      return;
    }

    for (const model of this.monaco.editor.getModels()) {
      if (this.isJsTsModel(model)) {
        void this.scanModelImports(model);
      }
    }
  }

  // =========================================================================
  // Private: Import scanning
  // =========================================================================

  private async scanModelImports(model: Monaco.editor.ITextModel): Promise<void> {
    try {
      const imports = await getAllImports(model);
      ataLog('scan:', model.uri.toString(), `(${imports.length} imports)`);

      for (const imp of imports) {
        if (isBareSpecifier(imp.specifier)) {
          const packageName = extractPackageName(imp.specifier);
          if (!packageName || this.acquiredTypes.has(packageName)) {
            continue;
          }

          ataLog('acquire:', packageName);
          void this.acquireTypes(packageName);
          continue;
        }

        // CDN URL import (e.g., 'https://cdn.jsdelivr.net/npm/replicad-decorate/...')
        const packageName = extractPackageFromCdnUrl(imp.specifier);
        if (!packageName) {
          continue;
        }

        this.registerCdnAlias(packageName, imp.specifier);

        if (this.acquiredTypes.has(packageName)) {
          this.injectCdnAliasIfNeeded(packageName, imp.specifier);
          continue;
        }

        ataLog('acquire CDN:', packageName, 'from', imp.specifier);
        void this.acquireTypes(packageName);
      }
    } catch {
      // Silently ignore scan errors (model may have been disposed)
    }
  }

  // =========================================================================
  // Private: Type acquisition
  // =========================================================================

  private async acquireTypes(packageName: string): Promise<void> {
    // Dedup: return existing in-flight promise
    const pending = this.pendingFetches.get(packageName);
    if (pending) {
      return pending;
    }

    // Check retry delay for previously failed packages
    const lastFailure = this.failedPackages.get(packageName);
    if (lastFailure !== undefined && Date.now() - lastFailure < retryDelay) {
      return;
    }

    // Check fetch cache (persisted across sessions)
    const cached = this.fetchCache.get(packageName);
    if (cached) {
      ataLog('cache hit:', packageName);
      this.injectDynamicTypes(packageName, cached);
      return;
    }

    ataLog('fetch:', packageName);
    // Capture epoch for async safety
    const currentEpoch = this.sessionEpoch;
    const { signal } = this.abortController ?? {};

    const promise = (async (): Promise<void> => {
      try {
        await this.fetchAndInjectTypes(packageName, currentEpoch, signal);
      } finally {
        this.pendingFetches.delete(packageName);
      }
    })();

    this.pendingFetches.set(packageName, promise);
    return promise;
  }

  private async fetchAndInjectTypes(
    packageName: string,
    epoch: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    try {
      // Fetch the module to discover the X-TypeScript-Types header
      const moduleUrl = `${esmShBase}/${packageName}`;
      const moduleResponse = await fetch(moduleUrl, { signal });

      if (this.sessionEpoch !== epoch) {
        return;
      }

      const typesUrl = moduleResponse.headers.get('X-TypeScript-Types');
      if (!typesUrl) {
        // No .d.ts types available -- try generating stub types from JS exports
        await this.generateStubTypes(packageName, moduleResponse, { epoch, signal });
        return;
      }

      // Fetch the type declarations
      const resolvedTypesUrl = typesUrl.startsWith('http') ? typesUrl : `${esmShBase}${typesUrl}`;
      const typesResponse = await fetch(resolvedTypesUrl, { signal });

      if (this.sessionEpoch !== epoch) {
        return;
      }

      if (!typesResponse.ok) {
        throw new Error(`Types fetch returned ${typesResponse.status}`);
      }

      const typesContent = await typesResponse.text();

      if (this.sessionEpoch !== epoch) {
        return;
      }

      // Cache and inject
      this.fetchCache.set(packageName, typesContent);
      this.injectDynamicTypes(packageName, typesContent);
      this.failedPackages.delete(packageName);

      ataLog('fetched:', packageName, `(${typesContent.length} chars)`);
    } catch (error) {
      // Don't record AbortError as a failure (it's intentional)
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      ataLog('fetch failed:', packageName, error);

      // Record failure with timestamp for retry delay
      this.failedPackages.set(packageName, Date.now());

      // Add to acquiredTypes to prevent immediate re-scan spam
      this.acquiredTypes.add(packageName);
    }
  }

  /**
   * Fallback for packages without `.d.ts` types: fetch the JS module source,
   * extract export names via es-module-lexer, and generate stub declarations
   * so that imports resolve (typed as `any`) instead of erroring.
   */
  private async generateStubTypes(
    packageName: string,
    moduleResponse: Response,
    { epoch, signal }: { epoch: number; signal: AbortSignal | undefined },
  ): Promise<void> {
    // The X-ESM-Path header points to the actual bundled module (bypasses the
    // thin entry re-export wrapper where `export *` yields no named exports).
    const esmPath = moduleResponse.headers.get('X-ESM-Path');

    let jsSource: string;

    if (esmPath) {
      const sourceResponse = await fetch(`${esmShBase}${esmPath}`, { signal });

      if (this.sessionEpoch !== epoch) {
        return;
      }

      if (!sourceResponse.ok) {
        this.acquiredTypes.add(packageName);
        return;
      }

      jsSource = await sourceResponse.text();
    } else {
      // No X-ESM-Path -- try parsing the entry module body directly
      jsSource = await moduleResponse.text();
    }

    if (this.sessionEpoch !== epoch) {
      return;
    }

    const exportNames = await parseExportNames(jsSource);

    if (exportNames.length === 0) {
      this.acquiredTypes.add(packageName);
      return;
    }

    const stubContent = generateStubDeclarations(exportNames);

    this.fetchCache.set(packageName, stubContent);
    this.injectDynamicTypes(packageName, stubContent);
    this.failedPackages.delete(packageName);

    ataLog('stub types:', packageName, `(${exportNames.length} exports)`);
  }

  /** Track a CDN URL as an alias for a package name. */
  private registerCdnAlias(packageName: string, cdnUrl: string): void {
    let aliases = this.cdnUrlAliases.get(packageName);
    if (!aliases) {
      aliases = new Set();
      this.cdnUrlAliases.set(packageName, aliases);
    }

    aliases.add(cdnUrl);
  }

  /** Inject a CDN URL alias declaration if the package types are cached and the alias is not yet registered. */
  private injectCdnAliasIfNeeded(packageName: string, cdnUrl: string): void {
    if (this.acquiredTypes.has(cdnUrl)) {
      return;
    }

    const cached = this.fetchCache.get(packageName);
    if (cached) {
      this.injectDynamicTypes(cdnUrl, cached);
    }
  }

  private injectDynamicTypes(moduleName: string, content: string): void {
    if (!this.monaco) {
      return;
    }

    ataLog('inject:', moduleName, `(${content.length} chars)`);

    // Dispose existing libs for this module (if re-injecting from cache)
    const existing = this.dynamicLibs.get(moduleName);
    if (existing) {
      for (const disposable of existing) {
        disposable.dispose();
      }
    }

    const wrapped = `declare module '${moduleName}' {\n${content}\n}`;
    // Use a clean file path for CDN URLs, standard path for package names
    const filePath = moduleName.startsWith('http')
      ? `file:///cdn-types/${encodeURIComponent(moduleName)}.d.ts`
      : `file:///node_modules/${moduleName}/index.d.ts`;

    const tsDisposable = this.monaco.typescript.typescriptDefaults.addExtraLib(wrapped, filePath);
    const jsDisposable = this.monaco.typescript.javascriptDefaults.addExtraLib(wrapped, filePath);

    this.dynamicLibs.set(moduleName, [tsDisposable, jsDisposable]);
    this.acquiredTypes.add(moduleName);

    // Also inject for any registered CDN URL aliases
    const aliases = this.cdnUrlAliases.get(moduleName);
    if (aliases) {
      for (const alias of aliases) {
        if (!this.acquiredTypes.has(alias)) {
          this.injectDynamicTypes(alias, content);
        }
      }
    }
  }
}

// =============================================================================
// Utility functions
// =============================================================================

/**
 * Extract the package name from a bare specifier, stripping any subpath.
 *
 * Examples:
 * - 'lodash' -> 'lodash'
 * - 'lodash/debounce' -> 'lodash'
 * - '@scope/pkg' -> '@scope/pkg'
 * - '@scope/pkg/sub/path' -> '@scope/pkg'
 */
function extractPackageName(specifier: string): string | undefined {
  if (specifier.startsWith('@')) {
    // Scoped package: @scope/name or @scope/name/subpath
    const parts = specifier.split('/');
    if (parts.length < 2) {
      return undefined;
    }

    return `${parts[0]}/${parts[1]}`;
  }

  // Unscoped package: name or name/subpath
  const slashIndex = specifier.indexOf('/');
  return slashIndex === -1 ? specifier : specifier.slice(0, slashIndex);
}

/**
 * Generate stub `.d.ts` content from a list of export names.
 *
 * All exports are typed as `any` -- this suppresses "Cannot find module" errors
 * and provides autocomplete for export names without pretending to know the types.
 *
 * @param exportNames - Array of export names (e.g., ['addGrid', 'default'])
 * @returns `.d.ts` content suitable for wrapping in `declare module`
 */
const stubJsdoc = '  /** This package does not provide type declarations. Exported as `any`. */';

export function generateStubDeclarations(exportNames: string[]): string {
  const lines: string[] = [];

  for (const name of exportNames) {
    if (name === 'default') {
      lines.push(stubJsdoc);
      lines.push('  const _default: any;');
      lines.push('  export default _default;');
    } else {
      lines.push(stubJsdoc);
      lines.push(`  export const ${name}: any;`);
    }
  }

  return lines.join('\n');
}
