import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Gimbal Roll Ring', () => {
  it('is a 28 mm class roll housing', async () => {
    const model = await loadModel({ file: 'lib/parts/gimbal_roll_ring.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 10, y: 28, z: 28 },
      tolerance: 2,
    });
  });

  it('is a single watertight ring', async () => {
    const model = await loadModel({ file: 'lib/parts/gimbal_roll_ring.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
