import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Receiver', () => {
  it('is a compact ELRS board', async () => {
    const model = await loadModel({ file: 'lib/parts/receiver.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 13, y: 10, z: 2 },
      tolerance: 1.5,
    });
  });

  it('is a single watertight receiver', async () => {
    const model = await loadModel({ file: 'lib/parts/receiver.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
