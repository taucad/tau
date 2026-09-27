import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Optical Window', () => {
  it('is a convex spherical cap', async () => {
    const model = await loadModel({ file: 'lib/parts/optical_window.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 4, y: 16, z: 16 },
      tolerance: 2,
    });
  });

  it('is a single watertight window', async () => {
    const model = await loadModel({ file: 'lib/parts/optical_window.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
