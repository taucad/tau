/**
 * The one canonical JSON form (CL-R4, W0.1): keys sorted recursively, `undefined`-valued keys omitted, `undefined`
 * array items written as `null`, a container that contains itself written as `"[Circular]"`.
 *
 * It is the stored form, because `JSON.stringify` writes exactly those bytes: two values with equal canonical forms
 * read back identically after a reload. The appender's row identity, settlement comparison and the safeguards'
 * signatures all use it, so no two readings of "the same row" can disagree (S5 D1).
 *
 * @param value - Any value; `undefined` alone is written as `null`.
 * @returns The canonical JSON text.
 * @public
 */
export const canonicalJson = (value: unknown): string => {
  // Ancestors only: a value shared by two keys is written twice, as `JSON.stringify` writes it.
  const ancestors = new Set<unknown>();
  const visit = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') {
      return input;
    }
    if (ancestors.has(input)) {
      return '[Circular]';
    }
    ancestors.add(input);
    const record = input as Record<string, unknown>;
    const visited = Array.isArray(input)
      ? input.map((item) => visit(item))
      : Object.fromEntries(
          Object.keys(record)
            .sort()
            .map((key) => [key, visit(record[key])]),
        );
    ancestors.delete(input);
    return visited;
  };
  const visited = visit(value);
  return visited === undefined ? 'null' : JSON.stringify(visited);
};
