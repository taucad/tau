import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Antenna', () => {
  it('is a 5.8 GHz stub with cloverleaf', async () => {
    const model = await loadModel({ file: 'lib/parts/antenna.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 12, y: 12, z: 22 },
      tolerance: 3,
    });
  });

  it('is a single watertight antenna', async () => {
    const model = await loadModel({ file: 'lib/parts/antenna.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
