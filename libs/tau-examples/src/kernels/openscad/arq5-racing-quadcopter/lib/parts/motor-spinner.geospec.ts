import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Motor Spinner', () => {
  it('is a compact NACA spinner', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_spinner.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 24, y: 24, z: 16 },
      tolerance: 2,
    });
  });

  it('is a single watertight spinner', async () => {
    const model = await loadModel({ file: 'lib/parts/motor_spinner.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
