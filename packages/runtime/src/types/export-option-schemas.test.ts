import { describe, expect, it } from 'vitest';
import { jscadExportSchemas } from '#kernels/jscad/jscad.schemas.js';
import { manifoldExportSchemas } from '#kernels/manifold/manifold.schemas.js';
import { opencascadeExportSchemas } from '#kernels/opencascade/opencascade.schemas.js';
import { replicadExportSchemas } from '#kernels/replicad/replicad.schemas.js';
import { zooExportSchemas } from '#kernels/zoo/zoo.schemas.js';
import { coordinateSystemSchema, unitSchema } from '#types/export-option-schemas.js';

describe('unitSchema', () => {
  it('should default length units to meters for general runtime exports', () => {
    const parsed = unitSchema.parse({});

    expect(parsed).toEqual({ unit: { length: 'meter' } });
  });

  it('should accept millimeter length units for GeoSpec-canonical exports', () => {
    const parsed = unitSchema.parse({ unit: { length: 'millimeter' } });

    expect(parsed).toEqual({ unit: { length: 'millimeter' } });
  });

  it('should reject unsupported length units', () => {
    expect(() => unitSchema.parse({ unit: { length: 'inch' } })).toThrow();
  });
});

describe('coordinateSystemSchema', () => {
  it('should remain composable with unitSchema for mesh export routes', () => {
    const schema = coordinateSystemSchema.extend(unitSchema.shape);

    const parsed = schema.parse({});

    expect(parsed).toEqual({
      coordinateSystem: 'z-up',
      unit: { length: 'meter' },
    });
  });
});

describe('OpenCascade STEP export schema', () => {
  it('should expose coordinateSystem for direct STEP routes', () => {
    const parsed = opencascadeExportSchemas.step.parse({ coordinateSystem: 'z-up' });

    expect(parsed).toEqual({ coordinateSystem: 'z-up' });
  });
});

describe('GeoSpec-critical mesh export schemas', () => {
  it('should expose coordinateSystem and unit on direct GLB routes', () => {
    const schemas = [
      jscadExportSchemas.glb,
      manifoldExportSchemas.glb,
      opencascadeExportSchemas.glb,
      replicadExportSchemas.glb,
      zooExportSchemas.glb,
    ];

    for (const schema of schemas) {
      const parsed = schema.parse({ coordinateSystem: 'z-up', unit: { length: 'millimeter' } });

      expect(parsed).toEqual(
        expect.objectContaining({
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        }),
      );
    }
  });
});
