import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Battery Latch', () => {
  it('is a compact curved latch', async () => {
    const model = await loadModel({ file: 'lib/parts/battery_latch.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 22, y: 13, z: 12.4 },
      tolerance: 2,
    });
  });

  it('is a single watertight latch', async () => {
    const model = await loadModel({ file: 'lib/parts/battery_latch.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
