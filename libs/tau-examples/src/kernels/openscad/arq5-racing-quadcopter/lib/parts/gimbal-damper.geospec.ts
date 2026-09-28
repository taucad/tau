import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Gimbal Damper', () => {
  it('is an 8 mm isolation sphere', async () => {
    const model = await loadModel({ file: 'lib/parts/gimbal_damper.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 8, y: 8, z: 8 },
      tolerance: 0.3,
    });
  });

  it('is a single watertight damper', async () => {
    const model = await loadModel({ file: 'lib/parts/gimbal_damper.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
