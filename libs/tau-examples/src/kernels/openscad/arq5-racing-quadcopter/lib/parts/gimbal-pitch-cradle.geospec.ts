import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Gimbal Pitch Cradle', () => {
  it('is a curved fork around the camera', async () => {
    const model = await loadModel({
      file: 'lib/parts/gimbal_pitch_cradle.scad',
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 26, y: 34, z: 18 },
      tolerance: 3,
    });
  });

  it('is a single watertight cradle', async () => {
    const model = await loadModel({
      file: 'lib/parts/gimbal_pitch_cradle.scad',
    });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
