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

/** Stringify `stripStableTslNodeJson(value)` for `.toMatchFileSnapshot()`. */
export function serialiseStrippedTslGraph(value: unknown): string {
  return `${JSON.stringify(stripStableTslNodeJson(value), null, 2)}\n`;
}
