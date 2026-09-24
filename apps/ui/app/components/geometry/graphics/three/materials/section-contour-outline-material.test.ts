import { describe, expect, it } from 'vitest';
import { Vector2 } from 'three';
import {
  createSectionContourOutlineMaterial,
  resolveSectionContourOutlineEmphasis,
  setSectionContourOutlineMaterialColor,
} from '#components/geometry/graphics/three/materials/section-contour-outline-material.js';
import {
  gltfEdgeColorLightMode,
  gltfEdgeHoverColor,
  gltfEdgeSelectedColor,
} from '#components/geometry/graphics/three/overlay-colors.constants.js';
import { viewportRenderTiers } from '#components/geometry/graphics/three/utils/render-order.utils.js';

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

  it('gives a cap outline the emphasis colour and draw order of the component it belongs to', () => {
    // The cut face is part of the component. Leaving its outline at the theme colour strands a
    // black loop inside an otherwise yellow shape.
    expect(resolveSectionContourOutlineEmphasis('none', gltfEdgeColorLightMode)).toEqual({
      edgeColor: gltfEdgeColorLightMode,
      renderOrder: viewportRenderTiers.sectionContourOutline,
    });
    expect(resolveSectionContourOutlineEmphasis('hover', gltfEdgeColorLightMode)).toEqual({
      edgeColor: gltfEdgeHoverColor,
      renderOrder: viewportRenderTiers.modelEmphasisEdge,
    });
    for (const emphasis of ['selected', 'focused'] as const) {
      expect(resolveSectionContourOutlineEmphasis(emphasis, gltfEdgeColorLightMode)).toEqual({
        edgeColor: gltfEdgeSelectedColor,
        renderOrder: viewportRenderTiers.modelEmphasisEdge,
      });
    }
  });

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
