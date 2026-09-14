import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { quantityKinds } from '@taucad/units/quantity';
import { quantity } from '#configuration/zod.js';
import { validateJsonSchemaValue } from '#configuration/admission.js';

describe('quantity authoring', () => {
  it('should retain numeric bound intersections in both shipped Zod formats and schema directions', () => {
    // The statically named package's require entry exercises its separate CJS build.
    const commonJs = createRequire(import.meta.url)('zod') as { z: typeof z };
    for (const api of [z, commonJs.z]) {
      const schemas = [
        api.number().min(-10).max(10).int(),
        api.number().int().min(-10).max(10),
        api.number().positive().max(0.01).int(),
        api.number().int().positive().max(0.01),
        api.number().min(20).max(10).int(),
      ];
      for (const schema of schemas) {
        for (const io of ['input', 'output'] as const) {
          const jsonSchema = api.toJSONSchema(schema, { target: 'draft-07', io });
          for (const value of [-11, -10, 0, 0.001, 1, 10, 11, 20, Number.MAX_SAFE_INTEGER + 1]) {
            expect(validateJsonSchemaValue(jsonSchema, value), `${io}: ${String(value)}`).toBe(
              schema.safeParse(value).success,
            );
          }
        }
      }
    }
  });
  it.each([
    ['length', 'm', quantityKinds.length],
    ['speed', 'm/s', quantityKinds.speed],
    ['plane angle', 'rad', quantityKinds.planeAngle],
  ] as const)('should annotate canonical %s semantics in both schema directions', (_name, unit, kind) => {
    const schema = quantity({ unit, quantityKind: kind, space: 'linear' })
      .positive()
      .max(10)
      .meta({ title: 'Physical value' });
    for (const io of ['input', 'output'] as const) {
      expect(z.toJSONSchema(schema, { target: 'draft-07', io })).toMatchObject({
        type: 'number',
        'x-tau-unit': unit,
        'x-tau-quantity-kind': kind,
        'x-tau-space': 'linear',
        title: 'Physical value',
        exclusiveMinimum: 0,
        maximum: 10,
      });
    }
    expect(schema.parse(0.01)).toBe(0.01);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(11).success).toBe(false);
  });

  it('should retain annotations through defaults, optional values, null and array wrappers', () => {
    const schema = z.object({
      length: quantity({ unit: 'm', quantityKind: quantityKinds.length, space: 'linear' }).default(0.001),
      speed: quantity({ unit: 'm/s', quantityKind: quantityKinds.speed, space: 'linear' }).optional(),
      volumes: quantity({ unit: 'm3', quantityKind: quantityKinds.volume, space: 'linear' }).nullable().array(),
    });
    for (const converter of [schema['~standard'].jsonSchema.input, schema['~standard'].jsonSchema.output]) {
      expect(converter({ target: 'draft-07' })).toMatchObject({
        properties: {
          length: { type: 'number', 'x-tau-unit': 'm', default: 0.001 },
          speed: { type: 'number', 'x-tau-unit': 'm/s' },
          volumes: {
            type: 'array',
            items: { anyOf: [{ type: 'number', 'x-tau-unit': 'm3' }, { type: 'null' }] },
          },
        },
      });
    }
    expect(schema.parse({ volumes: [null, 0.2] })).toEqual({ length: 0.001, volumes: [null, 0.2] });
  });

  it('should reject unknown IDs at a JavaScript boundary', () => {
    expect(() => {
      Reflect.apply(quantity, undefined, [{ unit: 'meters' }]);
    }).toThrow('Invalid or unsupported UCUM unit');
    expect(() => {
      Reflect.apply(quantity, undefined, [{ unit: 'm', quantityKind: 'length' }]);
    }).toThrow('Unknown quantity kind');
  });
});
