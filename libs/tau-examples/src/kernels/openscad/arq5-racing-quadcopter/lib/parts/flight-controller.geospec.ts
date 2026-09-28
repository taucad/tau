import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Flight Controller', () => {
  it('is a 30.5 mm stack board', async () => {
    const model = await loadModel({ file: 'lib/parts/flight_controller.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 36, y: 36, z: 6 },
      tolerance: 2,
    });
  });

  it('is a single watertight board', async () => {
    const model = await loadModel({ file: 'lib/parts/flight_controller.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
