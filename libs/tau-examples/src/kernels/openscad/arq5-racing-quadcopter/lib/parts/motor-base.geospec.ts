import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Motor Base', () => {
  it('carries the 16 x 19 mm M3 pattern', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_base.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 26, y: 26, z: 4 },
      tolerance: 1,
    });
  });

  it('is a single watertight base', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_base.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
