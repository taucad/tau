import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { quantityIds } from '@taucad/units/constants';
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
  it.each(quantityIds)('should annotate the canonical %s quantity in both schema directions', (id) => {
    const schema = quantity(id).positive().max(10).meta({ title: 'Physical value' });
    for (const io of ['input', 'output'] as const) {
      expect(z.toJSONSchema(schema, { target: 'draft-07', io })).toMatchObject({
        type: 'number',
        'x-tau-quantity': id,
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
      length: quantity('length').default(0.001),
      speed: quantity('speed').optional(),
      volumes: quantity('volume').nullable().array(),
    });
    for (const converter of [schema['~standard'].jsonSchema.input, schema['~standard'].jsonSchema.output]) {
      expect(converter({ target: 'draft-07' })).toMatchObject({
        properties: {
          length: { type: 'number', 'x-tau-quantity': 'length', default: 0.001 },
          speed: { type: 'number', 'x-tau-quantity': 'speed' },
          volumes: {
            type: 'array',
            items: { anyOf: [{ type: 'number', 'x-tau-quantity': 'volume' }, { type: 'null' }] },
          },
        },
      });
    }
    expect(schema.parse({ volumes: [null, 0.2] })).toEqual({ length: 0.001, volumes: [null, 0.2] });
  });

  it('should reject unknown IDs at a JavaScript boundary', () => {
    expect(() => {
      Reflect.apply(quantity, undefined, ['meters']);
    }).toThrow('Unknown quantity kind');
    expect(() => {
      Reflect.apply(quantity, undefined, [{ dimension: 'length' }]);
    }).toThrow('Unknown quantity kind');
  });
});
