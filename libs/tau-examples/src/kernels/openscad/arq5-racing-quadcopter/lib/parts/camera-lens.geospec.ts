import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Camera Lens', () => {
  it('is a 14 mm lens barrel', async () => {
    const model = await loadModel({ file: 'lib/parts/camera_lens.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 10, y: 14, z: 14 },
      tolerance: 1,
    });
  });

  it('is a single watertight lens', async () => {
    const model = await loadModel({ file: 'lib/parts/camera_lens.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
