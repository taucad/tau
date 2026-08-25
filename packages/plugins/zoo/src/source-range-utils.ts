import type { SourceRange } from '@taucad/kcl-wasm-lib/bindings/SourceRange';

/** Represents a position within source code as a 1-based line and 0-based column number. */
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
function charOffsetToLineColumn(sourceCode: string, charOffset: number): LineColumnPosition {
  if (charOffset < 0 || charOffset > sourceCode.length) {
    return { line: 1, column: 0 };
  }

  let line = 1;
  let column = 0;

  for (let index = 0; index < charOffset && index < sourceCode.length; index++) {
    if (sourceCode[index] === '\n') {
      line++;
      column = 0;
    } else {
      column++;
    }
  }

  return { line, column };
}

/**
 * Converts a SourceRange (character offsets) to a line/column position using source code.
 *
 * @param sourceRange - the SourceRange array [startChar, endChar, moduleId]
 * @param sourceCode - the source code string to resolve offsets against
 * @returns the start position as 1-based line and 0-based column
 */
export function sourceRangeToLineColumn(sourceRange: SourceRange, sourceCode: string): LineColumnPosition {
  const startCharOffset = sourceRange[0];
  return charOffsetToLineColumn(sourceCode, startCharOffset);
}

/**
 * Extracts the line/column position from a compilation error's source range.
 *
 * @param error - object with a sourceRange from the KCL parser
 * @param error.sourceRange - source range array from the compilation error
 * @param sourceCode - the source code string that was parsed
 * @returns the error position as 1-based line and 0-based column
 */
export function getErrorPosition(error: { sourceRange: SourceRange }, sourceCode: string): LineColumnPosition {
  return sourceRangeToLineColumn(error.sourceRange, sourceCode);
}
