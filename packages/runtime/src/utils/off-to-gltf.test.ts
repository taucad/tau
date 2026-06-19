import { describe, it, expect } from 'vitest';
import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { srgbToLinear } from '#utils/color-space.js';
import { convertOffToGltf } from '#utils/off-to-gltf.js';

/**
 * Parse a GLB buffer back to a glTF-Transform Document for inspection.
 */
async function parseGlb(glbBuffer: Uint8Array<ArrayBuffer>): Promise<Document> {
  const io = new NodeIO();
  return io.readBinary(glbBuffer);
}

describe('convertOffToGltf', () => {
  describe('color opacity handling (per-color materials)', () => {
    it('should set material baseColorFactor with alpha for semi-transparent faces', async () => {
      // OFF data with a semi-transparent blue triangle (alpha = 127/255 ≈ 0.498)
      // Using "OFF 3 1 0" format (header and counts on same line) as OpenSCAD outputs
      const offContent = `OFF 3 1 0
0 0 0
1 0 0
0.5 1 0
3 0 1 2 0 0 255 127
`;
      const glbBuffer = await convertOffToGltf(offContent, { format: 'glb' });
      const document = await parseGlb(glbBuffer);

      // Get the mesh and check material color
      const meshes = document.getRoot().listMeshes();
      expect(meshes).toHaveLength(1);
      expect(document.getRoot().listNodes()[0]!.getName()).toBe('Shape 1');
      expect(meshes[0]!.getName()).toBe('Shape 1');

      const materials = document.getRoot().listMaterials();
      expect(materials).toHaveLength(1);

      // Color should be on the material's baseColorFactor (linear), not vertex colors
      const material = materials[0]!;
      expect(material.getName()).toBe('');
      const baseColor = material.getBaseColorFactor();
      expect(baseColor[0]).toBeCloseTo(0, 2); // R
      expect(baseColor[1]).toBeCloseTo(0, 2); // G
      expect(baseColor[2]).toBeCloseTo(srgbToLinear(1), 2); // B (linear)
      expect(baseColor[3]).toBeCloseTo(127 / 255, 2); // A ≈ 0.498 (alpha is not gamma-corrected)

      // Primitives should NOT have vertex colors (color is on material)
      const primitives = meshes[0]!.listPrimitives();
      expect(primitives).toHaveLength(1);
      expect(primitives[0]!.getAttribute('COLOR_0')).toBeNull();
    });

    it('should set material alpha mode to BLEND for transparent faces', async () => {
      // OFF data with a semi-transparent triangle
      const offContent = `OFF 3 1 0
0 0 0
1 0 0
0.5 1 0
3 0 1 2 255 0 0 128
`;
      const glbBuffer = await convertOffToGltf(offContent, { format: 'glb' });
      const document = await parseGlb(glbBuffer);

      const materials = document.getRoot().listMaterials();
      expect(materials).toHaveLength(1);

      const material = materials[0]!;
      expect(material.getAlphaMode()).toBe('BLEND');
      expect(material.getName()).toBe('');
    });

    it('should set material alpha mode to OPAQUE for fully opaque faces', async () => {
      // OFF data with a fully opaque triangle (alpha = 255)
      const offContent = `OFF 3 1 0
0 0 0
1 0 0
0.5 1 0
3 0 1 2 255 0 0 255
`;
      const glbBuffer = await convertOffToGltf(offContent, { format: 'glb' });
      const document = await parseGlb(glbBuffer);

      const materials = document.getRoot().listMaterials();
      expect(materials).toHaveLength(1);

      const material = materials[0]!;
      expect(material.getAlphaMode()).toBe('OPAQUE');
      expect(material.getName()).toBe('');
    });

    it('should create separate materials for opaque and transparent faces', async () => {
      // OFF data with two faces: one opaque, one transparent
      const offContent = `OFF 6 2 0
0 0 0
1 0 0
0.5 1 0
2 0 0
3 0 0
2.5 1 0
3 0 1 2 255 0 0 255
3 3 4 5 0 255 0 128
`;
      const glbBuffer = await convertOffToGltf(offContent, { format: 'glb' });
      const document = await parseGlb(glbBuffer);

      // Should have 2 materials - one for each unique color
      const materials = document.getRoot().listMaterials();
      expect(materials).toHaveLength(2);
      expect(materials.map((material) => material.getName())).toEqual(['', '']);

      // Find materials by their alpha mode
      const opaqueMaterials = materials.filter((mat) => mat.getAlphaMode() === 'OPAQUE');
      const blendMaterials = materials.filter((mat) => mat.getAlphaMode() === 'BLEND');

      expect(opaqueMaterials).toHaveLength(1);
      expect(blendMaterials).toHaveLength(1);

      // Check each material has correct color (linear-space)
      const opaqueColor = opaqueMaterials[0]!.getBaseColorFactor();
      expect(opaqueColor[0]).toBeCloseTo(1, 2); // R = 1 (linear == sRGB at endpoints)
      expect(opaqueColor[3]).toBeCloseTo(1, 2); // A

      const blendColor = blendMaterials[0]!.getBaseColorFactor();
      expect(blendColor[1]).toBeCloseTo(1, 2); // G = 1
      expect(blendColor[3]).toBeCloseTo(128 / 255, 2); // A (not gamma-corrected)
    });

    it('should preserve RGB-only colors with default alpha of 1 on material', async () => {
      // OFF data with RGB color only (no alpha specified)
      const offContent = `OFF 3 1 0
0 0 0
1 0 0
0.5 1 0
3 0 1 2 255 128 64
`;
      const glbBuffer = await convertOffToGltf(offContent, { format: 'glb' });
      const document = await parseGlb(glbBuffer);

      // Color should be on material
      const materials = document.getRoot().listMaterials();
      expect(materials).toHaveLength(1);

      const material = materials[0]!;
      const baseColor = material.getBaseColorFactor();
      // BaseColorFactor is linear; OFF integer colors are sRGB
      expect(baseColor[0]).toBeCloseTo(srgbToLinear(255 / 255), 2); // R
      expect(baseColor[1]).toBeCloseTo(srgbToLinear(128 / 255), 2); // G
      expect(baseColor[2]).toBeCloseTo(srgbToLinear(64 / 255), 2); // B
      expect(baseColor[3]).toBeCloseTo(1, 2); // A = 1 (default)

      // Material should be OPAQUE since all faces are fully opaque
      expect(material.getAlphaMode()).toBe('OPAQUE');
    });

    it('should handle OpenSCAD glass color [0.6, 0.8, 0.95, 0.5] correctly on material', async () => {
      // Simulating OpenSCAD glass_color = [0.6, 0.8, 0.95, 0.5]
      // In OFF format (0-255): 153, 204, 242, 127
      const offContent = `OFF 3 1 0
0 0 0
1 0 0
0.5 1 0
3 0 1 2 153 204 242 127
`;
      const glbBuffer = await convertOffToGltf(offContent, { format: 'glb' });
      const document = await parseGlb(glbBuffer);

      const materials = document.getRoot().listMaterials();
      expect(materials).toHaveLength(1);

      const material = materials[0]!;
      const baseColor = material.getBaseColorFactor();

      // BaseColorFactor is linear; OFF integer colors are sRGB
      expect(baseColor[0]).toBeCloseTo(srgbToLinear(153 / 255), 2); // R sRGB ≈ 0.6
      expect(baseColor[1]).toBeCloseTo(srgbToLinear(204 / 255), 2); // G sRGB ≈ 0.8
      expect(baseColor[2]).toBeCloseTo(srgbToLinear(242 / 255), 2); // B sRGB ≈ 0.95
      expect(baseColor[3]).toBeCloseTo(127 / 255, 2); // A ≈ 0.5 (alpha not gamma-corrected)

      // Should use BLEND mode for transparency
      expect(material.getAlphaMode()).toBe('BLEND');
    });
  });

  it('should convert valid OFF to JSON glTF format when format is gltf', async () => {
    const offContent = `OFF 3 1 0
0 0 0
1 0 0
0.5 1 0
3 0 1 2 255 0 0 255
`;
    const gltfBytes = await convertOffToGltf(offContent, { format: 'gltf' });
    const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
      asset: unknown;
      meshes: unknown[];
      buffers: Array<{ uri: string }>;
    };

    expect(json.asset).toBeDefined();
    expect(json.meshes).toBeDefined();
    expect(json.buffers).toBeDefined();
    expect(json.buffers[0]!.uri).toMatch(/^data:application\/octet-stream;base64,/);
  });

  it('should export z-up millimeter coordinates when requested', async () => {
    const offContent = `OFF 3 1 0
0 0 0
50 0 0
0 50 0
3 0 1 2 255 0 0 255
`;
    const glbBuffer = await convertOffToGltf(offContent, {
      format: 'glb',
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    });
    const document = await parseGlb(glbBuffer);
    const position = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('POSITION')!;

    expect(position.getElement(1, [0, 0, 0])).toEqual([50, 0, 0]);
    expect(position.getElement(2, [0, 0, 0])).toEqual([0, 50, 0]);
  });
});
