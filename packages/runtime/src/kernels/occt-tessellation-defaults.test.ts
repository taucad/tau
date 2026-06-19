import { describe, expect, it } from 'vitest';
import { opencascadeExportSchemas, opencascadeRenderSchema } from '#kernels/opencascade/opencascade.schemas.js';
import { replicadExportSchemas, replicadRenderSchema } from '#kernels/replicad/replicad.schemas.js';

describe('OCCT-backed tessellation defaults', () => {
  it('should default Replicad render and mesh exports to 0.01mm / 20deg', () => {
    expect(replicadRenderSchema.parse({}).tessellation).toEqual({
      linearTolerance: 0.01,
      angularTolerance: 20,
    });
    expect(replicadExportSchemas.glb.parse({}).tessellation).toEqual({
      linearTolerance: 0.01,
      angularTolerance: 20,
    });
    expect(replicadExportSchemas.stl.parse({}).tessellation).toEqual({
      linearTolerance: 0.01,
      angularTolerance: 20,
    });
  });

  it('should default OpenCascade render and mesh exports to 0.01mm / 20deg', () => {
    expect(opencascadeRenderSchema.parse({}).tessellation).toEqual({
      linearTolerance: 0.01,
      angularTolerance: 20,
    });
    expect(opencascadeExportSchemas.glb.parse({}).tessellation).toEqual({
      linearTolerance: 0.01,
      angularTolerance: 20,
    });
    expect(opencascadeExportSchemas.stl.parse({}).tessellation).toEqual({
      linearTolerance: 0.01,
      angularTolerance: 20,
    });
  });
});
