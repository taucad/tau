/**
 * Hyphenated UUID (node-graph cross-reference) from `material.toJSON()`.
 *
 * Stable snapshots replace these strings with **`nodeRefPlaceholder`** — Three regenerates IDs per build while the graph topology stays comparable.
 */
const nodeGraphReferenceUuidPattern = /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/iu;

/** Placeholder substituted for UUID-shaped node refs after key sort + recursive walk. */
const nodeRefPlaceholder = '<nodeRef>';

export function stripStableTslNodeJson(value: unknown): unknown {
  if (typeof value === 'string' && nodeGraphReferenceUuidPattern.test(value)) {
    return nodeRefPlaceholder;
  }

  if (Array.isArray(value)) {
    return value.map((nested) => stripStableTslNodeJson(nested));
  }

  if (value !== null && typeof value === 'object') {
    const entry = value as Record<string, unknown>;
    if ('uuid' in entry) {
      const { uuid: _discardedUuid, ...remainder } = entry;
      return stripStableTslNodeJson(remainder);
    }

    const sortedKeys = Object.keys(entry).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = stripStableTslNodeJson(entry[key]);
    }

    return result;
  }

  return value;
}

const isJsonPrimitive = (value: unknown): boolean =>
  value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const stringifyCompactPrimitiveArrays = (value: unknown, depth = 0): string => {
  const indent = '  '.repeat(depth);
  const childIndent = '  '.repeat(depth + 1);

  if (Array.isArray(value)) {
    if (value.every(isJsonPrimitive)) {
      return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    }

    return `[\n${value.map((item) => `${childIndent}${stringifyCompactPrimitiveArrays(item, depth + 1)}`).join(',\n')}\n${indent}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, nested]) => nested !== undefined && typeof nested !== 'function' && typeof nested !== 'symbol',
    );
    if (entries.length === 0) {
      return '{}';
    }

    return `{\n${entries
      .map(
        ([key, nested]) =>
          `${childIndent}${JSON.stringify(key)}: ${stringifyCompactPrimitiveArrays(nested, depth + 1)}`,
      )
      .join(',\n')}\n${indent}}`;
  }

  return JSON.stringify(value);
};

/** Stringify `stripStableTslNodeJson(value)` for `.toMatchFileSnapshot()`. */
export function serialiseStrippedTslGraph(value: unknown): string {
  return `${stringifyCompactPrimitiveArrays(stripStableTslNodeJson(value))}\n`;
}
