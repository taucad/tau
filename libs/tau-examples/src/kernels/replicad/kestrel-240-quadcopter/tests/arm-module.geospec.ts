import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';
describe('ARM MODULE / repeatable quadrants', () => {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      it(`quadrant ${sx},${sy} / all four parts clear each other`, async () => {
        const m = await loadModel({
          file: 'assemblies/arm-module.ts',
          parameters: { sx, sy },
          format: 'step',
        });
        expectGeo(m).toBeValidBrep();
        expectGeo(m).toHaveTopologyCounts({ solids: 4 });
        expectGeo(m).toHaveNoComponentInterference({ tolerance: 0.001 });
        const mesh = await loadModel({
          file: 'assemblies/arm-module.ts',
          parameters: { sx, sy },
        });
        expectGeo(mesh).toBeWatertight();
        expectGeo(mesh).toHaveAssemblyOccurrences({
          occurrences: [
            {
              name: /^AF-005 Root clamp [FR][LR]$/,
              count: 1,
              bounds: {
                center: { x: sx * 61.68, y: sy * 32, z: 0 },
                tolerance: 0.05,
              },
            },
          ],
        });
      });
    }
  }
  it('one fairing, one spar, one clamp and one pad per module', async () => {
    const m = await loadModel({ file: 'assemblies/arm-module.ts' });
    expectGeo(m).toBeWatertight();
    expectGeo(m).toHaveAssemblyOccurrences({
      uniqueNames: true,
      occurrences: [
        { name: 'AF-003 Arm RR', count: 1 },
        { name: 'AF-004 Spar RR', count: 1 },
        { name: 'AF-005 Root clamp RR', count: 1 },
        { name: 'AF-006 Motor pad RR', count: 1 },
      ],
    });
    expectGeo(m).toHaveNoComponentInterference({
      pairs: [{ left: 'AF-003 Arm RR', right: 'AF-004 Spar RR' }],
      tolerance: 0.02,
    });
  });
  it('front-left variant preserves four independently named parts', async () => {
    const m = await loadModel({
      file: 'assemblies/arm-module.ts',
      parameters: { sx: -1, sy: -1 },
    });
    expectGeo(m).toBeWatertight();
    expectGeo(m).toHaveAssemblyOccurrences({
      occurrences: [
        {
          name: 'AF-006 Motor pad FL',
          count: 1,
          bounds: { center: { x: -85, y: -85, z: 1 }, tolerance: 0.1 },
        },
      ],
    });
  });
});
