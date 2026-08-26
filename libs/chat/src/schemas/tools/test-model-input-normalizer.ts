const bracketArrayAliasPattern = /^(files|include|exclude)\[(0|[1-9][0-9]*)\]$/u;
const unsupportedUnindexedAliasPattern = /^(files|include|exclude)\[\]$/u;

type GeoSpecRunFilterAliasField = 'files' | 'include' | 'exclude';

type IndexedAlias = {
  index: number;
  key: string;
  value: unknown;
};

/**
 * Result of pre-validating `test_model` filter aliases.
 *
 * @public
 */
export type GeoSpecRunFilterInputNormalization = {
  input: unknown;
  changed: boolean;
  healedKeys: readonly string[];
  blockedReason?: 'canonical_collision' | 'non_contiguous_indexes' | 'unsupported_unindexed_array';
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function contiguousFromZero(aliases: readonly IndexedAlias[]): boolean {
  return aliases.every((alias, index) => alias.index === index);
}

/**
 * Heals only the known Gemini-observed bracket-array aliases for `test_model`
 * filters before the canonical strict Zod schema validates the result.
 *
 * The public contract remains JSON arrays (`files`, `include`, `exclude`).
 * Unknown keys are deliberately preserved so `.strict()` still rejects them.
 *
 * @public
 */
export function normalizeGeoSpecRunFilterInputAliases(input: unknown): GeoSpecRunFilterInputNormalization {
  if (!isPlainObject(input)) {
    return { input, changed: false, healedKeys: [] };
  }

  const byField = new Map<GeoSpecRunFilterAliasField, IndexedAlias[]>();
  let sawUnsupportedUnindexedAlias = false;

  for (const [key, value] of Object.entries(input)) {
    if (unsupportedUnindexedAliasPattern.test(key)) {
      sawUnsupportedUnindexedAlias = true;
      continue;
    }

    const match = bracketArrayAliasPattern.exec(key);
    if (!match) {
      continue;
    }

    const [, field, indexText] = match;
    const aliasField = field as GeoSpecRunFilterAliasField;
    const aliases = byField.get(aliasField) ?? [];
    aliases.push({
      index: Number(indexText),
      key,
      value,
    });
    byField.set(aliasField, aliases);
  }

  if (byField.size === 0) {
    if (sawUnsupportedUnindexedAlias) {
      return { input, changed: false, healedKeys: [], blockedReason: 'unsupported_unindexed_array' };
    }

    return { input, changed: false, healedKeys: [] };
  }

  const sortedEntries = [...byField.entries()].map(
    ([field, aliases]) => [field, [...aliases].sort((left, right) => left.index - right.index)] as const,
  );
  const healedKeys = sortedEntries.flatMap(([, aliases]) => aliases.map((alias) => alias.key));

  for (const [field, aliases] of sortedEntries) {
    if (Object.hasOwn(input, field)) {
      return { input, changed: false, healedKeys, blockedReason: 'canonical_collision' };
    }

    if (!contiguousFromZero(aliases)) {
      return { input, changed: false, healedKeys, blockedReason: 'non_contiguous_indexes' };
    }
  }

  const healedKeySet = new Set(healedKeys);
  const normalized: Record<string, unknown> = Object.fromEntries(
    Object.entries(input).filter(([key]) => !healedKeySet.has(key)),
  );
  for (const [field, aliases] of sortedEntries) {
    normalized[field] = aliases.map((alias) => alias.value);
  }

  return { input: normalized, changed: true, healedKeys };
}
