import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';
import { quantityKinds } from '@taucad/runtime/kernel';
import { openrscadExportSchemas, openrscadRenderSchema } from '#openrscad.kernel.js';

describe('OpenRSCAD tessellation schema', () => {
  it.each([
    ['render', openrscadRenderSchema],
    ['GLB export', openrscadExportSchemas.glb],
    ['3MF export', openrscadExportSchemas['3mf']],
  ] as const)('declares %s $fs in millimetres, $fa in degrees and $fn as a plain count', (_name, schema) => {
    const tessellation = (
      toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as unknown as {
        properties: { tessellation: { properties: Record<string, Record<string, unknown>> } };
      }
    ).properties.tessellation.properties;

    expect(tessellation['minimumSize']).toMatchObject({
      'x-tau-unit': 'mm',
      'x-tau-quantity-kind': quantityKinds.length,
    });
    expect(tessellation['minimumAngle']).toMatchObject({
      'x-tau-unit': 'deg',
      'x-tau-quantity-kind': quantityKinds.planeAngle,
    });
    expect(tessellation['segments']).not.toHaveProperty('x-tau-unit');
  });
});
