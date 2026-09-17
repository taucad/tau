import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  fileParameterEntrySchema,
  fileParameterRecordProfile,
  getActiveGroupValues,
  parameterEntryPath,
  parametersDirectory,
} from '@taucad/types';

const validEntry = {
  recordVersion: 1,
  profile: fileParameterRecordProfile,
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

const recordIdentity = {
  sourceRevision: 'source:1',
  manifestRevision: 'manifest:1',
  valueRevision: 'value:1',
  dependencyRevision: 'dependency:1',
};

const attributedBinding = {
  parameter: { value: 'width', stability: 'stable' },
  schema: { resource: 'urn:test:schema', pointer: '/properties/width' },
  unit: 'mm',
  quantityKind: 'length',
  provenance: {
    unit: {
      origin: 'inferred',
      producer: 'tau-defaults',
      sourceRevision: 'source:1',
      profile: 'tau-defaults-v1',
      rule: 'length-name',
      evidence: 'width',
    },
    quantityKind: {
      origin: 'project',
      producer: '.tau/parameters/main.ts.json',
      sourceRevision: 'source:1',
      evidence: 'binding:/width',
    },
  },
};

describe('fileParameterEntrySchema', () => {
  it('should reject a record without its version and profile markers', () => {
    const { recordVersion: _recordVersion, profile: _profile, ...unversioned } = validEntry;
    expect(fileParameterEntrySchema.safeParse(unversioned).success).toBe(false);
  });

  it('should parse nested JSON parameter values without loss', () => {
    expect(fileParameterEntrySchema.parse(validEntry)).toEqual(validEntry);
  });

  it('should preserve arbitrary owned JSON keys without changing object prototypes', () => {
    const values = JSON.parse(
      '{"__proto__":{"unitsAuditMarker":42},"constructor":{"prototype":{"value":7}}}',
    ) as Record<string, unknown>;
    const parsed = fileParameterEntrySchema.parse({
      recordVersion: 1,
      profile: fileParameterRecordProfile,
      activeGroup: 'default',
      groups: { default: { values } },
    });

    expect(Object.hasOwn(parsed.groups['default']!.values, '__proto__')).toBe(true);
    expect(Reflect.get(parsed.groups['default']!.values, '__proto__')).toEqual({ unitsAuditMarker: 42 });
    expect(parsed.groups['default']!.values.constructor).toEqual({ prototype: { value: 7 } });
    expect(Reflect.get({}, 'unitsAuditMarker')).toBeUndefined();
  });

  it('should atomically retain bindings, complete per-field provenance, identities, and a correlated receipt', () => {
    const entry = {
      ...validEntry,
      groups: {
        ...validEntry.groups,
        default: {
          ...validEntry.groups.default,
          bindings: { '/width': attributedBinding },
        },
      },
      identity: recordIdentity,
      lastOperation: {
        requestId: 'request-1',
        fingerprint: 'operation-1',
        outcome: 'committed',
        ...recordIdentity,
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
    { name: 'duplicate order entries', order: ['default', 'default'] },
    { name: 'an unknown ordered group', order: ['default', 'missing'] },
  ])('should reject $name', ({ order }) => {
    expect(fileParameterEntrySchema.safeParse({ ...validEntry, order }).success).toBe(false);
  });

  it.each([
    {
      name: 'provenance without a binding value',
      binding: { ...attributedBinding, unit: undefined },
    },
    {
      name: 'incomplete inferred provenance',
      binding: {
        ...attributedBinding,
        provenance: {
          ...attributedBinding.provenance,
          unit: {
            origin: 'inferred',
            producer: 'rule',
            sourceRevision: 'source:1',
          },
        },
      },
    },
    {
      name: 'incomplete project provenance',
      binding: {
        ...attributedBinding,
        provenance: {
          ...attributedBinding.provenance,
          unit: {
            origin: 'project',
            producer: 'project',
            sourceRevision: 'source:1',
          },
        },
      },
    },
  ])('should reject a persisted binding with $name', ({ binding }) => {
    const entry = {
      activeGroup: 'default',
      groups: {
        default: { values: { width: 10 }, bindings: { '/width': binding } },
      },
    };

    expect(fileParameterEntrySchema.safeParse(entry).success).toBe(false);
  });

  it('should reject a receipt without record identity', () => {
    const entry = {
      ...validEntry,
      lastOperation: {
        requestId: 'request-1',
        fingerprint: 'operation-1',
        outcome: 'committed',
        ...recordIdentity,
      },
    };
    expect(fileParameterEntrySchema.safeParse(entry).success).toBe(false);
  });

  it('should preserve a durable receipt after the current source identity advances', () => {
    const entry = {
      ...validEntry,
      identity: recordIdentity,
      lastOperation: {
        requestId: 'request-1',
        fingerprint: 'operation-1',
        outcome: 'committed',
        ...recordIdentity,
        valueRevision: 'value:older',
      },
    };

    expect(fileParameterEntrySchema.parse(entry).lastOperation?.valueRevision).toBe('value:older');
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
