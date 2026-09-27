import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Motor Bearing', () => {
  it('is a 5 x 11 x 4 mm radial bearing', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_bearing.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 11, y: 11, z: 4 },
      tolerance: 0.3,
    });
  });

  it('is a single watertight race', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_bearing.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
