import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Heat Insert', () => {
  it('is an M3 x 4 mm brass insert', async () => {
    const model = await loadModel({ file: 'lib/parts/heat_insert.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 4.6, y: 4.6, z: 4 },
      tolerance: 0.4,
    });
  });

  it('is a single watertight insert', async () => {
    const model = await loadModel({ file: 'lib/parts/heat_insert.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
