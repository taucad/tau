/**
 * FZF-style fuzzy matching algorithm for command-palette / autocomplete UIs.
 *
 * Scores based on consecutive character runs, word-boundary alignment,
 * prefix position, and gap penalties — the same heuristics used by
 * VS Code, Windows Terminal, and fzf.
 *
 * @public
 */

export type FuzzyMatchResult = {
  /** Higher is better. */
  score: number;
  /** Character indices in `target` that matched the query. */
  positions: number[];
};

const scoreConsecutive = 8;
const scoreWordBoundary = 6;
const scorePrefix = 10;
const scoreMatch = 1;
const penaltyGapStart = -3;
const penaltyGapExtension = -1;

const separators = new Set([' ', '-', '_', '.', '/', '\\']);

const isSeparator = (char: string): boolean => separators.has(char);

const isUpperCase = (char: string): boolean => char !== char.toLowerCase() && char === char.toUpperCase();

/**
 * Determines whether position `index` in `target` sits at a word boundary.
 *
 * A word boundary is:
 * - index 0 (start of string)
 * - preceded by a separator (`-`, `_`, `.`, `/`, `\\`, space)
 * - a camelCase transition (lowercase -> uppercase)
 */
const isWordBoundary = (target: string, index: number): boolean => {
  if (index === 0) {
    return true;
  }
  const previous = target[index - 1]!;
  if (isSeparator(previous)) {
    return true;
  }
  if (!isUpperCase(previous) && isUpperCase(target[index]!)) {
    return true;
  }
  return false;
};

/**
 * Fuzzy-match `query` against `target`.
 *
 * Returns `undefined` when the query characters cannot be found
 * sequentially in the target. Otherwise returns a score and the
 * matched character positions.
 *
 * @example
 * ```typescript
 * fuzzyMatch('pc', 'Past Chats');
 * // { score: 18, positions: [0, 5] }
 *
 * fuzzyMatch('xyz', 'hello');
 * // undefined
 * ```
 *
 * @public
 */
export const fuzzyMatch = (query: string, target: string): FuzzyMatchResult | undefined => {
  if (query.length === 0) {
    return { score: 0, positions: [] };
  }
  if (query.length > target.length) {
    return undefined;
  }

  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  const positions: number[] = [];
  let score = 0;
  let queryIndex = 0;
  let lastMatchIndex = -1;
  let consecutiveCount = 0;
  let inGap = false;

  for (let i = 0; i < target.length && queryIndex < query.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      positions.push(i);
      score += scoreMatch;

      if (lastMatchIndex >= 0 && i === lastMatchIndex + 1) {
        consecutiveCount++;
        score += scoreConsecutive * consecutiveCount;
      } else {
        consecutiveCount = 0;
      }

      if (isWordBoundary(target, i)) {
        score += scoreWordBoundary;
      }

      if (i === queryIndex) {
        score += scorePrefix;
      }

      if (query[queryIndex] === target[i]) {
        score += 1;
      }

      inGap = false;
      lastMatchIndex = i;
      queryIndex++;
    } else if (queryIndex > 0) {
      if (inGap) {
        score += penaltyGapExtension;
      } else {
        score += penaltyGapStart;
        inGap = true;
      }
    }
  }

  if (queryIndex !== query.length) {
    return undefined;
  }

  return { score, positions };
};
