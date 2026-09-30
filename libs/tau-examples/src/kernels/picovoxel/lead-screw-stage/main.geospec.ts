import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Lead screw stage geometry', () => {
  it('should deliver finite closed meshes with the complete stage envelope', async () => {
    const model = await loadModel({ file: 'main.ts', format: 'glb' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 112, y: 40, z: 25 },
      tolerance: 2,
    });
    expectGeo(model).toHaveMeshIntegrity({
      finitePositions: true,
      degenerateTriangles: { count: 0 },
      watertight: true,
    });
  });
});
