/**
 * Error Enrichment Utilities
 *
 * Standalone functions for parsing stack traces, classifying frames,
 * resolving source maps, and deriving error locations.
 */

import { SourceMapConsumer } from 'source-map-js';
import type { KernelStackFrame, FrameContext, ErrorLocation } from '#types/runtime.types.js';
import { named } from '#framework/named.js';

const virtualSourcePrefix = 'vfs:';

const normalizeEntryName = (name: string): string => {
  if (!name.startsWith('file:')) {
    return name.replaceAll('\\', '/');
  }

  try {
    return decodeURIComponent(new URL(name).pathname)
      .replace(/^\/(?=[A-Za-z]:\/)/, '')
      .replaceAll('\\', '/');
  } catch {
    return name;
  }
};

// =============================================================================
// Stack Trace Parsing
// =============================================================================

type LibraryPattern = { pattern: string; moduleName: string };

/**
 * Parse an error's stack trace into structured stack frames.
 *
 * @param error - the thrown value (only Error instances with `.stack` are processed)
 * @param options - optional configuration for frame classification, source mapping, and path resolution
 * @returns array of parsed stack frames, source-mapped when a source map is provided
 * @public
 */
export function parseStackTrace(
  error: unknown,
  options?: {
    classifyFrame?: (fileName: string) => FrameContext;
    sourceMap?: string;
    resolveSourcePath?: (sourcePath: string) => string;
    lastEntryName?: string;
  },
): KernelStackFrame[] {
  if (!(error instanceof Error) || !error.stack) {
    return [];
  }

  const classifier = options?.classifyFrame ?? defaultClassifyFrame;
  const frames: KernelStackFrame[] = [];
  const lines = error.stack.split('\n');

  for (const line of lines) {
    // Chrome: "    at functionName (file:line:column)" or "    at file:line:column"
    // Firefox: "functionName@file:line:column"
    const chromeFunctionMatch = /^\s*at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/.exec(line);
    const chromeBareMatch = /^\s*at\s+(.+):(\d+):(\d+)$/.exec(line);
    const firefoxMatch = /^(.*)@(.+):(\d+):(\d+)$/.exec(line);

    const match = chromeFunctionMatch ?? firefoxMatch;
    if (match ?? chromeBareMatch) {
      const rawFunctionName = match?.[1];
      const fileName = match?.[2] ?? chromeBareMatch?.[1];
      const lineNumber = match?.[3] ?? chromeBareMatch?.[2];
      const columnNumber = match?.[4] ?? chromeBareMatch?.[3];
      const functionName = rawFunctionName?.replace(/^Proxy\./, '') ?? '<anonymous>';

      frames.push({
        functionName,
        fileName: fileName ?? '',
        lineNumber: Number.parseInt(lineNumber ?? '0', 10),
        columnNumber: Number.parseInt(columnNumber ?? '0', 10),
        context: classifier(fileName ?? ''),
      });
    }
  }

  return applySourceMapToFrames({
    frames,
    sourceMapJson: options?.sourceMap,
    resolveSourcePathFn: options?.resolveSourcePath,
    lastEntryName: options?.lastEntryName,
  });
}

// =============================================================================
// Frame Classification
// =============================================================================

/**
 * Default frame classifier.
 *
 * - blob: URLs → user code (bundled)
 * - node:, <, wasm: → runtime
 * - node_modules/, data:, /kernel/ → framework
 * - Everything else → user
 *
 * @param fileName - the source file URL or path to classify
 * @returns the frame context category for the given file
 */
function defaultClassifyFrame(fileName: string): FrameContext {
  if (fileName.startsWith('blob:')) {
    return 'user';
  }

  if (fileName.startsWith('node:') || fileName.startsWith('<') || fileName.startsWith('wasm:')) {
    return 'runtime';
  }

  if (
    fileName.includes('/node_modules/') ||
    fileName.startsWith('data:') ||
    fileName.includes('/kernel/') ||
    fileName.includes('/runtime/')
  ) {
    return 'framework';
  }

  return 'user';
}

/**
 * Create a deterministic frame classifier for the defineKernel architecture.
 *
 * Uses URL scheme to classify frames without any path-based heuristics:
 * - `blob:` / `data:` → `user` (esbuild-wasm always bundles user code into these URLs)
 * - `node:` / `wasm:` / `<` → `runtime` (V8/WASM internals)
 * - Everything else → `framework` (not user code, not runtime = platform code)
 *
 * The third rule is correct by construction: user code can ONLY enter the call
 * stack via blob/data URLs (created by {@link executeCode}), so any frame from
 * a different URL scheme is definitionally not user code.
 *
 * Library frames are identified in a second pass via {@link classifyLibraryFrames}
 * using the ES module export name table, which works identically in dev and prod.
 *
 * @returns classifier function that assigns a {@link FrameContext} to a given file name
 * @public
 */
