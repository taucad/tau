import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Power Assembly', () => {
  it('packages the 6S pack and latch', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'power' } },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 78, y: 36, z: 32 },
      tolerance: 4,
    });
  });

  it('is watertight', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'power' } },
    });
    expectGeo(model).toBeWatertight();
  });
});
