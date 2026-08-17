import type { ErrorLocation, KernelIssue, KernelStackFrame } from '@taucad/runtime/kernel';

/**
 * Callback function type for adding parsed errors.
 * @public
 */
export type AddErrorFunction = (error: KernelIssue) => void;

/**
 * Function type for lazily fetching file contents on demand.
 * Takes a normalized filename and returns the file content, or undefined if not found.
 * @public
 */
export type GetFileContentsFunction = (fileName: string) => string | undefined;

/**
 * Extract the basename (filename without directory path) from a full path.
 *
 * @param path - The full file path.
 * @returns The basename (e.g., 'main.scad' from 'site/main.scad').
 */
function getBasename(path: string): string {
  const lastSlashIndex = path.lastIndexOf('/');
  return lastSlashIndex === -1 ? path : path.slice(lastSlashIndex + 1);
}

/**
 * Normalize a filename by removing leading slashes and optionally mapping
 * the main file basename to its full relative path.
 *
 * OpenSCAD outputs absolute paths like "/main.scad" but we want relative paths.
 * Additionally, when the main file is in a subdirectory (e.g., "site/backyard.scad"),
 * OpenSCAD only reports the basename, so we need to map it back to the full path.
 *
 * @param fileName - The filename to normalize.
 * @param mainFilePath - Optional full relative path of the main file (e.g., "site/backyard.scad").
 * @returns The normalized filename, with main file basename mapped to full path if applicable.
 */
function normalizeFileName(fileName: string, mainFilePath?: string): string {
  const normalized = fileName.replace(/^\/+/, '');

  // If a main file path is provided and the normalized filename matches its basename,
  // return the full path instead of just the basename
  if (mainFilePath) {
    const mainBasename = getBasename(mainFilePath);
    if (normalized === mainBasename) {
      return mainFilePath;
    }
  }

  return normalized;
}

/**
 * Get a specific line from file contents using the getter function.
 * Returns undefined if the file or line is not found.
 *
 * @param getFileContents - Function to lazily fetch file content.
 * @param fileName - The normalized filename to look up.
 * @param lineNumber - The 1-based line number.
 * @returns The line content, or undefined if not found.
 */
function getLine(
  getFileContents: GetFileContentsFunction | undefined,
  fileName: string,
  lineNumber: number,
): string | undefined {
  if (!getFileContents) {
    return undefined;
  }

  const content = getFileContents(fileName);
  if (content === undefined) {
    return undefined;
  }

  const lines = content.split('\n');
  const lineIndex = lineNumber - 1; // Convert to 0-based index

  if (lineIndex < 0 || lineIndex >= lines.length) {
    return undefined;
  }

  return lines[lineIndex];
}

/**
 * Get the index of the first non-whitespace character in a string.
 *
 * @param line - The line content.
 * @returns The 0-based index of the first non-whitespace character, or 0 if all whitespace.
 */
function getFirstNonWhitespaceIndex(line: string): number {
  const match = /\S/.exec(line);
  return match?.index ?? 0;
}

/**
 * Create an ErrorLocation with proper start and end positions based on line content.
 * The start column is the first non-whitespace character, and end column is after the last character.
 * Both columns are 1-based to match Monaco editor conventions.
 *
 * @param fileName - The normalized filename.
 * @param lineNumber - The 1-based line number.
 * @param getFileContents - Optional function to lazily fetch file content.
 * @returns The ErrorLocation with 1-based start and end positions.
 */
function createErrorLocation(
  fileName: string,
  lineNumber: number,
  getFileContents: GetFileContentsFunction | undefined,
): ErrorLocation {
  const lineContent = getLine(getFileContents, fileName, lineNumber);

  if (lineContent === undefined) {
    // Fallback when line content is not available (1-based columns)
    return {
      fileName,
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: 1000,
    };
  }

  // Convert 0-based index to 1-based column
  const startColumn = getFirstNonWhitespaceIndex(lineContent) + 1;
  const endColumn = lineContent.length + 1;

  return {
    fileName,
    startLineNumber: lineNumber,
    startColumn,
    endLineNumber: lineNumber,
    endColumn,
  };
}

/**
 * Set of OpenSCAD built-in functions/modules that should be marked as internal
 * in stack traces. These are not user code and should be filterable.
 */
const openscadBuiltinFunctions = new Set(['assert', 'echo', 'let', 'assign']);

