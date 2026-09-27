import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Shell And Tube Heat Exchanger', () => {
  it('matches the production envelope', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveBoundingBox({
      min: { x: -360, y: -139, z: 0 },
      max: { x: 360, y: 139, z: 282 },
      size: { x: 720, y: 278, z: 282 },
      tolerance: 0.5,
    });
  });

  it('keeps the axial length parametric', async () => {
    const model = await loadModel({
      file: 'main.ts',
      parameters: { shellLength: 540 },
    });
    expectGeo(model).toHaveBoundingBox({
      min: { x: -380 },
      max: { x: 380 },
      size: { x: 760, y: 278, z: 282 },
      tolerance: 0.5,
    });
  });

  it('contains only closed, finite solids', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveMeshIntegrity({
      finitePositions: true,
      degenerateTriangles: { maxCount: 0 },
    });
  });

  it('keeps both tubeside nozzles attached at the channel-head envelope', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveBoundingBox({
      min: { y: -139 },
      max: { y: 139 },
      tolerance: 0.5,
    });
    expectGeo(model).toBeWatertight();
  });

  it('retains substantial pressure-boundary and internal material', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveVolume({
      value: { greaterThan: 3_000_000, lessThan: 6_000_000 },
    });
  });
});
