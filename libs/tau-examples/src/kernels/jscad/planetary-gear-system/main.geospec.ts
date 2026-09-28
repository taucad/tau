import {
  describe,
  expectGeo,
  it,
  type GeoSpecComponentInterferenceAllowance,
} from 'geospec';
import { loadModel } from 'geospec/model';

// The output shaft is fixed to the carrier plate; their shared face meshes to
// a hairline overlap, not a clash.
const shaftJoint: GeoSpecComponentInterferenceAllowance = {
  kind: 'intentionalInterference',
  left: 'Planet Carrier Plate#0',
  right: 'Carrier Output Shaft#0',
  maxVolume: 0.05,
  reason: 'Output shaft is fixed to the carrier plate at a shared face.',
};

describe('Planetary Gear System', () => {
  it('should compile and render correctly', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toBeWatertight();
  });

  it('should have no component interference', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveNoComponentInterference({
      tolerance: 0.1,
      allowances: [shaftJoint],
    });
  });

  it('should be centered and have expected bounding box size', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveBoundingBox({
      center: { x: 0, y: 0 },
      tolerance: 1,
    });
  });

  it('should have no interference between ring gear and planet gears', async () => {
    const model = await loadModel({ file: 'main.ts' });
    // Ring and planets should mesh without solid intersection
    expectGeo(model).toHaveNoComponentInterference({
      tolerance: 0.05,
      pairs: [{ left: 'Housing Ring#0', right: /^Planet Gear \d#0$/ }],
    });
  });
});
