import { assertType, describe, expectTypeOf, it } from 'vitest';
import type { FileParameterEntry, ParameterGroup } from '@taucad/types';

describe('parameter sidecar public types', () => {
  it('should derive parameter groups from the persisted entry contract', () => {
    expectTypeOf<ParameterGroup>().toEqualTypeOf<FileParameterEntry['groups'][string]>();
  });

  it('should accept recursively JSON-compatible values', () => {
    assertType<FileParameterEntry>({
      activeGroup: 'default',
      groups: { default: { values: { nested: { enabled: true, sizes: [1, 2, null] } } } },
    });
  });

  it('should expose only the units a person authored beside the values', () => {
    assertType<FileParameterEntry>({
      activeGroup: 'default',
      groups: {
        default: { values: { width: 10 }, units: { '/width': 'in' }, sourceUnits: { '/width': 'in' } },
      },
    });
  });

  it('should reject manifest-derived and protocol evidence in the record', () => {
    assertType<FileParameterEntry>({
      activeGroup: 'default',
      // @ts-expect-error -- binding identity, constraints and provenance come from the live manifest
      groups: { default: { values: {}, bindings: { '/width': { unit: 'mm' } } } },
    });
    assertType<FileParameterEntry>({
      activeGroup: 'default',
      groups: { default: { values: {} } },
      // @ts-expect-error -- the record is unversioned and carries no write-protocol receipt
      lastOperation: { requestId: 'request-1' },
    });
  });

  it('should reject values that cannot be persisted as JSON', () => {
    // @ts-expect-error -- undefined is not part of the persisted JSON value contract
    assertType<FileParameterEntry>({ activeGroup: 'default', groups: { default: { values: { width: undefined } } } });
  });
});
