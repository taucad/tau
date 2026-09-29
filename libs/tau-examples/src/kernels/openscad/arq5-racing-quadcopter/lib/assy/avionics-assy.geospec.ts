import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Avionics Assembly', () => {
  it('stacks FC, ESC, VTX and receiver', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'avionics' } },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 41, y: 41, z: 22 },
      tolerance: 4,
    });
  });

  it('is watertight', async () => {
    const model = await loadModel({
      file: 'main.scad',
      parameters: { View: { part: 'avionics' } },
    });
    expectGeo(model).toBeWatertight();
  });
});
