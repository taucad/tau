import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Camera Assembly', () => {
  it('stacks body, lens and window', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'camera' } },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 31.9, y: 18.9, z: 18.9 },
      tolerance: 3,
    });
  });

  it('is watertight', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'camera' } },
    });
    expectGeo(model).toBeWatertight();
  });
});
