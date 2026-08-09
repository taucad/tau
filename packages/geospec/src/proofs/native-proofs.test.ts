import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';
import { resolve } from '#selector/resolve.js';
import type { GeometrySelector } from '#selector/types.js';
import { loadStep } from '#step/index.js';
import { getSubjectProofContext, proveRelationship } from '#proofs/index.js';
import type { RelationshipProofContext } from '#proofs/index.js';

const fixturePath = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');

// Fixture geometry: cubeA is a 10mm cube centered at the origin; cubeB is the
// same cube placed at +30mm X, so the exact facing gap between them is 20mm.
const cubeGap = 20;

describe('native relationship proofs (SB1 two-cube fixture)', () => {
  let subject: GeometrySubject;
  let context: RelationshipProofContext;
  let previousExtremaGate: string | undefined;

  beforeAll(async () => {
    // This suite certifies the exact native proof path (measured extrema
    // distances, boolean common volumes, audit diagnostics). The CR4 mesh
    // gate would resolve these mm-scale rows first and has its own
    // differential, so pin it off for every path including the matcher.
    previousExtremaGate = process.env['GEOSPEC_EXTREMA_GATE'];
    process.env['GEOSPEC_EXTREMA_GATE'] = '0';
    subject = await loadStep({ source: fixturePath, name: 'two-cube-assembly.step' });
    const built = getSubjectProofContext(subject);
    if (!built) {
      throw new Error('two-cube fixture subject must carry STEP-XDE and native BRep evidence.');
    }
    context = built;
  }, 120_000);

  afterAll(() => {
    if (previousExtremaGate === undefined) {
      delete process.env['GEOSPEC_EXTREMA_GATE'];
    } else {
      process.env['GEOSPEC_EXTREMA_GATE'] = previousExtremaGate;
    }
    subject.nativeXde?.delete?.();
  });

  const prove = (
    expectation: GeoSpecSpatialRelationshipExpectation,
    subjectSelector: GeometrySelector,
    targetSelector: GeometrySelector,
  ) =>
    proveRelationship({
      subject: resolve(subjectSelector, context.index),
      target: resolve(targetSelector, context.index),
      expectation,
      context,
    });

  it('should fail contact across the gap with the measured extrema distance and witnesses on both faces', () => {
    const evidence = prove(
      { kind: 'contact', subject: 'cubeA', target: 'cubeB', tolerance: 0.02 },
      { kind: 'occurrence', name: 'cubeA' },
      { kind: 'occurrence', name: 'cubeB' },
    );
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.method).toBe('extrema');
    expect(evidence.final?.measured['distance']).toBeCloseTo(cubeGap, 6);
    expect(evidence.final?.expected['tolerance']).toBe(0.02);
    const [witnessA, witnessB] = evidence.final?.witnesses ?? [];
    expect(witnessA?.kind).toBe('point');
    expect(witnessA?.value[0]).toBeCloseTo(5, 6);
    expect(witnessB?.value[0]).toBeCloseTo(25, 6);
    expect(evidence.broadPhase).toMatchObject({ method: 'aabb', candidate: false });
    expect(evidence.diagnostics[0]?.code).toBe('GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH');
    expect(evidence.diagnostics[0]?.suggestion).toBeTruthy();
  });

  it('should pass clearance inside the declared band with extrema evidence', () => {
    const evidence = prove(
      { kind: 'clearance', subject: 'cubeA', target: 'cubeB', min: 19.5, max: 20.5 },
      { kind: 'occurrence', name: 'cubeA' },
      { kind: 'occurrence', name: 'cubeB' },
    );
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.method).toBe('extrema');
    expect(evidence.final?.measured['distance']).toBeCloseTo(cubeGap, 6);
    expect(evidence.diagnostics).toEqual([]);
  });

  it('should fail clearance outside the declared band and name the direction', () => {
    const evidence = prove(
      { kind: 'clearance', subject: 'cubeA', target: 'cubeB', min: 0, max: 5 },
      { kind: 'occurrence', name: 'cubeA' },
      { kind: 'occurrence', name: 'cubeB' },
    );
    expect(evidence.verdict).toBe('fail');
    expect(evidence.diagnostics[0]?.message).toContain('too loose');
  });

  it('should pass interference with an exactly zero boolean common volume for the gapped pair', () => {
    const evidence = prove(
      { kind: 'interference', subject: 'cubeA', target: 'cubeB' },
      { kind: 'occurrence', name: 'cubeA' },
      { kind: 'occurrence', name: 'cubeB' },
    );
    expect(evidence.verdict).toBe('pass');
    expect(evidence.final?.method).toBe('boolean-intersection');
    expect(evidence.final?.measured['volume']).toBeCloseTo(0, 9);
  });

  it('should fail a declared intentional-interference band when the exact common volume is zero', () => {
    const evidence = prove(
      { kind: 'interference', subject: 'cubeA', target: 'cubeB', minVolume: 1, maxVolume: 5 },
      { kind: 'occurrence', name: 'cubeA' },
      { kind: 'occurrence', name: 'cubeB' },
    );
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.measured['volume']).toBeCloseTo(0, 9);
    expect(evidence.final?.expected).toEqual({ minVolume: 1, maxVolume: 5 });
  });

  it('should prove containment by exact classification of the authored face boundary samples', () => {
    const contained = prove({ kind: 'containment', subject: 'cubeA.face.a', target: 'cubeA' }, 'cubeA.face.a', {
      kind: 'occurrence',
      name: 'cubeA',
    });
    expect(contained.verdict).toBe('pass');
    expect(contained.final?.method).toBe('classification');
    expect(contained.final?.measured['outside']).toBe(0);
  });

  it('should fail containment across the gap with an outside witness point', () => {
    const evidence = prove(
      { kind: 'containment', subject: 'cubeA', target: 'cubeB' },
      { kind: 'occurrence', name: 'cubeA' },
      { kind: 'occurrence', name: 'cubeB' },
    );
    expect(evidence.verdict).toBe('fail');
    expect(evidence.final?.measured['outside']).toBeGreaterThan(0);
    expect(evidence.final?.witnesses[0]?.kind).toBe('point');
    expect(evidence.diagnostics[0]?.spatial?.center).toBeDefined();
  });

  it('should measure insertion depth by exact classification along the declared axis', () => {
    const seated = prove(
      { kind: 'insertion', subject: 'cubeA', target: 'cubeA', axis: [1, 0, 0], min: 9, max: 11 },
      { kind: 'occurrence', name: 'cubeA' },
      { kind: 'occurrence', name: 'cubeA' },
    );
    expect(seated.verdict).toBe('pass');
    expect(seated.final?.method).toBe('classification');
    expect(seated.final?.measured['depth']).toBeCloseTo(10, 3);

    const disengaged = prove(
      { kind: 'insertion', subject: 'cubeA', target: 'cubeB', axis: [1, 0, 0], min: 1 },
      { kind: 'occurrence', name: 'cubeA' },
      { kind: 'occurrence', name: 'cubeB' },
    );
    expect(disengaged.verdict).toBe('fail');
    expect(disengaged.final?.measured['depth']).toBeCloseTo(0, 6);
    expect(disengaged.final?.measured['distance']).toBeCloseTo(cubeGap, 6);
  });

  it('should keep relationship verdicts and measurements identical across tessellation settings', async () => {
    const coarse = await loadStep({
      source: fixturePath,
      name: 'two-cube-assembly.step',
      meshLinearTolerance: 1,
      meshAngularToleranceDegrees: 40,
    });
    const fine = await loadStep({
      source: fixturePath,
      name: 'two-cube-assembly.step',
      meshLinearTolerance: 0.01,
      meshAngularToleranceDegrees: 5,
    });
    try {
      const measure = (loaded: GeometrySubject) => {
        const loadedContext = getSubjectProofContext(loaded);
        if (!loadedContext) {
          throw new Error('fixture subject must carry BRep evidence at every tessellation setting.');
        }
        return proveRelationship({
          subject: resolve({ kind: 'occurrence', name: 'cubeA' }, loadedContext.index),
          target: resolve({ kind: 'occurrence', name: 'cubeB' }, loadedContext.index),
          expectation: { kind: 'clearance', subject: 'cubeA', target: 'cubeB', min: 19.5, max: 20.5 },
          context: loadedContext,
        });
      };
      const coarseEvidence = measure(coarse);
      const fineEvidence = measure(fine);
      expect(coarseEvidence.verdict).toBe('pass');
      expect(fineEvidence.verdict).toBe(coarseEvidence.verdict);
      expect(fineEvidence.final?.measured).toEqual(coarseEvidence.final?.measured);
    } finally {
      coarse.nativeXde?.delete?.();
      fine.nativeXde?.delete?.();
    }
  }, 120_000);

  describe('toHaveSpatialRelationships matcher rewiring', () => {
    const runOneAssertion = async (callback: (collector: ReturnType<typeof createCollector>) => void) => {
      const collector = createCollector();
      installCollector(collector);
      try {
        collector.it('should evaluate relationship matcher', () => {
          callback(collector);
        });
        await collector.waitForCompletion(30_000);
        return collector.tests[0];
      } finally {
        clearCollectorGlobals();
      }
    };

    it('should pass in-band relationships end to end through the matcher', async () => {
      const passing = await runOneAssertion((collector) => {
        collector.expectGeo(subject).toHaveSpatialRelationships({
          relationships: [
            { id: 'gap band', kind: 'clearance', subject: 'cubeA', target: 'cubeB', min: 19.5, max: 20.5 },
            { id: 'no interference', kind: 'interference', subject: 'cubeA', target: 'cubeB' },
            { id: 'authored face seat', kind: 'containment', subject: 'cubeA.face.a', target: 'cubeA' },
          ],
        });
      });
      expect(passing?.status).toBe('passed');
    });

    it('should emit the audit diagnostic contract on relationship failure', async () => {
      const failing = await runOneAssertion((collector) => {
        collector.expectGeo(subject).toHaveSpatialRelationships({
          relationships: [
            { id: 'seated flanges', kind: 'contact', subject: 'cubeA', target: 'cubeB', tolerance: 0.02 },
          ],
        });
      });
      expect(failing?.status).toBe('failed');
      const diagnostic = failing?.assertions[0]?.diagnostics?.[0];
      if (!diagnostic) {
        throw new Error('expected a relationship failure diagnostic.');
      }
      expect(diagnostic.code).toBe('GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH');
      expect(diagnostic.message).toContain('Spatial relationship 0 (seated flanges) failed');
      expect(diagnostic.suggestion).toBeTruthy();
      expect(diagnostic.spatial?.center).toBeDefined();
      const details = diagnostic.details as {
        relationship: { kind: string };
        subject: { stability: string; entities: Array<{ occurrencePath: string }> };
        target: { stability: string };
        evidence: { broadPhase: { method: string; candidate: boolean }; final: { method: string } };
        measured: { distance: number };
        expected: { tolerance: number };
        witnesses: unknown[];
      };
      expect(details.relationship.kind).toBe('contact');
      expect(details.subject.stability).toBe('authored');
      expect(details.subject.entities[0]?.occurrencePath).toBe('cubeA');
      expect(details.target.stability).toBe('authored');
      expect(details.evidence.broadPhase).toMatchObject({ method: 'aabb', candidate: false });
      expect(details.evidence.final.method).toBe('extrema');
      expect(details.measured.distance).toBeCloseTo(cubeGap, 6);
      expect(details.expected.tolerance).toBe(0.02);
      expect(details.witnesses).toHaveLength(2);
    });

    it('should reject explicit analytic endpoints through the evidence policy', async () => {
      const rejected = await runOneAssertion((collector) => {
        collector.expectGeo(subject).toHaveSpatialRelationships({
          relationships: [
            {
              kind: 'coaxial',
              subject: { kind: 'axis', direction: [1, 0, 0], center: [0, 0, 0] },
              target: { kind: 'axis', direction: [1, 0, 0], center: [0, 0, 0] },
            },
          ],
        });
      });
      expect(rejected?.status).toBe('failed');
      expect(rejected?.assertions[0]?.diagnostics?.[0]?.code).toBe('GEOSPEC_SELECTOR_UNSUPPORTED_EVIDENCE');
      expect(rejected?.assertions[0]?.diagnostics?.[0]?.message).toContain('evidence policy');
    });

    it('should surface selector resolution failures with relationship context', async () => {
      const unmatched = await runOneAssertion((collector) => {
        collector.expectGeo(subject).toHaveSpatialRelationships({
          relationships: [{ kind: 'contact', subject: 'cubeZ', target: 'cubeB' }],
        });
      });
      expect(unmatched?.status).toBe('failed');
      const diagnostic = unmatched?.assertions[0]?.diagnostics?.[0];
      if (!diagnostic) {
        throw new Error('expected an unmatched-selector diagnostic.');
      }
      expect(diagnostic.code).toBe('GEOSPEC_SELECTOR_UNMATCHED');
      expect(diagnostic.message).toContain('Spatial relationship 0 failed');
      expect((diagnostic.details as { relationship: { subject: string } }).relationship.subject).toBe('cubeZ');
    });
  });
});

