import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('M3 SHCS', () => {
  it('is ISO 4762 M3 x 10', async () => {
    const model = await loadModel({ file: 'lib/parts/m3_shcs.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 5.5, y: 5.5, z: 13 },
      tolerance: 0.5,
    });
  });

  it('is a single watertight screw', async () => {
    const model = await loadModel({ file: 'lib/parts/m3_shcs.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
