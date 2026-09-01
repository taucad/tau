import { codeLanguages } from '@taucad/types/constants';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import type * as Monaco from 'monaco-editor';
import type * as LSP from 'vscode-languageserver-protocol';
import type { Node } from '@taucad/kcl-wasm-lib/bindings/Node';
import type { Program } from '@taucad/kcl-wasm-lib/bindings/Program';
import type { KclValue } from '@taucad/kcl-wasm-lib/bindings/KclValue';
import { KclLspClient } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import { createKclLogger } from '#lib/kcl-language/lsp/kcl-logs.js';
import { createDiagnosticsHandler, kclMarkerOwner } from '#lib/kcl-language/lsp/providers/diagnostics-handler.js';
import { createCompletionProvider } from '#lib/kcl-language/lsp/providers/completion-provider.js';
import { createHoverProvider } from '#lib/kcl-language/lsp/providers/hover-provider.js';
import { createSignatureHelpProvider } from '#lib/kcl-language/lsp/providers/signature-provider.js';
import { createFormattingProvider } from '#lib/kcl-language/lsp/providers/formatting-provider.js';
import { createSemanticTokensProvider } from '#lib/kcl-language/lsp/providers/semantic-tokens-provider.js';
import { createFoldingRangeProvider } from '#lib/kcl-language/lsp/providers/folding-provider.js';
import { createRenameProvider } from '#lib/kcl-language/lsp/providers/rename-provider.js';
import { createDefinitionProvider } from '#lib/kcl-language/lsp/providers/definition-provider.js';
import { createCodeActionProvider } from '#lib/kcl-language/lsp/providers/code-action-provider.js';
import { getKclSymbolService } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import type { KclSymbolService } from '#lib/kcl-language/lsp/kcl-symbol-service.js';
import { bindMonacoModelsToLspConnection } from '@taucad/lsp/monaco-lsp-binding';
import type { LanguageContribution, ActivationContext, ActivationResult } from '#lib/monaco-language-registry.js';
import type { MonacoMarkerService } from '#lib/monaco-marker-service.js';

const log = createKclLogger('Register');

/** Global LSP client instance */
let lspClient: KclLspClient | undefined;

/** Symbol service instance for WASM-based symbol extraction */
let symbolService: KclSymbolService | undefined;

/** Track if already registered to prevent duplicate registration */
let isRegistered = false;

/** Global marker service reference (injected by activation) */
let globalMarkerService: MonacoMarkerService | undefined;

/**
 * Get the symbol service instance.
 */
export function getSymbolService(): KclSymbolService | undefined {
  return symbolService;
}

/**
 * Get the LSP client instance.
 */
export function getKclLspClient(): KclLspClient | undefined {
  return lspClient;
}

/**
 * @deprecated Prefer Monaco models + {@link bindMonacoModelsToLspConnection}; kept for narrow test helpers.
 */
export function notifyDocumentOpen(uri: string, text: string): void {
  if (!lspClient?.ready) {
    return;
  }

  lspClient.setCurrentDocumentUri(uri);
  lspClient.textDocumentDidOpen({
    textDocument: {
      uri,
      languageId: codeLanguages.kcl,
      version: 1,
      text,
    },
  });
}

/**
 * @deprecated Prefer model-driven sync.
 */
export function notifyDocumentChange(uri: string, text: string): void {
  if (!lspClient?.ready) {
    return;
  }

  lspClient.textDocumentDidChange({
    textDocument: { uri, version: 1 },
    contentChanges: [{ text }],
  });
}

/**
 * @deprecated Prefer model-driven sync.
 */
export function notifyDocumentClose(uri: string): void {
  if (!lspClient?.ready) {
    return;
  }

  lspClient.textDocumentDidClose({
    textDocument: { uri },
  });
}

/**
 * Register KCL language with Monaco editor.
 *
 * This provides full language support for KCL files including:
 * - Language identification and configuration
 * - LSP-powered features: completions, hover, diagnostics, formatting, etc.
 *
 * @see https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-custom-languages
 */
