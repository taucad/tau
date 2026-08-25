import { describe, expect, it } from 'vitest';
import { opencascadeExportSchemas, opencascadeRenderSchema } from '#opencascade.schemas.js';

describe('OpenCascade option schemas', () => {
  it('keeps the OCCT tessellation and STEP coordinate defaults', () => {
    expect(opencascadeRenderSchema.parse({}).tessellation).toEqual({
      linearTolerance: 0.02,
      angularTolerance: 20,
    });
    expect(opencascadeExportSchemas.glb.parse({}).tessellation).toEqual({
      linearTolerance: 0.01,
      angularTolerance: 20,
    });
    expect(opencascadeExportSchemas.step.parse({ coordinateSystem: 'z-up' })).toEqual({ coordinateSystem: 'z-up' });
  });
});
