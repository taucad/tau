import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Camera Body', () => {
  it('is a 19 mm class camera housing', async () => {
    const model = await loadModel({ file: 'lib/parts/camera_body.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 16, y: 19, z: 19 },
      tolerance: 1.5,
    });
  });

  it('is a single watertight body', async () => {
    const model = await loadModel({ file: 'lib/parts/camera_body.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
