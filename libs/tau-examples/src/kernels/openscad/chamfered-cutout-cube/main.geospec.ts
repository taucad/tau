import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

// Nominal part: 40 mm cube, all 12 edges chamfered 3 mm (45°),
// Ø20 mm through-bore along Z, centred on the origin.
//
// Expected volume (mm³):
//   chamfered block = L³ − 6c²(L − c) = 64000 − 1998 = 62002
//   bore (96-facet polygon, length L) = 40 × 4800·sin(2π/96) ≈ 12557.7
//   net ≈ 49444

describe('chamfered cube with cylinder cutout', () => {
  it('has a 40 mm cube envelope centred on the origin', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveBoundingBox({
      size: [40, 40, 40],
      center: [0, 0, 0],
      tolerance: 0.01,
    });
  });

  it('is a single watertight solid', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });

  it('has the chamfered-block volume less the through-bore', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toHaveVolume({ value: 49_444, tolerance: 25 });
  });
});
