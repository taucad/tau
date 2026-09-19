import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

describe('planetary gearbox', () => {
  it('fits the declared printer envelope', async () => {
    const housing = await loadModel({ file: 'main.js', parameters: { part: 'housing', printPose: true } });
    expectGeo(housing).toHaveBoundingBox({
      min: { x: { greaterThanOrEqual: 10 }, y: { greaterThanOrEqual: 10 }, z: { greaterThanOrEqual: 0 } },
      max: { x: { lessThanOrEqual: 246 }, y: { lessThanOrEqual: 246 }, z: { lessThanOrEqual: 256 } },
      tolerance: 0.001,
    });
  });
  for (const part of ['housing', 'ring', 'sun', 'planet', 'carrier', 'cover', 'bolt']) {
    it(`${part} is one closed solid`, async () => {
      const model = await loadModel({ file: 'main.js', parameters: { part } });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveConnectedComponents({ count: 1, tolerance: 0.001 });
    });
  }
  for (const angle of [0, 5, 10, 15, 20]) {
    it(`has no interference at input angle ${angle}`, async () => {
      const assembly = await loadModel({ file: 'main.js', parameters: { angle } });
      expectGeo(assembly).toHaveNoComponentInterference({ tolerance: 0.01 });
    });
  }
});
