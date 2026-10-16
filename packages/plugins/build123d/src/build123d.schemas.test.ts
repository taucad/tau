import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';
import { quantityKinds } from '@taucad/runtime/kernel';
import { build123dExportSchemas, build123dRenderSchema } from '#build123d.schemas.js';

describe('build123d tessellation schema', () => {
  it.each([
    ['render', build123dRenderSchema, 'medium'],
    ['GLB export', build123dExportSchemas.glb, 'high'],
  ] as const)('declares %s tessellation as a preset or millimetres and degrees', (_name, schema, preset) => {
    expect(toJSONSchema(schema, { target: 'draft-7', io: 'input' })).toMatchObject({
      properties: {
        tessellation: {
          default: preset,
          oneOf: [
            { enum: ['low', 'medium', 'high', 'extra-high'] },
            {
              additionalProperties: false,
              properties: {
                linearTolerance: { 'x-tau-unit': 'mm', 'x-tau-quantity-kind': quantityKinds.length },
                angularTolerance: { 'x-tau-unit': 'deg', 'x-tau-quantity-kind': quantityKinds.planeAngle },
              },
            },
          ],
        },
      },
    });
  });

  it.each([
    ['render', build123dRenderSchema, 'medium'],
    ['GLB export', build123dExportSchemas.glb, 'high'],
  ] as const)('defaults %s to its preset and keeps explicit tolerances whole', (_name, schema, preset) => {
    expect(schema.parse({}).tessellation).toBe(preset);
    expect(schema.parse({ tessellation: { linearTolerance: 0.05 } }).tessellation).toEqual({ linearTolerance: 0.05 });
  });

  it('rejects a preset and tolerances together', () => {
    expect(build123dRenderSchema.safeParse({ tessellation: { quality: 'high', linearTolerance: 0.01 } }).success).toBe(
      false,
    );
    expect(build123dRenderSchema.safeParse({ tessellation: {} }).success).toBe(false);
  });
});