export function registerKclLanguage(monaco: typeof Monaco): void {
  // Prevent duplicate registration
  if (isRegistered) {
    log.debug(' Language already registered, skipping');

    return;
  }

  isRegistered = true;

  // Register language metadata
  monaco.languages.register({
    id: codeLanguages.kcl,
    extensions: ['.kcl'],
    aliases: ['KCL', 'kcl'],
    mimetypes: ['text/x-kcl'],
  });

  // Basic language configuration
  monaco.languages.setLanguageConfiguration(codeLanguages.kcl, {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string'] },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    // Word pattern: matches identifiers and quoted strings (for import paths)
    // This enables Cmd+Click on both symbols and import path strings
    wordPattern: /("[^"]*\.kcl"|'[^']*\.kcl'|[A-Z_a-z]\w*)/,
  });

  // NOTE: LSP / WASM initialization deliberately deferred to
  // `kclContribution.activate`, which itself only runs when the first
  // `kcl` model triggers `monaco.languages.onLanguage('kcl')`. Replicad and
  // OpenSCAD-only projects pay zero KCL cost.
}

let pendingActivationContext: ActivationContext | undefined;

/**
 * Initialize the LSP client and register all Monaco providers.
 */
async function initializeLsp(monaco: typeof Monaco): Promise<void> {
  const context = pendingActivationContext;
  if (!context?.treeService) {
    log.error('KCL activation context missing tree service');
    return;
  }

  const snap = context.fileManagerRef.getSnapshot();
  const { proxy } = snap.context;
  if (!proxy) {
    log.warn('KCL LSP skipped: file manager proxy not ready');
    return;
  }

  const paths = new WorkspacePathResolver(snap.context.rootDirectory);

  // Create diagnostics handler (uses marker service if available)
  const diagnosticsHandler = createDiagnosticsHandler(monaco, globalMarkerService);

  // Initialize symbol service
  symbolService = getKclSymbolService();

  // Initialize WASM for symbol service (async, non-blocking)
  void initializeSymbolServiceWasm();

  // Create and initialize LSP client
  lspClient = new KclLspClient({
    fs: {
      fileManager: context.fileManager,
      treeService: context.treeService,
      proxy,
      paths,
      filePoolBuffer: snap.context.filePoolBuffer,
    },
    onInitialized() {
      log.debug(' Client initialized successfully');
    },
    onNotification(notification: LSP.NotificationMessage) {
      diagnosticsHandler(notification);
    },
  });

  try {
    await lspClient.initialize();
  } catch (error) {
    log.error('Failed to initialize client:', error);
    lspClient = undefined;

    return;
  }

  // Wait for the client to be ready
  await lspClient.waitForReady();

  const client = lspClient;

  // Register Monaco language providers
  const languageId = codeLanguages.kcl;

  // Completion provider (with symbol service for user-defined completions)
  monaco.languages.registerCompletionItemProvider(languageId, createCompletionProvider(monaco, client, symbolService));

  // Hover provider (with symbol service for enhanced hover)
  monaco.languages.registerHoverProvider(languageId, createHoverProvider(monaco, client, symbolService));

  // Signature help provider
  monaco.languages.registerSignatureHelpProvider(languageId, createSignatureHelpProvider(monaco, client));

  // Document formatting provider
  monaco.languages.registerDocumentFormattingEditProvider(languageId, createFormattingProvider(monaco, client));

  // Semantic tokens provider
  monaco.languages.registerDocumentSemanticTokensProvider(languageId, createSemanticTokensProvider(monaco, client));

  // Folding range provider
  monaco.languages.registerFoldingRangeProvider(languageId, createFoldingRangeProvider(monaco, client));

  // Rename provider
  monaco.languages.registerRenameProvider(languageId, createRenameProvider(monaco, client));

  // Definition provider (with symbol service for go-to-definition; opener materialises targets)
  monaco.languages.registerDefinitionProvider(languageId, createDefinitionProvider(monaco, client, symbolService));

  // Code action provider
  monaco.languages.registerCodeActionProvider(languageId, createCodeActionProvider(monaco, client));

  const disposable = bindMonacoModelsToLspConnection({
    monaco,
    languageId,
    lsp: {
      didOpen: (parameters) => {
        client.setCurrentDocumentUri(parameters.textDocument.uri);
        client.textDocumentDidOpen(parameters);
      },
      didChange: (parameters) => {
        client.textDocumentDidChange(parameters);
      },
      didClose: (parameters) => {
        client.textDocumentDidClose(parameters);
      },
    },
    extras: {
      afterOpen(model) {
        const uri = model.uri.toString();
        const text = model.getValue();
        if (symbolService) {
          void symbolService.updateDocument(uri, text, 1);
        }
      },
      afterChange(model, parameters) {
        const {
          textDocument: { uri, version },
          contentChanges,
        } = parameters;
        const nextText = contentChanges[0]?.text ?? model.getValue();
        if (symbolService) {
          void symbolService.updateDocument(uri, nextText, version);
        }
      },
      afterClose(uri) {
        symbolService?.removeDocument(uri);
      },
    },
  });

  activationDisposables.push(disposable);

  log.debug(' All Monaco providers registered');
}

