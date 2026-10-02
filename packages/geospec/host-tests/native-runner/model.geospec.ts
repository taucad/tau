import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

const expected = {
  bounds: { size: { x: 10, y: 20, z: 30 }, tolerance: 0.000001 },
  volume: { value: 6000, tolerance: 0.000001 },
};

describe('native model host', () => {
  it('loads retained STEP source bytes', async () => {
    const subject = await loadModel({ source: 'baseline.step', format: 'step' });
    expectGeo(subject).toHaveVolume(expected.volume);
    expectGeo(subject).toHaveBoundingBox(expected.bounds);
    expectGeo(subject).toBeValidBrep({ maxTolerance: 0.01 });
  });

  it('exports a project file through Runtime as GLB', async () => {
    const subject = await loadModel({ file: 'model.ts', format: 'glb' });
    expectGeo(subject).toHaveVolume(expected.volume);
    expectGeo(subject).toHaveBoundingBox(expected.bounds);
    expectGeo(subject).toBeWatertight();
  });

  it('deduplicates repeated admission of the same STEP subject', async () => {
    await loadModel({ source: 'baseline.step', format: 'step' });
    const second = await loadModel({ source: 'baseline.step', format: 'step' });
    expectGeo(second).toHaveVolume(expected.volume);
  });
});
