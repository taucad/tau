import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import { createMemoryEvidenceStore } from '#cache/testing/memory-evidence-store.js';
import type { GeometrySubject } from '#mesh/types.js';
import { getSubjectProofContext, proveRelationship } from '#proofs/index.js';
import type { RelationshipProofContext } from '#proofs/index.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';
import { resolve } from '#selector/resolve.js';
import type { GeometrySelector } from '#selector/types.js';
import { loadStep } from '#step/index.js';

const fixturePath = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');

type NativeCounts = { extrema: number; classifyPoints: number; commonVolume: number };

/** Wrap the proof context's native surface with per-crossing counters. */
const countingContext = (
  base: RelationshipProofContext,
): { context: RelationshipProofContext; counts: NativeCounts } => {
  const counts: NativeCounts = { extrema: 0, classifyPoints: 0, commonVolume: 0 };
  const native: RelationshipProofContext['native'] = {
    faceFacts: (occurrence) => base.native.faceFacts(occurrence),
    extrema: (...extremaArguments: Parameters<RelationshipProofContext['native']['extrema']>) => {
      counts.extrema += 1;
      return base.native.extrema(...extremaArguments);
    },
    classifyPoints: (occurrence, pointsJson) => {
      counts.classifyPoints += 1;
      return base.native.classifyPoints(occurrence, pointsJson);
    },
    commonVolume: (occurrenceA, occurrenceB) => {
      counts.commonVolume += 1;
      return base.native.commonVolume(occurrenceA, occurrenceB);
    },
  };
  return { context: { ...base, native }, counts };
};

describe('relationship-verdict evidence family (R1)', () => {
  let subject: GeometrySubject;
  let baseContext: RelationshipProofContext;

  beforeAll(async () => {
    subject = await loadStep({ source: fixturePath, name: 'two-cube-assembly.step' });
    const built = getSubjectProofContext(subject);
    if (!built) {
      throw new Error('two-cube fixture subject must carry STEP-XDE and native BRep evidence.');
    }
    // The R1 family caches exact native payloads; the CR4 mesh gate would
    // resolve these mm-scale rows without crossing into native, so pin it
    // off — the gate has its own differential.
    baseContext = { ...built, extremaGate: false };
  }, 120_000);

  afterAll(() => {
    subject.nativeXde?.delete?.();
  });

  afterEach(() => {
    setGeoSpecEvidenceStore(undefined);
  });

  const prove = (options: {
    context: RelationshipProofContext;
    expectation: GeoSpecSpatialRelationshipExpectation;
    subjectSelector: GeometrySelector;
    targetSelector: GeometrySelector;
  }) =>
    proveRelationship({
      subject: resolve(options.subjectSelector, options.context.index),
      target: resolve(options.targetSelector, options.context.index),
      expectation: options.expectation,
      context: options.context,
    });

  // One claim per cacheable payload kind: extrema (contact), extrema
  // (clearance — same face pair, so it shares the contact entry), exact
  // classification (containment), and boolean common volume (interference).
  const cubePair = {
    subjectSelector: { kind: 'occurrence', name: 'cubeA' } as const,
    targetSelector: { kind: 'occurrence', name: 'cubeB' } as const,
  };

  const runCorpus = (context: RelationshipProofContext) => [
    prove({
      context,
      expectation: { kind: 'contact', subject: 'cubeA', target: 'cubeB', tolerance: 0.02 },
      ...cubePair,
    }),
    prove({
      context,
      expectation: { kind: 'clearance', subject: 'cubeA', target: 'cubeB', min: 19.5, max: 20.5 },
      ...cubePair,
    }),
    prove({
      context,
      expectation: { kind: 'containment', subject: 'cubeA', target: 'cubeB' },
      ...cubePair,
    }),
    prove({
      context,
      expectation: { kind: 'interference', subject: 'cubeA', target: 'cubeB' },
      ...cubePair,
    }),
  ];

  it('should replay every exact-BRep payload with zero native crossings on the warm run', () => {
    const store = createMemoryEvidenceStore();
    setGeoSpecEvidenceStore(store);
    const { context, counts } = countingContext(baseContext);

    const cold = runCorpus(context);
    // The cold run must actually exercise every payload kind — a corpus that
    // stops crossing would make the warm assertion vacuous.
    expect(counts.extrema).toBeGreaterThan(0);
    expect(counts.classifyPoints).toBeGreaterThan(0);
    expect(counts.commonVolume).toBeGreaterThan(0);
    expect(store.families()).toEqual(['relationship-verdict']);

    counts.extrema = 0;
    counts.classifyPoints = 0;
    counts.commonVolume = 0;
    const warm = runCorpus(context);

    expect(counts).toEqual({ extrema: 0, classifyPoints: 0, commonVolume: 0 });
    expect(warm).toEqual(cold);
  });

  it('should reach byte-identical verdicts with the cache enabled and disabled', () => {
    setGeoSpecEvidenceStore(undefined);
    const direct = runCorpus(baseContext);

    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const cachedCold = runCorpus(baseContext);
    const cachedWarm = runCorpus(baseContext);

    expect(cachedCold).toEqual(direct);
    expect(cachedWarm).toEqual(direct);
    expect(direct.map((evidence) => evidence.verdict)).toEqual(['fail', 'pass', 'fail', 'pass']);
  });

  it('should dedupe repeated identical crossings within one cold run', () => {
    setGeoSpecEvidenceStore(createMemoryEvidenceStore());
    const { context, counts } = countingContext(baseContext);

    // Contact and clearance on the same face pair evaluate the same exact
    // extrema — the audit's within-run dedupe question: the second claim must
    // replay the first claim's payload instead of re-crossing.
    prove({
      context,
      expectation: { kind: 'contact', subject: 'cubeA', target: 'cubeB', tolerance: 0.02 },
      ...cubePair,
    });
    const afterContact = counts.extrema;
    prove({
      context,
      expectation: { kind: 'clearance', subject: 'cubeA', target: 'cubeB', min: 19.5, max: 20.5 },
      ...cubePair,
    });

    expect(afterContact).toBeGreaterThan(0);
    expect(counts.extrema).toBe(afterContact);
  });
});