/**
 * Parse a TRACE line from OpenSCAD stderr and return a stack frame.
 *
 * OpenSCAD emits two types of TRACE lines after errors:
 * - `TRACE: called by '<name>' in file <path>, line <N>` — indicates the call site of a function
 * - `TRACE: call of '<name>()' in file <path>, line <N>` — indicates the function definition
 *
 * The "called by" lines represent meaningful call sites (where a function was invoked),
 * while "call of" lines point to function/module definitions. Together they form a
 * complete call stack from the error site back to the top-level call.
 *
 * Built-in OpenSCAD functions (like `assert`) are marked as internal.
 *
 * @param message - The stderr line to parse.
 * @param mainFilePath - Optional main file path for filename normalization.
 * @returns A KernelStackFrame if the line is a TRACE line, or undefined otherwise.
 */
function parseTraceLine(message: string, mainFilePath?: string): KernelStackFrame | undefined {
  // Pattern: TRACE: called by '<name>' in file <path>, line <N>
  // These represent call sites — where a function was invoked
  let match = /^TRACE: called by '([^']+)' in file "?([^",]+)"?, line (\d+)/.exec(message);
  if (match) {
    const [, functionName, file, line] = match;
    const name = functionName ?? '<anonymous>';
    return {
      functionName: name,
      fileName: normalizeFileName(file ?? '', mainFilePath),
      lineNumber: Number(line),
      context: openscadBuiltinFunctions.has(name) ? 'framework' : 'user',
    };
  }

  // Pattern: TRACE: call of '<name>()' in file <path>, line <N>
  // These represent function/module definitions — less useful for user-facing traces
  // but we still capture them for completeness
  match = /^TRACE: call of '([^']+)' in file "?([^",]+)"?, line (\d+)/.exec(message);
  if (match) {
    const [, functionName, file, line] = match;
    const name = functionName ?? '<anonymous>';
    return {
      functionName: name,
      fileName: normalizeFileName(file ?? '', mainFilePath),
      lineNumber: Number(line),
      context: openscadBuiltinFunctions.has(name) ? 'framework' : 'user',
    };
  }

  return undefined;
}

/**
 * Stateful parser for OpenSCAD stderr output.
 *
 * OpenSCAD emits errors and warnings as single lines, optionally followed
 * by TRACE lines that form a call stack. This parser accumulates TRACE lines
 * and attaches them as `stackFrames` to the preceding error.
 *
 * Usage:
 * ```typescript
 * const issues: KernelIssue[] = [];
 * const parser = new OpenScadStderrParser(
 *   (issue) => issues.push(issue),
 *   (fileName) => fileContents.get(fileName),
 *   'main.scad',
 * );
 * parser.parseLine('ERROR: Parser error in file "main.scad", line 5: syntax error');
 * ```
 *
 * @internal
 */
export class OpenScadStderrParser {
  /* oxlint-disable @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties */
  private readonly addError: AddErrorFunction;
  private readonly getFileContents?: GetFileContentsFunction;
  private readonly mainFilePath?: string;
  /* oxlint-enable @typescript-eslint/parameter-properties -- re-enable after constructor fields */

  /** Reference to the last error added, so TRACE lines can append stack frames to it. */
  private lastError: KernelIssue | undefined;

  /**
   * Creates a parser that converts OpenSCAD stderr output into structured kernel issues.
   *
   * @param addError - Callback invoked for each parsed error or warning
   * @param getFileContents - Optional function to lazily fetch file content for column calculation
   * @param mainFilePath - Optional relative path of the main file for basename-to-path mapping
   */
  public constructor(addError: AddErrorFunction, getFileContents?: GetFileContentsFunction, mainFilePath?: string) {
    this.addError = addError;
    this.getFileContents = getFileContents;
    this.mainFilePath = mainFilePath;
  }

  /**
   * Parse a single stderr line. If it's an error/warning, create an issue.
   * If it's a TRACE line, append a stack frame to the last error.
   *
   * @param message - The stderr line to parse
   */
  public parseLine(message: string): void {
    // First, check if this is a TRACE line (must come before error patterns to avoid mismatching)
    const traceFrame = parseTraceLine(message, this.mainFilePath);
    if (traceFrame) {
      this.appendFrameToLastError(traceFrame);
      return;
    }

    // Check for "Can't parse file 'X'!" lines that follow parser errors.
    // These indicate the include chain — e.g., bad.scad has a syntax error and
    // "Can't parse file 'main.scad'!" tells us main.scad included the broken file.
    if (this.tryCantParseFile(message)) {
      return;
    }

    // Not a TRACE or follow-up line — reset lastError so subsequent lines
    // are not accidentally appended to the wrong error
    this.lastError = undefined;

    // Try each error pattern
    if (this.tryParserErrorWithFile(message)) {
      return;
    }

    if (this.tryParserErrorInline(message)) {
      return;
    }

    if (this.tryWarning(message)) {
      return;
    }

    if (this.tryAssertionFailure(message)) {
      return;
    }

    if (this.tryGenericError(message)) {
      return;
    }

    this.tryEmptyObject(message);
  }

