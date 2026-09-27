import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('ARQ-5 complete vehicle', () => {
  it('fits a 5-inch racing envelope with props', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 253.5, y: 253.5, z: 82 },
      tolerance: 12,
    });
  });

  it('is a closed manifold assembly', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toBeWatertight();
  });

  it('has racing-drone scale volume', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveVolume({
      value: { greaterThan: 120_000, lessThan: 450_000 },
    });
  });

  it('keeps the mass near the origin', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveCenterOfMass({
      point: { x: 8, y: 0, z: 8 },
      tolerance: 18,
    });
  });
});
