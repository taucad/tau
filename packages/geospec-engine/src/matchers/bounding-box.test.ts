import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line import/no-unassigned-import -- Installs the real matcher engine for the public collector.
import '#register.js';
import { loadMesh } from 'geospec/mesh';
import { createCollector } from 'geospec/runner';
import type { GeoSpecBoundingBoxExpectation } from 'geospec/runner';

const checkBounds = async (expected: GeoSpecBoundingBoxExpectation) => {
  const loaded = await loadMesh({ source: { format: 'mesh-buffer', positions: [10, 10, 0, 246, 10, 0, 10, 246, 32] } });
  if (!loaded.success) {
    throw new Error('Could not load bounds fixture');
  }
  const collector = createCollector();
  collector.it('declared envelope', () => collector.expectGeo(loaded.subject).toHaveBoundingBox(expected));
  await collector.waitForCompletion();
  return collector.tests[0];
};

describe('bounding-box ranges', () => {
  it('should accept inclusive boundaries and preserve tuple equality', async () => {
    expect(
      await checkBounds({
        min: { x: { greaterThanOrEqual: 10 }, z: { greaterThanOrEqual: 0 } },
        max: { x: { lessThanOrEqual: 246 }, y: { lessThanOrEqual: 246 } },
      }),
    ).toMatchObject({ status: 'passed' });
    expect(
      await checkBounds({ min: [10, 10, 0], max: [246, 246, 32], size: { x: 236 }, tolerance: 0.001 }),
    ).toMatchObject({ status: 'passed' });
  });
  it('should reject overflow independently of equality tolerance', async () => {
    expect(await checkBounds({ max: { x: { lessThanOrEqual: 245.9 } }, tolerance: 100 })).toMatchObject({
      status: 'failed',
    });
    expect(await checkBounds({ min: { z: { greaterThan: 0 } } })).toMatchObject({ status: 'failed' });
    expect(await checkBounds({ max: { z: { lessThanOrEqual: 31 } } })).toMatchObject({ status: 'failed' });
  });
  it('should reject nonfinite and empty range declarations', async () => {
    await Promise.all(
      [Number.NaN, Number.POSITIVE_INFINITY, {}, { lessThanOrEqual: Number.NaN }].map(async (x) => {
        expect(await checkBounds({ size: { x } })).toMatchObject({ status: 'failed' });
      }),
    );
  });
});
