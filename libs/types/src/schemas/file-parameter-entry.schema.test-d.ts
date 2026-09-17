import { assertType, describe, expectTypeOf, it } from 'vitest';
import { fileParameterRecordProfile } from '@taucad/types';
import type { FileParameterEntry, ParameterGroup } from '@taucad/types';

describe('parameter sidecar public types', () => {
  it('should derive parameter groups from the persisted entry contract', () => {
    expectTypeOf<ParameterGroup>().toEqualTypeOf<FileParameterEntry['groups'][string]>();
  });

  it('should accept recursively JSON-compatible values', () => {
    assertType<FileParameterEntry>({
      recordVersion: 1,
      profile: fileParameterRecordProfile,
      activeGroup: 'default',
      groups: { default: { values: { nested: { enabled: true, sizes: [1, 2, null] } } } },
    });
  });

  it('should expose optional atomic identity, binding provenance, and receipt fields', () => {
    assertType<FileParameterEntry>({
      recordVersion: 1,
      profile: fileParameterRecordProfile,
      activeGroup: 'default',
      groups: {
        default: {
          values: { width: 10 },
          bindings: {
            '/width': {
              parameter: { value: 'width', stability: 'stable' },
              schema: { resource: 'urn:test:schema', pointer: '/properties/width' },
              unit: 'mm',
              provenance: {
                unit: {
                  origin: 'project',
                  producer: '.tau/parameters/main.ts.json',
                  sourceRevision: 'source:1',
                  evidence: 'binding:/width',
                },
              },
            },
          },
        },
      },
      identity: {
        sourceRevision: 'source:1',
        manifestRevision: 'manifest:1',
        valueRevision: 'value:1',
        dependencyRevision: 'dependency:1',
      },
      lastOperation: {
        requestId: 'request-1',
        fingerprint: 'operation-1',
        outcome: 'committed',
        sourceRevision: 'source:1',
        manifestRevision: 'manifest:1',
        valueRevision: 'value:1',
        dependencyRevision: 'dependency:1',
      },
    });
  });

  it('should reject values that cannot be persisted as JSON', () => {
    // @ts-expect-error -- undefined is not part of the persisted JSON value contract
    assertType<FileParameterEntry>({ activeGroup: 'default', groups: { default: { values: { width: undefined } } } });
  });
});