// Contact-patch-area frontier (SB4 contact-area): the estimate is the
// contacting fraction of the subject face's sampled footprint times its exact
// faceFacts area. Fixtures give a known analytic patch to check against.
const contactFixture = (relative: string) =>
  join(import.meta.dirname, '../../fixtures/contact', relative, 'model.step');

describe('native contact-area proof (contact fixtures)', () => {
  describe('flange full-face seat (runnerFlange.mount 40x40 = 1600 mm² flush on head.port.mount)', () => {
    let subject: GeometrySubject;
    let context: RelationshipProofContext;

    beforeAll(async () => {
      subject = await loadStep({ source: contactFixture('flange-face-positive'), name: 'flange-face-positive.step' });
      const built = getSubjectProofContext(subject);
      if (!built) {
        throw new Error('flange-face-positive fixture must carry STEP-XDE and native BRep evidence.');
      }
      context = built;
    }, 120_000);

    afterAll(() => {
      subject.nativeXde?.delete?.();
    });

    const proveContactArea = (minContactArea: number) =>
      proveRelationship({
        subject: resolve('runnerFlange.mount', context.index),
        target: resolve('head.port.mount', context.index),
        expectation: { kind: 'contact', subject: 'runnerFlange.mount', target: 'head.port.mount', minContactArea },
        context,
      });

    it('should estimate the full-face patch within the sampling band of the 1600 mm² analytic area', () => {
      const evidence = proveContactArea(1500);
      expect(evidence.verdict).toBe('pass');
      expect(evidence.final?.method).toBe('classification');
      // Every sampled face point seats: the estimate equals the exact face area.
      expect(evidence.final?.measured['contactArea']).toBeCloseTo(1600, 3);
      expect(evidence.final?.measured['faceArea']).toBeCloseTo(1600, 3);
      expect(evidence.final?.measured['penetratingSamples']).toBe(0);
      expect(evidence.final?.witnesses[0]?.kind).toBe('point');
    });

    it('should pass when minContactArea is below the true patch and fail when above it', () => {
      expect(proveContactArea(1500).verdict).toBe('pass');
      const failing = proveContactArea(1900);
      expect(failing.verdict).toBe('fail');
      // Fails on the estimate + band clearing below the threshold, not a matcher bug.
      expect(failing.final?.measured['contactArea']).toBeCloseTo(1600, 3);
      expect(failing.diagnostics[0]?.code).toBe('GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH');
      expect(failing.diagnostics[0]?.message).toContain('contact patch of at least 1900');
    });

    it('should preserve the plain extrema contact verdict when minContactArea is absent', () => {
      const plain = proveRelationship({
        subject: resolve('runnerFlange.mount', context.index),
        target: resolve('head.port.mount', context.index),
        expectation: { kind: 'contact', subject: 'runnerFlange.mount', target: 'head.port.mount', tolerance: 0.02 },
        context,
      });
      expect(plain.verdict).toBe('pass');
      expect(plain.final?.method).toBe('extrema');
      expect(plain.final?.measured['distance']).toBeCloseTo(0, 6);
    });
  });

  describe('face-group seat (gasket-sandwich: both 60×60 gasket sides, one deck each)', () => {
    let subject: GeometrySubject;
    let context: RelationshipProofContext;

    beforeAll(async () => {
      subject = await loadStep({
        source: contactFixture('gasket-sandwich-positive'),
        name: 'gasket-sandwich-positive.step',
      });
      const built = getSubjectProofContext(subject);
      if (!built) {
        throw new Error('gasket-sandwich-positive fixture must carry STEP-XDE and native BRep evidence.');
      }
      context = built;
    }, 120_000);

    afterAll(() => {
      subject.nativeXde?.delete?.();
    });

    // Both gasket deck faces (area 3600 each) as ONE face-group subject — the
    // fire-ring-bead shape: a band seating on both sides, proven per deck.
    const bothGasketSides: GeometrySelector = {
      kind: 'face',
      of: 'gasket',
      query: { surfaceType: 'plane', area: 3600 },
      expect: 'many',
    };

    const proveGroupPatch = (minContactArea: number) =>
      proveRelationship({
        subject: resolve(bothGasketSides, context.index),
        target: resolve({ kind: 'occurrence', name: 'block' }, context.index),
        expectation: { kind: 'contact', subject: 'gasket faces', target: 'block', minContactArea },
        context,
      });

    it('should sum per-face patches so only the block-side face contributes against the block deck', () => {
      const selection = resolve(bothGasketSides, context.index);
      expect(selection.status).toBe('resolved');
      expect(selection.entities).toHaveLength(2);
      const evidence = proveGroupPatch(3000);
      expect(evidence.verdict).toBe('pass');
      expect(evidence.final?.method).toBe('classification');
      // Both faces are sampled (summed faceArea 7200), but only the lower
      // face seats on the block: the patch is exactly one 60×60 deck face.
      expect(evidence.final?.measured['faceArea']).toBeCloseTo(7200, 3);
      expect(evidence.final?.measured['contactArea']).toBeCloseTo(3600, 3);
      expect(evidence.final?.measured['penetratingSamples']).toBe(0);
      expect(evidence.final?.witnesses[0]?.kind).toBe('point');
    });

    it('should fail when the declared patch exceeds the one-deck seat, naming the summed estimate', () => {
      const failing = proveGroupPatch(7000);
      expect(failing.verdict).toBe('fail');
      expect(failing.final?.measured['contactArea']).toBeCloseTo(3600, 3);
      expect(failing.diagnostics[0]?.code).toBe('GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH');
      expect(failing.diagnostics[0]?.message).toContain('contact patch of at least 7000');
    });
  });

  describe('valve-seat cone band (45° frustum r10→r13, analytic π·23·3√2 ≈ 306.5 mm²)', () => {
    const coneBandArea = Math.PI * 23 * 3 * Math.SQRT2;
    let subject: GeometrySubject;
    let context: RelationshipProofContext;

    beforeAll(async () => {
      subject = await loadStep({
        source: contactFixture('valve-seat-cone-positive'),
        name: 'valve-seat-cone-positive.step',
      });
      const built = getSubjectProofContext(subject);
      if (!built) {
        throw new Error('valve-seat-cone-positive fixture must carry STEP-XDE and native BRep evidence.');
      }
      context = built;
    }, 120_000);

    afterAll(() => {
      subject.nativeXde?.delete?.();
    });

    const proveConePatch = (minContactArea: number) =>
      proveRelationship({
        subject: resolve('seat.seatCone', context.index),
        target: resolve({ kind: 'occurrence', name: 'valve' }, context.index),
        expectation: { kind: 'contact', subject: 'seat.seatCone', target: 'valve', minContactArea },
        context,
      });

    it('should estimate the fully seated cone-band patch at the exact frustum area', () => {
      const selection = resolve('seat.seatCone', context.index);
      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.facts.surfaceType).toBe('cone');
      const evidence = proveConePatch(250);
      expect(evidence.verdict).toBe('pass');
      expect(evidence.final?.method).toBe('classification');
      // The valve cone coincides with the seat cone over the whole band, so
      // every sampled footprint point seats: patch = exact faceFacts area.
      expect(evidence.final?.measured['faceArea']).toBeCloseTo(coneBandArea, 3);
      expect(evidence.final?.measured['contactArea']).toBeCloseTo(coneBandArea, 3);
      expect(evidence.final?.measured['penetratingSamples']).toBe(0);
      expect(evidence.final?.witnesses[0]?.kind).toBe('point');
    });

    it('should fail when the declared patch exceeds the cone band, naming the estimate', () => {
      const failing = proveConePatch(380);
      expect(failing.verdict).toBe('fail');
      expect(failing.final?.measured['contactArea']).toBeLessThan(320);
      expect(failing.diagnostics[0]?.message).toContain('contact patch of at least 380');
    });
  });

  describe('plug washer partial seat (r10.9 disk on the r6..r11 counterbore annulus ≈ 260 mm²)', () => {
    let subject: GeometrySubject;
    let context: RelationshipProofContext;

    beforeAll(async () => {
      subject = await loadStep({ source: contactFixture('plug-seat-positive'), name: 'plug-seat-positive.step' });
      const built = getSubjectProofContext(subject);
      if (!built) {
        throw new Error('plug-seat-positive fixture must carry STEP-XDE and native BRep evidence.');
      }
      context = built;
    }, 120_000);

    afterAll(() => {
      subject.nativeXde?.delete?.();
    });

    const proveWasherPatch = (minContactArea: number) =>
      proveRelationship({
        subject: resolve('plug.washerSeat', context.index),
        target: resolve({ kind: 'occurrence', name: 'head' }, context.index),
        expectation: { kind: 'contact', subject: 'plug.washerSeat', target: 'head', minContactArea },
        context,
      });

    it('should estimate the annular contact patch near the π(10.9²−6²) ≈ 260 mm² analytic overlap', () => {
      const evidence = proveWasherPatch(200);
      expect(evidence.verdict).toBe('pass');
      // Analytic annulus overlap is 260.2 mm²; the sampled estimate lands within
      // ~1% of it and below the full 262 mm² washer-face area (the inner Ø12
      // bore is void, so the seat is a true annulus, not the whole disk).
      const measured = evidence.final?.measured['contactArea'] ?? 0;
      expect(measured).toBeGreaterThan(255);
      expect(measured).toBeLessThan(262);
      expect(evidence.final?.measured['penetratingSamples']).toBe(0);
    });

    it('should fail when the declared patch exceeds the annular seat, naming the estimate', () => {
      const failing = proveWasherPatch(320);
      expect(failing.verdict).toBe('fail');
      expect(failing.final?.measured['contactArea']).toBeLessThan(262);
      expect(failing.diagnostics[0]?.message).toContain('contact patch of at least 320');
    });
  });
});
