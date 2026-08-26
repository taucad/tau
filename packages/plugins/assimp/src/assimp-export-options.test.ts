import { describe, expect, it } from 'vitest';
import { assimpCapabilities } from 'libassimp';
import { assimpEdgeSchemas } from '#assimp-export-options.js';

describe('assimp export option schemas', () => {
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

  it('enforces enums, integer ranges, and target-specific fields', () => {
    expect(assimpEdgeSchemas['3mf'].parse({ unit: 'inch', decimalPrecision: 12 })).toMatchObject({
      unit: 'inch',
      decimalPrecision: 12,
    });
    expect(assimpEdgeSchemas['3mf'].safeParse({ unit: 'parsec' }).success).toBe(false);
    expect(assimpEdgeSchemas['3mf'].safeParse({ decimalPrecision: 2.5 }).success).toBe(false);
    expect(assimpEdgeSchemas['3mf'].safeParse({ decimalPrecision: 17 }).success).toBe(false);
    expect(assimpEdgeSchemas.stl.parse({ binary: true }).binary).toBe(true);
    expect(assimpEdgeSchemas.glb.safeParse({ binary: true }).success).toBe(false);
  });
});
