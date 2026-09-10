/**
 * JavaScript/TypeScript Import Parser
 *
 * Uses the pure-JavaScript es-module-lexer parser with parse result caching.
 * This module is used by the DefinitionProvider for Cmd+Click navigation.
 */

import { parse } from 'es-module-lexer/js';
import type { ImportSpecifier } from 'es-module-lexer/js';
import type * as Monaco from 'monaco-editor';

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
function getImportsForModel(model: Monaco.editor.ITextModel): readonly ImportSpecifier[] {
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
export function getImportAtPosition(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): ImportAtPosition | undefined {
  const offset = model.getOffsetAt(position);
  const imports = getImportsForModel(model);
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
export function getAllImports(model: Monaco.editor.ITextModel): ImportAtPosition[] {
  const imports = getImportsForModel(model);
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

/**
 * Parse export names from raw JavaScript source code.
 *
 * Used by ATA to generate stub type declarations for pure-JS packages
 * that don't ship their own `.d.ts` files. Works on minified code.
 *
 * @param code - Raw JavaScript module source
 * @returns Array of exported names (e.g., ['addGrid', 'addHoneycomb', 'default'])
 */
export function parseExportNames(code: string): string[] {
  const [, exports] = parse(code);

  return exports.map((exp) => code.slice(exp.s, exp.e));
}
