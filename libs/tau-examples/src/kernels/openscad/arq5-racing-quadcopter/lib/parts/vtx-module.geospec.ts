import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('VTX Module', () => {
  it('is a compact 5.8 GHz brick', async () => {
    const model = await loadModel({ file: 'lib/parts/vtx_module.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 20, y: 16, z: 8 },
      tolerance: 2,
    });
  });

  it('is a single watertight module', async () => {
    const model = await loadModel({ file: 'lib/parts/vtx_module.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
