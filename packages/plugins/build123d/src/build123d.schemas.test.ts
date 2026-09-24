import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';
import { quantityKinds } from '@taucad/runtime/kernel';
import { build123dExportSchemas, build123dRenderSchema } from '#build123d.schemas.js';

describe('build123d tessellation schema', () => {
  it.each([
    ['render', build123dRenderSchema],
    ['GLB export', build123dExportSchemas.glb],
  ] as const)('declares %s tolerances in model millimetres and OCCT radians', (_name, schema) => {
    expect(toJSONSchema(schema, { target: 'draft-7', io: 'input' })).toMatchObject({
      properties: {
        tessellation: {
          properties: {
            linearTolerance: { 'x-tau-unit': 'mm', 'x-tau-quantity-kind': quantityKinds.length },
            // Build123d hands this straight to BRepMesh, which takes radians; it is not OCCT-core's degrees.
            angularTolerance: {
              'x-tau-unit': 'rad',
              'x-tau-quantity-kind': quantityKinds.planeAngle,
              maximum: Math.PI,
            },
          },
        },
      },
    });
  });
});
