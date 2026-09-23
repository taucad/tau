import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';
import { quantityKinds } from '@taucad/runtime/kernel';
import { occtGltfExportSchema, occtRenderOptionSchema, occtStlExportSchema } from '#occt-schemas.js';

describe('OCCT schemas', () => {
  it('keeps preview and export tessellation defaults distinct', () => {
    expect(occtRenderOptionSchema.parse({}).tessellation.linearTolerance).toBe(0.02);
    expect(occtStlExportSchema.parse({}).tessellation.linearTolerance).toBe(0.01);
    expect(occtGltfExportSchema.parse({}).tessellation.linearTolerance).toBe(0.01);
  });

  it.each([
    ['render', occtRenderOptionSchema],
    ['STL export', occtStlExportSchema],
    ['glTF export', occtGltfExportSchema],
  ] as const)('declares %s tessellation tolerances in model millimetres and degrees', (_name, schema) => {
    expect(toJSONSchema(schema, { target: 'draft-7', io: 'input' })).toMatchObject({
      properties: {
        tessellation: {
          properties: {
            linearTolerance: {
              'x-tau-unit': 'mm',
              'x-tau-quantity-kind': quantityKinds.length,
              'x-tau-space': 'linear',
            },
            angularTolerance: {
              'x-tau-unit': 'deg',
              'x-tau-quantity-kind': quantityKinds.planeAngle,
              'x-tau-space': 'linear',
            },
          },
        },
      },
    });
  });
});