  // ---------------------------------------------------------------------------
  // Error patterns
  // ---------------------------------------------------------------------------

  /**
   * Pattern 1: ERROR: Parser error in file "foo.scad", line 10: syntax error
   *
   * @param message - the stderr line to match
   * @returns whether the line matched this pattern
   */
  private tryParserErrorWithFile(message: string): boolean {
    const match = /^ERROR: Parser error in file "([^"]+)", line (\d+): (.*)$/.exec(message);
    if (!match) {
      return false;
    }

    const [, file, line, error] = match;
    const fileName = normalizeFileName(file ?? '', this.mainFilePath);
    const lineNumber = Number(line);
    this.emitError({
      message: error ?? 'Unknown error',
      code: 'RUNTIME',
      location: createErrorLocation(fileName, lineNumber, this.getFileContents),
      type: 'compilation',
      severity: 'error',
    });
    return true;
  }

  /**
   * Pattern 2: ERROR: Parser error: syntax error in file foo.scad, line 10
   *
   * @param message - the stderr line to match
   * @returns whether the line matched this pattern
   */
  private tryParserErrorInline(message: string): boolean {
    const match = /^ERROR: Parser error: (.*?) in file ([^,]+), line (\d+)$/.exec(message);
    if (!match) {
      return false;
    }

    const [, error, file, line] = match;
    const fileName = normalizeFileName(file ?? '', this.mainFilePath);
    const lineNumber = Number(line);
    this.emitError({
      message: error ?? 'Unknown error',
      code: 'RUNTIME',
      location: createErrorLocation(fileName, lineNumber, this.getFileContents),
      type: 'compilation',
      severity: 'error',
    });
    return true;
  }

  /**
   * Pattern 3: WARNING messages
   *
   * @param message - the stderr line to match
   * @returns whether the line matched this pattern
   */
  private tryWarning(message: string): boolean {
    const match = /^WARNING: (.*?),? in file ([^,]+), line (\d+)\.?/.exec(message);
    if (!match) {
      return false;
    }

    const [, warning, file, line] = match;
    const fileName = normalizeFileName(file ?? '', this.mainFilePath);
    const lineNumber = Number(line);
    this.emitError({
      message: warning ?? 'Unknown warning',
      code: 'RUNTIME',
      location: createErrorLocation(fileName, lineNumber, this.getFileContents),
      type: 'compilation',
      severity: 'warning',
    });
    return true;
  }

  /**
   * Pattern 4: Assertion failures - ERROR: Assertion 'condition' failed in file "foo.scad", line 10
   *
   * @param message - the stderr line to match
   * @returns whether the line matched this pattern
   */
  private tryAssertionFailure(message: string): boolean {
    const match = /^ERROR: (Assertion .*?) in file "?([^",]+)"?, line (\d+)/.exec(message);
    if (!match) {
      return false;
    }

    const [, error, file, line] = match;
    const fileName = normalizeFileName(file ?? '', this.mainFilePath);
    const lineNumber = Number(line);
    this.emitError({
      message: error ?? 'Assertion failed',
      code: 'RUNTIME',
      location: createErrorLocation(fileName, lineNumber, this.getFileContents),
      type: 'runtime',
      severity: 'error',
    });
    return true;
  }

  /**
   * Pattern 5: Generic ERROR messages with file/line info
   *
   * @param message - the stderr line to match
   * @returns whether the line matched this pattern
   */
  private tryGenericError(message: string): boolean {
    const match = /^ERROR: (.*?) in file "?([^",]+)"?, line (\d+)/.exec(message);
    if (!match) {
      return false;
    }

    const [, error, file, line] = match;
    const fileName = normalizeFileName(file ?? '', this.mainFilePath);
    const lineNumber = Number(line);
    this.emitError({
      message: error ?? 'Unknown error',
      code: 'RUNTIME',
      location: createErrorLocation(fileName, lineNumber, this.getFileContents),
      type: 'runtime',
      severity: 'error',
    });
    return true;
  }

  /**
   * Pattern: Can't parse file 'X'!
   *
   * This line follows parser errors when the error occurs in an included file.
   * For example, if bad.scad has a syntax error and is included by main.scad
   * through middle.scad:
   *   ERROR: Parser error: syntax error in file /bad.scad, line 2
   *   Can't parse file 'main.scad'!
   *
   * OpenSCAD only emits the top-level file that failed to parse, not the
   * intermediate files. We reconstruct the full include chain by walking
   * the include/use directives in the file contents.
   *
   * @param message - the stderr line to match
   * @returns whether the line matched this pattern
   */
  private tryCantParseFile(message: string): boolean {
    if (!this.lastError) {
      return false;
    }

    const match = /^Can't parse file '([^']+)'!$/.exec(message);
    if (!match) {
      return false;
    }

    const [, rawFile] = match;
    const topLevelFile = normalizeFileName(rawFile ?? '', this.mainFilePath);
    const errorFile = this.lastError.location?.fileName;

    if (!errorFile) {
      // No error location to trace from — just add the top-level file
      this.appendFrameToLastError({
        functionName: 'include',
        fileName: topLevelFile,
        lineNumber: 1,
        context: 'user',
      });
      return true;
    }

    // Build the include chain from the top-level file down to the error file.
    // This reconstructs intermediate files that OpenSCAD doesn't report.
    const chain = this.buildIncludeChain(topLevelFile, errorFile);

    for (const frame of chain) {
      this.appendFrameToLastError(frame);
    }

    return true;
  }

  /**
   * Pattern 6: Empty top level object (no geometry to render)
   *
   * @param message - the stderr line to match
   */
  private tryEmptyObject(message: string): void {
    if (message.includes('Current top level object is empty')) {
      this.emitError({
        message:
          'No geometry to render. Call a module or add a primitive (e.g., cube(), sphere()) to create visible output.',
        code: 'RUNTIME',
        location: this.mainFilePath ? { fileName: this.mainFilePath, startLineNumber: 1, startColumn: 1 } : undefined,
        type: 'runtime',
        severity: 'warning',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Append a stack frame to the last error's stackFrames array.
   * Creates the array if it doesn't exist.
   *
   * @param frame - the stack frame to append
   */
  private appendFrameToLastError(frame: KernelStackFrame): void {
    if (!this.lastError) {
      return;
    }

    this.lastError.stackFrames ??= [];
    this.lastError.stackFrames.push(frame);
  }

  /**
   * Build a chain of include stack frames from the top-level file down to
   * the file containing the error. Walks include/use directives in file contents
   * to reconstruct intermediate files that OpenSCAD doesn't report.
   *
   * For example, with main.scad -> middle.scad -> bad.scad:
   * Returns frames for [middle.scad (include <bad.scad>), main.scad (include <middle.scad>)]
   * ordered from deepest to shallowest (matching stack trace convention).
   *
   * @param topLevelFile - The file reported in "Can't parse file 'X'!".
   * @param errorFile - The file where the actual error occurred.
   * @returns Array of stack frames representing the include chain.
   */
  private buildIncludeChain(topLevelFile: string, errorFile: string): KernelStackFrame[] {
    if (!this.getFileContents) {
      // Without file contents, we can only show the top-level file
      return [
        {
          functionName: 'include',
          fileName: topLevelFile,
          lineNumber: 1,
          context: 'user',
        },
      ];
    }

    // Walk from topLevelFile, following include/use directives toward errorFile.
    // Use BFS to find the shortest path through the include graph.
    const chain = this.findIncludePathBfs(topLevelFile, errorFile);

    if (chain.length === 0) {
      // Couldn't trace the chain — fall back to showing just the top-level file
      const directLine = this.findIncludeLineInFile(topLevelFile, errorFile);
      return [
        {
          functionName: 'include',
          fileName: topLevelFile,
          lineNumber: directLine ?? 1,
          context: 'user',
        },
      ];
    }

    return chain;
  }

  /**
   * BFS through include/use directives to find the path from startFile to targetFile.
   * Returns stack frames ordered from deepest (closest to error) to shallowest (entry point).
   *
   * @param startFile - the top-level file to start searching from
   * @param targetFile - the file containing the error to trace to
   * @returns stack frames from deepest to shallowest include
   */
  private findIncludePathBfs(startFile: string, targetFile: string): KernelStackFrame[] {
    if (!this.getFileContents) {
      return [];
    }

    const targetBasename = getBasename(targetFile);

    // Each entry: [currentFile, path of (parentFile, lineNumber) pairs leading here]
    type BfsEntry = {
      file: string;
      path: Array<{ file: string; line: number }>;
    };
    const queue: BfsEntry[] = [{ file: startFile, path: [] }];
    const visited = new Set<string>([startFile]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const includes = this.getIncludesFromFile(current.file);

      for (const inc of includes) {
        if (getBasename(inc.includedFile) === targetBasename || inc.includedFile === targetFile) {
          // Found the target! Build the chain from deepest to shallowest.
          // Reverse so the file closest to the error comes first (stack trace convention).
          const fullPath = [...current.path, { file: current.file, line: inc.lineNumber }];
          return fullPath.reverse().map((entry) => ({
            functionName: 'include',
            fileName: entry.file,
            lineNumber: entry.line,
            context: 'user',
          }));
        }

        if (!visited.has(inc.includedFile)) {
          visited.add(inc.includedFile);
          queue.push({
            file: inc.includedFile,
            path: [...current.path, { file: current.file, line: inc.lineNumber }],
          });
        }
      }
    }

    return [];
  }

  /**
   * Extract all include/use directives from a file's contents.
   * Returns an array of { includedFile, lineNumber } entries.
   *
   * @param fileName - the file to scan for include/use directives
   * @returns array of included file paths and their line numbers
   */
  private getIncludesFromFile(fileName: string): Array<{ includedFile: string; lineNumber: number }> {
    if (!this.getFileContents) {
      return [];
    }

    const content = this.getFileContents(fileName);
    if (content === undefined) {
      return [];
    }

    const results: Array<{ includedFile: string; lineNumber: number }> = [];
    const lines = content.split('\n');

    for (const [index, line] of lines.entries()) {
      const match = /^\s*(?:include|use)\s+<([^>]+)>/.exec(line);
      if (match) {
        results.push({
          includedFile: match[1] ?? '',
          lineNumber: index + 1, // 1-based
        });
      }
    }

    return results;
  }

  /**
   * Search a file's content for an include/use directive that references
   * the given included file, and return the 1-based line number.
   *
   * @param parentFileName - The file that contains the include/use directive.
   * @param includedFileName - The file being included (the one with the error).
   * @returns The 1-based line number of the include directive, or undefined if not found.
   */
  private findIncludeLineInFile(parentFileName: string, includedFileName: string): number | undefined {
    const includes = this.getIncludesFromFile(parentFileName);
    const targetBasename = getBasename(includedFileName);

    for (const inc of includes) {
      if (getBasename(inc.includedFile) === targetBasename || inc.includedFile === includedFileName) {
        return inc.lineNumber;
      }
    }

    return undefined;
  }

  /**
   * Emit an error and store its reference so subsequent TRACE lines
   * can append stack frames to it.
   *
   * @param error - the kernel issue to emit and track
   */
  private emitError(error: KernelIssue): void {
    this.lastError = error;
    this.addError(error);
  }
}

/**
 * Parse a single stderr line from OpenSCAD and call addError if it matches a known error pattern.
 *
 * This is the stateless legacy API preserved for backward compatibility.
 * For full stack trace support, use {@link OpenScadStderrParser} instead.
 *
 * Supports the following OpenSCAD error/warning formats:
 * - `ERROR: Parser error in file "foo.scad", line 10: syntax error`
 * - `ERROR: Parser error: syntax error in file foo.scad, line 10`
 * - `WARNING: message in file foo.scad, line 10`
 * - `ERROR: Assertion 'condition' failed in file "foo.scad", line 10`
 * - `ERROR: message in file "foo.scad", line 10` (generic error)
 * - `Current top level object is empty.` (special case: no geometry rendered)
 *
 * @param options - Options containing the stderr message, error callback, and optional file content/path helpers
 * @param options.message - The stderr line to parse
 * @param options.addError - Callback to invoke when an error is parsed
 * @param options.getFileContents - Optional function to lazily fetch file content for calculating column positions
 * @param options.mainFilePath - Optional full relative path of the main file, used to map basename errors back to full paths
 * @public
 */
export function parseStderrLine(options: {
  message: string;
  addError: AddErrorFunction;
  getFileContents?: GetFileContentsFunction;
  mainFilePath?: string;
}): void {
  const { message, addError, getFileContents, mainFilePath } = options;
  // Delegate to the stateful parser for a single line.
  // Note: TRACE lines will not be captured when using this stateless API since
  // each call creates a new parser instance with no memory of previous errors.
  const parser = new OpenScadStderrParser(addError, getFileContents, mainFilePath);
  parser.parseLine(message);
}
