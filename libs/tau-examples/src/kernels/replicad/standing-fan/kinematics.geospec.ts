import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Standing fan rigid kinematics', () => {
  it('should keep the telescopic inner tube rigid at both height limits', async () => {
    for (const headHeight of [1020, 1320]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- GeoSpec exact evidence is run serially.
      const tube = await loadModel({
        file: 'main.ts',
        format: 'step',
        parameters: { part: 'inner-tube', headHeight },
      });
      expectGeo(tube).toHaveBoundingBox({
        size: { z: 590 },
        min: { z: headHeight - 700 },
        tolerance: 0.02,
      });
    }
  });
});
