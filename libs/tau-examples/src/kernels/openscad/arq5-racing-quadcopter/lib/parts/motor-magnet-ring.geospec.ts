import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Motor Magnet Ring', () => {
  it('fits inside the 2207 bell', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_magnet_ring.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 26, y: 26, z: 7 },
      tolerance: 0.6,
    });
  });

  it('is a single watertight ring', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_magnet_ring.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
