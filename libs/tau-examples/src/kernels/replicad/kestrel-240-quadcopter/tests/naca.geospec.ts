import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

describe('AERO / exact NACA 0024 reference coupon', () => {
  it('exact analytic area integral and rounded finite trailing edge', async () => {
    const m = await loadModel({ file: 'lib/naca.ts', format: 'step' });
    const area =
      10 *
      0.24 *
      50 ** 2 *
      ((0.2969 * 2) / 3 - 0.126 / 2 - 0.3516 / 3 + 0.2843 / 4 - 0.1015 / 5);
    const trailingRadius = 5 * 0.24 * 50 * 0.0021;
    expectGeo(m).toHaveVolume({
      value: 20 * (area + (Math.PI * trailingRadius ** 2) / 2),
      tolerance: 0.02,
    });
    expectGeo(m).toBeValidBrep();
    expectGeo(m).toHaveTopologyCounts({ solids: 1 });
  });
  it('smooth profile / dimensional envelope', async () => {
    const m = await loadModel({ file: 'lib/naca.ts' });
    expectGeo(m).toBeWatertight();
    expectGeo(m).toHaveBoundingBox({
      size: { x: 50.126, y: 20, z: 12.004 },
      tolerance: 0.08,
    });
  });
  it('NACA 0012 independent size variant', async () => {
    const m = await loadModel({
      file: 'lib/naca.ts',
      parameters: { chord: 80, thickness: 0.12, span: 10 },
      format: 'step',
    });
    const area =
      10 *
      0.12 *
      80 ** 2 *
      ((0.2969 * 2) / 3 - 0.126 / 2 - 0.3516 / 3 + 0.2843 / 4 - 0.1015 / 5);
    expectGeo(m).toHaveVolume({
      value: 10 * (area + (Math.PI * 0.1008 ** 2) / 2),
      tolerance: 0.03,
    });
    // STEP bounds include conservative OCC deflection padding; mesh extrema verify dimensions.
    const mesh = await loadModel({
      file: 'lib/naca.ts',
      parameters: { chord: 80, thickness: 0.12, span: 10 },
    });
    expectGeo(mesh).toHaveBoundingBox({
      size: { x: 80.1008, y: 10, z: 9.603 },
      tolerance: 0.03,
    });
  });
});
