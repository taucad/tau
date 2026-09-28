import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Fuselage Canopy', () => {
  it('caps the NACA 2425 upper body', async () => {
    const model = await loadModel({ file: 'lib/parts/fuselage_canopy.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 117.6, y: 47.2 },
      min: { z: 4 },
      max: { z: 22.9 },
      tolerance: 3,
    });
  });

  it('is a single watertight shell', async () => {
    const model = await loadModel({ file: 'lib/parts/fuselage_canopy.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });

  it('is a thin upper cover', async () => {
    const model = await loadModel({ file: 'lib/parts/fuselage_canopy.scad' });
    expectGeo(model).toHaveVolume({
      value: { greaterThan: 6000, lessThan: 28_000 },
    });
  });
});
