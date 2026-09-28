import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Gimbal Roll Motor', () => {
  it('is a 1404 class actuator', async () => {
    const model = await loadModel({ file: 'lib/parts/gimbal_roll_motor.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 12, y: 14, z: 14 },
      tolerance: 1.2,
    });
  });

  it('is a single watertight motor', async () => {
    const model = await loadModel({ file: 'lib/parts/gimbal_roll_motor.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
