/**
 * KCL Symbol Service
 *
 * Provides symbol extraction and lookup using the KCL WASM API.
 * This replaces the regex-based parsers with proper AST-based symbol resolution.
 */

import type { Node } from '@taucad/kcl-wasm-lib/bindings/Node';
import type { Program } from '@taucad/kcl-wasm-lib/bindings/Program';
import type { KclValue } from '@taucad/kcl-wasm-lib/bindings/KclValue';
import type { BodyItem } from '@taucad/kcl-wasm-lib/bindings/BodyItem';
import type { VariableDeclaration } from '@taucad/kcl-wasm-lib/bindings/VariableDeclaration';
import type { FunctionExpression } from '@taucad/kcl-wasm-lib/bindings/FunctionExpression';
import type { Parameter } from '@taucad/kcl-wasm-lib/bindings/Parameter';
import type { ImportStatement } from '@taucad/kcl-wasm-lib/bindings/ImportStatement';
import type { LspFileManager } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import { createKclLogger } from '#lib/kcl-language/lsp/kcl-logs.js';

const log = createKclLogger('Symbol Service');

/**
 * Types of symbols that can be extracted from KCL code
 */
export type KclSymbolKind = 'variable' | 'function' | 'parameter' | 'import';

/**
 * Parameter information for function symbols
 */
export type KclParameterInfo = {
  name: string;
  type: string | undefined;
  isLabeled: boolean;
  hasDefault: boolean;
  range: { start: number; end: number };
};

/**
 * A symbol extracted from KCL code using WASM AST
 */
export type KclSymbol = {
  /** Symbol name */
  name: string;
  /** Kind of symbol */
  kind: KclSymbolKind;
  /** Byte range in source (from Node<T>.start and Node<T>.end) */
  range: { start: number; end: number };
  /** Line number (1-based) */
  lineNumber: number;
  /** Column number (1-based) */
  column: number;
  /** Runtime value from mock execution */
  value: KclValue | undefined;
  /** Whether the symbol is exported */
  isExported: boolean;
  /** For functions: parameter information */
  parameters: KclParameterInfo[] | undefined;
  /** For functions: return type */
  returnType: string | undefined;
  /** For parameters: the containing function name */
  containingFunction: string | undefined;
  /** For imports: the import path */
  importPath: string | undefined;
  /** URI of the document containing this symbol */
  uri: string;
};

/**
 * Cached document data
 */
type DocumentCache = {
  version: number;
  content: string;
  program: Node<Program> | undefined;
  symbols: KclSymbol[];
  variables: Partial<Record<string, KclValue>>;
  lineOffsets: number[];
};

/**
 * Parse function interface - matches KclUtils.parseKcl signature
 */
export type ParseFunction = (code: string) => Promise<{
  program: Node<Program>;
  errors: unknown[];
  warnings: unknown[];
}>;

/**
 * Module source from WASM - contains stdlib and user file sources
 */
export type ModuleSource = {
  path: { type: 'Main' } | { type: 'Local'; value: string } | { type: 'Std'; value: string };
  source: string;
};

/**
 * Mock execution result interface - includes sourceFiles for stdlib
 */
export type MockExecuteResult = {
  variables: Partial<Record<string, KclValue>>;
  errors: unknown[];
  sourceFiles?: Record<string | number, ModuleSource>;
};

/**
 * Mock execution function interface - matches KclUtils.executeMockKcl signature
 */
export type MockExecuteFunction = (program: Program, path: string) => Promise<MockExecuteResult>;

/**
 * KCL Symbol Service
 *
 * Extracts symbols from KCL code using the WASM AST parser and provides
 * lookup functionality for hover, go-to-definition, etc.
 */
export class KclSymbolService {
  private readonly cache = new Map<string, DocumentCache>();
  private parseFunction: ParseFunction | undefined;
  private mockExecuteFunction: MockExecuteFunction | undefined;

  /** Cached stdlib symbols - parsed once from sourceFiles */
  private stdlibSymbols: KclSymbol[] = [];
  private stdlibProcessed = false;

  /**
   * Set the parse function (from KclUtils)
   */
  public setParseFunction(parseFn: ParseFunction): void {
    this.parseFunction = parseFn;
  }

  /**
   * Set the mock execution function (from KclUtils)
   */
  public setMockExecuteFunction(executeFn: MockExecuteFunction): void {
    this.mockExecuteFunction = executeFn;
  }

  /**
   * Check if the service has been initialized with WASM functions
   */
  public get isInitialized(): boolean {
    return this.parseFunction !== undefined;
  }

  /**
   * Check if stdlib has been processed
   */
  public get hasStdlib(): boolean {
    return this.stdlibProcessed;
  }

