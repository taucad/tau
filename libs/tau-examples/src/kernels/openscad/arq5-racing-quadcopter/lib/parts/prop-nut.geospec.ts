import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Prop Nut', () => {
  it('is an M5 nyloc 8 mm across flats', async () => {
    const model = await loadModel({ file: 'lib/parts/prop_nut.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 9.3, y: 8, z: 6 },
      tolerance: 0.6,
    });
  });

  it('is a single watertight nut', async () => {
    const model = await loadModel({ file: 'lib/parts/prop_nut.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
