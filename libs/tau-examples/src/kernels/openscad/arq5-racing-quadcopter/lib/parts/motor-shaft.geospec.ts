import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Motor Shaft', () => {
  it('is a 5 mm shaft 22 mm long', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_shaft.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 5, y: 5, z: 22 },
      tolerance: 0.3,
    });
  });

  it('is a single watertight shaft', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_shaft.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
