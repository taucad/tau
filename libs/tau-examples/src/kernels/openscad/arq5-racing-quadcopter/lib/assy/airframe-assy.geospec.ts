import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Airframe Assembly', () => {
  it('reaches the 220 mm motor stations', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'airframe' } },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 190, y: 190, z: 48 },
      tolerance: 12,
    });
  });

  it('is watertight', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'airframe' } },
    });
    expectGeo(model).toBeWatertight();
  });
});
