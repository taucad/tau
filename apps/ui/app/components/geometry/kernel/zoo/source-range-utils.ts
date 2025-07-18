import type { SourceRange } from '@taucad/kcl-wasm-lib/bindings/SourceRange';

export type LineColumnPosition = {
  line: number;
  column: number;
};

/**
 * Convert a character offset to line and column position within source code
 * @param sourceCode - The source code string
 * @param charOffset - Character offset from start of file (0-based)
 * @returns Object with 1-based line and 0-based column numbers
 */
export function charOffsetToLineColumn(sourceCode: string, charOffset: number): LineColumnPosition {
  if (charOffset < 0 || charOffset > sourceCode.length) {
    return { line: 1, column: 0 };
  }

  let line = 1;
  let column = 0;

  for (let i = 0; i < charOffset && i < sourceCode.length; i++) {
    if (sourceCode[i] === '\n') {
      line++;
      column = 0;
    } else {
      column++;
    }
  }

  return { line, column };
}

/**
 * Convert a SourceRange (character offsets) to line/column format using source code
 * @param sourceRange - The SourceRange array [startChar, endChar, moduleId]
 * @param sourceCode - The source code string
 * @returns Object with start position in line/column format
 */
export function sourceRangeToLineColumn(sourceRange: SourceRange, sourceCode: string): LineColumnPosition {
  const startCharOffset = sourceRange[0];
  return charOffsetToLineColumn(sourceCode, startCharOffset);
}

/**
 * Extract error position information from CompilationError with source code context
 * @param error - CompilationError from KCL parser
 * @param sourceCode - The source code string that was parsed
 * @returns Object with line/column position
 */
export function getErrorPosition(error: { sourceRange: SourceRange }, sourceCode: string): LineColumnPosition {
  return sourceRangeToLineColumn(error.sourceRange, sourceCode);
}
