import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('a box from a non-Tau exporter', () => {
  it('passes: the box is 10 mm', async () => {
    const box = await loadModel({ file: 'part.box', format: 'step' });
    expectGeo(box).toHaveBoundingBox({ size: { x: 10, y: 10, z: 10 }, center: { x: 0, y: 0, z: 0 }, tolerance: 1e-6 });
  });

  it('passes: parameters resize the box', async () => {
    const box = await loadModel({ file: 'part.box', format: 'step', parameters: { size: 20 } });
    expectGeo(box).toHaveBoundingBox({ size: { x: 20, y: 20, z: 20 }, tolerance: 1e-6 });
  });

  it('fails: the box is not 12 mm', async () => {
    const box = await loadModel({ file: 'part.box', format: 'step' });
    expectGeo(box).toHaveBoundingBox({ size: { x: 12, y: 12, z: 12 }, tolerance: 1e-6 });
  });

  it('refuses: the exporter writes no GLB', async () => {
    const box = await loadModel({ file: 'part.box', format: 'glb' });
    expectGeo(box).toHaveBoundingBox({ size: { x: 10, y: 10, z: 10 }, tolerance: 1e-6 });
  });
});
