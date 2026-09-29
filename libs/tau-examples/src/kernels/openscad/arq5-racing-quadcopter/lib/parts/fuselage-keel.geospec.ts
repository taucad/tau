import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Fuselage Keel', () => {
  it('follows the NACA 2425 chord and width', async () => {
    const model = await loadModel({ file: 'lib/parts/fuselage_keel.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 128, y: 48 },
      min: { z: -19 },
      max: { z: 4 },
      tolerance: 3,
    });
  });

  it('is a single watertight printed shell', async () => {
    const model = await loadModel({ file: 'lib/parts/fuselage_keel.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });
});
