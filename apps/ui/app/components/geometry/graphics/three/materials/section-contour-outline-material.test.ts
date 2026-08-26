import { describe, expect, it } from 'vitest';
import { Vector2 } from 'three';
import {
  createSectionContourOutlineMaterial,
  setSectionContourOutlineMaterialColor,
} from '#components/geometry/graphics/three/materials/section-contour-outline-material.js';

describe('section-contour-outline-material', () => {
  for (const backend of ['webgl', 'webgpu'] as const) {
    it(`should create opaque depth-tested non-depth-writing contour outline materials for ${backend}`, () => {
      const material = createSectionContourOutlineMaterial({
        backend,
        edgeColor: 0x12_34_56,
        resolution: new Vector2(1024, 768),
      });

      expect(material.transparent).toBe(false);
      expect(material.depthTest).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.color.getHex()).toBe(0x12_34_56);
    });
  }

  it('should preserve contour-specific state when recoloring a reused material', () => {
    const material = createSectionContourOutlineMaterial({
      backend: 'webgl',
      edgeColor: 0x12_34_56,
      resolution: new Vector2(1024, 768),
    });

    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = true;
    const previousVersion = material.version;

    setSectionContourOutlineMaterialColor(material, 0xaa_bb_cc);

    expect(material.color.getHex()).toBe(0xaa_bb_cc);
    expect(material.transparent).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.version).toBeGreaterThan(previousVersion);
  });
});
