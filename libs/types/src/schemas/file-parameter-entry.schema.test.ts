import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { fileParameterEntrySchema, getActiveGroupValues, parameterEntryPath, parametersDirectory } from '@taucad/types';

const validEntry = {
  activeGroup: 'default',
  groups: {
    default: {
      values: {
        nil: null,
        visible: true,
        label: 'box',
        width: 10,
        dimensions: [10, 20, 30],
        material: { name: 'steel', properties: { density: 7.85 } },
      },
    },
    alternate: { values: {} },
  },
};

const emptyGroupName = '';

describe('fileParameterEntrySchema', () => {
  it('should reject the pre-simplification record format outright', () => {
    expect(
      fileParameterEntrySchema.safeParse({
        recordVersion: 1,
        profile: 'tau-json-structure-units-03-v1',
        ...validEntry,
      }).success,
    ).toBe(false);
  });

  it('should parse nested JSON parameter values without loss', () => {
    expect(fileParameterEntrySchema.parse(validEntry)).toEqual(validEntry);
  });

  it('should preserve arbitrary owned JSON keys without changing object prototypes', () => {
    const values = JSON.parse(
      '{"__proto__":{"unitsAuditMarker":42},"constructor":{"prototype":{"value":7}}}',
    ) as Record<string, unknown>;
    const parsed = fileParameterEntrySchema.parse({ activeGroup: 'default', groups: { default: { values } } });

    expect(Object.hasOwn(parsed.groups['default']!.values, '__proto__')).toBe(true);
    expect(Reflect.get(parsed.groups['default']!.values, '__proto__')).toEqual({ unitsAuditMarker: 42 });
    expect(parsed.groups['default']!.values.constructor).toEqual({ prototype: { value: 7 } });
    expect(Reflect.get({}, 'unitsAuditMarker')).toBeUndefined();
  });

  it('should retain the units a person authored beside the values', () => {
    const entry = {
      ...validEntry,
      groups: {
        ...validEntry.groups,
        default: {
          ...validEntry.groups.default,
          units: { '/width': 'in' },
          sourceUnits: { '/width': 'in' },
        },
      },
    };

    expect(fileParameterEntrySchema.parse(entry)).toEqual(entry);
  });

  it.each([
    { name: 'undefined', value: undefined },
    { name: 'NaN', value: Number.NaN },
    { name: 'positive infinity', value: Number.POSITIVE_INFINITY },
    { name: 'negative infinity', value: Number.NEGATIVE_INFINITY },
    { name: 'bigint', value: BigInt(1) },
    { name: 'function', value: () => undefined },
  ])('should reject the JSON-unsafe value $name', ({ value }) => {
    const entry = {
      activeGroup: 'default',
      groups: { default: { values: { invalid: value } } },
    };

    expect(fileParameterEntrySchema.safeParse(entry).success).toBe(false);
  });

  it.each([
    {
      name: 'missing active group',
      entry: { groups: { default: { values: {} } } },
    },
    {
      name: 'null active group',
      entry: { activeGroup: null, groups: { default: { values: {} } } },
    },
    {
      name: 'scalar active group',
      entry: { activeGroup: 1, groups: { default: { values: {} } } },
    },
    {
      name: 'empty active group',
      entry: { activeGroup: '', groups: { default: { values: {} } } },
    },
    { name: 'missing groups', entry: { activeGroup: 'default' } },
    { name: 'null groups', entry: { activeGroup: 'default', groups: null } },
    { name: 'empty groups', entry: { activeGroup: 'default', groups: {} } },
    {
      name: 'empty group name',
      entry: {
        activeGroup: emptyGroupName,
        groups: { [emptyGroupName]: { values: {} } },
      },
    },
    {
      name: 'missing group values',
      entry: { activeGroup: 'default', groups: { default: {} } },
    },
    {
      name: 'null group values',
      entry: { activeGroup: 'default', groups: { default: { values: null } } },
    },
    {
      name: 'absent active group',
      entry: { activeGroup: 'missing', groups: { default: { values: {} } } },
    },
  ])('should reject an entry with $name', ({ entry }) => {
    expect(fileParameterEntrySchema.safeParse(entry).success).toBe(false);
  });

  it('should reject unknown top-level and group properties', () => {
    const topLevel = { ...validEntry, extra: true };
    const groupLevel = {
      ...validEntry,
      groups: { ...validEntry.groups, default: { values: {}, extra: true } },
    };

    expect(fileParameterEntrySchema.safeParse(topLevel).success).toBe(false);
    expect(fileParameterEntrySchema.safeParse(groupLevel).success).toBe(false);
  });

  it.each([
    { name: 'a group display order', extra: { order: ['default', 'alternate'] } },
    { name: 'a persisted binding copy', extra: { groups: { default: { values: {}, bindings: {} } } } },
    { name: 'a persisted record identity', extra: { identity: { manifestRevision: 'manifest:1' } } },
    { name: 'a durable operation receipt', extra: { lastOperation: { requestId: 'request-1' } } },
    { name: 'a schema profile marker', extra: { profile: 'tau-json-structure-units-03-v1' } },
  ])('should reject $name', ({ extra }) => {
    expect(fileParameterEntrySchema.safeParse({ ...validEntry, ...extra }).success).toBe(false);
  });

  it.each([
    { name: 'an empty unit', units: { '/width': '' } },
    { name: 'a blank unit', units: { '/width': '   ' } },
    { name: 'a non-pointer key', units: { width: 'mm' } },
  ])('should reject an authored unit map with $name', ({ units }) => {
    expect(
      fileParameterEntrySchema.safeParse({ activeGroup: 'default', groups: { default: { values: {}, units } } })
        .success,
    ).toBe(false);
  });

  it('should reject a source unit without the unit the value is authored in', () => {
    expect(
      fileParameterEntrySchema.safeParse({
        activeGroup: 'default',
        groups: { default: { values: {}, sourceUnits: { '/width': 'in' } } },
      }).success,
    ).toBe(false);
  });
});

describe('getActiveGroupValues', () => {
  it('should return the active parameter group values', () => {
    const entry = fileParameterEntrySchema.parse(validEntry);

    expect(getActiveGroupValues(entry)).toEqual(validEntry.groups.default.values);
  });

  it('should return an empty record when the entry is absent', () => {
    expect(getActiveGroupValues(undefined)).toEqual({});
  });
});

describe('parameterEntryPath', () => {
  it('should create canonical top-level and nested sidecar paths', () => {
    expect(parameterEntryPath('main.ts')).toBe(`${parametersDirectory}/main.ts.json`);
    expect(parameterEntryPath('src/models/box.ts')).toBe(`${parametersDirectory}/src/models/box.ts.json`);
  });

  it.each([
    { name: 'empty', path: '' },
    { name: 'absolute', path: '/main.ts' },
    { name: 'current-directory segment', path: './main.ts' },
    { name: 'parent-directory segment', path: '../main.ts' },
    { name: 'nested parent-directory segment', path: 'src/../main.ts' },
    { name: 'backslash', path: 'src\\main.ts' },
    { name: 'empty segment', path: 'src//main.ts' },
    { name: 'NUL byte', path: 'src/\0main.ts' },
    { name: 'over-length', path: 'a'.repeat(2049) },
  ])('should reject an unsafe $name path', ({ path }) => {
    expect(() => parameterEntryPath(path)).toThrow(ZodError);
  });
});