export function createFrameClassifier(): (fileName: string) => FrameContext {
  return (fileName: string): FrameContext => {
    if (fileName.startsWith('blob:') || fileName.startsWith('data:')) {
      return 'user';
    }

    if (fileName.startsWith('node:') || fileName.startsWith('<') || fileName.startsWith('wasm:')) {
      return 'runtime';
    }

    return 'framework';
  };
}

// =============================================================================
// Source Map Resolution
// =============================================================================

/**
 * Resolve a source map path to a project-relative path.
 * esbuild source maps contain paths prefixed with the namespace (e.g., `vfs:main.ts`).
 *
 * @param sourcePath - raw source path from the source map
 * @returns cleaned project-local path for user presentation
 * @public
 */
export function resolveSourcePath(sourcePath: string): string {
  const cleanPath = sourcePath.startsWith(virtualSourcePrefix)
    ? sourcePath.slice(virtualSourcePrefix.length)
    : sourcePath;

  return cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
}

/**
 * Apply source map resolution to parsed stack frames.
 * Maps generated (post-bundle) positions in blob:/data: URLs back to
 * original source file paths and line/column numbers.
 *
 * @param options - source map resolution configuration with frames, source map JSON, and path resolver
 * @returns stack frames with resolved original source positions
 */
function applySourceMapToFrames(options: {
  frames: KernelStackFrame[];
  sourceMapJson?: string;
  resolveSourcePathFn?: (sourcePath: string) => string;
  lastEntryName?: string;
}): KernelStackFrame[] {
  const { frames, sourceMapJson, resolveSourcePathFn, lastEntryName } = options;
  if (!sourceMapJson) {
    return frames;
  }

  try {
    const rawMap: unknown = JSON.parse(sourceMapJson);
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- source-map-js accepts parsed JSON
    const consumer = new SourceMapConsumer(rawMap as any);
    const resolver = resolveSourcePathFn ?? ((s: string) => resolveSourcePath(s));

    return frames.map((frame) => {
      const name = frame.fileName ?? '';
      const isBundledFrame =
        name.startsWith('blob:') ||
        name.startsWith('data:') ||
        (lastEntryName !== undefined && normalizeEntryName(name) === normalizeEntryName(lastEntryName));

      if (!isBundledFrame || !frame.lineNumber) {
        return frame;
      }

      const original = consumer.originalPositionFor({
        line: frame.lineNumber,
        column: (frame.columnNumber ?? 1) - 1,
      });

      if (!original.source) {
        return frame;
      }

      const fileName = resolver(original.source);

      return {
        ...frame,
        fileName,
        // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- source-map-js returns null at runtime despite types saying number
        lineNumber: original.line ?? frame.lineNumber,
        // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- source-map-js returns null at runtime despite types saying number
        columnNumber: (original.column ?? 0) + 1,
        functionName: original.name ?? frame.functionName,
        context: 'user',
      };
    });
  } catch {
    return frames;
  }
}

// =============================================================================
// Library Source Map Resolution
// =============================================================================

/**
 * Resolve a library source map path to a clean display path.
 * E.g., '../src/sketches/Sketch.ts' → 'replicad/src/sketches/Sketch.ts'
 *
 * @param moduleName - npm package name used as the display prefix
 * @param rawSource - raw source path from the library's source map
 * @returns cleaned display path prefixed with the module name
 */
export function resolveLibrarySourcePath(moduleName: string, rawSource: string, stripPattern?: string): string {
  let clean = rawSource;

  if (clean.startsWith('file://')) {
    clean = clean.slice(7);
  }

  const candidatePatterns = [stripPattern, `node_modules/${moduleName}/`].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );

  let stripped = false;
  for (const candidate of candidatePatterns) {
    const index = clean.indexOf(candidate);
    if (index !== -1) {
      clean = clean.slice(index + candidate.length);
      stripped = true;
      break;
    }
  }

  if (!stripped) {
    while (clean.startsWith('../')) {
      clean = clean.slice(3);
    }

    while (clean.startsWith('./')) {
      clean = clean.slice(2);
    }
  }

  clean = clean.replaceAll('\\', '/').replaceAll(/\/+/g, '/');
  return `${moduleName}/${clean}`;
}

/**
 * Apply library source maps to resolve library frames to original TS positions.
 * Uses a cache map that is populated lazily.
 *
 * @param frames - parsed stack frames to resolve
 * @param libraryPatterns - patterns identifying which frames belong to known libraries
 * @param getSourceMapConsumer - factory that returns a cached SourceMapConsumer for a given module name
 * @returns frames with library entries resolved to original source positions
 * @public
 */
