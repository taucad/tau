import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Propeller Assembly', () => {
  it('is a 5 inch three-blade propeller', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'propeller' } },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 112.9, y: 100.2 },
      tolerance: 4,
    });
  });

  it('is watertight', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'propeller' } },
    });
    expectGeo(model).toBeWatertight();
  });
});