  /**
   * Process stdlib source files and cache their symbols.
   * This should be called once with the sourceFiles from mock execution.
   */
  public async processStdlibSources(sourceFiles: Record<string | number, ModuleSource>): Promise<void> {
    if (this.stdlibProcessed || !this.parseFunction) {
      return;
    }

    log.debug('Processing stdlib source files...');
    const stdlibEntries = Object.values(sourceFiles).filter(
      (source): source is ModuleSource => source.path.type === 'Std',
    );

    log.debug('Found', stdlibEntries.length, 'stdlib modules');

    const allSymbols: KclSymbol[] = [];

    // Capture parseFunction to satisfy TypeScript in async callback
    const parseFn = this.parseFunction;

    // Parse all stdlib modules in parallel
    const parseResults = await Promise.all(
      stdlibEntries.map(async (entry) => {
        const moduleName = entry.path.type === 'Std' ? entry.path.value : 'unknown';
        const uri = `std://${moduleName}`;

        try {
          const parseResult = await parseFn(entry.source);
          const lineOffsets = computeLineOffsets(entry.source);
          const symbols = extractSymbolsFromProgram({
            program: parseResult.program,
            uri,
            content: entry.source,
            lineOffsets,
          });

          // Mark all stdlib symbols with their module for better documentation
          const moduleSymbols: KclSymbol[] = [];
          for (const symbol of symbols) {
            // Only include exported functions and variables (top-level symbols)
            if (symbol.kind === 'function' || symbol.kind === 'variable') {
              symbol.importPath = `std::${moduleName}`;
              moduleSymbols.push(symbol);
            }
          }

          log.debug('Parsed stdlib module:', moduleName, 'symbols:', symbols.length);
          return moduleSymbols;
        } catch (error) {
          log.debug('Failed to parse stdlib module:', moduleName, error);
          return [];
        }
      }),
    );

    for (const moduleSymbols of parseResults) {
      allSymbols.push(...moduleSymbols);
    }

    this.stdlibSymbols = allSymbols;
    this.stdlibProcessed = true;
    log.debug('Stdlib processing complete. Total symbols:', allSymbols.length);
  }

  /**
   * Get all stdlib symbols for completion
   */
  public getStdlibSymbols(): KclSymbol[] {
    return this.stdlibSymbols;
  }

  /**
   * Re-parse all cached documents.
   * This should be called after WASM is initialized to parse documents
   * that were opened before the parse function was available.
   */
  public async reparseAllDocuments(): Promise<void> {
    if (!this.parseFunction) {
      log.debug('Cannot reparse: parseFunction not set');
      return;
    }

    const uris = [...this.cache.keys()];
    log.debug('Reparsing', uris.length, 'cached documents');

    // Collect documents that need reparsing
    const documentsToReparse: Array<{ uri: string; content: string; version: number }> = [];
    for (const uri of uris) {
      const cached = this.cache.get(uri);
      if (cached?.symbols.length === 0) {
        documentsToReparse.push({ uri, content: cached.content, version: cached.version });
      }
    }

    // Reparse all documents in parallel
    await Promise.all(
      documentsToReparse.map(async (doc) => {
        log.debug('Reparsing document:', doc.uri);
        await this.updateDocument(doc.uri, doc.content, doc.version + 1);
      }),
    );
  }

  /**
   * Update document cache with new content.
   *
   * Error Resilience Strategy:
   * - If parsing fails completely, preserve the last good symbols for intellisense
   * - If parsing succeeds but has errors, extract symbols from the partial AST
   * - Mock execution errors are non-fatal; we still use successfully extracted symbols
   */
  public async updateDocument(uri: string, content: string, version: number): Promise<void> {
    const existing = this.cache.get(uri);
    if (existing && existing.version >= version && existing.content === content) {
      return; // Already up to date
    }

    log.debug('Updating document:', uri, 'version:', version);

    const lineOffsets = computeLineOffsets(content);

    // Try to parse and extract symbols
    const parseResult = await this.parseAndExtractSymbols(uri, content, lineOffsets);

    // Error Resilience: If parsing failed completely and we have previous symbols, preserve them
    // This keeps intellisense working with stale-but-valid data while user fixes errors
    if (!parseResult.succeeded && existing && existing.symbols.length > 0) {
      log.debug(
        'Parse failed, preserving',
        existing.symbols.length,
        'previous symbols for intellisense (version:',
        existing.version,
        ')',
      );

      // Update content and version but keep previous symbols
      // This allows diagnostics to update while intellisense remains functional
      this.cache.set(uri, {
        version,
        content,
        program: existing.program, // Keep previous AST
        symbols: existing.symbols, // Keep previous symbols for intellisense
        variables: existing.variables, // Keep previous variable values
        lineOffsets,
      });

      return;
    }

    // Normal case: update cache with new (possibly partial) symbols
    this.cache.set(uri, {
      version,
      content,
      program: parseResult.program,
      symbols: parseResult.symbols,
      variables: parseResult.variables,
      lineOffsets,
    });
  }

