import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Gimbal Pitch Motor', () => {
  it('is a 1404 class actuator', async () => {
    const model = await loadModel({
      file: 'lib/parts/gimbal_pitch_motor.scad',
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 14, y: 14, z: 12 },
      tolerance: 1.2,
    });
  });

  it('is a single watertight motor', async () => {
    const model = await loadModel({
      file: 'lib/parts/gimbal_pitch_motor.scad',
    });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
