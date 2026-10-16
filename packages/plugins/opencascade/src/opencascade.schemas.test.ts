import { describe, expect, it } from 'vitest';
import { opencascadeExportSchemas, opencascadeRenderSchema } from '#opencascade.schemas.js';

describe('OpenCascade option schemas', () => {
  it('defaults previews to the medium preset, mesh exports to high, and keeps the STEP coordinate default', () => {
    expect(opencascadeRenderSchema.parse({}).tessellation).toBe('medium');
    expect(opencascadeExportSchemas.glb.parse({}).tessellation).toBe('high');
    expect(opencascadeExportSchemas.stl.parse({}).tessellation).toBe('high');
    expect(opencascadeExportSchemas.step.parse({ coordinateSystem: 'z-up' })).toEqual({ coordinateSystem: 'z-up' });
  });

  it('keeps explicit tolerances whole and rejects a preset beside them', () => {
    const explicit = { linearTolerance: 0.02, angularTolerance: 20 };
    expect(opencascadeRenderSchema.parse({ tessellation: explicit }).tessellation).toEqual(explicit);
    expect(opencascadeExportSchemas.stl.parse({ tessellation: { linearTolerance: 0.01 } }).tessellation).toEqual({
      linearTolerance: 0.01,
    });
    expect(
      opencascadeExportSchemas.glb.safeParse({ tessellation: { quality: 'high', linearTolerance: 0.01 } }).success,
    ).toBe(false);
  });
});
