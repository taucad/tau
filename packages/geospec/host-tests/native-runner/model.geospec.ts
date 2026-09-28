import { describe, expectNativeGeo, it } from 'geospec';
import { loadNativeModel } from 'geospec/runner/native';

const expected = {
  bounds: { size: { x: 10, y: 20, z: 30 }, tolerance: 0.000001 },
  volume: { value: 6000, tolerance: 0.000001 },
};

describe('native model host', () => {
  it('loads retained STEP source bytes', async () => {
    const subject = await loadNativeModel({ source: 'baseline.step', format: 'step' });
    await expectNativeGeo(subject).toHaveVolume(expected.volume);
    await expectNativeGeo(subject).toHaveBoundingBox(expected.bounds);
    await expectNativeGeo(subject).toBeValidBrep({ maxTolerance: 0.01 });
  });

  it('exports a project file through Runtime as GLB', async () => {
    const subject = await loadNativeModel({ file: 'model.ts', format: 'glb' });
    await expectNativeGeo(subject).toHaveVolume(expected.volume);
    await expectNativeGeo(subject).toHaveBoundingBox(expected.bounds);
    await expectNativeGeo(subject).toBeWatertight();
  });

  it('deduplicates repeated admission of the same STEP subject', async () => {
    const first = await loadNativeModel({ source: 'baseline.step', format: 'step' });
    const second = await loadNativeModel({ source: 'baseline.step', format: 'step' });
    if (first.subjectHash !== second.subjectHash) {
      throw new Error('Repeated native admission returned different subject identities.');
    }
    await expectNativeGeo(second).toHaveVolume(expected.volume);
  });
});
