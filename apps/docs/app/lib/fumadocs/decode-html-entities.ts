const namedEntities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const htmlEntityPattern = /&(?:#x([\dA-Fa-f]+)|#(\d+)|([A-Za-z]+));/g;

const maxCodePoint = 0x10_ff_ff;

// The pattern only captures digits, so parsing never yields NaN; the reachable
// failure is an in-range-looking reference above the Unicode maximum, which
// String.fromCodePoint rejects with a RangeError.
const decodeCodePoint = (code: number, match: string): string =>
  code <= maxCodePoint ? String.fromCodePoint(code) : match;

const decodeEntityReplacement = (match: string, ...captures: Array<string | undefined>): string => {
  const hex = captures[0] ?? '';
  const dec = captures[1] ?? '';
  const name = captures[2] ?? '';
  if (hex.length > 0) {
    return decodeCodePoint(Number.parseInt(hex, 16), match);
  }

  if (dec.length > 0) {
    return decodeCodePoint(Number.parseInt(dec, 10), match);
  }

  if (name.length > 0) {
    const entity = namedEntities[name];
    if (entity !== undefined) {
      return entity;
    }
  }

  return match;
};

/**
 * Decode HTML numeric and a small set of named character references in plain-text LLM output.
 * Safe for `getText('processed')` strings served as `text/plain` — output is not reparsed as HTML/MDX.
 */
export const decodeHtmlEntities = (input: string): string =>
  input.replaceAll(htmlEntityPattern, decodeEntityReplacement);
