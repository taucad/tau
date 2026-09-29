import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Battery Pack', () => {
  it('is a 6S 1100 pouch 75 x 36 x 28 mm', async () => {
    const model = await loadModel({ file: 'lib/parts/battery_pack.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 75, y: 36, z: 28 },
      tolerance: 1.5,
    });
  });

  it('is a single watertight pack', async () => {
    const model = await loadModel({ file: 'lib/parts/battery_pack.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
