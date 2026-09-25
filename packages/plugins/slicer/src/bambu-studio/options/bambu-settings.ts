/**
 * Turns resolved Bambu Studio process and filament presets into a grouped JSON Schema with current
 * values, and turns edited values back into Bambu Studio's own string encoding.
 *
 * Tau-authored descriptors cover the options people change most; every other editable key of the
 * resolved presets gets a descriptor inferred from its value, so the schema always covers the
 * whole preset.
 *
 * @module
 */

import type { JSONSchema7 } from '@taucad/runtime/types';
import {
  bambuOptionCatalog,
  bambuOptionGroups,
  bambuSkippedKeys,
  filamentFallbackGroup,
  processFallbackGroup,
} from '#bambu-studio/options/catalog.js';
import type {
  BambuOptionDescriptor,
  BambuOptionGroup,
  BambuOptionScope,
  BambuOptionType,
} from '#bambu-studio/options/catalog.js';

/** Fully resolved process and filament presets in Bambu Studio's JSON encoding. @public */
export type BambuResolvedPresets = Readonly<{
  process: Readonly<Record<string, unknown>>;
  filament: Readonly<Record<string, unknown>>;
}>;

/** Schema, current values and groups built from resolved presets. @public */
export type BambuSettingsSchema = Readonly<{
  /** Draft-7 schema nested scope → group → Bambu key. */
  schema: JSONSchema7;
  /** Current values in the same nesting as `schema`. */
  values: Record<string, unknown>;
  /** Non-empty groups in display order. */
  groups: readonly BambuOptionGroup[];
}>;

/** Bambu-encoded values split by the preset that owns each key. @public */
export type BambuEncodedSettings = {
  process: Record<string, string | string[]>;
  filament: Record<string, string | string[]>;
};

type Raw = string | readonly string[];

type Described = {
  descriptor: BambuOptionDescriptor;
  /** Raw value the displayed value decodes from: the owning preset's, or the fallback. */
  raw: Raw;
  value: unknown;
  /** The value is a list rather than one value written into every array element. */
  list: boolean;
};

const nil = 'nil';
const numberPattern = /^-?(?:\d+\.?\d*|\.\d+)$/;
const percentPattern = /^-?(?:\d+\.?\d*|\.\d+)%$/;
const flagPattern =
  /^(?:enable|disable|is|has|use|allow|avoid|detect|reduce|only|no|activate|override|ensure|precise)_|_(?:is|has)_|_(?:enable|enabled|only|first|soluble|safe|per_object)$/;
const mismatch = Symbol('mismatch');
const scopes: readonly BambuOptionScope[] = ['process', 'filament'];

const isRaw = (value: unknown): value is Raw =>
  typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

const isEditable = (key: string): boolean => !bambuSkippedKeys.has(key) && !key.endsWith('_gcode');

