import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Propulsion Unit', () => {
  it('combines motor, spinner and 5 inch prop', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'propulsion' } },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 112.9, y: 100.2, z: 48 },
      tolerance: 5,
    });
  });

  it('is watertight', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'propulsion' } },
    });
    expectGeo(model).toBeWatertight();
  });
});
