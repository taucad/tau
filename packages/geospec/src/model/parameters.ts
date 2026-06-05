import type {
  GeoSpecParameterFileEntry,
  GeoSpecParameterGroup,
  GeoSpecParameterOptions,
  GeoSpecParameters,
} from '#model/types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cloneValue = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  return structuredClone(value);
};

const mergeParameters = <Defaults extends Record<string, unknown>>(
  defaults: Defaults,
  overrides: Record<string, unknown>,
): Defaults => {
  const merged: Record<string, unknown> = cloneValue(defaults);
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value) ? mergeParameters(current, value) : cloneValue(value);
  }
  return merged as Defaults;
};

const parseParameterEntry = (entry: GeoSpecParameterFileEntry | string): GeoSpecParameterFileEntry => {
  if (typeof entry === 'string' && !entry.trimStart().startsWith('{')) {
    throw new Error('Invalid GeoSpec parameter file input: pass parsed JSON or raw JSON text, not a filesystem path.');
  }

  const parsed: unknown = typeof entry === 'string' ? JSON.parse(entry) : entry;
  if (!isRecord(parsed) || typeof parsed['activeGroup'] !== 'string' || !isRecord(parsed['groups'])) {
    throw new Error('Invalid GeoSpec parameter file: expected activeGroup and groups.');
  }
  for (const [name, group] of Object.entries(parsed['groups'])) {
    if (!isRecord(group) || !isRecord(group['values'])) {
      throw new Error(`Invalid GeoSpec parameter file: group '${name}' must contain a values object.`);
    }
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
export function params<const Defaults extends Record<string, unknown> = Record<string, unknown>>(
  entry: GeoSpecParameterFileEntry | string,
  options: GeoSpecParameterOptions<Defaults> = {},
): GeoSpecParameters<Defaults> {
  const parsed = parseParameterEntry(entry);
  const defaults = cloneValue((options.defaults ?? {}) as Defaults);
  const groups = groupNames(parsed).map<GeoSpecParameterGroup<Defaults>>((name) => {
    const overrides = cloneValue(parsed.groups[name]?.values ?? {});
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

  return { active, groups, defaults: cloneValue(defaults) };
}

/**
 * Return merged values for the active parameter group.
 *
 * @param entry - Parsed JSON import or raw JSON string.
 * @param options - Defaults and provenance for the source parameter file.
 * @returns Merged active parameter values.
 * @public
 */
export function activeParams<const Defaults extends Record<string, unknown> = Record<string, unknown>>(
  entry: GeoSpecParameterFileEntry | string,
  options: GeoSpecParameterOptions<Defaults> = {},
): Defaults {
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
export function parameterGroups<const Defaults extends Record<string, unknown> = Record<string, unknown>>(
  entry: GeoSpecParameterFileEntry | string,
  options: GeoSpecParameterOptions<Defaults> = {},
): Array<GeoSpecParameterGroup<Defaults>> {
  return params(entry, options).groups;
}
