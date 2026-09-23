import { describe, expect, it, vi } from 'vitest';
import { assimpCapabilities } from 'libassimp';
import type { OptionDescriptor } from 'libassimp';
import { toJSONSchema } from 'zod';
import { quantityKinds } from '@taucad/runtime/transcoder';
import { assimpEdgeSchemas } from '#assimp-export-options.js';

describe('assimp export option schemas', () => {
  it('declares the glTF identity-matrix epsilon as a dimensionless ratio', () => {
    for (const format of ['glb', 'gltf'] as const) {
      expect(toJSONSchema(assimpEdgeSchemas[format], { target: 'draft-7', io: 'input' })).toMatchObject({
        properties: {
          identityMatrixEpsilon: {
            'x-tau-unit': '1',
            'x-tau-quantity-kind': quantityKinds.dimensionlessRatio,
            'x-tau-space': 'linear',
          },
        },
      });
    }
  });

  it('covers every canonical target from the generated registry', () => {
    expect(Object.keys(assimpEdgeSchemas)).toEqual(Object.keys(assimpCapabilities.export));
  });

  it('applies every registry default and rejects unknown keys', () => {
    for (const [format, capability] of Object.entries(assimpCapabilities.export)) {
      const schema = assimpEdgeSchemas[format as keyof typeof assimpEdgeSchemas];
      expect(schema.parse({})).toEqual(
        Object.fromEntries(
          Object.entries(capability.exportOptions)
            .filter(([, descriptor]) => descriptor.default !== null)
            .map(([name, descriptor]) => [name, descriptor.default]),
        ),
      );
      expect(schema.safeParse({ definitelyNotAnAssimpOption: true }).success).toBe(false);
    }
  });

  it('enforces the generated boolean, string, enum, integer, and number descriptors', () => {
    expect(assimpEdgeSchemas['3mf'].parse({ application: 'Tau', unit: 'inch', decimalPrecision: 12 })).toMatchObject({
      application: 'Tau',
      unit: 'inch',
      decimalPrecision: 12,
    });
    expect(assimpEdgeSchemas.glb.parse({ identityMatrixEpsilon: 0.5, pointClouds: true })).toMatchObject({
      identityMatrixEpsilon: 0.5,
      pointClouds: true,
    });
    expect(assimpEdgeSchemas['3mf'].safeParse({ unit: 'parsec' }).success).toBe(false);
    expect(assimpEdgeSchemas['3mf'].safeParse({ application: 42 }).success).toBe(false);
    expect(assimpEdgeSchemas['3mf'].safeParse({ decimalPrecision: 2.5 }).success).toBe(false);
    expect(assimpEdgeSchemas['3mf'].safeParse({ decimalPrecision: 17 }).success).toBe(false);
    expect(assimpEdgeSchemas.glb.safeParse({ identityMatrixEpsilon: -1 }).success).toBe(false);
    expect(assimpEdgeSchemas.stl.parse({ binary: true }).binary).toBe(true);
    expect(assimpEdgeSchemas.glb.safeParse({ binary: true }).success).toBe(false);
  });

  it('should build every supported descriptor shape', async () => {
    const matrix = Array.from({ length: 16 }, (_, index) => index);
    const exportOptions = {
      optionalBoolean: { kind: 'boolean', default: null, description: 'Optional boolean' },
      maximumInteger: { kind: 'integer', default: 2, maximum: 4, description: 'Bounded integer' },
      minimumNumber: { kind: 'number', default: 1, minimum: 0, description: 'Bounded number' },
      text: { kind: 'string', default: 'Tau', description: 'String value' },
      matrix: { kind: 'matrix', default: matrix, description: 'Matrix value' },
      choice: { kind: 'string', default: 'first', values: ['first', 'second'], description: 'Choice value' },
    } satisfies Record<string, OptionDescriptor>;
    vi.resetModules();
    vi.doMock('libassimp', () => ({ assimpCapabilities: { export: { '3mf': { exportOptions } } } }));

    try {
      const { assimpEdgeSchemas: isolatedSchemas } = await import('#assimp-export-options.js');
      const schema = isolatedSchemas['3mf'];

      expect(schema.parse({})).toEqual({
        maximumInteger: 2,
        minimumNumber: 1,
        text: 'Tau',
        matrix,
        choice: 'first',
      });
      expect(schema.parse({ optionalBoolean: true, maximumInteger: 4, minimumNumber: 0 })).toMatchObject({
        optionalBoolean: true,
        maximumInteger: 4,
        minimumNumber: 0,
      });
      expect(schema.safeParse({ maximumInteger: 5 }).success).toBe(false);
      expect(schema.safeParse({ minimumNumber: -1 }).success).toBe(false);
      expect(schema.safeParse({ matrix: matrix.slice(1) }).success).toBe(false);
      expect(schema.safeParse({ choice: 'third' }).success).toBe(false);
    } finally {
      vi.doUnmock('libassimp');
      vi.resetModules();
    }
  });
});
