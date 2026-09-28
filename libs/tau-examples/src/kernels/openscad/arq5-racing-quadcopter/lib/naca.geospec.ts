import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('NACA 2412 coupon', () => {
  it('matches 100 mm chord and 12 percent thickness', async () => {
    const model = await loadModel({ file: 'lib/naca.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 100, y: 12.1, z: 15 },
      tolerance: 0.6,
    });
  });

  it('is a single watertight solid', async () => {
    const model = await loadModel({ file: 'lib/naca.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });

  it('has camber shifting volume above the chord plane', async () => {
    const model = await loadModel({ file: 'lib/naca.scad' });
    expectGeo(model).toHaveVolume({
      value: { greaterThan: 8000, lessThan: 14_000 },
    });
    expectGeo(model).toHaveCenterOfMass({
      point: { y: 1.6 },
      tolerance: 1.2,
    });
  });
});
