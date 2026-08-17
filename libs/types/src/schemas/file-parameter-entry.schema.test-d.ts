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

  it('should reject values that cannot be persisted as JSON', () => {
    // @ts-expect-error -- undefined is not part of the persisted JSON value contract
    assertType<FileParameterEntry>({ activeGroup: 'default', groups: { default: { values: { width: undefined } } } });
  });
});