const labelFromKey = (key: string): string => {
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// Older presets store wall order and infill-first together; Bambu Studio splits them when loading.
const legacyWallOrder = (
  process: Readonly<Record<string, unknown>>,
): { walls: string; infillFirst: string } | undefined => {
  const order = process['wall_infill_order'];
  if (typeof order !== 'string') {
    return undefined;
  }
  const infillFirst = order.startsWith('infill/');
  return { walls: order.replace(/^infill\//, '').replace(/\/infill$/, ''), infillFirst: infillFirst ? '1' : '0' };
};

const derivedFallback = (key: string, presets: BambuResolvedPresets): string | undefined => {
  if (key === 'wall_sequence') {
    return legacyWallOrder(presets.process)?.walls;
  }
  if (key === 'is_infill_first') {
    return legacyWallOrder(presets.process)?.infillFirst;
  }
  return undefined;
};

const inferType = (
  key: string,
  samples: readonly string[],
): Pick<BambuOptionDescriptor, 'type' | 'nullable' | 'unit'> => {
  const values = samples.filter((sample) => sample !== nil);
  const nullable = values.length < samples.length ? { nullable: true } : {};
  if (values.length === 0) {
    return { type: 'string', ...nullable };
  }
  if (values.every((value) => numberPattern.test(value))) {
    const flag = values.every((value) => value === '0' || value === '1') && flagPattern.test(key);
    return { type: flag ? 'bool' : 'float', ...nullable };
  }
  if (values.every((value) => percentPattern.test(value))) {
    return { type: 'percent', unit: '%', ...nullable };
  }
  if (values.every((value) => numberPattern.test(value) || percentPattern.test(value))) {
    return { type: 'float-or-percent', ...nullable };
  }
  return { type: 'string', ...nullable };
};

const inferDescriptor = (key: string, scope: BambuOptionScope, raw: Raw): BambuOptionDescriptor => ({
  key,
  scope,
  group: scope === 'process' ? processFallbackGroup : filamentFallbackGroup,
  title: labelFromKey(key),
  description: `Bambu Studio setting ${key}.`,
  inferred: true,
  ...inferType(key, typeof raw === 'string' ? [raw] : raw),
});

const decodeScalar = (descriptor: BambuOptionDescriptor, raw: string): unknown => {
  if (raw === nil && descriptor.nullable) {
    return null;
  }
  switch (descriptor.type) {
    case 'float': {
      return numberPattern.test(raw) ? Number(raw) : mismatch;
    }
    case 'int': {
      return /^-?\d+$/.test(raw) ? Number(raw) : mismatch;
    }
    case 'percent': {
      return percentPattern.test(raw) ? Number(raw.slice(0, -1)) : mismatch;
    }
    case 'float-or-percent': {
      if (numberPattern.test(raw)) {
        return Number(raw);
      }
      return percentPattern.test(raw) ? raw : mismatch;
    }
    case 'bool': {
      return raw === '0' || raw === '1' ? raw === '1' : mismatch;
    }
    case 'enum':
    case 'string': {
      return raw;
    }
  }
};

// Arrays hold one value per extruder variant or filament slot unless their elements clearly differ as a list.
const isList = (descriptor: BambuOptionDescriptor, raw: Raw, variantCount: number): boolean => {
  if (typeof raw === 'string') {
    return false;
  }
  if (!descriptor.inferred) {
    return raw.length === 0;
  }
  return raw.length !== 1 && raw.length !== variantCount && raw.some((item) => item !== raw[0]);
};

const decode = (descriptor: BambuOptionDescriptor, raw: Raw, list: boolean): unknown => {
  if (list) {
    const items = (raw as readonly string[]).map((item) => decodeScalar(descriptor, item));
    return items.includes(mismatch) ? mismatch : items;
  }
  return decodeScalar(descriptor, typeof raw === 'string' ? raw : raw[0]!);
};

// Adds a choice Bambu Studio uses but the catalog does not yet list, so the current value stays selectable.
const withChoice = (descriptor: BambuOptionDescriptor, value: string): BambuOptionDescriptor => {
  const choices = descriptor.choices ?? [];
  const known = (value === nil && descriptor.nullable === true) || choices.some((choice) => choice.value === value);
  return descriptor.type !== 'enum' || known
    ? descriptor
    : { ...descriptor, choices: [...choices, { value, title: value }] };
};

const describeKey = (descriptor: BambuOptionDescriptor, raw: Raw, variantCount: number): Described => {
  const first = typeof raw === 'string' ? raw : raw[0];
  const candidate = first === undefined ? descriptor : withChoice(descriptor, first);
  const list = isList(candidate, raw, variantCount);
  const value = decode(candidate, raw, list);
  if (value !== mismatch) {
    return { descriptor: candidate, raw, value, list };
  }
  // A curated type that does not fit this preset's value degrades to an inferred descriptor.
  const inferred = inferDescriptor(descriptor.key, descriptor.scope, raw);
  const inferredList = isList(inferred, raw, variantCount);
  return { descriptor: inferred, raw, value: decode(inferred, raw, inferredList), list: inferredList };
};

const variantCounts = (presets: BambuResolvedPresets): Record<BambuOptionScope, number> => {
  const lengthOf = (value: unknown): number => (Array.isArray(value) ? value.length : 1);
  return {
    process: lengthOf(presets.process['print_extruder_variant']),
    filament: lengthOf(presets.filament['filament_extruder_variant']),
  };
};

// Every exposed key of the presets with its descriptor and decoded value, in display order.
const describeAll = (presets: BambuResolvedPresets): Map<string, Described> => {
  const counts = variantCounts(presets);
  const described = new Map<string, Described>();
  for (const descriptor of bambuOptionCatalog) {
    const owned = presets[descriptor.scope][descriptor.key];
    const other = presets[descriptor.scope === 'process' ? 'filament' : 'process'][descriptor.key];
    const raw = [owned, other, derivedFallback(descriptor.key, presets), descriptor.fallback].find((candidate) =>
      isRaw(candidate),
    );
    if (raw !== undefined) {
      described.set(descriptor.key, describeKey(descriptor, raw, counts[descriptor.scope]));
    }
  }
  for (const scope of scopes) {
    for (const [key, raw] of Object.entries(presets[scope])) {
      if (described.has(key) || !isEditable(key) || !isRaw(raw)) {
        continue;
      }
      // A key in both presets belongs to the filament, which Bambu Studio applies last.
      const owner = scope === 'process' && isRaw(presets.filament[key]) ? 'filament' : scope;
      const ownerRaw = presets[owner][key] as Raw;
      described.set(key, describeKey(inferDescriptor(key, owner, ownerRaw), ownerRaw, counts[owner]));
    }
  }
  return described;
};

const scalarSchema = (descriptor: BambuOptionDescriptor): JSONSchema7 => {
  const nullable = descriptor.nullable === true;
  const typed = (type: 'number' | 'integer' | 'boolean' | 'string'): JSONSchema7 => ({
    type: nullable ? [type, 'null'] : type,
  });
  const range = {
    ...(descriptor.minimum === undefined ? {} : { minimum: descriptor.minimum }),
    ...(descriptor.maximum === undefined ? {} : { maximum: descriptor.maximum }),
  };
  switch (descriptor.type) {
    case 'float':
    case 'percent': {
      return { ...typed('number'), ...range };
    }
    case 'int': {
      return { ...typed('integer'), ...range };
    }
    case 'bool': {
      return typed('boolean');
    }
    case 'string': {
      return typed('string');
    }
    case 'float-or-percent': {
      return {
        type: nullable ? ['number', 'string', 'null'] : ['number', 'string'],
        pattern: percentPattern.source,
        ...range,
      };
    }
    case 'enum': {
      return {
        ...typed('string'),
        oneOf: [
          ...(descriptor.choices ?? []).map((choice) => ({ const: choice.value, title: choice.title })),
          ...(nullable ? [{ const: null, title: 'Printer value' }] : []),
        ],
      };
    }
  }
};

const leafSchema = ({ descriptor, value, list }: Described): JSONSchema7 => {
  const scalar = scalarSchema(descriptor);
  const schema: JSONSchema7 = {
    ...(list ? { type: 'array', items: scalar } : scalar),
    title: descriptor.title,
    description: descriptor.description,
    default: value as JSONSchema7['default'],
  };
  return Object.assign(schema, {
    ...(descriptor.unit === undefined ? {} : { 'x-tau-unit': descriptor.unit }),
    ...(descriptor.inferred ? { 'x-tau-inferred': true } : {}),
  });
};

/**
 * Build the grouped JSON Schema and current values of resolved Bambu Studio presets.
 *
 * Leaves sit at `properties.<scope>.properties.<group>.properties.<key>` with `default` equal to the
 * preset's value. Groups follow Bambu Studio's tabs; keys without a Tau descriptor appear under
 * "All other settings" with `x-tau-inferred: true`.
 *
 * @param presets - Resolved process and filament presets as Bambu Studio writes them.
 * @returns The schema, the current values nested the same way, and the non-empty groups.
 * @public
 */
export const buildBambuSettingsSchema = (presets: BambuResolvedPresets): BambuSettingsSchema => {
  const described = describeAll(presets);
  const groups = bambuOptionGroups.filter((group) =>
    [...described.values()].some(({ descriptor }) => descriptor.group === group.id),
  );
  const schemaScopes: Record<string, JSONSchema7> = {};
  const values: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const scope of scopes) {
    const groupSchemas: Record<string, JSONSchema7> = {};
    values[scope] = {};
    for (const group of groups.filter((candidate) => candidate.scope === scope)) {
      const members = [...described.values()].filter(({ descriptor }) => descriptor.group === group.id);
      groupSchemas[group.id] = {
        type: 'object',
        title: group.label,
        additionalProperties: false,
        properties: Object.fromEntries(members.map((member) => [member.descriptor.key, leafSchema(member)])),
      };
      values[scope][group.id] = Object.fromEntries(members.map((member) => [member.descriptor.key, member.value]));
    }
    schemaScopes[scope] = {
      type: 'object',
      title: scope === 'process' ? 'Process' : 'Filament',
      additionalProperties: false,
      properties: groupSchemas,
    };
  }
  return {
    schema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: schemaScopes,
    },
    values,
    groups,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Flatten nested settings values (scope → group → key) into Bambu key → value.
 *
 * @param values - Values shaped like the `values` of `buildBambuSettingsSchema`.
 * @returns One entry per Bambu key.
 * @public
 */
export const flattenBambuSettings = (values: Record<string, unknown>): Record<string, unknown> => {
  const flat: Record<string, unknown> = {};
  for (const scope of Object.values(values).filter((scope) => isRecord(scope))) {
    for (const group of Object.values(scope).filter((group) => isRecord(group))) {
      Object.assign(flat, group);
    }
  }
  return flat;
};

const expectation: Record<BambuOptionType, string> = {
  float: 'a number',
  int: 'an integer',
  percent: 'a number of percent',
  'float-or-percent': 'a number or a percentage such as "50%"',
  bool: 'true or false',
  enum: 'one of its choices',
  string: 'a single-line string',
};

const numericTypes: ReadonlySet<BambuOptionType> = new Set(['float', 'int', 'percent', 'float-or-percent']);

const encodeNumber = (descriptor: BambuOptionDescriptor, value: number): string | undefined => {
  if (!numericTypes.has(descriptor.type) || !Number.isFinite(value)) {
    return undefined;
  }
  if (descriptor.type === 'int' && !Number.isInteger(value)) {
    return undefined;
  }
  const { minimum = -Infinity, maximum = Infinity } = descriptor;
  if (value < minimum || value > maximum) {
    throw new RangeError(
      `Bambu Studio setting "${descriptor.key}" must be between ${minimum} and ${maximum}; received ${value}.`,
    );
  }
  return descriptor.type === 'percent' ? `${value}%` : String(value);
};

const encodeScalar = (descriptor: BambuOptionDescriptor, value: unknown): string => {
  const fail = (): never => {
    const nullable = descriptor.nullable ? ', or null for the printer value' : '';
    throw new TypeError(
      `Bambu Studio setting "${descriptor.key}" expects ${expectation[descriptor.type]}${nullable}; received ${JSON.stringify(value)}.`,
    );
  };
  if (value === null) {
    return descriptor.nullable ? nil : fail();
  }
  if (typeof value === 'number') {
    return encodeNumber(descriptor, value) ?? fail();
  }
  if (typeof value === 'boolean') {
    return descriptor.type === 'bool' ? (value ? '1' : '0') : fail();
  }
  if (typeof value !== 'string') {
    return fail();
  }
  switch (descriptor.type) {
    case 'string': {
      // A line break could end the setting's line in the G-code config block and start another.
      return /[\r\n]/u.test(value) ? fail() : value;
    }
    case 'enum': {
      return descriptor.choices?.some((choice) => choice.value === value) ? value : fail();
    }
    case 'float-or-percent': {
      return percentPattern.test(value) ? value : fail();
    }
    default: {
      return fail();
    }
  }
};

const shapeLike = (raw: Raw, descriptor: BambuOptionDescriptor, value: unknown): string | string[] => {
  if (Array.isArray(value)) {
    if (typeof raw === 'string') {
      throw new TypeError(`Bambu Studio setting "${descriptor.key}" takes a single value, not a list.`);
    }
    return value.map((item: unknown) => encodeScalar(descriptor, item));
  }
  const encoded = encodeScalar(descriptor, value);
  return typeof raw === 'string' ? encoded : Array.from({ length: Math.max(raw.length, 1) }, () => encoded);
};

/**
 * Encode flat settings values into Bambu Studio's JSON encoding, split by owning preset.
 *
 * Values equal to the resolved preset's keep their original encoding. A changed value is written
 * into every element of a per-extruder or per-filament array; an array value is written element by
 * element. Percentages keep their `%`, booleans become `"0"`/`"1"` and `null` becomes `"nil"` where
 * the printer value may be used.
 *
 * @param settings - Bambu key → value, for example from `flattenBambuSettings`.
 * @param presets - The resolved presets the settings apply to.
 * @returns Encoded values for each preset that owns a key.
 * @throws TypeError when a key is unknown or not editable, or a value has the wrong type.
 * @throws RangeError when a number is outside the option's range.
 * @public
 */
export const encodeBambuSettings = (
  settings: Readonly<Record<string, unknown>>,
  presets: BambuResolvedPresets,
): BambuEncodedSettings => {
  const described = describeAll(presets);
  const encoded: BambuEncodedSettings = { process: {}, filament: {} };
  for (const [key, value] of Object.entries(settings)) {
    const entry = described.get(key);
    if (entry === undefined) {
      throw new TypeError(`Unknown or read-only Bambu Studio setting "${key}".`);
    }
    const unchanged = JSON.stringify(value) === JSON.stringify(entry.value);
    const owners = scopes.filter((scope) => isRaw(presets[scope][key]));
    if (owners.length === 0) {
      if (!unchanged) {
        encoded[entry.descriptor.scope][key] = shapeLike(entry.raw, entry.descriptor, value);
      }
      continue;
    }
    for (const scope of owners) {
      const raw = presets[scope][key] as Raw;
      encoded[scope][key] = unchanged
        ? typeof raw === 'string'
          ? raw
          : [...raw]
        : shapeLike(raw, entry.descriptor, value);
    }
  }
  return encoded;
};
