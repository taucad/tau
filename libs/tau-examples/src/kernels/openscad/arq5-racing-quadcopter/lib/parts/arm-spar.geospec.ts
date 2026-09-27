import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Arm Spar', () => {
  it('is a NACA 0024 beam 28 mm chord by 66 mm span', async () => {
    const model = await loadModel({ file: 'lib/parts/arm_spar.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 28, y: 66, z: 6.8 },
      tolerance: 1.2,
    });
  });

  it('is a single watertight spar', async () => {
    const model = await loadModel({ file: 'lib/parts/arm_spar.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });

  it('has a cable duct reducing solid volume', async () => {
    const model = await loadModel({ file: 'lib/parts/arm_spar.scad' });
    expectGeo(model).toHaveVolume({
      value: { greaterThan: 2500, lessThan: 9000 },
    });
  });
});
