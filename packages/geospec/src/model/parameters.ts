import type {
  GeoSpecParameterFileEntry,
  GeoSpecParameterGroup,
  GeoSpecParameterOptions,
  GeoSpecParameters,
} from '#model/types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeParameters = (
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value) ? mergeParameters(current, value) : value;
  }
  return merged;
};

const parseParameterEntry = (entry: GeoSpecParameterFileEntry | string): GeoSpecParameterFileEntry => {
  const parsed: unknown = typeof entry === 'string' ? JSON.parse(entry) : entry;
  if (!isRecord(parsed) || typeof parsed['activeGroup'] !== 'string' || !isRecord(parsed['groups'])) {
    throw new Error('Invalid GeoSpec parameter file: expected activeGroup and groups.');
  }
  return parsed as GeoSpecParameterFileEntry;
};

const groupNames = (entry: GeoSpecParameterFileEntry): string[] => {
  const ordered = entry.order ?? [
    entry.activeGroup,
    ...Object.keys(entry.groups).filter((name) => name !== entry.activeGroup),
  ];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [...ordered, ...Object.keys(entry.groups)]) {
    if (seen.has(name) || entry.groups[name] === undefined) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
};

/**
 * Resolve a parameter JSON file into active and named parameter cases.
 *
 * @param entry - Parsed JSON import or raw JSON string.
 * @param options - Defaults and provenance for the source parameter file.
 * @returns Concrete parameter groups for GeoSpec tests.
 * @public
 */
export function params(
  entry: GeoSpecParameterFileEntry | string,
  options: GeoSpecParameterOptions = {},
): GeoSpecParameters {
  const parsed = parseParameterEntry(entry);
  const defaults = options.defaults ?? {};
  const groups = groupNames(parsed).map<GeoSpecParameterGroup>((name) => {
    const overrides = parsed.groups[name]?.values ?? {};
    return {
      name,
      active: name === parsed.activeGroup,
      values: mergeParameters(defaults, overrides),
      overrides,
      provenance: {
        ...(options.parameterFile ? { parameterFile: options.parameterFile } : {}),
        activeGroup: parsed.activeGroup,
        groupName: name,
      },
    };
  });

  const active = groups.find((group) => group.active);
  if (!active) {
    throw new Error(`Invalid GeoSpec parameter file: active group '${parsed.activeGroup}' is missing.`);
  }

  return { active, groups, defaults };
}

/**
 * Return merged values for the active parameter group.
 *
 * @param entry - Parsed JSON import or raw JSON string.
 * @param options - Defaults and provenance for the source parameter file.
 * @returns Merged active parameter values.
 * @public
 */
export function activeParams(
  entry: GeoSpecParameterFileEntry | string,
  options: GeoSpecParameterOptions = {},
): Record<string, unknown> {
  return params(entry, options).active.values;
}

/**
 * Return all resolved parameter groups in stored order.
 *
 * @param entry - Parsed JSON import or raw JSON string.
 * @param options - Defaults and provenance for the source parameter file.
 * @returns Concrete parameter groups for repeatable tests.
 * @public
 */
export function parameterGroups(
  entry: GeoSpecParameterFileEntry | string,
  options: GeoSpecParameterOptions = {},
): GeoSpecParameterGroup[] {
  return params(entry, options).groups;
}
