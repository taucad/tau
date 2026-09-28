import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Motor Assembly', () => {
  it('stacks to a 2207 envelope', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'motor' } },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 27.8, y: 27.8, z: 32 },
      tolerance: 2,
    });
  });

  it('is watertight', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'motor' } },
    });
    expectGeo(model).toBeWatertight();
  });
});
