import { describe, expect, it } from 'vitest';
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
