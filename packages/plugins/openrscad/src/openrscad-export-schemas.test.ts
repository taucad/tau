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
    const { oneOf } = (
      toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as unknown as {
        properties: { tessellation: { oneOf: Array<{ properties?: Record<string, Record<string, unknown>> }> } };
      }
    ).properties.tessellation;
    const tessellation = oneOf.find((branch) => branch.properties)?.properties ?? {};

    for (const name of ['linearTolerance', 'minimumSize']) {
      expect(tessellation[name]).toMatchObject({ 'x-tau-unit': 'mm', 'x-tau-quantity-kind': quantityKinds.length });
    }
    for (const name of ['angularTolerance', 'minimumAngle']) {
      expect(tessellation[name]).toMatchObject({
        'x-tau-unit': 'deg',
        'x-tau-quantity-kind': quantityKinds.planeAngle,
      });
    }
    expect(tessellation['minimumSize']).toMatchObject({ deprecated: true });
    expect(tessellation['segments']).not.toHaveProperty('x-tau-unit');
  });
});
