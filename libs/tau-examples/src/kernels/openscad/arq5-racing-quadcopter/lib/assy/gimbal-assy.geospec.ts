import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Gimbal Assembly', () => {
  it('fits in the nose bay', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'gimbal' } },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 39.9, y: 34, z: 28 },
      tolerance: 5,
    });
  });

  it('is watertight', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'gimbal' } },
    });
    expectGeo(model).toBeWatertight();
  });
});
