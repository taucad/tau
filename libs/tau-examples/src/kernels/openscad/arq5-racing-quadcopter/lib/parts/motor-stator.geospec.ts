import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Motor Stator', () => {
  it('is a 2207 stator 22 mm OD by 7 mm stack', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_stator.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 22, y: 22, z: 7 },
      tolerance: 0.4,
    });
  });

  it('is a single watertight stator', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_stator.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });

  it('is a hollow lamination stack', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_stator.scad' });
    expectGeo(model).toHaveVolume({
      value: { greaterThan: 1200, lessThan: 2400 },
    });
  });
});
