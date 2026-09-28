import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Motor Bell', () => {
  it('is a 27.8 mm 2207 bell', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_bell.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 27.8, y: 27.8, z: 16 },
      tolerance: 0.5,
    });
  });

  it('is a single watertight bell', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_bell.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
