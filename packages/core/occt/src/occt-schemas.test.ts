import { describe, expect, it } from 'vitest';
import { occtGltfExportSchema, occtRenderOptionSchema, occtStlExportSchema } from '#occt-schemas.js';

describe('OCCT schemas', () => {
  it('keeps preview and export tessellation defaults distinct', () => {
    expect(occtRenderOptionSchema.parse({}).tessellation.linearTolerance).toBe(0.02);
    expect(occtStlExportSchema.parse({}).tessellation.linearTolerance).toBe(0.01);
    expect(occtGltfExportSchema.parse({}).tessellation.linearTolerance).toBe(0.01);
  });
});
