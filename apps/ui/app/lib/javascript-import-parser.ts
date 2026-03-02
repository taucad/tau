/**
 * JavaScript/TypeScript Import Parser
 *
 * Uses es-module-lexer for production-ready parsing with parse result caching.
 * This module is used by the DefinitionProvider for Cmd+Click navigation.
 */

import { init, parse } from 'es-module-lexer';
import type { ImportSpecifier } from 'es-module-lexer';
import type * as Monaco from 'monaco-editor';

// Initialize WASM once
let initialized = false;
let initPromise: Promise<void> | undefined;

async function ensureInitialized(): Promise<void> {
  if (initialized) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async (): Promise<void> => {
    await init;
    initialized = true;
  })();
  return initPromise;
}

// Cache parse results per model (WeakMap for auto cleanup when model is disposed)
const parseCache = new WeakMap<
  Monaco.editor.ITextModel,
  {
    version: number;
    imports: readonly ImportSpecifier[];
  }
>();

export type ImportAtPosition = {
  /** The module specifier (e.g., 'replicad', './utils') */
  specifier: string;
  /** Character offset where specifier starts */
  startOffset: number;
  /** Character offset where specifier ends */
  endOffset: number;
  /** Whether this is a dynamic import */
  isDynamic: boolean;
  /** Character offset where the import statement starts */
  statementStart: number;
  /** Character offset where the import statement ends */
  statementEnd: number;
};

/**
 * Get cached or fresh parse results for a model.
 */
async function getImportsForModel(model: Monaco.editor.ITextModel): Promise<readonly ImportSpecifier[]> {
  await ensureInitialized();

  const cached = parseCache.get(model);
  const currentVersion = model.getVersionId();

  if (cached?.version === currentVersion) {
    return cached.imports;
  }

  const code = model.getValue();
  const [imports] = parse(code);

  parseCache.set(model, { version: currentVersion, imports });
  return imports;
}

/**
 * Find the import at a given cursor position using cached parse results.
 *
 * @param model - The Monaco text model
 * @param position - The cursor position
 * @returns The import at that position, or undefined if not on an import
 */
export async function getImportAtPosition(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): Promise<ImportAtPosition | undefined> {
  const offset = model.getOffsetAt(position);
  const imports = await getImportsForModel(model);
  const code = model.getValue();

  for (const imp of imports) {
    // Check if cursor is within the specifier string (between s and e)
    if (offset >= imp.s && offset <= imp.e) {
      return {
        specifier: imp.n ?? code.slice(imp.s, imp.e),
        startOffset: imp.s,
        endOffset: imp.e,
        isDynamic: imp.d > -1,
        statementStart: imp.ss,
        statementEnd: imp.se,
      };
    }
  }

  return undefined;
}

/**
 * Get all imports from a model (uses cache).
 *
 * @param model - The Monaco text model
 * @returns Array of all imports with their positions
 */
export async function getAllImports(model: Monaco.editor.ITextModel): Promise<ImportAtPosition[]> {
  const imports = await getImportsForModel(model);
  const code = model.getValue();

  return imports.map((imp) => ({
    specifier: imp.n ?? code.slice(imp.s, imp.e),
    startOffset: imp.s,
    endOffset: imp.e,
    isDynamic: imp.d > -1,
    statementStart: imp.ss,
    statementEnd: imp.se,
  }));
}
