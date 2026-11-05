/**
 * Grep for the compute worker: one pattern over files handed in as bytes,
 * line by line, bounded by a match count. Bytes in, matches out; the caller
 * decides which files to read (W9 routes agent grep through here).
 *
 * @module
 */

/** One file to search. */
export type GrepFile = Readonly<{ path: string; data: Uint8Array<ArrayBuffer> }>;

/** What to look for: a regular expression, or a literal string when `literal` is set. */
export type GrepPattern = Readonly<{ source: string; literal?: boolean; ignoreCase?: boolean }>;

/** One matching line. `line` counts from 1, `column` from 0 in UTF-16 units. */
export type GrepMatch = Readonly<{ path: string; line: number; column: number; text: string }>;

/** The matches, and whether the bound cut them short. */
export type GrepResult = Readonly<{ matches: GrepMatch[]; truncated: boolean }>;

/** Bounds of one search. */
export type GrepOptions = Readonly<{
  /** Matches returned before stopping. */
  maxMatches?: number;
  /** A matching line longer than this is cut to it. UTF-16 units. */
  maxLineLength?: number;
}>;

/* Git's heuristic: a NUL in the first 8000 bytes makes a file binary. */
const binaryProbeBytes = 8000;

/**
 * Search files for a pattern; binary files are skipped.
 *
 * @param files - The files, as bytes.
 * @param pattern - The pattern.
 * @param options - Bounds.
 * @returns Each matching line, in file and line order.
 * @throws SyntaxError when the pattern is not a valid regular expression.
 */
export const grep = (files: readonly GrepFile[], pattern: GrepPattern, options: GrepOptions = {}): GrepResult => {
  const maxMatches = options.maxMatches ?? 1000;
  const maxLineLength = options.maxLineLength ?? 500;
  const source = pattern.literal === true ? pattern.source.replaceAll(/[$()*+.?[\\\]^{|}]/gu, '\\$&') : pattern.source;
  const expression = new RegExp(source, pattern.ignoreCase === true ? 'iu' : 'u');
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const matches: GrepMatch[] = [];
  for (const file of files) {
    if (file.data.subarray(0, binaryProbeBytes).includes(0)) {
      continue;
    }
    const lines = decoder.decode(file.data).split(/\r?\n/u);
    for (const [index, text] of lines.entries()) {
      const found = expression.exec(text);
      if (found === null) {
        continue;
      }
      if (matches.length === maxMatches) {
        return { matches, truncated: true };
      }
      matches.push({ path: file.path, line: index + 1, column: found.index, text: text.slice(0, maxLineLength) });
    }
  }
  return { matches, truncated: false };
};
