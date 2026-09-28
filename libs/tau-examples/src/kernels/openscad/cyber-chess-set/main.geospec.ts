import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Cyberpunk Chessboard', () => {
  it('keeps the production envelope and renderable mesh', async () => {
    const model = await loadModel({ file: 'main.scad', format: 'glb' });

    expectGeo(model).toHaveNoDiagnostics();
    expectGeo(model).toHaveBoundingBox({
      size: { x: 244, y: 244, z: 72 },
      center: { x: 0, y: 0, z: 36 },
      tolerance: 1,
    });
    expectGeo(model).toHaveMeshIntegrity({
      finitePositions: true,
      triangleCount: { greaterThan: 4000 },
    });
  });
});
