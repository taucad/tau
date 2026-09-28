import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Motor Pod', () => {
  it('is a NACA body of revolution around the motor axis', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_pod.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 32, y: 32, z: 36 },
      tolerance: 2.5,
    });
  });

  it('is a single watertight pod', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_pod.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });

  it('is hollow for the 2207 motor', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_pod.scad' });
    expectGeo(model).toHaveVolume({
      value: { greaterThan: 4000, lessThan: 18_000 },
    });
  });
});