export function applyLibrarySourceMaps(
  frames: KernelStackFrame[],
  libraryPatterns: LibraryPattern[],
  getSourceMapConsumer: (moduleName: string) => SourceMapConsumer | undefined,
): KernelStackFrame[] {
  if (libraryPatterns.length === 0) {
    return frames;
  }

  return frames.map((frame) => {
    if (frame.context === 'user' || frame.context === 'runtime' || !frame.fileName || !frame.lineNumber) {
      return frame;
    }

    const library = libraryPatterns.find((l) => frame.fileName!.includes(l.pattern));
    if (!library) {
      return frame;
    }

    const consumer = getSourceMapConsumer(library.moduleName);
    if (consumer) {
      try {
        const original = consumer.originalPositionFor({
          line: frame.lineNumber,
          column: (frame.columnNumber ?? 1) - 1,
        });

        if (original.source) {
          return {
            ...frame,
            fileName: resolveLibrarySourcePath(library.moduleName, original.source, library.pattern),
            // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- source-map-js returns null at runtime despite types saying number
            lineNumber: original.line ?? frame.lineNumber,
            // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- source-map-js returns null at runtime despite types saying number
            columnNumber: (original.column ?? 0) + 1,
            functionName: original.name ?? frame.functionName,
          };
        }
      } catch {
        // Fall through to path normalization
      }
    }

    return {
      ...frame,
      fileName: resolveLibrarySourcePath(library.moduleName, frame.fileName, library.pattern),
    };
  });
}

// =============================================================================
// Export Name Preservation
// =============================================================================

/**
 * Information extracted from a module's export table for minification resilience.
 */
export type ExportNameInfo = {
  /** Mapping of mangled function names to their original export names (for {@link demangleStackFrames}). */
  mangledToOriginal: Map<string, string>;
  /** Set of all function/class export names (for {@link classifyLibraryFrames}). */
  exportNames: Set<string>;
};

/**
 * Restore original function/class names from a module's export table.
 *
 * Minifiers rename internal identifiers, but ES module export keys are string
 * literals that survive minification. This sets each exported function's `.name`
 * to match its export key so standalone function calls show the original name
 * in stack traces.
 *
 * Returns both a mangled → original mapping (for {@link demangleStackFrames} to
 * fix class method type prefixes) and the full set of export names (for
 * {@link classifyLibraryFrames} to identify library frames by function name).
 *
 * @param moduleExports - the module's exports (from `import * as mod from '...'`)
 * @returns export name info for demangling and library classification
 * @public
 */
export function preserveExportNames(moduleExports: Record<string, unknown>): ExportNameInfo {
  const mangledToOriginal = new Map<string, string>();
  const exportNames = new Set<string>();

  for (const [exportName, exportValue] of Object.entries(moduleExports)) {
    if (typeof exportValue === 'function') {
      exportNames.add(exportName);
      if (exportValue.name !== exportName) {
        mangledToOriginal.set(exportValue.name, exportName);
        named(exportName, exportValue as (...args: never[]) => unknown);
      }
    }
  }

  return { mangledToOriginal, exportNames };
}

/**
 * Post-process parsed stack frames to replace mangled names with originals.
 *
 * V8 bakes class names at parse time for method calls (e.g., `e.extrude`),
 * which `Object.defineProperty` on `.name` cannot fix. This function uses
 * the mangled → original mapping from {@link preserveExportNames} to replace
 * mangled type prefixes and standalone function names in parsed stack frames.
 *
 * @param frames - parsed stack frames to demangle
 * @param mangledToOriginal - mapping from mangled names to original export names
 * @returns frames with mangled names replaced by their original export names
 * @public
 */
export function demangleStackFrames(
  frames: KernelStackFrame[],
  mangledToOriginal: Map<string, string>,
): KernelStackFrame[] {
  if (mangledToOriginal.size === 0) {
    return frames;
  }

  return frames.map((frame) => {
    const name = frame.functionName;
    if (!name) {
      return frame;
    }

    const dotIndex = name.indexOf('.');
    if (dotIndex > 0) {
      const typeName = name.slice(0, dotIndex);
      const rest = name.slice(dotIndex);
      const original = mangledToOriginal.get(typeName);
      if (original) {
        return { ...frame, functionName: original + rest };
      }
    }

    const original = mangledToOriginal.get(name);
    if (original) {
      return { ...frame, functionName: original };
    }

    return frame;
  });
}

// =============================================================================
// Library Frame Classification
// =============================================================================

/**
 * Reclassify framework frames as library frames using the ES module export name table.
 *
 * In production, library code (e.g., replicad) is bundled into the same chunks
 * as framework code, making URL-based detection impossible. Instead, this function
 * checks whether a frame's function name (or class name in `ClassName.method`)
 * matches a known library export. This works identically in dev and prod because
 * ES module export keys are string literals that survive minification, and
 * {@link preserveExportNames} restores `.name` on all exported functions/classes.
 *
 * Should be called AFTER {@link demangleStackFrames} so that class type prefixes
 * have been restored (e.g., `e.extrude` → `Sketch.extrude`).
 *
 * @param frames - parsed and demangled stack frames
 * @param libraryExportNames - set of all function/class export names from the library
 * @returns frames with matching entries reclassified from `framework` to `library`
 * @public
 */
