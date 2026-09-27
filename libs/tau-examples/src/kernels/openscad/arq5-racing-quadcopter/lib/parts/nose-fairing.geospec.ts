import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Nose Fairing', () => {
  it('covers the forward NACA nose and gimbal bay', async () => {
    const model = await loadModel({ file: 'lib/parts/nose_fairing.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 35.9, y: 46.9, z: 39.1 },
      tolerance: 4,
    });
  });

  it('is a single watertight fairing', async () => {
    const model = await loadModel({ file: 'lib/parts/nose_fairing.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
