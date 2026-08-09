import { describe, expect, it } from 'vitest';
import { loadMesh } from '#mesh/load-mesh.js';
import type { GeometrySubject } from '#mesh/types.js';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import type { GeoSpecTestCase } from '#runner/types.js';

// Same closed 10x20x30 box soup the measurement-matcher suite uses: solid,
// watertight, one component — every guarded matcher has a meaningful
// positive-control run on it.
const boxPositions = [
  0, 0, 0, 10, 20, 0, 10, 0, 0, 0, 0, 0, 0, 20, 0, 10, 20, 0, 0, 0, 30, 10, 0, 30, 10, 20, 30, 0, 0, 30, 10, 20, 30, 0,
  20, 30, 0, 0, 0, 10, 0, 0, 10, 0, 30, 0, 0, 0, 10, 0, 30, 0, 0, 30, 0, 20, 0, 10, 20, 30, 10, 20, 0, 0, 20, 0, 0, 20,
  30, 10, 20, 30, 0, 0, 0, 0, 0, 30, 0, 20, 30, 0, 0, 0, 0, 20, 30, 0, 20, 0, 10, 0, 0, 10, 20, 0, 10, 20, 30, 10, 0, 0,
  10, 20, 30, 10, 0, 30,
];

const loadBox = async (): Promise<GeometrySubject> => {
  const result = await loadMesh({
    source: { format: 'mesh-buffer', name: 'box', positions: boxPositions },
  });
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error('Expected mesh fixture to load.');
  }
  return result.subject;
};

// The `mesh: false` STEP-load shape (R12): the loader withholds every
// `{kind:'mesh'}` capability while `subject.mesh` remains a (empty) record.
const withoutMeshEvidence = (subject: GeometrySubject): GeometrySubject => ({
  ...subject,
  capabilities: subject.capabilities.filter((capability) => capability.kind !== 'mesh'),
});

const runOneTest = async (
  callback: (collector: ReturnType<typeof createCollector>) => void | Promise<void>,
): Promise<GeoSpecTestCase> => {
  const collector = createCollector();
  installCollector(collector);
  try {
    collector.it('should evaluate matcher', async () => callback(collector));
    await collector.waitForCompletion(10_000);
    return collector.tests[0]!;
  } finally {
    clearCollectorGlobals();
  }
};

const expectMeshEvidenceDiagnostic = (test: GeoSpecTestCase): void => {
  expect(test.status).toBe('failed');
  const diagnostic = test.assertions[0]?.diagnostics?.[0];
  expect(diagnostic?.code).toBe('UNSUPPORTED_GEOMETRY_EVIDENCE');
  expect(diagnostic?.message).toContain('requires mesh evidence');
};

describe('mesh-evidence guard (R12)', () => {
  it('should fail closed when connected components run without mesh evidence', async () => {
    const subject = withoutMeshEvidence(await loadBox());
    const test = await runOneTest((collector) => {
      collector.expectGeo(subject).toHaveConnectedComponents({ count: 1 });
    });
    expectMeshEvidenceDiagnostic(test);
  });

  it('should fail closed when watertightness runs without mesh evidence', async () => {
    const subject = withoutMeshEvidence(await loadBox());
    const test = await runOneTest((collector) => {
      collector.expectGeo(subject).toBeWatertight();
    });
    expectMeshEvidenceDiagnostic(test);
  });

  it('should fail closed when mesh integrity runs without mesh evidence', async () => {
    const subject = withoutMeshEvidence(await loadBox());
    const test = await runOneTest((collector) => {
      collector.expectGeo(subject).toHaveMeshIntegrity({ finitePositions: true });
    });
    expectMeshEvidenceDiagnostic(test);
  });

  it('should fail closed when a mesh-evidence surface area runs without mesh evidence', async () => {
    const subject = withoutMeshEvidence(await loadBox());
    const test = await runOneTest((collector) => {
      collector.expectGeo(subject).toHaveSurfaceArea({ value: 2200, tolerance: 1, evidence: 'mesh' });
    });
    expectMeshEvidenceDiagnostic(test);
  });

  it('should fail closed when volume falls back to mesh evidence that is missing', async () => {
    // Default evidence with no BRep mass properties lands on the mesh value —
    // the guard must fire on the fallback path too.
    const subject = withoutMeshEvidence(await loadBox());
    const test = await runOneTest((collector) => {
      collector.expectGeo(subject).toHaveVolume({ value: 6000, tolerance: 1 });
    });
    expectMeshEvidenceDiagnostic(test);
  });

  it('should fail closed when component interference runs without mesh evidence', async () => {
    const subject = withoutMeshEvidence(await loadBox());
    const test = await runOneTest((collector) => {
      collector.expectGeo(subject).toHaveNoComponentInterference();
    });
    expectMeshEvidenceDiagnostic(test);
  });

  it('should fail closed when chamfer distance runs without subject mesh evidence', async () => {
    const subject = withoutMeshEvidence(await loadBox());
    const reference = await loadBox();
    const test = await runOneTest((collector) => {
      collector.expectGeo(subject).toHaveChamferDistanceTo(reference, { mean: 0 });
    });
    expectMeshEvidenceDiagnostic(test);
  });

  it('should fail closed when the distance reference lacks mesh evidence', async () => {
    const subject = await loadBox();
    const reference = withoutMeshEvidence(await loadBox());
    const test = await runOneTest((collector) => {
      collector.expectGeo(subject).toHaveMinimumDistanceTo(reference, { value: 0, tolerance: 1 });
    });
    expectMeshEvidenceDiagnostic(test);
  });

  it('should keep mesh matchers passing on subjects that carry mesh evidence', async () => {
    const subject = await loadBox();
    const test = await runOneTest((collector) => {
      const matcher = collector.expectGeo(subject);
      matcher.toBeWatertight();
      matcher.toHaveVolume({ value: 6000, tolerance: 1 });
      matcher.toHaveConnectedComponents({ count: 1 });
    });
    expect(test.status).toBe('passed');
  });
});
