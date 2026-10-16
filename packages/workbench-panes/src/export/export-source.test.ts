import { describe, expect, it } from 'vitest';
import type { JSONSchema7 } from '@taucad/runtime/types';
import {
  fillMissingBatchViewIds,
  groupExportFormatsByFidelity,
  resolveActiveSchema,
  runtimeContentFromRecord,
  sanitizeFormDelta,
} from '#export/export-source.js';

const modes: JSONSchema7 = {
  anyOf: [
    {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['single'] },
        camera: { type: 'object' },
      },
      required: ['mode'],
    },
    {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['batch'] },
        views: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
      },
      required: ['mode', 'views'],
    },
  ],
};

describe('export schema helpers', () => {
  it('should resolve the branch the discriminator selects', () => {
    const { schema, defaults } = resolveActiveSchema(modes, { mode: 'batch' });
    expect(Object.keys(schema.properties ?? {})).toEqual(['mode', 'views']);
    expect(defaults).toEqual({ mode: 'batch' });
  });

  it('should keep only values the active branch admits', () => {
    expect(sanitizeFormDelta(modes, { mode: 'single', camera: {}, views: [] })).toEqual({ mode: 'single', camera: {} });
    expect(sanitizeFormDelta({}, { anything: 1 })).toEqual({});
  });

  it('should give unnamed batch views fresh ids', () => {
    const { schema } = resolveActiveSchema(modes, { mode: 'batch' });
    expect(
      fillMissingBatchViewIds(schema, {
        mode: 'batch',
        views: [{ id: 'view-1' }, {}],
      }),
    ).toEqual({
      mode: 'batch',
      views: [{ id: 'view-1' }, { id: 'view-2' }],
    });
  });

  it('should narrow content to the runtime flags', () => {
    expect(
      runtimeContentFromRecord({
        includeEdges: true,
        includeTopology: 'yes',
        other: 1,
      }),
    ).toEqual({
      includeEdges: true,
    });
  });

  it('should group formats BREP first and omit empty groups', () => {
    expect(
      groupExportFormatsByFidelity([
        { format: 'stl', fidelity: 'mesh' },
        { format: 'step', fidelity: 'brep' },
      ] as const),
    ).toEqual([
      { name: 'BREP', items: [{ format: 'step', fidelity: 'brep' }] },
      { name: 'Mesh', items: [{ format: 'stl', fidelity: 'mesh' }] },
    ]);
    expect(groupExportFormatsByFidelity([{ fidelity: 'mesh' }]).map(({ name }) => name)).toEqual(['Mesh']);
  });
});
