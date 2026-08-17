import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { fileParameterEntrySchema, getActiveGroupValues, parameterEntryPath, parametersDirectory } from '@taucad/types';

const validEntry = {
  activeGroup: 'default',
  order: ['default', 'alternate'],
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
  it('should parse nested JSON parameter values without loss', () => {
    expect(fileParameterEntrySchema.parse(validEntry)).toEqual(validEntry);
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
    { name: 'missing active group', entry: { groups: { default: { values: {} } } } },
    { name: 'null active group', entry: { activeGroup: null, groups: { default: { values: {} } } } },
    { name: 'scalar active group', entry: { activeGroup: 1, groups: { default: { values: {} } } } },
    { name: 'empty active group', entry: { activeGroup: '', groups: { default: { values: {} } } } },
    { name: 'missing groups', entry: { activeGroup: 'default' } },
    { name: 'null groups', entry: { activeGroup: 'default', groups: null } },
    { name: 'empty groups', entry: { activeGroup: 'default', groups: {} } },
    {
      name: 'empty group name',
      entry: { activeGroup: emptyGroupName, groups: { [emptyGroupName]: { values: {} } } },
    },
    { name: 'missing group values', entry: { activeGroup: 'default', groups: { default: {} } } },
    { name: 'null group values', entry: { activeGroup: 'default', groups: { default: { values: null } } } },
    { name: 'absent active group', entry: { activeGroup: 'missing', groups: { default: { values: {} } } } },
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
    { name: 'duplicate order entries', order: ['default', 'default'] },
    { name: 'an unknown ordered group', order: ['default', 'missing'] },
  ])('should reject $name', ({ order }) => {
    expect(fileParameterEntrySchema.safeParse({ ...validEntry, order }).success).toBe(false);
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
