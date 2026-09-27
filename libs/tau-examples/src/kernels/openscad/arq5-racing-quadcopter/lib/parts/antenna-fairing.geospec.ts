import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Antenna Fairing', () => {
  it('is a NACA 0015 teardrop', async () => {
    const model = await loadModel({ file: 'lib/parts/antenna_fairing.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 18, y: 10, z: 10 },
      tolerance: 2,
    });
  });

  it('is a single watertight fairing', async () => {
    const model = await loadModel({ file: 'lib/parts/antenna_fairing.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
