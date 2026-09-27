import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Prop Blade', () => {
  it('spans hub to 5 inch tip with NACA 4412 chord', async () => {
    const model = await loadModel({ file: 'lib/parts/prop_blade.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: { y: 57 },
      tolerance: 3,
    });
  });

  it('is a single watertight blade', async () => {
    const model = await loadModel({ file: 'lib/parts/prop_blade.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });

  it('has airfoil volume not a flat plate', async () => {
    const model = await loadModel({ file: 'lib/parts/prop_blade.scad' });
    expectGeo(model).toHaveVolume({
      value: { greaterThan: 800, lessThan: 6000 },
    });
  });
});
