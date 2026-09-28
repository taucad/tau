import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Arm Assembly', () => {
  it('spans spar, pod and propulsion', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'arm' } },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 127, y: 150, z: 50 },
      tolerance: 18,
    });
  });

  it('is watertight', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'arm' } },
    });
    expectGeo(model).toBeWatertight();
  });
});