/**
 * Initialize WASM for the symbol service.
 * This loads the KCL WASM module and hooks it up to the symbol service.
 */
async function initializeSymbolServiceWasm(): Promise<void> {
  if (!symbolService) {
    return;
  }

  try {
    // Dynamically import the WASM module, path, and mock connections
    const [wasmModule, wasmPathModule, engineModule] = await Promise.all([
      import('@taucad/kcl-wasm-lib'),
      import('@taucad/kcl-wasm-lib/kcl.wasm?url'),
      import('@taucad/runtime/kernels/zoo/engine-connection'),
    ]);

    // Initialize WASM
    await wasmModule.default(wasmPathModule.default);

    // Set up parse function with error resilience
    // The WASM parser returns [program, errors] even when there are parse errors,
    // but may throw on catastrophic failures (e.g., invalid UTF-8)
    type ParseResultError = { severity: string };
    type ParseResult = [Node<Program>, ParseResultError[]];

    symbolService.setParseFunction(async (code: string) => {
      try {
        const result = wasmModule.parse_wasm(code) as ParseResult;
        const allErrors = result[1];
        const errors = allErrors.filter((error) => error.severity !== 'Warning');
        const warnings = allErrors.filter((warning) => warning.severity === 'Warning');

        // WASM parser returns partial AST even with errors - this is intentional
        // We can extract symbols from the successfully parsed portions
        log.debug('Parse completed with', errors.length, 'errors and', warnings.length, 'warnings');

        return { program: result[0], errors, warnings };
      } catch (error) {
        // Log and re-throw to surface the failure
        log.error('Parse threw exception (catastrophic failure):', error);
        throw error;
      }
    });

    // Set up mock execution function for variable values
    // Create a minimal mock file system that throws on file operations
    // (mock execution for single-file hover/intellisense doesn't need real file access)
    const mockEngine = new engineModule.MockEngineConnection();
    const mockFileSystem = {
      async readFile(): Promise<Uint8Array<ArrayBuffer>> {
        throw new Error('Mock file system does not support file reads');
      },
      exists: async (): Promise<boolean> => false,
      getAllFiles: async (): Promise<string[]> => [],
    };

    // oxlint-disable-next-line @typescript-eslint/await-thenable -- WASM Context constructor may return thenable
    const mockContext = (await new wasmModule.Context(mockEngine, mockFileSystem)) as {
      // oxlint-disable-next-line max-params -- External WASM API contract
      executeMock: (program: string, path: string, settings: string, capture: boolean) => Promise<unknown>;
    };

    type MockExecutionResult = {
      variables: Partial<Record<string, KclValue>>;
      errors: unknown[];
      sourceFiles?: Record<
        string | number,
        {
          path: { type: 'Main' } | { type: 'Local'; value: string } | { type: 'Std'; value: string };
          source: string;
        }
      >;
    };

    // Flag to track if we've processed stdlib
    let stdlibProcessed = false;

    // Capture reference to symbolService for closure (we know it's defined from guard above)
    const service = symbolService;

    service.setMockExecuteFunction(async (program, path) => {
      try {
        const result = (await mockContext.executeMock(
          JSON.stringify(program),
          path,
          '{}',
          false,
        )) as MockExecutionResult;

        // Process stdlib from successful result if available and not already done
        const successSourceFiles = result.sourceFiles;
        if (!stdlibProcessed && successSourceFiles) {
          log.debug('Processing stdlib from successful mock execution...');

          await service.processStdlibSources(successSourceFiles);
          stdlibProcessed = true;
        }

        return {
          variables: result.variables,
          errors: result.errors,
          sourceFiles: result.sourceFiles,
        };
      } catch (error) {
        // Mock execution can throw but still contain partial results
        // The error object may contain sourceFiles which we need for stdlib
        if (error && typeof error === 'object') {
          const errorObject = error as MockExecutionResult;

          // Process stdlib from error result if available and not already done
          const errorSourceFiles = errorObject.sourceFiles;
          if (!stdlibProcessed && errorSourceFiles) {
            log.debug('Processing stdlib from error mock execution...');

            await service.processStdlibSources(errorSourceFiles);
            stdlibProcessed = true;
          }

          // Re-throw with variables and sourceFiles attached for the symbol service to extract
          const errorData = {
            variables: errorObject.variables,
            errors: errorObject.errors,
            sourceFiles: errorObject.sourceFiles,
          };
          // oxlint-disable-next-line @typescript-eslint/only-throw-error -- Intentionally throwing data object for symbol service
          throw errorData;
        }

        throw error;
      }
    });

    log.debug(' Symbol service WASM initialized with mock execution');

    // Re-parse any documents that were opened before WASM was ready
    await symbolService.reparseAllDocuments();
  } catch (error) {
    log.warn('Failed to initialize symbol service WASM:', error);
  }
}

