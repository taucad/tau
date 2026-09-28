import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('ESC Stack', () => {
  it('is a 4-in-1 40 mm class ESC', async () => {
    const model = await loadModel({ file: 'lib/parts/esc_stack.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 41, y: 41, z: 4.3 },
      tolerance: 2,
    });
  });

  it('is a single watertight ESC', async () => {
    const model = await loadModel({ file: 'lib/parts/esc_stack.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
