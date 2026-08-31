// @vitest-environment node

import { describe, it } from 'vitest';
import { validateGlbData } from '@taucad/runtime-testing';
import { picovoxelToGlb } from '#picovoxel.geometry.js';

describe('picovoxelToGlb', () => {
  it('emits valid GLB for degenerate normals and meshes with no feature edges', () => {
    const degenerate = picovoxelToGlb(
      {
        shapes: [{
          name: 'Degenerate',
          lane: 'exact',
          vertices: new Float32Array(9),
          triangles: new Uint32Array([0, 1, 2]),
        }],
      },
      { includeEdges: true },
    );
    validateGlbData(degenerate);
  });
});