/**
 * Dispose of the LSP client and clean up resources.
 */
export function disposeKclLsp(): void {
  // Clean up LSP client
  lspClient?.dispose();
  lspClient = undefined;

  // Clean up symbol service
  symbolService?.clear();
  symbolService = undefined;

  // Reset registration flag to allow re-registration
  isRegistered = false;

  pendingActivationContext = undefined;

  // Clear global service references
  globalMarkerService = undefined;
}

// ============================================================================
// Language Contribution (for LanguageContributionRegistry)
// ============================================================================

/** Provider disposables from activation */
let activationDisposables: Monaco.IDisposable[] = [];

/** Stored marker service reference for cleanup */
let activationMarkerService: ActivationContext['markerService'] | undefined;

/**
 * KCL Language Contribution
 *
 * Conforms to the LanguageContribution interface for uniform lifecycle management.
 * - register: Language metadata and configuration
 * - activate: LSP client, providers, document sync, marker service injection
 * - onProjectSessionChange: Reset document tracking and caches
 * - dispose: Full cleanup including LSP client, workers, markers
 */
export const kclContribution: LanguageContribution = {
  languageId: codeLanguages.kcl,
  /**
   * Gates this contribution behind the first `kcl` model creation. Until then
   * the entire LSP worker, WASM symbol service, and provider registration
   * stays unloaded so non-KCL projects pay zero cost.
   */
  activationLanguageIds: ['kcl'],

  register(monaco: typeof Monaco): void {
    registerKclLanguage(monaco);
  },

  activate(context: ActivationContext): ActivationResult {
    const { markerService, monaco } = context;

    activationMarkerService = markerService;

    // Reset per-activation disposable list so re-activation after `dispose()`
    // does not accumulate stale entries.
    activationDisposables = [];

    // Shell disposable so `activate()` always returns a non-empty list
    // synchronously (real LSP/bind disposables are appended in `initializeLsp`).
    activationDisposables.push({
      dispose() {
        // No-op: contract anchor only; `dispose()` iterates the full list.
      },
    });

    // Store marker service globally so diagnostics handler can access it
    globalMarkerService = markerService;

    pendingActivationContext = context;

    // Defer the heavy LSP boot (Web Worker spawn + WASM init + provider
    // registration) to a microtask so `activate()` returns synchronously and
    // does not block the registry's per-contribution loop. Mirrors VS Code's
    // TypeScript extension pattern.
    queueMicrotask(() => {
      void initializeLsp(monaco);
    });

    return {
      disposables: activationDisposables,
    };
  },

  onProjectSessionChange(_buildId: string): void {
    symbolService?.clear();
  },

  dispose(): void {
    // Dispose activation-specific disposables
    for (const disposable of activationDisposables) {
      disposable.dispose();
    }

    activationDisposables = [];

    // Full KCL LSP cleanup
    disposeKclLsp();

    // Clear KCL markers via marker service
    activationMarkerService?.clearOwnerEverywhere(kclMarkerOwner);
    activationMarkerService = undefined;
  },
};
