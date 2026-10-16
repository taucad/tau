import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';
import { quantityKinds } from '@taucad/runtime/kernel';
import {
  occtGltfExportSchema,
  occtQualityGltfExportSchema,
  occtQualityRenderOptionSchema,
  occtQualityStlExportSchema,
  occtRenderOptionSchema,
  occtStlExportSchema,
  occtTessellationSchema,
} from '#occt-schemas.js';
import type { OcctTessellation } from '#occt-schemas.js';

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

describe('OCCT tessellation union', () => {
  it.each([
    ['a preset', 'high'],
    ['an explicit linear tolerance', { linearTolerance: 0.01 }],
    ['an explicit angular tolerance', { angularTolerance: 12 }],
    ['explicit tolerances', { linearTolerance: 0.01, angularTolerance: 12 }],
  ] as const)('accepts %s', (_name, tessellation) => {
    expect(occtQualityRenderOptionSchema.parse({ tessellation }).tessellation).toEqual(tessellation);
    expect(occtQualityStlExportSchema.parse({ tessellation }).tessellation).toEqual(tessellation);
    expect(occtQualityGltfExportSchema.parse({ tessellation }).tessellation).toEqual(tessellation);
  });

  it('defaults previews to medium and exports to high', () => {
    expect(occtQualityRenderOptionSchema.parse({}).tessellation).toBe('medium');
    expect(occtQualityStlExportSchema.parse({}).tessellation).toBe('high');
    expect(occtQualityGltfExportSchema.parse({}).tessellation).toBe('high');
  });

  it.each([
    ['a preset beside explicit fields', { quality: 'high', linearTolerance: 0.01 }],
    ['an empty explicit object', {}],
    ['an unknown preset', 'ultra'],
    ['a non-positive tolerance', { linearTolerance: 0 }],
  ])('rejects %s and names both accepted forms', (_name, tessellation) => {
    const parsed = occtQualityRenderOptionSchema.safeParse({ tessellation });
    expect(parsed.success).toBe(false);
    const messages = parsed.success
      ? []
      : parsed.error.issues.flatMap((issue) => [
          issue.message,
          ...(issue.code === 'invalid_union' ? issue.errors.flat().map((nested) => nested.message) : []),
        ]);
    expect(messages.join('\n')).toContain(
      "tessellation is a preset ('low' | 'medium' | 'high' | 'extra-high') or an explicit object",
    );
  });

  it('makes a preset beside explicit fields unrepresentable in TypeScript', () => {
    // @ts-expect-error -- a preset and explicit tolerances are never combined (R1)
    const combined: OcctTessellation = { quality: 'high', linearTolerance: 0.01 };
    expect(occtTessellationSchema.safeParse(combined).success).toBe(false);
  });

  it('publishes the union as oneOf with units on the explicit fields', () => {
    const schema = toJSONSchema(occtQualityRenderOptionSchema, { target: 'draft-7', io: 'input' });
    expect(schema).toMatchObject({
      properties: {
        tessellation: {
          default: 'medium',
          oneOf: [
            { type: 'string', enum: ['low', 'medium', 'high', 'extra-high'] },
            {
              type: 'object',
              additionalProperties: false,
              minProperties: 1,
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
          ],
        },
      },
    });
  });
});
