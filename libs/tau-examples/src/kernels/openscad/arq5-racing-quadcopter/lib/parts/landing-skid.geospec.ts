import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Landing Skid', () => {
  it('is a NACA 0012 rocker about 90 mm long', async () => {
    const model = await loadModel({ file: 'lib/parts/landing_skid.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 90, y: 17, z: 10.8 },
      tolerance: 3,
    });
  });

  it('is a single watertight skid', async () => {
    const model = await loadModel({ file: 'lib/parts/landing_skid.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
