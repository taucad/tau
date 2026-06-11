import { describe, expect, it } from 'vitest';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import { loadMesh } from '#mesh/load-mesh.js';
import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecVolumeExpectation } from '#runner/types.js';

const boxPositions = [
  0, 0, 0, 10, 20, 0, 10, 0, 0, 0, 0, 0, 0, 20, 0, 10, 20, 0, 0, 0, 30, 10, 0, 30, 10, 20, 30, 0, 0, 30, 10, 20, 30, 0,
  20, 30, 0, 0, 0, 10, 0, 0, 10, 0, 30, 0, 0, 0, 10, 0, 30, 0, 0, 30, 0, 20, 0, 10, 20, 30, 10, 20, 0, 0, 20, 0, 0, 20,
  30, 10, 20, 30, 0, 0, 0, 0, 0, 30, 0, 20, 30, 0, 0, 0, 0, 20, 30, 0, 20, 0, 10, 0, 0, 10, 20, 0, 10, 20, 30, 10, 0, 0,
  10, 20, 30, 10, 0, 30,
];

const shiftedBoxPositions = boxPositions.map((value, index) => (index % 3 === 0 ? value + 1 : value));

const loadBox = async (positions = boxPositions): Promise<GeometrySubject> => {
  const result = await loadMesh({
    source: {
      format: 'mesh-buffer',
      name: 'box',
      positions,
    },
  });
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error('Expected mesh fixture to load.');
  }
  return result.subject;
};

const runOneAssertion = async (
  callback: (subject: GeometrySubject, collector: ReturnType<typeof createCollector>) => void | Promise<void>,
) => {
  const subject = await loadBox();
  const collector = createCollector();
  installCollector(collector);
  try {
    collector.it('should evaluate matcher', async () => callback(subject, collector));
    await collector.waitForCompletion(1000);
    return collector.tests[0]!;
  } finally {
    clearCollectorGlobals();
  }
};

describe('measurement matchers', () => {
  it('should validate mesh surface area, volume, mass, and center of mass', async () => {
    const test = await runOneAssertion((subject, collector) => {
      const matcher = collector.expectGeo(subject);
      matcher.toHaveSurfaceArea({ value: 2200, tolerance: 0.001 });
      matcher.toHaveVolume({ value: 6000, tolerance: 0.001 });
      matcher.toHaveMass({ value: 47.1, density: 7.85e-3, tolerance: 0.001 });
      matcher.toHaveCenterOfMass({ point: { x: 5, y: 10, z: 15 }, tolerance: 0.001 });
    });

    expect(test.status).toBe('passed');
    expect(test.assertions.map((assertion) => assertion.kind)).toEqual([
      'surfaceArea',
      'volume',
      'mass',
      'centerOfMass',
    ]);
  });

  it('should report structured diagnostics when volume does not match', async () => {
    const test = await runOneAssertion((subject, collector) => {
      collector.expectGeo(subject).toHaveVolume({ value: 7000, tolerance: 1 });
    });

    expect(test.status).toBe('failed');
    expect(test.assertions[0]?.diagnostics).toMatchObject([
      {
        code: 'VOLUME_MISMATCH',
        severity: 'error',
        details: {
          evidence: 'mesh',
          measurement: 'volume',
          actual: 6000,
          unit: 'mm',
          source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'box' },
        },
      },
    ]);
  });

  it('should report invalid expectation diagnostics for malformed measurement input', async () => {
    const invalidExpectation = {
      value: 6000,
      tolerance: 1,
      expectedCount: 1,
    } as unknown as GeoSpecVolumeExpectation;

    const test = await runOneAssertion((subject, collector) => {
      collector.expectGeo(subject).toHaveVolume(invalidExpectation);
    });

    expect(test.status).toBe('failed');
    const diagnostic = test.assertions[0]?.diagnostics?.[0];
    expect(diagnostic?.code).toBe('GEOSPEC_INVALID_EXPECTATION');
    expect(diagnostic?.message).toContain("unknown field 'expectedCount'");
    expect(diagnostic?.details).toMatchObject({
      matcher: 'toHaveVolume',
      field: 'expectedCount',
    });
  });

  it('should validate deterministic chamfer distance against a reference mesh', async () => {
    const subject = await loadBox();
    const shifted = await loadBox(shiftedBoxPositions);
    const collector = createCollector();
    installCollector(collector);
    try {
      collector.it('should compare meshes', () => {
        collector.expectGeo(subject).toHaveChamferDistanceTo(subject, {
          mean: { lessThanOrEqual: 0 },
          max: { lessThanOrEqual: 0 },
          p95: { lessThanOrEqual: 0 },
          samples: 1000,
        });
        collector.expectGeo(shifted).toHaveChamferDistanceTo(subject, {
          mean: { greaterThan: 0.1 },
          max: { greaterThan: 0.9 },
          samples: 1000,
        });
      });
      await collector.waitForCompletion(10_000);
      expect(collector.tests[0]?.status).toBe('passed');
    } finally {
      clearCollectorGlobals();
    }
  });

  it('should reject vacuous distance expectations before sampling geometry', async () => {
    const subject = await loadBox();
    const collector = createCollector();
    installCollector(collector);
    try {
      collector.it('should reject distance checks with no statistic', () => {
        collector.expectGeo(subject).toHaveChamferDistanceTo(subject, {
          samples: 3,
        });
      });
      await collector.waitForCompletion(1000);

      expect(collector.tests[0]?.status).toBe('failed');
      const assertion = collector.tests[0]?.assertions[0];
      expect(assertion?.kind).toBe('chamferDistance');
      expect(assertion?.passed).toBe(false);
      const diagnostic = assertion?.diagnostics?.[0];
      expect(diagnostic?.code).toBe('GEOSPEC_INVALID_EXPECTATION');
      expect(diagnostic?.message).toContain('expected at least one distance statistic');
      expect(diagnostic?.details).toMatchObject({ matcher: 'toHaveChamferDistanceTo' });
    } finally {
      clearCollectorGlobals();
    }
  });
});