export function classifyLibraryFrames(frames: KernelStackFrame[], libraryExportNames: Set<string>): KernelStackFrame[] {
  if (libraryExportNames.size === 0) {
    return frames;
  }

  return frames.map((frame) => {
    if (frame.context !== 'framework' || !frame.functionName) {
      return frame;
    }

    const dotIndex = frame.functionName.indexOf('.');
    const baseName = dotIndex > 0 ? frame.functionName.slice(0, dotIndex) : frame.functionName;

    if (libraryExportNames.has(baseName)) {
      return { ...frame, context: 'library' as FrameContext };
    }

    return frame;
  });
}

// =============================================================================
// Error Location Derivation
// =============================================================================

/**
 * Derive an ErrorLocation from the first user-context stack frame.
 * Optionally uses source map data to compute expression extent.
 *
 * @param frames - parsed stack frames to search for user context
 * @param sourceMapJson - optional raw source map JSON for expression extent computation
 * @param resolveSourcePathFunction - optional path resolver override
 * @returns location of the first user-authored frame, or `undefined` if none found
 * @public
 */
export function deriveLocationFromFrames(
  frames: KernelStackFrame[],
  sourceMapJson?: string,
  resolveSourcePathFunction?: (sourcePath: string) => string,
): ErrorLocation | undefined {
  const userFrame = frames.find((frame) => frame.context === 'user');
  if (!userFrame?.fileName || !userFrame.lineNumber) {
    return undefined;
  }

  const startLineNumber = userFrame.lineNumber;
  let startColumn = userFrame.columnNumber ?? 1;
  let endColumn: number | undefined;

  if (sourceMapJson) {
    try {
      const extent = computeExpressionExtentFromSourceMap({
        sourceMapJson,
        fileName: userFrame.fileName,
        lineNumber: startLineNumber,
        startColumn,
        resolveSourcePathFn: resolveSourcePathFunction,
      });
      if (extent) {
        startColumn = extent.startColumn;
        endColumn = extent.endColumn;
      }
    } catch {
      // Fall through with no endColumn on source map errors
    }
  }

  return {
    fileName: userFrame.fileName,
    startLineNumber,
    startColumn,
    endLineNumber: endColumn === undefined ? undefined : startLineNumber,
    endColumn,
  };
}

/**
 * Compute the expression extent (start/end columns) from source map mapping data.
 *
 * @param options - source map lookup configuration with file name, line, column, and path resolver
 * @returns start and end column range, or undefined if the mapping cannot be resolved
 */
function computeExpressionExtentFromSourceMap(options: {
  sourceMapJson: string;
  fileName: string;
  lineNumber: number;
  startColumn: number;
  resolveSourcePathFn?: (sourcePath: string) => string;
}): { startColumn: number; endColumn: number } | undefined {
  const { sourceMapJson, fileName, lineNumber, startColumn, resolveSourcePathFn } = options;
  const rawMap: unknown = JSON.parse(sourceMapJson);
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- source-map-js accepts parsed JSON
  const consumer = new SourceMapConsumer(rawMap as any);
  const resolver = resolveSourcePathFn ?? ((s: string) => resolveSourcePath(s));

  let sourceName: string | undefined;
  for (const source of consumer.sources) {
    if (resolver(source) === fileName) {
      sourceName = source;
      break;
    }
  }

  if (!sourceName) {
    return undefined;
  }

  let adjustedStartColumn = startColumn;

  const sourceContent = consumer.sourceContentFor(sourceName) ?? undefined;
  if (sourceContent) {
    const lines = sourceContent.split('\n');
    const line = lines[lineNumber - 1];
    if (line && startColumn > 1 && line[startColumn - 2] === '.') {
      adjustedStartColumn = startColumn - 1;
    }
  }

  const columnsOnLine: number[] = [];
  consumer.eachMapping((mapping) => {
    if (mapping.source === sourceName && mapping.originalLine === lineNumber && mapping.originalColumn !== null) {
      columnsOnLine.push(mapping.originalColumn);
    }
  });

  if (columnsOnLine.length === 0) {
    return undefined;
  }

  const start0 = adjustedStartColumn - 1;
  const lastMappedColumn = columnsOnLine
    .filter((col) => col >= start0)
    .sort((a, b) => a - b)
    .pop();

  if (lastMappedColumn === undefined) {
    return undefined;
  }

  return { startColumn: adjustedStartColumn, endColumn: lastMappedColumn + 2 };
}
