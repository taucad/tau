import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Vase model', () => {
  it('should be exactly 20cm (200mm) high', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { z: 200 },
      tolerance: 0.1,
    });
  });

  it('should be centered on the XY origin', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveBoundingBox({
      center: { x: 0, y: 0 },
      tolerance: 3,
    });
  });

  it('should be watertight and a single component', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