  /**
   * Remove a document from the cache
   */
  public removeDocument(uri: string): void {
    this.cache.delete(uri);
  }

  /**
   * Get all symbols for a document
   */
  public getSymbols(uri: string): KclSymbol[] {
    return this.cache.get(uri)?.symbols ?? [];
  }

  /**
   * Get symbol at a specific position (byte offset)
   */
  public getSymbolAtOffset(uri: string, offset: number): KclSymbol | undefined {
    const symbols = this.getSymbols(uri);
    return symbols.find((symbol) => offset >= symbol.range.start && offset <= symbol.range.end);
  }

  /**
   * Get symbol at a specific line and column (1-based)
   */
  public getSymbolAtPosition(uri: string, line: number, column: number): KclSymbol | undefined {
    const cached = this.cache.get(uri);
    if (!cached) {
      return undefined;
    }

    const offset = positionToOffset(cached.lineOffsets, line, column);
    return this.getSymbolAtOffset(uri, offset);
  }

  /**
   * Find symbol by name (for usage site lookups)
   */
  public findSymbolByName(uri: string, name: string): KclSymbol | undefined {
    const symbols = this.getSymbols(uri);
    return symbols.find((symbol) => symbol.name === name);
  }

  /**
   * Get all usages of a symbol in the document
   */
  public findUsages(uri: string, symbolName: string): Array<{ start: number; end: number }> {
    const cached = this.cache.get(uri);
    if (!cached) {
      return [];
    }

    // Find all occurrences of the identifier in the source
    const usages: Array<{ start: number; end: number }> = [];
    const regex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, 'g');
    let match;

    while ((match = regex.exec(cached.content)) !== null) {
      usages.push({
        start: match.index,
        end: match.index + symbolName.length,
      });
    }

