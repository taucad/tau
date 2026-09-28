import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Prop Hub', () => {
  it('is a 14 mm hub', async () => {
    const model = await loadModel({ file: 'lib/parts/prop_hub.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 14, y: 14, z: 8 },
      tolerance: 0.6,
    });
  });

  it('is a single watertight hub', async () => {
    const model = await loadModel({ file: 'lib/parts/prop_hub.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
