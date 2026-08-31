import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

const loadCube = async () => loadModel({ file: 'main.ts', format: 'glb' });

describe('Picovoxel hello cube', () => {
  it('loads packaged Picovoxel GLB with the exact cube envelope and mesh integrity', async () => {
    const model = await loadCube();
    expectGeo(model).toHaveBoundingBox({
      size: { x: 1, y: 1, z: 1 },
      center: { x: 0, y: 0, z: 0 },
      tolerance: 0,
    });
    expectGeo(model).toHaveMeshIntegrity({
      finitePositions: true,
      degenerateTriangles: { count: 0 },
      duplicateFaces: { count: 0 },
      watertight: true,
      triangleCount: 12,
    });
  });
});