    return usages;
  }

  /**
   * Get the symbol that a usage refers to
   */
  public getDefinitionForUsage(options: {
    uri: string;
    line: number;
    column: number;
    word: string;
  }): KclSymbol | undefined {
    const { uri, line, column, word } = options;

    // First check if we're on a declaration
    const symbolAtPosition = this.getSymbolAtPosition(uri, line, column);
    if (symbolAtPosition) {
      return symbolAtPosition;
    }

    // Otherwise look up by name
    return this.findSymbolByName(uri, word);
  }

  /**
   * Get the variable value from mock execution
   */
  public getVariableValue(uri: string, name: string): KclValue | undefined {
    return this.cache.get(uri)?.variables[name];
  }

  /**
   * Convert byte offset to line/column
   */
  public offsetToPosition(uri: string, offset: number): { line: number; column: number } | undefined {
    const cached = this.cache.get(uri);
    if (!cached) {
      return undefined;
    }

    return offsetToPosition(cached.lineOffsets, offset);
  }

  /**
   * Clear all cached data
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Get all imports for a document (extracted from ImportStatement AST nodes)
   */
  public getImports(uri: string): KclSymbol[] {
    return this.getSymbols(uri).filter((symbol) => symbol.kind === 'import');
  }

  /**
   * Resolve an imported symbol to its definition in the imported file.
   * This reads the imported file, parses it, and finds the symbol definition.
   *
   * @param uri The URI of the current document
   * @param symbolName The name of the imported symbol to resolve
   * @param fileManager The file manager for reading files
   * @returns The symbol definition from the imported file, or undefined
   */
  public async resolveImportedSymbol(
    uri: string,
    symbolName: string,
    fileManager: LspFileManager,
  ): Promise<KclSymbol | undefined> {
    const imports = this.getImports(uri);
    log.debug('resolveImportedSymbol: checking', imports.length, 'imports for:', symbolName);

    const importInfo = imports.find((importSymbol) => importSymbol.name === symbolName);
    log.debug('resolveImportedSymbol: importInfo:', importInfo?.name, 'path:', importInfo?.importPath);

    if (!importInfo?.importPath) {
      log.debug('resolveImportedSymbol: no importPath for symbol:', symbolName);
      return undefined;
    }

    // Resolve the import path relative to the current file
    const importUri = resolveImportPath(uri, importInfo.importPath);
    const importFilePath = uriToPath(importUri);

    log.debug('Resolving imported symbol:', symbolName, 'from:', importFilePath);

    try {
      // Read the imported file
      const content = await fileManager.readFile(importFilePath);
      const contentString = new TextDecoder().decode(content);

      // Parse and cache the imported file if not already cached
      await this.updateDocument(importUri, contentString, 1);

      // Find the symbol in the imported file
      const symbol = this.findSymbolByName(importUri, symbolName);
      if (symbol) {
        log.debug('Found imported symbol definition:', symbol.name, 'at line:', symbol.lineNumber);
        return symbol;
      }

      log.debug('Symbol not found in imported file:', symbolName);
      return undefined;
    } catch (error) {
      log.debug('Error resolving imported symbol:', error);
      return undefined;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Completion Support
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get all symbols suitable for completion from the current document.
   * Returns variables, functions, and parameters (excluding imports which need resolution).
   */
  public getCompletableSymbols(uri: string): KclSymbol[] {
    const symbols = this.getSymbols(uri);
    // Return all symbols except imports (imports are handled separately via resolution)
    return symbols.filter((symbol) => symbol.kind !== 'import');
  }

  /**
   * Get all imported symbols resolved to their actual definitions.
   * This reads imported files and returns the actual symbol definitions.
   *
   * @param uri The URI of the current document
   * @param fileManager The file manager for reading files
   * @returns Array of resolved symbol definitions from imported files
   */
  public async getImportedSymbolsForCompletion(uri: string, fileManager: LspFileManager): Promise<KclSymbol[]> {
    const imports = this.getImports(uri);
    log.debug('getImportedSymbolsForCompletion: resolving', imports.length, 'imports');

    // Filter to imports with valid paths
    const validImports = imports.filter((importSymbol) => Boolean(importSymbol.importPath));

    // Resolve all imports in parallel
    const resolveResults = await Promise.all(
      validImports.map(async (importSymbol) => {
        try {
          // Resolve the import path relative to the current file
          const importUri = resolveImportPath(uri, importSymbol.importPath!);
          const importFilePath = uriToPath(importUri);

          // Read and parse the imported file
          const content = await fileManager.readFile(importFilePath);
          const contentString = new TextDecoder().decode(content);
          await this.updateDocument(importUri, contentString, 1);

          // Find the symbol in the imported file
          const resolvedSymbol = this.findSymbolByName(importUri, importSymbol.name);
          if (resolvedSymbol) {
            // Add the import path to the resolved symbol for documentation
            return {
              ...resolvedSymbol,
              importPath: importSymbol.importPath,
            };
          }

          return undefined;
        } catch (error) {
          log.debug('Error resolving import for completion:', importSymbol.name, error);

          return undefined;
        }
      }),
    );

    // Filter out undefined results
    const resolvedSymbols = resolveResults.filter((symbol): symbol is KclSymbol => symbol !== undefined);

    log.debug('getImportedSymbolsForCompletion: resolved', resolvedSymbols.length, 'symbols');

    return resolvedSymbols;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Private Helper Methods (for error resilience)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Parse content and extract symbols with error resilience.
   * Extracted to reduce complexity of updateDocument.
   */
  private async parseAndExtractSymbols(
    uri: string,
    content: string,
    lineOffsets: number[],
  ): Promise<{
    succeeded: boolean;
    program: Node<Program> | undefined;
    symbols: KclSymbol[];
    variables: Partial<Record<string, KclValue>>;
  }> {
    let program: Node<Program> | undefined;
    let symbols: KclSymbol[] = [];
    let variables: Partial<Record<string, KclValue>> = {};
    let succeeded = false;

    if (!this.parseFunction) {
      return { succeeded, program, symbols, variables };
    }

    try {
      const parseResult = await this.parseFunction(content);
      program = parseResult.program;

      // Extract symbols even if there are parse errors (partial AST)
      // The WASM parser returns a partial program even when there are errors
      symbols = extractSymbolsFromProgram({ program, uri, content, lineOffsets });
      succeeded = true;
      log.debug('Extracted', symbols.length, 'symbols from AST (errors:', parseResult.errors.length, ')');

      // Try mock execution for variable values
      if (this.mockExecuteFunction) {
        variables = await this.executeMockAndMergeValues(program, uri, symbols);
      }
    } catch (error) {
      log.debug('Parse failed:', error);
      // Parse threw an exception - this is a complete failure, not just errors in the code
    }

    return { succeeded, program, symbols, variables };
  }

  /**
   * Execute mock and merge variable values into symbols.
   * Extracted to reduce nesting depth.
   */
  private async executeMockAndMergeValues(
    program: Node<Program>,
    uri: string,
    symbols: KclSymbol[],
  ): Promise<Partial<Record<string, KclValue>>> {
    let variables: Partial<Record<string, KclValue>> = {};

    if (!this.mockExecuteFunction) {
      return variables;
    }

    try {
      const execResult = await this.mockExecuteFunction(program, uriToPath(uri));
      variables = execResult.variables;
      log.debug('Mock execution returned', Object.keys(variables).length, 'variables');
    } catch (error) {
      // Mock execution can throw but still contain partial results
      variables = this.extractVariablesFromError(error);
    }

    // Merge variable values into symbols
    this.mergeVariableValuesIntoSymbols(symbols, variables);

    return variables;
  }

  /**
   * Extract variables from a mock execution error (partial results).
   */
  private extractVariablesFromError(error: unknown): Partial<Record<string, KclValue>> {
    if (error && typeof error === 'object' && 'variables' in error) {
      const errorWithVars = error as { variables?: Partial<Record<string, KclValue>> };
      if (errorWithVars.variables && typeof errorWithVars.variables === 'object') {
        log.debug('Mock execution failed but extracted', Object.keys(errorWithVars.variables).length, 'partial vars');
        return errorWithVars.variables;
      }
    }

    log.debug('Mock execution failed (non-fatal):', error);
    return {};
  }

  /**
   * Merge variable values into symbols.
   */
  private mergeVariableValuesIntoSymbols(symbols: KclSymbol[], variables: Partial<Record<string, KclValue>>): void {
    for (const symbol of symbols) {
      if (symbol.kind === 'variable' || symbol.kind === 'function') {
        const value = variables[symbol.name];
        if (value) {
          symbol.value = value;
          log.debug('Set value for symbol:', symbol.name, 'type:', typeof value);
        }
      }
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute line start offsets for a document
 */
function computeLineOffsets(content: string): number[] {
  const offsets: number[] = [0];
  let index = 0;
  for (const char of content) {
    if (char === '\n') {
      offsets.push(index + 1);
    }

    index += 1;
  }

  return offsets;
}

/**
 * Convert byte offset to line/column (1-based)
 */
function offsetToPosition(lineOffsets: number[], offset: number): { line: number; column: number } {
  let line = 1;
  for (let i = 1; i < lineOffsets.length; i++) {
    if (lineOffsets[i]! > offset) {
      break;
    }

    line = i + 1;
  }

  const lineStart = lineOffsets[line - 1] ?? 0;
  const column = offset - lineStart + 1;
  return { line, column };
}

/**
 * Convert line/column (1-based) to byte offset
 */
function positionToOffset(lineOffsets: number[], line: number, column: number): number {
  const lineStart = lineOffsets[line - 1] ?? 0;
  return lineStart + column - 1;
}

/**
 * Convert URI to file path.
 * The file manager expects paths without leading slashes (e.g., "public/...")
 * but Monaco URIs use "file:///public/..." format.
 */
function uriToPath(uri: string): string {
  let path = uri;

  // Remove "file://" scheme
  if (path.startsWith('file://')) {
    path = path.slice(7);
  }

  // Remove leading slash - file manager expects "public/..." not "/public/..."
  if (path.startsWith('/')) {
    path = path.slice(1);
  }

  return path;
}

/**
 * Resolve an import path relative to the current file's directory.
 *
 * @param currentFileUri The URI of the current file (e.g., "file:///public/kcl-samples/bench/main.kcl")
 * @param importPath The relative import path (e.g., "bench-parts.kcl")
 * @returns The absolute URI of the imported file
 */
function resolveImportPath(currentFileUri: string, importPath: string): string {
  // Parse the current file URI to get the directory
  // Example: "file:///public/kcl-samples/bench/main.kcl" -> "file:///public/kcl-samples/bench/"
  const lastSlashIndex = currentFileUri.lastIndexOf('/');
  const directory = currentFileUri.slice(0, lastSlashIndex + 1);

  // Join with the import path
  return `${directory}${importPath}`;
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Extract symbols from a parsed KCL program
 */
function extractSymbolsFromProgram(options: {
  program: Node<Program>;
  uri: string;
  content: string;
  lineOffsets: number[];
}): KclSymbol[] {
  const { program, uri, content, lineOffsets } = options;
  const symbols: KclSymbol[] = [];

  for (const bodyItem of program.body) {
    const extracted = extractSymbolFromBodyItem({ item: bodyItem, uri, content, lineOffsets });
    if (extracted) {
      symbols.push(...extracted);
    }
  }

  return symbols;
}

/**
 * Extract symbol(s) from a body item
 */
function extractSymbolFromBodyItem(options: {
  item: BodyItem;
  uri: string;
  content: string;
  lineOffsets: number[];
}): KclSymbol[] | undefined {
  const { item, uri, content, lineOffsets } = options;

  switch (item.type) {
    case 'VariableDeclaration': {
      return extractVariableSymbol({ item, uri, content, lineOffsets });
    }

    case 'ImportStatement': {
      return extractImportSymbol(item, uri, lineOffsets);
    }

    default: {
      return undefined;
    }
  }
}

/**
 * Extract variable/function symbol from a VariableDeclaration
 */
function extractVariableSymbol(options: {
  item: BodyItem & { type: 'VariableDeclaration' };
  uri: string;
  content: string;
  lineOffsets: number[];
}): KclSymbol[] {
  const { item, uri, lineOffsets } = options;
  const symbols: KclSymbol[] = [];
  const declaration = item as unknown as Node<VariableDeclaration>;
  const declarator = declaration.declaration;
  const { name } = declarator.id;
  const isExported = declaration.visibility === 'export';

  const position = offsetToPosition(lineOffsets, declarator.id.start);

  // Check if this is a function declaration
  if (declarator.init.type === 'FunctionExpression') {
    const funcExpr = declarator.init as unknown as Node<FunctionExpression>;
    const parameters = extractParameters(funcExpr.params, uri, lineOffsets);

    // Add function symbol
    symbols.push({
      name,
      kind: 'function',
      range: { start: declarator.id.start, end: declarator.id.end },
      lineNumber: position.line,
      column: position.column,
      value: undefined,
      isExported,
      parameters,
      returnType: undefined, // Could be extracted from type annotations if present
      containingFunction: undefined,
      importPath: undefined,
      uri,
    });

    // Add parameter symbols
    for (const parameter of parameters) {
      const parameterPosition = offsetToPosition(lineOffsets, parameter.range.start);
      symbols.push({
        name: parameter.name,
        kind: 'parameter',
        range: parameter.range,
        lineNumber: parameterPosition.line,
        column: parameterPosition.column,
        value: undefined,
        isExported: false,
        parameters: undefined,
        returnType: undefined,
        containingFunction: name,
        importPath: undefined,
        uri,
      });
    }
  } else {
    // Regular variable
    symbols.push({
      name,
      kind: 'variable',
      range: { start: declarator.id.start, end: declarator.id.end },
      lineNumber: position.line,
      column: position.column,
      value: undefined,
      isExported,
      parameters: undefined,
      returnType: undefined,
      containingFunction: undefined,
      importPath: undefined,
      uri,
    });
  }

  return symbols;
}

/**
 * Extract parameter information from function parameters.
 *
 * Special handling for unlabeled parameters:
 * In KCL, `fn foo(@plane)` means the parameter is unlabeled with type `@plane`.
 * When `labeled === false`, the type is implicit from the parameter name.
 */
function extractParameters(parameters: Parameter[], _uri: string, _lineOffsets: number[]): KclParameterInfo[] {
  return parameters.map((parameter) => {
    let typeString: string | undefined;

    if (parameter.param_type) {
      typeString = formatType(parameter.param_type);
    } else if (parameter.labeled === false) {
      // Unlabeled parameter: the type is @{identifier.name}
      // e.g., `fn divider(@plane)` has type `@plane`
      typeString = `@${parameter.identifier.name}`;
    }

    return {
      name: parameter.identifier.name,
      type: typeString,
      isLabeled: parameter.labeled !== false,
      hasDefault: parameter.default_value !== undefined && parameter.default_value !== null,
      range: { start: parameter.identifier.start, end: parameter.identifier.end },
    };
  });
}

/**
 * Format a type node to string.
 *
 * Type structure (Node<Type>):
 * - { type: 'Primitive', p_type: 'Named', id: Node<Identifier> } -> @plane
 * - { type: 'Primitive', p_type: 'String' } -> string
 * - { type: 'Primitive', p_type: 'Number' } -> number
 * - { type: 'Primitive', p_type: 'bool' } -> bool
 * - { type: 'Array', ty: Type, len: ArrayLen } -> array
 * - { type: 'Union', tys: Array<Node<Type>> } -> union
 */
function formatType(typeNode: Node<unknown>): string {
  const typeValue = typeNode as {
    type?: string;
    p_type?: string;
    id?: { name?: string; type?: string };
    name?: string;
    ty?: unknown;
    tys?: unknown[];
  };

  // Handle outer Type wrapper
  if (typeValue.type === 'Primitive') {
    // Handle PrimitiveType - Named type like @plane
    if (typeValue.p_type === 'Named' && typeValue.id?.name) {
      return `@${typeValue.id.name}`;
    }

    if (typeValue.p_type) {
      // Built-in types
      switch (typeValue.p_type) {
        case 'String': {
          return 'string';
        }

        case 'Number': {
          return 'number';
        }

        case 'bool': {
          return 'bool';
        }

        case 'Any': {
          return 'any';
        }

        case 'None': {
          return 'none';
        }

        case 'TagDecl': {
          return 'tag';
        }

        case 'ImportedGeometry': {
          return 'geometry';
        }

        case 'Function': {
          return 'function';
        }

        default: {
          return typeValue.p_type;
        }
      }
    }
  }

  if (typeValue.type === 'Array') {
    return 'array';
  }

  if (typeValue.type === 'Union') {
    return 'union';
  }

  // Fallback for other cases
  if (typeValue.name) {
    return typeValue.name;
  }

  if (typeValue.type) {
    return typeValue.type;
  }

  return 'unknown';
}

/**
 * Extract import symbol from ImportStatement.
 *
 * ImportPath can be:
 * - { type: 'Kcl', filename: string } - local KCL files
 * - { type: 'Foreign', path: string } - foreign imports
 * - { type: 'Std', path: Array<string> } - stdlib imports
 *
 * ImportSelector can be:
 * - { type: 'None', alias: Node<Identifier> | null } - module import: `import divider from "..."`
 * - { type: 'List', items: Array<Node<ImportItem>> } - named imports: `import { foo, bar } from "..."`
 * - { type: 'Glob' } - wildcard import: `import * from "..."`
 */
function extractImportSymbol(
  item: BodyItem & { type: 'ImportStatement' },
  uri: string,
  lineOffsets: number[],
): KclSymbol[] {
  const symbols: KclSymbol[] = [];
  const importStmt = item as unknown as Node<ImportStatement>;
  const isExported = importStmt.visibility === 'export';

  // Extract path based on ImportPath type
  const pathValue = importStmt.path;
  let importPath = '';

  if ('filename' in pathValue) {
    // Local KCL file: { type: 'Kcl', filename: 'bench-parts.kcl' }
    importPath = pathValue.filename;
  } else if ('path' in pathValue) {
    if (pathValue.type === 'Std' && Array.isArray(pathValue.path)) {
      // Stdlib import: { type: 'Std', path: ['std', 'module'] }
      importPath = pathValue.path.join('/');
    } else if (pathValue.type === 'Foreign' && typeof pathValue.path === 'string') {
      // Foreign import: { type: 'Foreign', path: '...' }
      importPath = pathValue.path;
    }
  }

  log.debug('extractImportSymbol: path type:', pathValue.type, 'extracted path:', importPath);

  // Extract selector (imported names)
  const { selector } = importStmt;

  log.debug('extractImportSymbol: selector type:', selector.type);

  switch (selector.type) {
    case 'None': {
      // Module import: `import divider from "bench-parts.kcl"`
      // The 'alias' contains the imported name (e.g., 'divider')
      const { alias } = selector;
      if (alias && 'name' in alias) {
        const { name } = alias;
        const position = offsetToPosition(lineOffsets, alias.start);
        log.debug('extractImportSymbol: None selector, alias:', name, 'importPath:', importPath);

        symbols.push({
          name,
          kind: 'import',
          range: { start: alias.start, end: alias.end },
          lineNumber: position.line,
          column: position.column,
          value: undefined,
          isExported,
          parameters: undefined,
          returnType: undefined,
          containingFunction: undefined,
          importPath,
          uri,
        });
      }

      break;
    }

    case 'List': {
      // Named imports: `import { foo, bar } from "module.kcl"`
      const { items } = selector;
      if (Array.isArray(items)) {
        for (const importItem of items) {
          // ImportItem has: name: Node<Identifier>, alias: Node<Identifier> | null
          const nameNode = importItem.name;
          const { name } = nameNode;
          const position = offsetToPosition(lineOffsets, nameNode.start);
          log.debug('extractImportSymbol: List item:', name, 'importPath:', importPath);

          symbols.push({
            name,
            kind: 'import',
            range: { start: nameNode.start, end: nameNode.end },
            lineNumber: position.line,
            column: position.column,
            value: undefined,
            isExported,
            parameters: undefined,
            returnType: undefined,
            containingFunction: undefined,
            importPath,
            uri,
          });
        }
      }

      break;
    }

    default: {
      // Glob or other import types: `import * from "..."`
      // No specific symbol name to extract
      log.debug('extractImportSymbol: Glob/other selector (wildcard import), skipping');
      break;
    }
  }

  return symbols;
}

// ============================================================================
// Formatting Helpers (for hover display)
// ============================================================================

/**
 * Format a KclValue for display
 */
export function formatKclValue(value: KclValue): string {
  switch (value.type) {
    case 'Number': {
      return String(value.value);
    }

    case 'String': {
      return `"${value.value}"`;
    }

    case 'Bool': {
      return String(value.value);
    }

    case 'Tuple':
    case 'HomArray': {
      return `[${value.value.map((v) => formatKclValue(v)).join(', ')}]`;
    }

    case 'Object': {
      const entries = Object.entries(value.value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${formatKclValue(v!)}`);
      return `{ ${entries.join(', ')} }`;
    }

    case 'Function': {
      return 'fn(...)';
    }

    case 'Module': {
      return `module`;
    }

    case 'Plane': {
      return 'Plane';
    }

    case 'Face': {
      return 'Face';
    }

    case 'Sketch': {
      return 'Sketch';
    }

    case 'Solid': {
      return 'Solid';
    }

    case 'Helix': {
      return 'Helix';
    }

    case 'Uuid': {
      return `uuid("${value.value}")`;
    }

    case 'KclNone': {
      return 'none';
    }

    default: {
      return String(value.type);
    }
  }
}

/**
 * Get the type name for a KclValue
 */
export function getKclValueType(value: KclValue): string {
  switch (value.type) {
    case 'Number': {
      return 'number';
    }

    case 'String': {
      return 'string';
    }

    case 'Bool': {
      return 'boolean';
    }

    case 'Tuple':
    case 'HomArray': {
      return 'array';
    }

    case 'Object': {
      return 'object';
    }

    case 'Function': {
      return 'function';
    }

    case 'Module': {
      return 'module';
    }

    default: {
      return value.type;
    }
  }
}

/**
 * Format a type string for display.
 * Converts @typename to Typename (e.g., @plane -> Plane) to match KCL LSP builtin format.
 */
function formatTypeForDisplay(type: string): string {
  if (type.startsWith('@')) {
    const name = type.slice(1);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  return type;
}

/**
 * Options for formatting symbol hover
 */
export type FormatSymbolHoverOptions = {
  /** Show as an alias (like TypeScript's import hover) */
  isAlias?: boolean;
  /** The original import path (for alias display) */
  importPath?: string;
};

/**
 * Format a variable symbol for hover display.
 */
function formatVariableHover(symbol: KclSymbol, isAlias: boolean, importPath: string | undefined): string[] {
  const lines: string[] = [];
  const type = symbol.value ? getKclValueType(symbol.value) : 'unknown';
  const prefix = isAlias ? '(alias)' : '(var)';
  lines.push(`\`\`\`kcl\n${prefix} ${symbol.name}: ${type}\n\`\`\``);

  if (isAlias) {
    lines.push(`\`\`\`kcl\nimport ${symbol.name}\n\`\`\``);
  }

  if (symbol.value) {
    lines.push(`*@default* — \`${formatKclValue(symbol.value)}\``);
  }

  if (isAlias && importPath) {
    lines.push(`*from* \`"${importPath}"\``);
  }

  return lines;
}

/**
 * Format a function symbol for hover display.
 */
function formatFunctionHover(symbol: KclSymbol, isAlias: boolean, importPath: string | undefined): string[] {
  const lines: string[] = [];
  const parameters = symbol.parameters ?? [];
  const parameterStrings = parameters.map((p) => {
    let string_ = p.isLabeled ? '' : '@';
    string_ += p.name;

    if (p.type) {
      string_ += `: ${formatTypeForDisplay(p.type)}`;
    }

    if (p.hasDefault) {
      string_ += ' = ...';
    }

    return string_;
  });

  const prefix = isAlias ? '(alias) function' : '(fn)';
  let signature = `${prefix} ${symbol.name}(${parameterStrings.join(', ')})`;
  if (symbol.returnType) {
    signature += `: ${symbol.returnType}`;
  }

  lines.push(`\`\`\`kcl\n${signature}\n\`\`\``);

  if (isAlias) {
    lines.push(`\`\`\`kcl\nimport ${symbol.name}\n\`\`\``);
  }

  if (isAlias && importPath) {
    lines.push(`*from* \`"${importPath}"\``);
  }

  return lines;
}

/**
 * Format a symbol for hover display.
 * Supports both standard format and TypeScript-like alias format for imports.
 */
export function formatSymbolHover(symbol: KclSymbol, options: FormatSymbolHoverOptions = {}): string[] {
  const { isAlias = false, importPath } = options;

  switch (symbol.kind) {
    case 'variable': {
      return formatVariableHover(symbol, isAlias, importPath);
    }

    case 'function': {
      return formatFunctionHover(symbol, isAlias, importPath);
    }

    case 'parameter': {
      const lines: string[] = [];
      lines.push(`\`\`\`kcl\n(param) ${symbol.name}\n\`\`\``);
      if (symbol.containingFunction) {
        lines.push(`*Parameter of function \`${symbol.containingFunction}\`*`);
      }

      return lines;
    }

    case 'import': {
      const lines: string[] = [];
      lines.push(`\`\`\`kcl\n(import) ${symbol.name}\n\`\`\``);
      if (symbol.importPath) {
        lines.push(`*from* \`"${symbol.importPath}"\``);
      }

      return lines;
    }
    // No default
  }
}

/**
 * Format a module path for hover display (like TypeScript's module hover).
 * Shows: module "path"
 */
export function formatModuleHover(modulePath: string): string[] {
  return [`\`\`\`kcl\nmodule "${modulePath}"\n\`\`\``];
}

// Singleton instance
let symbolServiceInstance: KclSymbolService | undefined;

/**
 * Get the singleton KCL Symbol Service instance
 */
export function getKclSymbolService(): KclSymbolService {
  symbolServiceInstance ??= new KclSymbolService();
  return symbolServiceInstance;
}
