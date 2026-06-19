import { beforeAll, describe, expect, it } from 'vitest';
import createManifoldModule from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';
import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { srgbToLinear } from '#utils/color-space.js';
import { canonicalizeOffWithManifold, convertOffToManifoldGltf } from '#utils/off-manifold-canonicalizer.js';

let manifoldModule: ManifoldToplevel;

const coloredCubeOff = `OFF 8 6 0
0 0 0
1 0 0
1 1 0
0 1 0
0 0 1
1 0 1
1 1 1
0 1 1
4 0 3 2 1 255 0 0 255
4 4 5 6 7 0 255 0 255
4 0 1 5 4 0 0 255 255
4 3 7 6 2 255 255 0 255
4 0 4 7 3 255 0 255 255
4 1 2 6 5 0 255 255 255
`;

const parseGlb = async (glbBuffer: Uint8Array<ArrayBuffer>): Promise<Document> => new NodeIO().readBinary(glbBuffer);

describe('convertOffToManifoldGltf', () => {
  beforeAll(async () => {
    manifoldModule = await createManifoldModule();
    manifoldModule.setup();
  });

  it('canonicalizes closed OFF meshes while preserving material runs', async () => {
    const canonical = canonicalizeOffWithManifold(coloredCubeOff, manifoldModule);
    const uniqueColors = new Set(canonical.colors.map((color) => color.join(',')));

    expect(canonical.faces).toHaveLength(12);
    expect(uniqueColors.size).toBe(6);

    const glb = await convertOffToManifoldGltf(coloredCubeOff, { format: 'glb', manifoldModule });
    const document = await parseGlb(glb);
    const materials = document.getRoot().listMaterials();

    expect(materials).toHaveLength(6);
    expect(materials.map((material) => material.getAlphaMode())).toEqual([
      'OPAQUE',
      'OPAQUE',
      'OPAQUE',
      'OPAQUE',
      'OPAQUE',
      'OPAQUE',
    ]);
    expect(materials[0]!.getBaseColorFactor()[0]).toBeCloseTo(srgbToLinear(1), 6);
  });
});
